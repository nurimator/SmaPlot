import type { Dataset, SmpAxisSpec, SmpLegendItem, SmpLineAnnotation, SmpPlotDoc } from '../types.ts'
import { unicodeToSmp } from './smpSymbolMapper.ts'

// --- Sma4Win internal unit conversions ---------------------------------
const MM_TO_SMP = 100 // width/thickness/size: 1 mm = 100 SMP units
const SMP_TICK_UNIT_MM = 0.02 // tick length: 1 SMP unit = 0.02 mm (mm / 0.02 = units)
const DEG_TO_SMP = 10 // rotation: 1 degree = 10 SMP units

// --- Colors --------------------------------------------------------------
const COLOR_WHITE_BGR = 0xffffff // 16777215, white as BGR int
const COLOR_BLACK_HEX = '#000000'
const COLOR_FACE_HEX = '#ffffff'
// Opaque per-axis label color codes: index 0=X, 1=Y, 2=Top, 3=Right.
const AXIS_LABEL_COLOR: readonly number[] = [300, 1200, 900, 0]

// --- Fallback defaults (values bound to optional doc/axis/item fields) ---
const DEFAULT_PLOT_GEOM = { left: 5000, top: 5000, width: 10000, height: 10000 }
const DEFAULT_AXIS_RANGE = { min: 0, max: 100, step: 20 }
const DEFAULT_AXIS = {
  subDivs: 5,
  fontSize: 12,
  fontFamily: 'Times New Roman',
  weight: 400,
  boldWeight: 600,
  majorLength: 6,
  majorWidth: 0.4,
  minorLength: 3,
  minorWidth: 0.4,
}
const DEFAULT_SERIES_SIZE = 3
const DEFAULT_LEGEND_TYPE = 8
const DEFAULT_XLABEL_POS = { x: 2400, y: 11400 }
const DEFAULT_YLABEL_POS = { x: -400, y: 5000, rotation: -90 }
const DEFAULT_ANNOTATION = { thickness: 0.4, shade: 0, round: 0 }

// --- Fixed Sma4Win format records (opaque grammar, keep byte-identical) ---
const HEADER_SMP_FILE = ' Sma4Win ver. 1.8  SMP file'
const HEADER_SMA_FILE = ' Sma4Win ver. 1.1  SMA file'
const PAGE_SETUP_LINE = '1 1 215 279 0 0 0' // A4 page setup
const GRAPH_FIXED_1 = '100 1 0 0 1 0'
const GRAPH_FIXED_2 = '40 0 300 16777215' // frame/background (16777215 = white)
const AXIS_FIXED_TAIL = '0 0 10000 -1 -1 0 1 0 0 1 5 5 1.000000e+00 1'
const AXIS_FONT_EXTRA = ['162 3 2 1 18', '0 0 0 2 18'] as const // idx 0|1 vs 2|3
const OTHERS_HEADER = ' 2'
const OTHERS_ZEROS = '0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00'
const OTHERS_SYMBOL_LINE = '-2400 0 0 0 400 1 0 0 2 3 2 1 18'
const MASKS_HEADER = ' 0'
const FONT_NAME_SYMBOL = 'Symbol'
const FONT_NAME_ARCHIC = 'Arphic PRound-Gothic Medium JIS'
const LEGEND_POS_TAIL = '0 1 0 0'
const SMP_FALLBACK_DIR = 'C:\\Sma4Win\\'

// --- Series spec record lines ---------------------------------------------
const SERIES_COUNT_LINE = (n: number): string => `0 0 0 0 0 1 ${n} 0 -1 `
const SERIES_STYLE_LINE = (prefix: number, color: number): string => `${prefix} ${color} 300 0 0 0 0`
const SERIES_SYMBOL_LINE = (sym: number, size: number, color: number): string => `1 ${sym} ${size} ${color}`
const SERIES_FIXED_LINE_3 = '0 0 1 0 0 0 16777215 5'
const SERIES_EXPR_LINE = (transformed: boolean): string => `0 ${transformed ? 1 : 0} 0`
const SERIES_ZEROS_LINE = '0 0 0 0 0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00'
const SERIES_FIXED_LINE_5 = '1 40 0 300 1'

