import type { Dataset, SmpAxisSpec, SmpLegendItem, SmpLineAnnotation, SmpPlotDoc } from '../types.ts'
import { unicodeToSmp } from './smpSymbolMapper.ts'

export function hexToBgr(hex: string): number {
  if (!hex) return 0
  const cleanHex = hex.replace('#', '')
  if (cleanHex.length !== 6) return 0
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0
  return r | (g << 8) | (b << 16)
}

function formatDateTimestamp(): string {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`
}

function formatFloatSci(val: number): string {
  const str = val.toExponential(6)
  return str.replace(/e([+-])(\d)$/, 'e$10$2')
}

function plotTypeToCode(pt?: string): number {
  switch (pt) {
    case 'circle': return 5
    case 'filled_circle': return 1
    case 'square': return 6
    case 'filled_square': return 2
    case 'triangle': return 3
    case 'filled_triangle': return 4
    case 'diamond': return 11
    case 'filled_diamond': return 10
    default: return 0
  }
}

export function serializeSmpDoc(doc: SmpPlotDoc, isMultiDoc = false, writeData = true): string {
  const lines: string[] = []

  if (isMultiDoc && doc.name) {
    lines.push(`[${doc.name}]`)
  }
  lines.push(' Sma4Win ver. 1.8  SMP file')
  lines.push('')
  lines.push('1 1 215 279 0 0 0')

  const datasets = doc.datasets || []
  lines.push(`${datasets.length}`)

  // Series Specs
  datasets.forEach((ds) => {
    const cleanName = ds.name.replace(/^\d+\s+/, '').replace(/\.txt$/i, '')
    const specHeader = `[${ds.smpSeriesName || `${cleanName}.txt`}]`
    lines.push(specHeader)
    lines.push(ds.filePath || `C:\\Sma4Win\\${cleanName}.txt`)
    const numericPointCount = Math.min(ds.x?.length || 0, ds.y?.length || 0)
    const pointCount = numericPointCount || ds.rawLines?.filter((row) => row.length >= 2).length || 0
    lines.push(`0 0 0 0 0 1 ${pointCount} 0 -1 `)

    const bgrColor = hexToBgr(ds.options?.lineColor || ds.color || '#000000')
    lines.push(`60 ${bgrColor} 300 0 0 0 0`)
    const symCode = plotTypeToCode(ds.options?.plotType)
    const dotColorBgr = hexToBgr(ds.options?.dotColor || ds.options?.lineColor || ds.color || '#000000')
    const sizeVal = Math.round((ds.options?.size || 3) * 100)
    lines.push(`1 ${symCode} ${sizeVal} ${dotColorBgr}`)
    lines.push('0 0 1 0 0 0 16777215 5')
    const xExpr = ds.options?.xExpr || 'x'
    const yExpr = ds.options?.yExpr || 'y'
    const hasTransform = ds.options?.xTransCheck || ds.options?.yTransCheck || xExpr !== 'x' || yExpr !== 'y'
    lines.push(`0 ${hasTransform ? 1 : 0} 0`)
    lines.push(xExpr)
    lines.push(yExpr)
    lines.push('0 0 0 0 0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00')
    lines.push('1 40 0 300 1')
    lines.push('')
    lines.push('')
  })

  // GRAPH Section
  lines.push('[GRAPH]')
  const left = Math.round(doc.left || 5000)
  const top = Math.round(doc.top || 5000)
  const width = Math.round(doc.width || 10000)
  const height = Math.round(doc.height || 10000)
  lines.push(`${left} ${top} ${width} ${height}`)
  lines.push('100 1 0 0 1 0')
  lines.push('40 0 300 16777215')
  lines.push('')

  // AXIS Sections
  const formatAxis = (idx: number, axis?: SmpAxisSpec, defaultMin = 0, defaultMax = 100, defaultStep = 20) => {
    lines.push(`[AXIS-${idx}]`)
    const minStr = formatFloatSci(axis?.min ?? defaultMin)
    const maxStr = formatFloatSci(axis?.max ?? defaultMax)
    const stepStr = formatFloatSci(axis?.step ?? defaultStep)
    const subDivs = axis?.subDivs || 5
    lines.push(`${minStr} ${maxStr} ${stepStr} 0 0 10000 -1 -1 0 1 0 0 1 5 5 1.000000e+00 1`)

    const showTicks = axis?.showTicks !== false ? 1 : 0
    const showLabels = axis?.showLabels !== false ? 1 : 0
    const shiftR = Math.round((axis?.shiftRight || 0) * 100)
    const shiftD = Math.round((axis?.shiftDown || 0) * 100)

    const autoSt = axis?.autoStep ? 1 : 0
    if (idx === 0) {
      lines.push(`${subDivs} 0 1 ${autoSt} ${showTicks} ${showLabels} ${shiftR} ${shiftD} 0 300 100 0`)
    } else if (idx === 1) {
      lines.push(`${subDivs} 0 1 ${autoSt} ${showTicks} ${showLabels} ${shiftR} ${shiftD} 0 1200 100 0`)
    } else if (idx === 2) {
      lines.push(`${subDivs} 0 1 ${autoSt} ${showTicks} ${showLabels} ${shiftR} ${shiftD} 0 900 100 0`)
    } else {
      lines.push(`${subDivs} 0 1 ${autoSt} ${showTicks} ${showLabels} ${shiftR} ${shiftD} 0 0 100 0`)
    }

    const weight = (axis?.fontWeight || 400) >= 600 ? 700 : 400
    const fontSz = Math.round((axis?.fontSize || 12) * 100)
    const startVal = `-${fontSz}`
    const isItalic = axis?.fontStyle === 'italic' ? 1 : 0
    const extraVal = (idx === 0 || idx === 1) ? `162 3 2 1 18` : `0 0 0 2 18`
    lines.push(`${startVal} 0 0 0 ${weight} ${isItalic} 0 0 ${extraVal}`)
    lines.push(axis?.fontFamily || 'Times New Roman')

    const majIn = axis?.majorIn !== false ? 1 : 0
    const majOut = axis?.majorOut ? 1 : 0
    const majLen = Math.round((axis?.majorLength ?? 6) / 0.02)
    const majWidth = Math.round((axis?.majorWidth ?? 0.4) * 100)
    const majColorBgr = hexToBgr(axis?.majorColor || '#000000')
    const majStyleNum = axis?.majorStyle === 'dashed' ? 2 : axis?.majorStyle === 'dotted' ? 3 : 1
    lines.push(`${majIn} ${majOut} ${majLen} ${majWidth} ${majColorBgr} 300 ${majStyleNum}`)

    const minIn = axis?.minorIn !== false ? 1 : 0
    const minOut = axis?.minorOut ? 1 : 0
    const minLen = Math.round((axis?.minorLength ?? 3) / 0.02)
    const minWidth = Math.round((axis?.minorWidth ?? 0.4) * 100)
    const minColorBgr = hexToBgr(axis?.minorColor || '#000000')
    const minStyleNum = axis?.minorStyle === 'dashed' ? 2 : axis?.minorStyle === 'dotted' ? 3 : 1
    lines.push(`${minIn} ${minOut} ${minLen} ${minWidth} ${minColorBgr} 300 ${minStyleNum}`)
    lines.push('')
  }

  const uIsCommon = doc.commonWithU !== false && doc.axisX.isCommon !== false
  const axisTopExport: SmpAxisSpec = uIsCommon
    ? {
        ...(doc.axisTop || doc.axisX),
        min: doc.axisX.min,
        max: doc.axisX.max,
        step: doc.axisX.step,
        subDivs: doc.axisX.subDivs,
        autoStep: doc.axisX.autoStep,
        showLabels: false,
      }
    : (doc.axisTop || doc.axisX)

  const rIsCommon = doc.commonWithR !== false && doc.axisY.isCommon !== false
  const axisRightExport: SmpAxisSpec = rIsCommon
    ? {
        ...(doc.axisRight || doc.axisY),
        min: doc.axisY.min,
        max: doc.axisY.max,
        step: doc.axisY.step,
        subDivs: doc.axisY.subDivs,
        autoStep: doc.axisY.autoStep,
        showLabels: false,
      }
    : (doc.axisRight || doc.axisY)

  formatAxis(0, doc.axisX, 0, 100, 20)
  formatAxis(1, doc.axisY, 0, 100, 20)
  formatAxis(2, axisTopExport, 0, 100, 20)
  formatAxis(3, axisRightExport, 0, 100, 20)

  // LEGEND Section
  const legendItems: SmpLegendItem[] = [...(doc.legendItems || [])]
  if (legendItems.length === 0) {
    if (doc.xLabel) {
      legendItems.push({
        type: 'text',
        legendType: 4,
        text: doc.xLabel,
        rawText: doc.xLabel,
        xNorm: 2400,
        yNorm: 11400,
        rotation: 0,
        fontFamily: 'Times New Roman',
        fontSize: 12,
        fontWeight: 400,
      })
    }
    if (doc.yLabel) {
      legendItems.push({
        type: 'text',
        legendType: 5,
        text: doc.yLabel,
        rawText: doc.yLabel,
        xNorm: -400,
        yNorm: 5000,
        rotation: -90,
        fontFamily: 'Times New Roman',
        fontSize: 12,
        fontWeight: 400,
      })
    }
  }

  lines.push('[LEGEND]')

  // Gather all legend items and annotation lines for export
  const exportList: { isRect?: boolean; isLine?: boolean; isText?: boolean; rawLine?: string; item?: SmpLegendItem; aLine?: SmpLineAnnotation }[] = []

  legendItems.forEach((item) => {
    if (item.rawLine && item.rawLine.startsWith('3')) {
      // Raw rectangle line
      exportList.push({ isRect: true, rawLine: item.rawLine, item })
    } else if (item.type === 'annotation' || item.x2Norm !== undefined) {
      exportList.push({ isLine: true, item })
    } else {
      exportList.push({ isText: true, item })
    }
  })

  // Add any annotationLines that are rectangles and not yet in exportList
  const annotationLines = doc.annotationLines || []
  annotationLines.forEach((aLine) => {
    if (aLine.shape === 'rectangle' || aLine.shape === 'rect') {
      const alreadyExported = exportList.some(
        (e) => e.isRect && e.item && e.item.xNorm === aLine.x1Norm && e.item.yNorm === aLine.y1Norm
      )
      if (!alreadyExported) {
        exportList.push({ isRect: true, aLine })
      }
    }
  })

  lines.push(`${exportList.length}`)

  exportList.forEach((entry) => {
    if (entry.isRect) {
      lines.push('3')
      if (entry.rawLine) {
        lines.push(entry.rawLine)
      } else if (entry.aLine) {
        const aLine = entry.aLine
        const x1Str = formatFloatSci(aLine.x1Norm)
        const y1Str = formatFloatSci(aLine.y1Norm)
        const x2Str = formatFloatSci(aLine.x2Norm)
        const y2Str = formatFloatSci(aLine.y2Norm)
        const thickVal = Math.round((aLine.thickness ?? aLine.width ?? 0.4) * 100)
        const shadeVal = Math.round((aLine.shadeDepth ?? 0) * 100)
        const shadeBgr = hexToBgr(aLine.shadeColor || aLine.color || '#000000')
        const faceBgr = hexToBgr(aLine.faceColor || '#ffffff')
        const roundXVal = Math.round((aLine.roundX ?? 0) * 100)
        const roundYVal = Math.round((aLine.roundY ?? 0) * 100)
        const styleNum = aLine.style === 'dashed' ? 2 : aLine.style === 'dotted' ? 3 : 1
        lines.push(`${x1Str} ${y1Str} ${x2Str} ${y2Str} 0 0 40 ${shadeVal} ${shadeBgr} 3 ${thickVal} 1 ${faceBgr} ${roundXVal} ${roundYVal} ${styleNum} 30 100 0`)
      } else if (entry.item) {
        const x1Str = formatFloatSci(entry.item.xNorm)
        const y1Str = formatFloatSci(entry.item.yNorm)
        const x2Str = formatFloatSci(entry.item.x2Norm ?? 0)
        const y2Str = formatFloatSci(entry.item.y2Norm ?? 0)
        lines.push(`${x1Str} ${y1Str} ${x2Str} ${y2Str} 0 0 40 100 0 3 40 1 16777215 0 0 1 30 100 0`)
      }
      lines.push('')
    } else if (entry.isLine && entry.item) {
      const item = entry.item
      lines.push('0')
      if (item.rawLine) {
        lines.push(item.rawLine)
      } else {
        const x1Str = formatFloatSci(item.xNorm)
        const y1Str = formatFloatSci(item.yNorm)
        const x2Str = formatFloatSci(item.x2Norm ?? 0)
        const y2Str = formatFloatSci(item.y2Norm ?? 0)
        lines.push(`${x1Str} ${y1Str} ${x2Str} ${y2Str} 0 0 40 50 0 0 300 2 16777215 0 0 1 30 100 0`)
      }
      lines.push('')
    } else if (entry.item) {
      const item = entry.item
      lines.push(String(item.legendType ?? 8))
      lines.push(`${Math.round(item.xNorm)} ${Math.round(item.yNorm)} 0 1 0 0`)
      // `text` is the canonical Unicode form. `rawText` is kept for rendering
      // parsed files and may already contain the SMP-encoded representation;
      // converting it again would corrupt the 2-byte symbol sequences.
      lines.push(unicodeToSmp(item.text || item.rawText || '').replace(/\n/g, '\\n'))
      const rot = Math.round(item.rotation * 10)
      const weight = item.fontWeight >= 600 ? 700 : 400
      const szVal = Math.round((item.fontSize || 12) * 100)
      lines.push(`-${szVal} 0 ${rot} ${-rot} ${weight} 0 0 0 0 3 2 1 18`)
      lines.push(item.fontFamily || 'Times New Roman')
      // Native Sma4Win stores the Arphic option-font record with its own
      // charset/face parameters. Keeping these values is required for the
      // original application to import the text item correctly.
      lines.push(`-${szVal} 0 ${rot} ${-rot} ${weight} 0 0 0 128 3 2 1 50`)
      lines.push('Arphic PRound-Gothic Medium JIS')
      lines.push(`-${szVal} 0 ${rot} ${-rot} ${weight} 0 0 0 2 3 2 1 18`)
      lines.push('Symbol')
      lines.push('')
    }
  })

  // OTHERS & MASKS Section
  lines.push('[OTHERS]')
  lines.push(' 2')
  lines.push('0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00')
  lines.push('-2400 0 0 0 400 1 0 0 2 3 2 1 18')
  lines.push('Symbol')
  lines.push('')
  lines.push('[MASKS]')
  lines.push(' 0')
  lines.push('0')
  lines.push('0')
  lines.push('')

  // DATA Section (single-doc export includes its own [DATA]; multi-doc projects
  // collect every dataset into one trailing [DATA] section, matching real Sma4Win)
  if (writeData) {
    lines.push(...dataSectionLines(datasets))
  }

  // Sma4Win desktop app requires Windows CRLF line endings (\r\n)
  return lines.join('\r\n')
}

function dataSectionLines(datasets: Dataset[]): string[] {
  const lines: string[] = ['[DATA]']
  const nowStamp = formatDateTimestamp()

  let first = true
  for (const ds of datasets) {
    if (!first) lines.push('')
    first = false

    const cleanName = ds.name.replace(/^\d+\s+/, '').replace(/\.txt$/i, '')
    lines.push(`[${ds.smpDataName || `${cleanName}.txt`}] ${nowStamp}`)

    const rows: string[][] =
      ds.rawLines && ds.rawLines.length > 0
        ? ds.rawLines
        : (ds.x || []).map((x, i) => [String(x), String(ds.y?.[i] ?? 0)])

    if (rows.length > 0) {
      for (const row of rows) {
        lines.push(row.length >= 2 ? `${row[0]}\t${row[1]}` : row[0])
      }
      lines.push('[End of Data]')
    } else {
      lines.push('[End of Data]')
    }
  }

  return lines
}

export function serializeSmpProject(docs: SmpPlotDoc[]): string {
  if (docs.length === 0) return ''
  if (docs.length === 1) return serializeSmpDoc(docs[0], false)

  const chunks: string[] = [
    ' Sma4Win ver. 1.1  SMA file',
    `${docs.length} 0 0 0 0 100`,
    ...docs.map((doc) => serializeSmpDoc(doc, true, false)),
  ]

  // One shared [DATA] section at the end, de-duplicated by dataset name,
  // mirroring how real Sma4Win stores multi-plot project files.
  const allDatasets: Dataset[] = []
  const seen = new Set<string>()
  for (const doc of docs) {
    for (const ds of doc.datasets || []) {
      const dataKey = ds.smpDataName || ds.name
      if (!seen.has(dataKey)) {
        seen.add(dataKey)
        allDatasets.push(ds)
      }
    }
  }
  chunks.push(dataSectionLines(allDatasets).join('\r\n'))

  return chunks.join('\r\n')
}

export function downloadFile(content: string, fileName: string, mimeType = 'text/plain'): void {
  const blob = new Blob([encodeWindows1252(content)], { type: `${mimeType};charset=windows-1252` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// SMP files use Windows-1252 bytes. The symbol mapper returns a JavaScript
// string whose characters represent those decoded bytes, so it must be
// encoded explicitly before passing it to Blob (which otherwise uses UTF-8).
const WINDOWS_1252_SPECIAL_BYTES = new Map<number, number>([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
  [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
])

function encodeWindows1252(text: string): ArrayBuffer {
  const buffer = new ArrayBuffer(text.length)
  const bytes = new Uint8Array(buffer)
  let byteCount = 0

  for (const char of text) {
    const codePoint = char.codePointAt(0) || 0x3f
    let byte = WINDOWS_1252_SPECIAL_BYTES.get(codePoint)

    if (byte === undefined && codePoint <= 0xff) {
      // This also preserves the undefined C1 slots (0x81, 0x8d, 0x8f,
      // 0x90 and 0x9d) used by Sma4Win's custom symbol pairs.
      byte = codePoint
    }

    bytes[byteCount++] = byte ?? 0x3f
  }

  return buffer.slice(0, byteCount)
}
