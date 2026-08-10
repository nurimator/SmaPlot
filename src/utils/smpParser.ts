import type { Dataset, SmpAxisSpec, SmpLegendItem, SmpLineAnnotation, SmpMetadata, SmpPlotDoc } from '../types.ts'

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
  xExpr: string
  yExpr: string
  filePath?: string
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
    showTicks: true,
    showSubTicks: true,
    showLabels: true,
    insideTicks: true,
    fontFamily: 'Inter, sans-serif',
    fontWeight: 400,
  }
}

export function parseSmpContent(text: string, defaultFileName: string): ParseSmpResult {
  const lines = text.split(/\r?\n/)

  // Detect document blocks (e.g. [HEMATIT1.SMP], [HEMATIT2.SMP] or single doc)
  const docBlocks: { name: string; lines: string[] }[] = []
  let currentDocName = defaultFileName
  let currentDocLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.match(/^\[.*\.SMP\]$/i)) {
      if (currentDocLines.length > 0) {
        docBlocks.push({ name: currentDocName, lines: currentDocLines })
      }
      currentDocName = trimmed.slice(1, -1)
      currentDocLines = []
    } else {
      currentDocLines.push(line)
    }
  }
  if (currentDocLines.length > 0) {
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

    let axisX = createDefaultAxis(0, 100, 20)
    let axisY = createDefaultAxis(0, 100, 20)
    let axisTop: SmpAxisSpec | undefined
    let axisRight: SmpAxisSpec | undefined

    const legendItems: SmpLegendItem[] = []
    const annotationLines: SmpLineAnnotation[] = []
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
        let color = '#3b82f6'
        if (i < docLines.length) {
          const parts = docLines[i].trim().split(/\s+/)
          if (parts.length >= 2) {
            const colorInt = parseInt(parts[1], 10)
            if (!isNaN(colorInt) && colorInt > 0) {
              color = bgrToHex(colorInt)
            }
          }
          i++
        }
        if (i < docLines.length) i++ // config 3
        if (i < docLines.length) i++ // config 4
        if (i < docLines.length) i++ // config 5
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

        seriesSpecs[specHeader] = {
          name: specHeader,
          cleanName,
          color,
          xExpr,
          yExpr,
          filePath,
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
        currentSection = ''
        i++
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
          if (parts1.length >= 15) {
            axisSpec.subDivs = parseInt(parts1[14], 10) || 5
          }
        }

        i++
        if (i < docLines.length) {
          const parts2 = docLines[i].trim().split(/\s+/)
          if (parts2.length >= 6) {
            axisSpec.showTicks = parts2[3] === '1'
            axisSpec.insideTicks = parts2[4] === '1'
            axisSpec.showLabels = parts2[5] === '1'
          }
          i++
        }

        if (i < docLines.length) {
          const parts3 = docLines[i].trim().split(/\s+/)
          if (parts3.length >= 5) {
            const weightNum = parseInt(parts3[4], 10)
            axisSpec.fontWeight = weightNum >= 600 ? 600 : 400
          }
          i++
        }

        if (i < docLines.length) {
          axisSpec.fontFamily = docLines[i].trim() || 'Inter, sans-serif'
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
        if (line === '8') {
          i++
          if (i < docLines.length) {
            const posParts = docLines[i].trim().split(/\s+/)
            const xNorm = parseFloat(posParts[0])
            const yNorm = parseFloat(posParts[1])
            i++
            if (i < docLines.length) {
              const rawTxt = docLines[i].trim()
              const txt = rawTxt.replace(/\\n/g, '\n').replace(/@/g, '')
              i++
              let rotation = 0
              let fontWeight = 400
              let fontSize = 12
              if (i < docLines.length) {
                const styleParts = docLines[i].trim().split(/\s+/)
                if (styleParts.length >= 5) {
                  const rotVal = parseInt(styleParts[2], 10)
                  if (rotVal !== 0) rotation = rotVal / 10 // e.g. -900 -> -90 deg
                  const weightNum = parseInt(styleParts[4], 10)
                  if (weightNum >= 600) fontWeight = 600
                  const sizeVal = Math.abs(parseInt(styleParts[0], 10))
                  if (sizeVal > 0) fontSize = Math.max(10, Math.round(sizeVal / 120))
                }
                i++
              }
              let fontFamily = 'Inter, sans-serif'
              if (i < docLines.length && !docLines[i].trim().startsWith('[')) {
                fontFamily = docLines[i].trim() || 'Inter, sans-serif'
                i++
              }
              // Skip remaining font spec 2 & 3 lines for item 8 (4 lines total: spec2, name2, spec3, name3)
              if (i < docLines.length && !docLines[i].trim().startsWith('[')) i++
              if (i < docLines.length && !docLines[i].trim().startsWith('[')) i++
              if (i < docLines.length && !docLines[i].trim().startsWith('[')) i++
              if (i < docLines.length && !docLines[i].trim().startsWith('[')) i++
              if (i < docLines.length && !docLines[i].trim()) i++ // empty line after item 8

              if (txt.toLowerCase().includes('wavenumber') || txt.toLowerCase().includes('2 theta') || txt.toLowerCase().includes('wavelength')) {
                xLabel = txt.replace('cm^-1', 'cm⁻¹')
              } else if (txt.toLowerCase().includes('transmitance') || txt.toLowerCase().includes('transmittance') || txt.toLowerCase().includes('intensity') || txt.toLowerCase().includes('absorbance')) {
                yLabel = txt
              }

              legendItems.push({
                type: 'text',
                text: txt,
                rawText: rawTxt,
                xNorm,
                yNorm,
                rotation,
                fontFamily,
                fontSize,
                fontWeight,
              })
            }
          }
          continue
        } else if (line === '0') {
          i++
          if (i < docLines.length) {
            const rawLineStr = docLines[i].trim()
            const coords = rawLineStr.split(/\s+/)
            if (coords.length >= 4) {
              const x1Norm = parseFloat(coords[0])
              const y1Norm = parseFloat(coords[1])
              const x2Norm = parseFloat(coords[2])
              const y2Norm = parseFloat(coords[3])
              if (!isNaN(x1Norm) && !isNaN(y1Norm) && !isNaN(x2Norm) && !isNaN(y2Norm)) {
                annotationLines.push({ x1Norm, y1Norm, x2Norm, y2Norm, style: 'dashed', width: 1 })
                legendItems.push({
                  type: 'annotation',
                  text: '',
                  rawLine: rawLineStr,
                  xNorm: x1Norm,
                  yNorm: y1Norm,
                  x2Norm,
                  y2Norm,
                  rotation: 0,
                  fontFamily: '',
                  fontSize: 0,
                  fontWeight: 0,
                })
              }
            }
            i++
            if (i < docLines.length && !docLines[i].trim()) i++ // empty line after item 0
          }
          continue
        }
        i++
        continue
      }

      i++
    }

    // Parse datasets for this document
    const datasetsMap: Record<string, { x: number[]; y: number[]; rawLines: string[][] }> = {}
    let activeDataHeader = ''
    let inDataBlock = false

    for (const rawLine of docLines) {
      const line = rawLine.trim()
      if (line === '[DATA]') {
        inDataBlock = true
        continue
      }
      if (!inDataBlock) continue
      if (line.startsWith('[OTHERS]') || line.startsWith('[MASKS]')) {
        inDataBlock = false
        continue
      }

      if (line.startsWith('[') && line.includes(']')) {
        activeDataHeader = line.split(']')[0].slice(1).trim()
        if (!datasetsMap[activeDataHeader]) {
          datasetsMap[activeDataHeader] = { x: [], y: [], rawLines: [] }
        }
        continue
      }

      if (!activeDataHeader) continue

      if (line.includes('[End of Data]')) {
        const cleanLine = line.replace('[End of Data]', '').trim()
        if (cleanLine) {
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

    const docDatasets: Dataset[] = []
    const headerKeys = Object.keys(datasetsMap)

    headerKeys.forEach((key) => {
      const spec = seriesSpecs[key] || {
        name: key,
        cleanName: key.replace(/^\d+\s+/, '').replace(/\.txt$/i, ''),
        color: '#3b82f6',
        xExpr: 'x',
        yExpr: 'y',
        filePath: '',
      }
      const data = datasetsMap[key]

      const ds: Dataset = {
        name: spec.cleanName,
        color: spec.color,
        x: data.x,
        y: data.y,
        rawLines: data.rawLines,
        fileName: docBlock.name,
        filePath: spec.filePath || `${docBlock.name} > ${spec.name}`,
        options: {
          show: true,
          lineColor: spec.color,
          lineStyle: 'solid',
          plotType: 'no_dot',
          lineType: 'solid',
          xTransCheck: spec.xExpr !== 'x',
          xExpr: spec.xExpr,
          yTransCheck: spec.yExpr !== 'y',
          yExpr: spec.yExpr,
        },
      }
      docDatasets.push(ds)
      allDatasets.push(ds)
    })

    docs.push({
      name: docBlock.name,
      left: docLeft,
      top: docTop,
      width: docWidth,
      height: docHeight,
      datasets: docDatasets,
      axisX,
      axisY,
      axisTop,
      axisRight,
      legendItems,
      annotationLines,
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