// --- Legend text font records (charset + mode differ per font) ------------
function fontRecordLine(szVal: number, rot: number, weight: number, charset: number, mode: number): string {
  return `-${szVal} 0 ${rot} ${-rot} ${weight} 0 0 0 ${charset} 3 2 1 ${mode}`
}
const FONT_SPEC_TIMES = (sz: number, rot: number, weight: number): string => fontRecordLine(sz, rot, weight, 0, 18)
const FONT_SPEC_ARCHIC = (sz: number, rot: number, weight: number): string => fontRecordLine(sz, rot, weight, 128, 50)
const FONT_SPEC_SYMBOL = (sz: number, rot: number, weight: number): string => fontRecordLine(sz, rot, weight, 2, 18)

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

function seriesSpecLines(ds: Dataset, pointCount: number): string[] {
  const cleanName = ds.name.replace(/^\d+\s+/, '').replace(/\.txt$/i, '')
  const bgrColor = hexToBgr(ds.options?.lineColor || ds.color || COLOR_BLACK_HEX)
  const symCode = plotTypeToCode(ds.options?.plotType)
  const dotColorBgr = hexToBgr(ds.options?.dotColor || ds.options?.lineColor || ds.color || COLOR_BLACK_HEX)
  const sizeVal = Math.round((ds.options?.size || DEFAULT_SERIES_SIZE) * MM_TO_SMP)
  const xExpr = ds.options?.xExpr || 'x'
  const yExpr = ds.options?.yExpr || 'y'
  const hasTransform = ds.options?.xTransCheck || ds.options?.yTransCheck || xExpr !== 'x' || yExpr !== 'y'
  const widthMm = ds.options?.width ?? (ds.smpSeriesStylePrefix ? ds.smpSeriesStylePrefix / 100 : 0.6)
  const stylePrefix = Math.round(widthMm * 100)
  const exprFlag = ds.smpExprFlag || SERIES_EXPR_LINE(hasTransform)
  const zerosLine = ds.smpSeriesZerosLine || SERIES_ZEROS_LINE
  const fixed5 = ds.smpSeriesFixed5 || SERIES_FIXED_LINE_5
  return [
    `[${ds.smpSeriesName || `${cleanName}.txt`}]`,
    ds.filePath || `${SMP_FALLBACK_DIR}${cleanName}.txt`,
    SERIES_COUNT_LINE(pointCount),
    SERIES_STYLE_LINE(stylePrefix, bgrColor),
    SERIES_SYMBOL_LINE(symCode, sizeVal, dotColorBgr),
    SERIES_FIXED_LINE_3,
    exprFlag,
    xExpr,
    yExpr,
    zerosLine,
    fixed5,
    '',
    '',
  ]
}

