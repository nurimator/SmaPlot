import type { Dataset, SmpAxisSpec, SmpLegendItem, SmpLineAnnotation, SmpMetadata, SmpPlotDoc } from '../types.ts'
import { smpToUnicode } from './smpSymbolMapper.ts'

export function bgrToHex(bgr: number): string {
  const r = bgr & 0xff
  const g = (bgr >> 8) & 0xff
  const b = (bgr >> 16) & 0xff
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

interface SmpSeriesSpec {
  name: string
  cleanName: string
  color: string
  width: number
  lineType?: string
  plotType?: string
  dotColor?: string
  markerSize?: number
  fillColor?: string
  fillLine?: string
  xExpr: string
  yExpr: string
  filePath?: string
  stylePrefix?: number
  zerosLine?: string
  fixed5?: string
  exprFlag?: string
}

export interface ParseSmpResult {
  datasets: Dataset[]
  smpMeta: SmpMetadata
}


function createDefaultAxis(min: number, max: number, step: number): SmpAxisSpec {
  return {
    min,
    max,
    step,
    subDivs: 5,
    autoStep: false,
    showTicks: true,
    showSubTicks: true,
    showLabels: true,
    insideTicks: true,
    majorIn: true,
    majorOut: false,
    majorLength: 6,
    majorWidth: 0.4,
    majorColor: '#000000',
    majorStyle: 'solid',
    minorIn: true,
    minorOut: false,
    minorLength: 3,
    minorWidth: 0.4,
    minorColor: '#000000',
    minorStyle: 'solid',
    fontFamily: 'Times New Roman, Inter, sans-serif',
    fontSize: 24,
    fontWeight: 400,
    fontStyle: 'regular',
    labelColor: '#000000',
    shiftRight: 0,
    shiftDown: 0,
  }
}

function parseDataBlockLines(lines: string[]): Record<string, { x: number[]; y: number[]; rawLines: string[][]; headerRest?: string }> {
  const datasetsMap: Record<string, { x: number[]; y: number[]; rawLines: string[][]; headerRest?: string }> = {}
  let activeDataHeader = ''
  let inDataBlock = false

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line === '[DATA]') {
      inDataBlock = true
      continue
    }
    if (line.startsWith('[OTHERS]') || line.startsWith('[MASKS]')) {
      inDataBlock = false
      continue
    }
    if (!inDataBlock) continue

    if (line.includes('[End of Data]')) {
      const cleanLine = line.replace('[End of Data]', '').trim()
      if (cleanLine && activeDataHeader && datasetsMap[activeDataHeader]) {
        const parts = cleanLine.split(/\s+/)
        if (parts.length >= 2) {
          const px = parseFloat(parts[0])
          const py = parseFloat(parts[1])
          if (!isNaN(px) && !isNaN(py)) {
            datasetsMap[activeDataHeader].x.push(px)
            datasetsMap[activeDataHeader].y.push(py)
            datasetsMap[activeDataHeader].rawLines.push([parts[0], parts[1]])
          }
        }
      }
      activeDataHeader = ''
      continue
    }

    if (line.startsWith('[') && line.includes(']')) {
      const closeBracketIdx = line.indexOf(']')
      const headerName = line.slice(1, closeBracketIdx).trim()
      const headerRest = line.slice(closeBracketIdx + 1).trim()
      if (headerName.toLowerCase().includes('end of data')) {
        activeDataHeader = ''
        continue
      }
      activeDataHeader = headerName
      if (!datasetsMap[activeDataHeader]) {
        datasetsMap[activeDataHeader] = { x: [], y: [], rawLines: [], headerRest }
      } else if (headerRest && !datasetsMap[activeDataHeader].headerRest) {
        datasetsMap[activeDataHeader].headerRest = headerRest
      }
      continue
    }

    if (!activeDataHeader) continue

    if (line.startsWith('#')) {
      datasetsMap[activeDataHeader].rawLines.push([line])
      continue
    }

    const parts = line.split(/\s+/)
    if (parts.length >= 2) {
      const px = parseFloat(parts[0])
      const py = parseFloat(parts[1])
      if (!isNaN(px) && !isNaN(py)) {
        datasetsMap[activeDataHeader].x.push(px)
        datasetsMap[activeDataHeader].y.push(py)
        datasetsMap[activeDataHeader].rawLines.push([parts[0], parts[1]])
      }
    }
  }

  return datasetsMap
}