export function serializeSmpDoc(doc: SmpPlotDoc, isMultiDoc = false, writeData = true): string {
  const lines: string[] = []

  if (isMultiDoc && doc.name) {
    lines.push(`[${doc.name}]`)
  }
  lines.push(HEADER_SMP_FILE)
  lines.push('')
  lines.push(PAGE_SETUP_LINE)

  const datasets = doc.datasets || []
  lines.push(`${datasets.length}`)

  // Series Specs
  datasets.forEach((ds) => {
    const numericPointCount = Math.min(ds.x?.length || 0, ds.y?.length || 0)
    const pointCount = numericPointCount || ds.rawLines?.filter((row) => row.length >= 2).length || 0
    lines.push(...seriesSpecLines(ds, pointCount))
  })

  // GRAPH Section
  lines.push('[GRAPH]')
  const left = Math.round(doc.left || DEFAULT_PLOT_GEOM.left)
  const top = Math.round(doc.top || DEFAULT_PLOT_GEOM.top)
  const width = Math.round(doc.width || DEFAULT_PLOT_GEOM.width)
  const height = Math.round(doc.height || DEFAULT_PLOT_GEOM.height)
  lines.push(`${left} ${top} ${width} ${height}`)
  lines.push(doc.graphFixed1 || GRAPH_FIXED_1)
  if (doc.graphFixed2 && !doc.frameWidth && !doc.frameColor) {
    lines.push(doc.graphFixed2)
  } else if (doc.frameWidth === undefined && doc.frameColor === undefined && doc.frameBgColor === undefined) {
    lines.push(GRAPH_FIXED_2)
  } else {
    const fw = Math.round((doc.frameWidth ?? 0.4) * 100)
    const fc = hexToBgr(doc.frameColor || COLOR_BLACK_HEX)
    const bg = hexToBgr(doc.frameBgColor || COLOR_FACE_HEX)
    lines.push(`${fw} ${fc} 300 ${bg}`)
  }
  lines.push('')

  // AXIS Sections
  const formatAxis = (idx: number, axis?: SmpAxisSpec) => {
    lines.push(`[AXIS-${idx}]`)
    let minStr: string
    let maxStr: string
    let stepStr: string
    if (axis?.rawFormatSci) {
      minStr = formatFloatSci(axis.min)
      maxStr = formatFloatSci(axis.max)
      stepStr = formatFloatSci(axis.step)
    } else if (axis?.rawFixedTail) {
      minStr = String(axis.min ?? DEFAULT_AXIS_RANGE.min)
      maxStr = String(axis.max ?? DEFAULT_AXIS_RANGE.max)
      stepStr = String(axis.step ?? DEFAULT_AXIS_RANGE.step)
    } else {
      minStr = formatFloatSci(axis?.min ?? DEFAULT_AXIS_RANGE.min)
      maxStr = formatFloatSci(axis?.max ?? DEFAULT_AXIS_RANGE.max)
      stepStr = formatFloatSci(axis?.step ?? DEFAULT_AXIS_RANGE.step)
    }
    const fixedTail = axis?.rawFixedTail || AXIS_FIXED_TAIL
    lines.push(`${minStr} ${maxStr} ${stepStr} ${fixedTail}`)

    if (axis?.rawLine2) {
      lines.push(axis.rawLine2)
    } else {
      const showTicks = axis?.showTicks !== false ? 1 : 0
      const showLabels = axis?.showLabels !== false ? 1 : 0
      const shiftR = Math.round((axis?.shiftRight || 0) * MM_TO_SMP)
      const shiftD = Math.round((axis?.shiftDown || 0) * MM_TO_SMP)
      const autoSt = axis?.autoStep ? 1 : 0
      const labelColor = axis?.labelColorCode || (AXIS_LABEL_COLOR[idx] ?? '300')
      const l2Tail = axis?.rawLine2Tail || (idx === 0 || idx === 1 ? '100 0' : '100 0')
      const insideTk = axis?.insideTicks ? 1 : 0
      const subDivs = axis?.subDivs || DEFAULT_AXIS.subDivs
      lines.push(`${subDivs} 0 ${insideTk} ${autoSt} ${showTicks} ${showLabels} ${shiftR} ${shiftD} 0 ${labelColor} ${l2Tail}`)
    }

    if (axis?.rawFontExtra) {
      const fontSz = Math.round((axis?.fontSize || DEFAULT_AXIS.fontSize) * MM_TO_SMP)
      const weight = (axis?.fontWeight || DEFAULT_AXIS.weight) >= DEFAULT_AXIS.boldWeight ? 700 : 400
      const isItalic = axis?.fontStyle === 'italic' ? 1 : 0
      lines.push(`-${fontSz} 0 0 0 ${weight} ${isItalic} 0 0 ${axis.rawFontExtra}`)
    } else {
      const weight = (axis?.fontWeight || DEFAULT_AXIS.weight) >= DEFAULT_AXIS.boldWeight ? 700 : 400
      const fontSz = Math.round((axis?.fontSize || DEFAULT_AXIS.fontSize) * MM_TO_SMP)
      const startVal = `-${fontSz}`
      const isItalic = axis?.fontStyle === 'italic' ? 1 : 0
      const extraVal = (idx === 0 || idx === 1) ? AXIS_FONT_EXTRA[0] : AXIS_FONT_EXTRA[1]
      lines.push(`${startVal} 0 0 0 ${weight} ${isItalic} 0 0 ${extraVal}`)
    }
    lines.push(axis?.fontFamily || DEFAULT_AXIS.fontFamily)

    if (axis?.rawMajLine) {
      lines.push(axis.rawMajLine)
    } else {
      const majIn = axis?.majorIn !== false ? 1 : 0
      const majOut = axis?.majorOut ? 1 : 0
      const majLen = Math.round((axis?.majorLength ?? DEFAULT_AXIS.majorLength) / SMP_TICK_UNIT_MM)
      const majWidth = Math.round((axis?.majorWidth ?? DEFAULT_AXIS.majorWidth) * MM_TO_SMP)
      const majColorBgr = hexToBgr(axis?.majorColor || COLOR_BLACK_HEX)
      const majStyleNum = axis?.majorStyle === 'dashed' ? 2 : axis?.majorStyle === 'dotted' ? 3 : 1
      lines.push(`${majIn} ${majOut} ${majLen} ${majWidth} ${majColorBgr} 300 ${majStyleNum}`)
    }

    if (axis?.rawMinLine) {
      lines.push(axis.rawMinLine)
    } else {
      const minIn = axis?.minorIn !== false ? 1 : 0
      const minOut = axis?.minorOut ? 1 : 0
      const minLen = Math.round((axis?.minorLength ?? DEFAULT_AXIS.minorLength) / SMP_TICK_UNIT_MM)
      const minWidth = Math.round((axis?.minorWidth ?? DEFAULT_AXIS.minorWidth) * MM_TO_SMP)
      const minColorBgr = hexToBgr(axis?.minorColor || COLOR_BLACK_HEX)
      const minStyleNum = axis?.minorStyle === 'dashed' ? 2 : axis?.minorStyle === 'dotted' ? 3 : 1
      lines.push(`${minIn} ${minOut} ${minLen} ${minWidth} ${minColorBgr} 300 ${minStyleNum}`)
    }
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

  formatAxis(0, doc.axisX)
  formatAxis(1, doc.axisY)
  formatAxis(2, axisTopExport)
  formatAxis(3, axisRightExport)

  // LEGEND Section
  const legendItems: SmpLegendItem[] = [...(doc.legendItems || [])]
  if (legendItems.length === 0) {
    if (doc.xLabel) {
      legendItems.push({
        type: 'text',
        legendType: 4,
        text: doc.xLabel,
        rawText: doc.xLabel,
        xNorm: DEFAULT_XLABEL_POS.x,
        yNorm: DEFAULT_XLABEL_POS.y,
        rotation: 0,
        fontFamily: DEFAULT_AXIS.fontFamily,
        fontSize: DEFAULT_AXIS.fontSize,
        fontWeight: DEFAULT_AXIS.weight,
      })
    }
    if (doc.yLabel) {
      legendItems.push({
        type: 'text',
        legendType: 5,
        text: doc.yLabel,
        rawText: doc.yLabel,
        xNorm: DEFAULT_YLABEL_POS.x,
        yNorm: DEFAULT_YLABEL_POS.y,
        rotation: DEFAULT_YLABEL_POS.rotation,
        fontFamily: DEFAULT_AXIS.fontFamily,
        fontSize: DEFAULT_AXIS.fontSize,
        fontWeight: DEFAULT_AXIS.weight,
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

  // Add any annotationLines that are not yet in exportList
  const annotationLines = doc.annotationLines || []
  annotationLines.forEach((aLine) => {
    const isRect = aLine.shape === 'rectangle' || aLine.shape === 'rect' || aLine.rawType === '3'
    const alreadyExported = exportList.some(
      (e) => (e.isRect === isRect || e.isLine === !isRect) &&
        ((e.item && e.item.xNorm === aLine.x1Norm && e.item.yNorm === aLine.y1Norm) ||
         (e.aLine && e.aLine.x1Norm === aLine.x1Norm && e.aLine.y1Norm === aLine.y1Norm))
    )
    if (!alreadyExported) {
      if (isRect) {
        exportList.push({ isRect: true, aLine })
      } else {
        exportList.push({ isLine: true, aLine })
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
        const thickVal = Math.round((aLine.thickness ?? aLine.width ?? DEFAULT_ANNOTATION.thickness) * MM_TO_SMP)
        const shadeVal = Math.round((aLine.shadeDepth ?? DEFAULT_ANNOTATION.shade) * MM_TO_SMP)
        const shadeBgr = hexToBgr(aLine.shadeColor || aLine.color || COLOR_BLACK_HEX)
        const faceBgr = hexToBgr(aLine.faceColor || COLOR_FACE_HEX)
        const roundXVal = Math.round((aLine.roundX ?? DEFAULT_ANNOTATION.round) * MM_TO_SMP)
        const roundYVal = Math.round((aLine.roundY ?? DEFAULT_ANNOTATION.round) * MM_TO_SMP)
        const styleNum = aLine.style === 'dashed' ? 2 : aLine.style === 'dotted' ? 3 : 1
        lines.push(`${x1Str} ${y1Str} ${x2Str} ${y2Str} 0 0 40 ${shadeVal} ${shadeBgr} 3 ${thickVal} 1 ${faceBgr} ${roundXVal} ${roundYVal} ${styleNum} 30 100 0`)
      } else if (entry.item) {
        const x1Str = formatFloatSci(entry.item.xNorm)
        const y1Str = formatFloatSci(entry.item.yNorm)
        const x2Str = formatFloatSci(entry.item.x2Norm ?? 0)
        const y2Str = formatFloatSci(entry.item.y2Norm ?? 0)
        lines.push(`${x1Str} ${y1Str} ${x2Str} ${y2Str} 0 0 40 100 0 3 40 1 ${COLOR_WHITE_BGR} 0 0 1 30 100 0`)
      }
      lines.push('')
    } else if (entry.isLine) {
      const aLine = entry.aLine
      const item = entry.item
      const itemType = aLine?.rawType || (aLine?.shape === 'dimension' ? '2' : '0')
      lines.push(itemType)
      if (aLine?.rawLineStr) {
        lines.push(aLine.rawLineStr)
      } else if (item?.rawLine) {
        lines.push(item.rawLine)
      } else if (aLine) {
        const x1Str = formatFloatSci(aLine.x1Norm)
        const y1Str = formatFloatSci(aLine.y1Norm)
        const x2Str = formatFloatSci(aLine.x2Norm)
        const y2Str = formatFloatSci(aLine.y2Norm)
        const unitXCode = aLine.unitX === 'xa' ? 1 : aLine.unitX === 'ua' ? 2 : 0
        const unitYCode = aLine.unitY === 'ya' ? 1 : aLine.unitY === 'ra' ? 2 : (aLine.shape === 'dimension' || aLine.rawType === '2' ? 2 : 0)
        const widthCode = Math.round((aLine.width ?? 0.4) * 100)
        const headCode = Math.round((aLine.arrowhead ?? 5.0) * 100)
        const colorCode = hexToBgr(aLine.color || '#000000')
        const styleCode = aLine.style === 'dashed' ? 2 : aLine.style === 'dotted' ? 3 : 1
        const faceCode = hexToBgr(aLine.faceColor || '#ffffff')
        const modeCode = aLine.arrowMode !== undefined ? aLine.arrowMode : (aLine.shape === 'arrow_start' ? 2 : aLine.shape === 'arrow_both' ? 3 : aLine.shape === 'line' || aLine.shape === 'dimension' ? 0 : 1)
        const spreadCode = Math.round(aLine.spread ?? 30)
        const shutCode = Math.round(aLine.shut ?? 100)
        lines.push(`${x1Str} ${y1Str} ${x2Str} ${y2Str} ${unitXCode} ${unitYCode} ${widthCode} ${headCode} ${colorCode} 0 300 ${styleCode} ${faceCode} 0 0 ${modeCode} ${spreadCode} ${shutCode} 0`)
      } else if (item) {
        const x1Str = formatFloatSci(item.xNorm)
        const y1Str = formatFloatSci(item.yNorm)
        const x2Str = formatFloatSci(item.x2Norm ?? 0)
        const y2Str = formatFloatSci(item.y2Norm ?? 0)
        lines.push(`${x1Str} ${y1Str} ${x2Str} ${y2Str} 0 0 40 500 0 0 300 1 ${COLOR_WHITE_BGR} 0 0 1 30 100 0`)
      }
      lines.push('')
    } else if (entry.item) {
      const item = entry.item
      lines.push(String(item.legendType ?? DEFAULT_LEGEND_TYPE))
      const posTail = item.posTail || LEGEND_POS_TAIL
      lines.push(`${Math.round(item.xNorm)} ${Math.round(item.yNorm)} ${posTail}`)
      // `text` is the canonical Unicode form. `rawText` is kept for rendering
      // parsed files and may already contain the SMP-encoded representation;
      // converting it again would corrupt the 2-byte symbol sequences.
      lines.push(unicodeToSmp(item.text || item.rawText || '').replace(/\n/g, '\\n'))
      const rot = Math.round(item.rotation * DEG_TO_SMP)
      const weight = item.fontWeight >= DEFAULT_AXIS.boldWeight ? 700 : 400
      const szVal = Math.round((item.fontSize || DEFAULT_AXIS.fontSize) * MM_TO_SMP)
      lines.push(item.font1Spec || FONT_SPEC_TIMES(szVal, rot, weight))
      lines.push(item.fontFamily || DEFAULT_AXIS.fontFamily)
      // Native Sma4Win stores the Arphic option-font record with its own
      // charset/face parameters. Keeping these values is required for the
      // original application to import the text item correctly.
      lines.push(item.font2Spec || FONT_SPEC_ARCHIC(szVal, rot, weight))
      lines.push(item.optionFontFamily || item.fontFamily || FONT_NAME_ARCHIC)
      lines.push(item.font3Spec || FONT_SPEC_SYMBOL(szVal, rot, weight))
      lines.push(item.symbolFontFamily || FONT_NAME_SYMBOL)
      lines.push('')
    }
  })

  // OTHERS & MASKS Section
  lines.push('[OTHERS]')
  lines.push(OTHERS_HEADER)
  lines.push(doc.othersZerosLine || OTHERS_ZEROS)
  lines.push(doc.othersSymbolLine || OTHERS_SYMBOL_LINE)
  lines.push(FONT_NAME_SYMBOL)
  lines.push('')
  lines.push('[MASKS]')
  lines.push(MASKS_HEADER)
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
    const headerInfo = ds.smpDataHeaderRest || nowStamp
    lines.push(`[${ds.smpDataName || `${cleanName}.txt`}] ${headerInfo}`)

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
    HEADER_SMA_FILE,
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

export async function saveFileWithPicker(
  content: string,
  suggestedName: string
): Promise<string | null | undefined> {
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const handle = await (window as unknown as {
        showSaveFilePicker: (options: unknown) => Promise<FileSystemFileHandle>
      }).showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: 'Sma4Win Project (*.SMP)',
            accept: {
              'application/octet-stream': ['.smp', '.SMP'],
              'text/plain': ['.smp', '.SMP'],
            },
          },
        ],
      })
      const writable = await handle.createWritable()
      const data = encodeWindows1252(content)
      await writable.write(data)
      await writable.close()
      return handle.name || suggestedName
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User cancelled the native save dialog
        return null
      }
      console.warn('Native showSaveFilePicker failed:', err)
    }
  }
  return undefined
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