export function parseSmpContent(text: string, defaultFileName: string): ParseSmpResult {
  const lines = text.split(/\r?\n/)
  const globalFileDatasetsMap = parseDataBlockLines(lines)

  // Detect document blocks (e.g. [HEMATIT1.SMP], [HEMATIT2.SMP] or single doc)
  const docBlocks: { name: string; lines: string[] }[] = []
  let currentDocName = defaultFileName
  let currentDocLines: string[] = []

  const isRealDocLines = (larr: string[]) =>
    larr.some((l) => {
      const t = l.trim()
      return t === '[GRAPH]' || t.startsWith('[AXIS-') || t === '[DATA]'
    })

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.match(/^\[.*\.SMP\]$/i)) {
      if (isRealDocLines(currentDocLines)) {
        docBlocks.push({ name: currentDocName, lines: currentDocLines })
      }
      currentDocName = trimmed.slice(1, -1)
      currentDocLines = []
    } else {
      currentDocLines.push(line)
    }
  }
  if (isRealDocLines(currentDocLines)) {
    docBlocks.push({ name: currentDocName, lines: currentDocLines })
  }

  const docs: SmpPlotDoc[] = []
  const allDatasets: Dataset[] = []

  docBlocks.forEach((docBlock) => {
    const docLines = docBlock.lines
    const seriesSpecs: Record<string, SmpSeriesSpec> = {}

    let docLeft = 4000
    let docTop = 4000
    let docWidth = 10000
    let docHeight = 10000
    let frameWidth = 0.4
    let frameColor = '#000000'
    let frameBgColor = '#ffffff'
    let graphFixed1 = ''
    let graphFixed2 = ''
    let mergeZeroLabels = false

    let axisX = createDefaultAxis(0, 100, 20)
    let axisY = createDefaultAxis(0, 100, 20)
    let axisTop: SmpAxisSpec | undefined
    let axisRight: SmpAxisSpec | undefined

    const legendItems: SmpLegendItem[] = []
    const annotationLines: SmpLineAnnotation[] = []
    let othersZerosLine = ''
    let othersSymbolLine = ''
    let xLabel: string | undefined
    let yLabel: string | undefined

    let currentSection = ''
    let i = 0

    while (i < docLines.length) {
      const rawLine = docLines[i]
      const line = rawLine.trim()

      if (!line) {
        i++
        continue
      }

      if (line.startsWith('[') && line.endsWith(']')) {
        currentSection = line.slice(1, -1).trim()
        i++
        // The first line after [LEGEND] is the item count (may collide with a
        // legend item type line, e.g. count "4" vs type 4 = X-axis title).
        if (currentSection === 'LEGEND' && i < docLines.length && /^\d+$/.test(docLines[i].trim())) {
          i++
        }
        continue
      }

      // Series specs e.g. [1 SG.txt] or [KP.txt]
      if (currentSection.match(/^\d+\s+/) || (currentSection.endsWith('.txt') && !currentSection.startsWith('AXIS'))) {
        const specHeader = currentSection
        const cleanName = specHeader.replace(/^\d+\s+/, '').replace(/\.txt$/i, '')
        let filePath = ''
        if (i < docLines.length) {
          filePath = docLines[i].trim()
          i++ // path line
        }
        if (i < docLines.length) i++ // config 1
        let color = '#000000'
        let width = 0.6
        let stylePrefix = 60
        if (i < docLines.length) {
          const parts = docLines[i].trim().split(/\s+/)
          if (parts.length >= 1) {
            const p0 = parseFloat(parts[0])
            if (!isNaN(p0) && p0 > 0) {
              stylePrefix = p0
              width = p0 / 100
            }
          }
          if (parts.length >= 2) {
            const colorInt = parseInt(parts[1], 10)
            if (!isNaN(colorInt) && colorInt >= 0) {
              color = bgrToHex(colorInt)
            }
          }
          i++
        }
        let lineType = 'solid'
        let plotType = 'no_dot'
        let dotColor: string | undefined
        let markerSize = 3
        if (i < docLines.length) {
          const parts = docLines[i].trim().split(/\s+/)
          // First token of the symbol line is the Sma4Win pen style code:
          // 1=solid, 2=dash, 3=dot, 4=dash-dot, 5=dash-dot-dot, 6=face.
          if (parts.length >= 1) {
            const penCode = parseInt(parts[0], 10)
            if (!isNaN(penCode)) {
              if (penCode === 2) lineType = 'dash'
              else if (penCode === 3) lineType = 'dotted'
              else if (penCode === 4) lineType = 'dash_dot'
              else if (penCode === 5) lineType = 'dash_dot_dot'
              else if (penCode === 6) lineType = 'face'
              else lineType = 'solid'
            }
          }
          if (parts.length >= 2) {
            const symCode = parseInt(parts[1], 10)
            if (!isNaN(symCode)) {
              if (symCode === 1) plotType = 'filled_circle'
              else if (symCode === 2) plotType = 'circle'
              else if (symCode === 3) plotType = 'filled_triangle'
              else if (symCode === 4) plotType = 'triangle'
              else if (symCode === 5) plotType = 'filled_square'
              else if (symCode === 6) plotType = 'square'
              else if (symCode === 7) plotType = 'filled_triangle_down'
              else if (symCode === 8) plotType = 'triangle_down'
              else if (symCode === 9) plotType = 'filled_diamond'
              else if (symCode === 10) plotType = 'diamond'
              else if (symCode === 11) plotType = 'plus'
              else if (symCode === 12) plotType = 'cross'
              else if (symCode === 41) plotType = 'star'
            }
          }
          if (parts.length >= 3) {
            const mSz = parseInt(parts[2], 10)
            if (!isNaN(mSz) && mSz > 0) markerSize = Math.max(1, Math.round(mSz / 100))
          }
          if (parts.length >= 4) {
            const dcInt = parseInt(parts[3], 10)
            if (!isNaN(dcInt)) dotColor = bgrToHex(dcInt)
          }
          i++
        }
        // Symbol fill color record: "0 0 1 0 0 0 <fillBGR> 5" (7th token).
        let fillColor: string | undefined
        let fillLine = ''
        if (i < docLines.length) {
          fillLine = docLines[i].trim()
          const fillParts = fillLine.split(/\s+/)
          if (fillParts.length >= 7) {
            const fillInt = parseInt(fillParts[6], 10)
            if (!isNaN(fillInt) && fillInt >= 0) fillColor = bgrToHex(fillInt)
          }
          i++
        }
        let exprFlag = '0 0 0'
        if (i < docLines.length) {
          exprFlag = docLines[i].trim() || '0 0 0'
          i++ // config 4
        }
        let xExpr = 'x'
        if (i < docLines.length) {
          xExpr = docLines[i].trim() || 'x'
          i++
        }
        let yExpr = 'y'
        if (i < docLines.length) {
          yExpr = docLines[i].trim() || 'y'
          i++
        }
        let zerosLine = ''
        if (i < docLines.length) {
          zerosLine = docLines[i].trim()
          i++ // config 5
        }
        let fixed5 = ''
        if (i < docLines.length) {
          fixed5 = docLines[i].trim()
          i++ // config 6
        }

        seriesSpecs[specHeader] = {
          name: specHeader,
          cleanName,
          color,
          width,
          lineType,
          plotType,
          dotColor,
          markerSize,
          fillColor,
          fillLine,
          xExpr,
          yExpr,
          filePath,
          stylePrefix,
          exprFlag,
          zerosLine,
          fixed5,
        }
        currentSection = ''
        continue
      }

      if (currentSection === 'GRAPH') {
        const parts = line.split(/\s+/)
        if (parts.length >= 4) {
          docLeft = parseFloat(parts[0]) || 4000
          docTop = parseFloat(parts[1]) || 4000
          docWidth = parseFloat(parts[2]) || 10000
          docHeight = parseFloat(parts[3]) || 10000
        }
        i++
        if (i < docLines.length && !docLines[i].trim().startsWith('[')) {
          graphFixed1 = docLines[i].trim()
          const gParts = graphFixed1.split(/\s+/)
          // GRAPH line token index 2 (0-based) is the "merge zero labels" flag that makes the
          // X and Y zero origin share a single label at the bottom-left corner.
          if (gParts.length > 2) {
            mergeZeroLabels = gParts[2] === '1'
          }
          i++
        }
        if (i < docLines.length && !docLines[i].trim().startsWith('[')) {
          graphFixed2 = docLines[i].trim()
          const gParts = graphFixed2.split(/\s+/)
          if (gParts.length >= 1) {
            const fw = parseFloat(gParts[0])
            if (!isNaN(fw) && fw > 0) frameWidth = fw / 100
          }
          if (gParts.length >= 2) {
            const fc = parseInt(gParts[1], 10)
            if (!isNaN(fc) && fc >= 0) frameColor = bgrToHex(fc)
          }
          if (gParts.length >= 4) {
            const bg = parseInt(gParts[3], 10)
            if (!isNaN(bg) && bg >= 0) frameBgColor = bgrToHex(bg)
          }
          i++
        }
        currentSection = ''
        continue
      }

      if (currentSection.startsWith('AXIS-')) {
        const axisIdx = parseInt(currentSection.replace('AXIS-', ''), 10)
        const parts1 = line.split(/\s+/)
        let axisSpec: SmpAxisSpec = createDefaultAxis(0, 100, 20)
        if (parts1.length >= 3) {
          axisSpec.min = parseFloat(parts1[0])
          axisSpec.max = parseFloat(parts1[1])
          axisSpec.step = parseFloat(parts1[2])
          axisSpec.rawFormatSci = parts1[0].includes('e') || parts1[0].includes('E')
          axisSpec.rawFixedTail = parts1.slice(3).join(' ')
          if (parts1.length >= 15) {
            axisSpec.subDivs = parseInt(parts1[14], 10) || 5
          }
          // Axis line token index 10 (0-based) is the "add + sign" flag for positive
          // tick labels (1 = enabled).
          if (parts1.length > 10) {
            axisSpec.addPlusSign = parts1[10] === '1'
          }
        }

        i++
        if (i < docLines.length) {
          axisSpec.rawLine2 = docLines[i].trim()
          const parts2 = docLines[i].trim().split(/\s+/)
          if (parts2.length >= 1) {
            const divs = parseInt(parts2[0], 10)
            if (!isNaN(divs) && divs > 0) axisSpec.subDivs = divs
          }
          if (parts2.length >= 6) {
            axisSpec.insideTicks = parts2[2] === '1'
            axisSpec.autoStep = parts2[3] === '1'
            axisSpec.showTicks = parts2[4] === '1'
            axisSpec.showLabels = parts2[5] === '1'
          } else if (parts2.length >= 4) {
            axisSpec.autoStep = parts2[2] === '1'
            axisSpec.showTicks = parts2[3] === '1'
          }
          if (parts2.length >= 8) {
            const sr = parseFloat(parts2[6])
            const sd = parseFloat(parts2[7])
            if (!isNaN(sr)) axisSpec.shiftRight = Math.round(sr / 100)
            if (!isNaN(sd)) axisSpec.shiftDown = Math.round(sd / 100)
          }
          if (parts2.length >= 10) {
            axisSpec.labelColorCode = parts2[9]
            const fsVal = parseFloat(parts2[9])
            if (!isNaN(fsVal) && fsVal > 0) {
              axisSpec.fontSize = Math.round(fsVal / 50)
            }
          }
          axisSpec.rawLine2Tail = parts2.length >= 12 ? '100 0' : '100'
          i++
        }

        if (i < docLines.length) {
          const parts3 = docLines[i].trim().split(/\s+/)
          if (parts3.length >= 5) {
            const sizeVal = Math.abs(parseFloat(parts3[0]))
            if (!isNaN(sizeVal) && sizeVal > 0) {
              axisSpec.fontSize = Math.round(sizeVal / 100)
            }
            const weightNum = parseInt(parts3[4], 10)
            axisSpec.fontWeight = weightNum >= 600 ? 700 : 400
            if (parts3.length >= 6 && parts3[5] === '1') {
              axisSpec.fontStyle = 'italic'
            } else if (weightNum >= 600) {
              axisSpec.fontStyle = 'bold'
            } else {
              axisSpec.fontStyle = 'regular'
            }
            if (parts3.length >= 9) {
              axisSpec.charset = parseInt(parts3[8], 10) || 0
              axisSpec.rawFontExtra = parts3.slice(8).join(' ')
            }
          }
          i++
        }

        if (i < docLines.length) {
          axisSpec.fontFamily = docLines[i].trim() || 'Times New Roman'
          i++
        }

        if (i < docLines.length && !docLines[i].trim().startsWith('[')) {
          axisSpec.rawMajLine = docLines[i].trim()
          const parts5 = docLines[i].trim().split(/\s+/)
          if (parts5.length >= 5) {
            axisSpec.majorIn = parts5[0] === '1'
            axisSpec.majorOut = parts5[1] === '1'
            if (axisSpec.majorIn) axisSpec.insideTicks = true
            axisSpec.majorLength = Math.max(1, (parseFloat(parts5[2]) * 0.02) || 6)
            axisSpec.majorWidth = (parseFloat(parts5[3]) / 100) || 0.4
            const cInt = parseInt(parts5[4], 10)
            if (!isNaN(cInt)) axisSpec.majorColor = bgrToHex(cInt)
            if (parts5.length >= 7 && parts5[6] !== '2') {
              axisSpec.majorStyle = parts5[6] === '3' ? 'dotted' : 'solid'
            } else {
              axisSpec.majorStyle = 'solid'
            }
          }
          i++
        }

        if (i < docLines.length && !docLines[i].trim().startsWith('[')) {
          axisSpec.rawMinLine = docLines[i].trim()
          const parts6 = docLines[i].trim().split(/\s+/)
          if (parts6.length >= 5) {
            axisSpec.minorIn = parts6[0] === '1'
            axisSpec.minorOut = parts6[1] === '1'
            axisSpec.minorLength = Math.max(1, (parseFloat(parts6[2]) * 0.02) || 3)
            axisSpec.minorWidth = (parseFloat(parts6[3]) / 100) || 0.4
            const cInt = parseInt(parts6[4], 10)
            if (!isNaN(cInt)) axisSpec.minorColor = bgrToHex(cInt)
            if (parts6.length >= 7 && parts6[6] !== '3') {
              axisSpec.minorStyle = parts6[6] === '2' ? 'dashed' : 'solid'
            } else {
              axisSpec.minorStyle = 'solid'
            }
          }
          i++
        }

        if (axisIdx === 0) axisX = axisSpec
        else if (axisIdx === 1) axisY = axisSpec
        else if (axisIdx === 2) axisTop = axisSpec
        else if (axisIdx === 3) axisRight = axisSpec

        currentSection = ''
        continue
      }

      if (currentSection === 'LEGEND') {
        if (line === '4' || line === '5' || line === '6' || line === '7' || line === '8') {
          const legendType = parseInt(line, 10)
          i++
          if (i < docLines.length) {
            const posParts = docLines[i].trim().split(/\s+/)
            // Native Sma4Win stores legend text positions in 0.01 mm from the
            // frame origin; convert to normalized 0-10000 frame-relative values.
            const xNorm = Math.round((parseFloat(posParts[0]) / docWidth) * 10000)
            const yNorm = Math.round((parseFloat(posParts[1]) / docHeight) * 10000)
            const posTail = posParts.slice(2).join(' ')
            i++
            if (i < docLines.length) {
              const rawTxt = docLines[i].trim()
              const txt = smpToUnicode(rawTxt).replace(/\\n/g, '\n')
              i++
              let rotation = 0
              let fontWeight = 400
              let fontSize = 12
              let font1Spec = ''
              if (i < docLines.length) {
                font1Spec = docLines[i].trim()
                const styleParts = font1Spec.split(/\s+/)
                if (styleParts.length >= 5) {
                  const rotVal = parseInt(styleParts[2], 10)
                  if (rotVal !== 0) rotation = rotVal / 10 // e.g. -900 -> -90 deg
                  const weightNum = parseInt(styleParts[4], 10)
                  if (weightNum >= 600) fontWeight = 600
                  const sizeVal = Math.abs(parseInt(styleParts[0], 10))
                  if (sizeVal > 0) fontSize = Math.max(6, Math.round(sizeVal / 100))
                }
                i++
              }
              let fontFamily = 'Times New Roman'
              if (i < docLines.length && !docLines[i].trim().startsWith('[')) {
                // Strip Sma4Win style suffix (e.g. "Times New Roman TUR" -> "Times New Roman")
                fontFamily = docLines[i].trim().replace(/\s+[A-Z]{2,4}$/, '') || 'Times New Roman'
                i++
              }
              let font2Spec = ''
              let optionFontFamily = ''
              if (i < docLines.length && !docLines[i].trim().startsWith('[')) {
                font2Spec = docLines[i].trim()
                i++
              }
              if (i < docLines.length && !docLines[i].trim().startsWith('[')) {
                optionFontFamily = docLines[i].trim()
                i++
              }
              let font3Spec = ''
              let symbolFontFamily = ''
              if (i < docLines.length && !docLines[i].trim().startsWith('[')) {
                font3Spec = docLines[i].trim()
                i++
              }
              if (i < docLines.length && !docLines[i].trim().startsWith('[')) {
                symbolFontFamily = docLines[i].trim()
                i++
              }
              if (i < docLines.length && !docLines[i].trim()) i++ // empty line after item

              // Native legend item types: 4=X-axis title, 5=Y-axis title.
              // Superscripts/subscripts (^...@ / _...@) are NOT converted here;
              // they render via renderSmpTextToHtml in the plot layer.
              if (legendType === 4) {
                xLabel = txt
              } else if (legendType === 5) {
                yLabel = txt
              }

              legendItems.push({
                type: 'text',
                legendType,
                text: txt,
                rawText: rawTxt,
                xNorm,
                yNorm,
                posTail,
                rotation,
                fontFamily,
                optionFontFamily,
                symbolFontFamily,
                font1Spec,
                font2Spec,
                font3Spec,
                fontSize,
                fontWeight,
              })
            }
          }
          continue
        } else if (line === '0' || line === '1' || line === '2') {
          const itemType = line
          i++
          if (i < docLines.length) {
            const rawLineStr = docLines[i].trim()
            const parts = rawLineStr.split(/\s+/)
            if (parts.length >= 4) {
              const x1Norm = parseFloat(parts[0])
              const y1Norm = parseFloat(parts[1])
              const x2Norm = parseFloat(parts[2])
              const y2Norm = parseFloat(parts[3])

              let unitX: 'mm' | 'xa' | 'ua' = 'mm'
              let unitY: 'mm' | 'ya' | 'ra' = 'mm'
              let width = 0.4
              let arrowhead = 5.0
              let color = '#000000'
              let style = 'solid'
              let faceColor = '#ffffff'
              let arrowMode = itemType === '2' ? 0 : 1
              let spread = 30
              let shut = 100
              let shape = itemType === '2' ? 'measure_line' : 'arrow'

              if (parts.length >= 5) {
                unitX = parts[4] === '1' ? 'xa' : parts[4] === '2' ? 'ua' : 'mm'
              }
              if (parts.length >= 6) {
                unitY = parts[5] === '1' ? 'ya' : parts[5] === '2' ? 'ra' : 'mm'
              }
              if (parts.length >= 7) {
                const wVal = parseFloat(parts[6])
                if (!isNaN(wVal) && wVal > 0) width = wVal / 100
              }
              if (parts.length >= 8) {
                const ahVal = parseFloat(parts[7])
                if (!isNaN(ahVal) && ahVal > 0) arrowhead = ahVal / 100
              }
              if (parts.length >= 9) {
                const cVal = parseInt(parts[8], 10)
                if (!isNaN(cVal) && cVal >= 0) color = bgrToHex(cVal)
              }
              if (parts.length >= 12) {
                const styleCode = parts[11]
                style = styleCode === '2' ? 'dashed' : styleCode === '3' ? 'dotted' : 'solid'
              }
              if (parts.length >= 13) {
                const fcVal = parseInt(parts[12], 10)
                if (!isNaN(fcVal) && fcVal >= 0) faceColor = bgrToHex(fcVal)
              }
              if (parts.length >= 16) {
                const modeVal = parseInt(parts[15], 10)
                if (!isNaN(modeVal)) {
                  arrowMode = modeVal
                  if (itemType === '2') {
                    shape = 'measure_line'
                  } else if (modeVal === 0) {
                    shape = 'line'
                  } else if (modeVal === 2) {
                    shape = 'arrow_start'
                  } else if (modeVal === 3) {
                    shape = 'arrow_both'
                  } else {
                    shape = 'arrow'
                  }
                }
              }
              if (parts.length >= 17) {
                const spVal = parseFloat(parts[16])
                if (!isNaN(spVal)) spread = spVal
              }
              if (parts.length >= 18) {
                const shVal = parseFloat(parts[17])
                if (!isNaN(shVal)) shut = shVal
              }

              if (!isNaN(x1Norm) && !isNaN(y1Norm) && !isNaN(x2Norm) && !isNaN(y2Norm)) {
                annotationLines.push({
                  x1Norm,
                  y1Norm,
                  x2Norm,
                  y2Norm,
                  unitX,
                  unitY,
                  width,
                  arrowhead,
                  color,
                  style,
                  faceColor,
                  shape,
                  arrowMode,
                  spread,
                  shut,
                  rawType: itemType,
                  rawLineStr,
                })
              }
            }
            i++
            if (i < docLines.length && !docLines[i].trim()) i++ // empty line after item
          }
          continue
        } else if (line === '3') {
          i++
          if (i < docLines.length) {
            const rawLineStr = docLines[i].trim()
            const parts = rawLineStr.split(/\s+/)
            if (parts.length >= 4) {
              const x1Norm = parseFloat(parts[0])
              const y1Norm = parseFloat(parts[1])
              const x2Norm = parseFloat(parts[2])
              const y2Norm = parseFloat(parts[3])

              let shadeDepth = 0
              let shadeColor = '#000000'
              let thickness = 0.4
              let faceColor = '#ffffff'
              let roundX = 0
              let roundY = 0
              let style = 'solid'
              let color = '#000000'

              if (parts.length >= 8) {
                const shadeVal = parseFloat(parts[7])
                if (!isNaN(shadeVal)) shadeDepth = shadeVal / 100
              }
              if (parts.length >= 9) {
                const sColorInt = parseInt(parts[8], 10)
                if (!isNaN(sColorInt) && sColorInt >= 0) {
                  const hex = bgrToHex(sColorInt)
                  shadeColor = hex
                  if (shadeDepth === 0) color = hex
                }
              }
              if (parts.length >= 11) {
                const tVal = parseFloat(parts[10])
                if (!isNaN(tVal) && tVal > 0) thickness = tVal / 100
              }
              if (parts.length >= 13) {
                const fColorInt = parseInt(parts[12], 10)
                if (!isNaN(fColorInt) && fColorInt >= 0) faceColor = bgrToHex(fColorInt)
              }
              if (parts.length >= 14) {
                const rxVal = parseFloat(parts[13])
                if (!isNaN(rxVal)) roundX = rxVal / 100
              }
              if (parts.length >= 15) {
                const ryVal = parseFloat(parts[14])
                if (!isNaN(ryVal)) roundY = ryVal / 100
              }
              if (parts.length >= 16) {
                style = parts[15] === '2' ? 'dashed' : parts[15] === '3' ? 'dotted' : 'solid'
              }

              if (!isNaN(x1Norm) && !isNaN(y1Norm) && !isNaN(x2Norm) && !isNaN(y2Norm)) {
                const rectAnnotation: SmpLineAnnotation = {
                  x1Norm,
                  y1Norm,
                  x2Norm,
                  y2Norm,
                  style,
                  width: thickness,
                  thickness,
                  color,
                  faceColor,
                  shadeDepth,
                  shadeColor,
                  roundX,
                  roundY,
                  shape: 'rectangle',
                }
                annotationLines.push(rectAnnotation)
              }
            }
            i++
            if (i < docLines.length && !docLines[i].trim()) i++ // empty line after item 3
          }
          continue
        }
        i++
        continue
      }

      if (currentSection === 'OTHERS') {
        if (line === '2') {
          i++
          if (i < docLines.length) {
            othersZerosLine = docLines[i].trim()
            i++
          }
          if (i < docLines.length) {
            othersSymbolLine = docLines[i].trim()
            i++
          }
          if (i < docLines.length) i++ // Symbol font name
          if (i < docLines.length && !docLines[i].trim()) i++
        }
        currentSection = ''
        continue
      }

      i++
    }

    // Parse datasets for this document
    const localDatasetsMap = parseDataBlockLines(docLines)
    const mergedDatasetsMap = { ...globalFileDatasetsMap, ...localDatasetsMap }

    const docDatasets: Dataset[] = []
    const specKeys = Object.keys(seriesSpecs)
    const targetKeys = specKeys.length > 0 ? specKeys : Object.keys(mergedDatasetsMap)

    targetKeys.forEach((specKey) => {
      if (specKey.toLowerCase().includes('end of data')) return
      const cleanSpecName = specKey.replace(/^\d+\s+/, '').replace(/\.txt$/i, '')
      const spec =
        seriesSpecs[specKey] ||
        seriesSpecs[`[${specKey}]`] ||
        Object.values(seriesSpecs).find((s) => s.cleanName === cleanSpecName || s.name === specKey || s.name === cleanSpecName) || {
          name: specKey,
          cleanName: cleanSpecName,
          color: '#000000',
          xExpr: 'x',
          yExpr: 'y',
          filePath: '',
        }

      const rawDataKey =
        Object.keys(mergedDatasetsMap).find((k) => {
          const cleanK = k.replace(/^\d+\s+/, '').replace(/\.txt$/i, '')
          return k === specKey || k === spec.name || cleanK === cleanSpecName
        }) || specKey

      const data = mergedDatasetsMap[rawDataKey] || { x: [], y: [], rawLines: [] }

      const ds: Dataset = {
        name: spec.cleanName,
        color: spec.color,
        x: [...data.x],
        y: [...data.y],
        rawLines: [...data.rawLines],
        fileName: docBlock.name,
        filePath: spec.filePath || `${docBlock.name} > ${spec.name}`,
        smpSeriesName: spec.name,
        smpDataName: rawDataKey,
        smpDataHeaderRest: data.headerRest,
        smpSeriesStylePrefix: spec.stylePrefix,
        smpSeriesZerosLine: spec.zerosLine,
        smpSeriesFixed5: spec.fixed5,
        smpSeriesFillLine: spec.fillLine,
        smpExprFlag: spec.exprFlag,
        options: {
          show: true,
          lineColor: spec.color,
          width: spec.width ?? ((spec.stylePrefix || 60) / 100),
          lineStyle: 'solid',
          plotType: spec.plotType || 'no_dot',
          lineType: spec.lineType || 'solid',
          dotColor: spec.dotColor || spec.color,
          paintColor: spec.fillColor || '#ffffff',
          size: spec.markerSize || 3,
          xTransCheck: spec.xExpr !== 'x',
          xExpr: spec.xExpr,
          yTransCheck: spec.yExpr !== 'y',
          yExpr: spec.yExpr,
        },
      }
      docDatasets.push(ds)
      allDatasets.push(ds)
    })

    const isUSynced = !axisTop || (
      axisTop.min === axisX.min &&
      axisTop.max === axisX.max &&
      axisTop.step === axisX.step &&
      axisTop.showLabels === false
    )
    const isRSynced = !axisRight || (
      axisRight.min === axisY.min &&
      axisRight.max === axisY.max &&
      axisRight.step === axisY.step &&
      axisRight.showLabels === false
    )

    if (!axisTop) {
      axisTop = { ...axisX, showLabels: false, isSynced: true }
    } else {
      axisTop.isSynced = isUSynced
    }
    axisX.isSynced = isUSynced

    if (!axisRight) {
      axisRight = { ...axisY, showLabels: false, isSynced: true }
    } else {
      axisRight.isSynced = isRSynced
    }
    axisY.isSynced = isRSynced

    docs.push({
      name: docBlock.name,
      left: docLeft,
      top: docTop,
      width: docWidth,
      height: docHeight,
      frameWidth,
      frameColor,
      frameBgColor,
      graphFixed1,
      graphFixed2,
      mergeZeroLabels,
      datasets: docDatasets,
      axisX,
      axisY,
      axisTop,
      axisRight,
      syncWithU: isUSynced,
      syncWithR: isRSynced,
      legendItems,
      annotationLines,
      othersZerosLine,
      othersSymbolLine,
      xLabel,
      yLabel,
    })
  })

  // For single doc backwards compatibility:
  const firstDoc = docs[0]
  const legacyMeta: SmpMetadata = {
    docs,
    xMin: firstDoc?.axisX.min,
    xMax: firstDoc?.axisX.max,
    xStep: firstDoc?.axisX.step,
    yMin: firstDoc?.axisY.min,
    yMax: firstDoc?.axisY.max,
    yStep: firstDoc?.axisY.step,
    xLabel: firstDoc?.xLabel,
    yLabel: firstDoc?.yLabel,
  }

  return {
    datasets: allDatasets,
    smpMeta: legacyMeta,
  }
}


