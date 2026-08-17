import type { Dataset, SmpAxisSpec, SmpLegendItem, SmpLineAnnotation, SmpPlotDoc } from '../types.ts'
import { unicodeToSmp } from './smpSymbolMapper.ts'

const MM_TO_SMP = 100
const SMP_TICK_UNIT_MM = 0.02
const DEG_TO_SMP = 10

const COLOR_WHITE_BGR = 0xffffff
const COLOR_BLACK_HEX = '#000000'
const COLOR_FACE_HEX = '#ffffff'
const AXIS_LABEL_COLOR: readonly number[] = [300, 1200, 900, 0]

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

const HEADER_SMP_FILE = ' Sma4Win ver. 1.8  SMP file'
const HEADER_SMA_FILE = ' Sma4Win ver. 1.1  SMA file'
const PAGE_SETUP_LINE = '1 1 215 279 0 0 0'
const GRAPH_FIXED_1 = '100 1 0 0 1 0'
const GRAPH_FIXED_2 = '40 0 300 16777215'
const AXIS_FIXED_TAIL = '0 0 10000 -1 -1 0 1 0 0 1 5 5 1.000000e+00 1'
const AXIS_FONT_EXTRA = ['162 3 2 1 18', '0 0 0 2 18'] as const
const OTHERS_HEADER = ' 2'
const OTHERS_ZEROS = '0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00'
const OTHERS_SYMBOL_LINE = '-2400 0 0 0 400 1 0 0 2 3 2 1 18'
const MASKS_HEADER = ' 0'
const FONT_NAME_SYMBOL = 'Symbol'
const FONT_NAME_ARCHIC = 'Arphic PRound-Gothic Medium JIS'
const LEGEND_POS_TAIL = '0 1 0 0'
const SMP_FALLBACK_DIR = 'C:\\Sma4Win\\'

const SERIES_COUNT_LINE = (n: number): string => `0 0 0 0 0 1 ${n} 0 -1 `
const SERIES_STYLE_LINE = (prefix: number, color: number): string => `${prefix} ${color} 300 0 0 0 0`
const SERIES_SYMBOL_LINE = (pen: number, sym: number, size: number, color: number): string => `${pen} ${sym} ${size} ${color}`
const SERIES_FILL_LINE = (fillBgr: number): string => `0 0 1 0 0 0 ${fillBgr} 5`
const SERIES_EXPR_LINE = (transformed: boolean): string => `0 ${transformed ? 1 : 0} 0`
const SERIES_ZEROS_LINE = '0 0 0 0 0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00'
const SERIES_FIXED_LINE_5 = '1 40 0 300 1'

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
    case 'filled_circle': return 1
    case 'circle': return 2
    case 'filled_triangle': return 3
    case 'triangle': return 4
    case 'filled_square': return 5
    case 'square': return 6
    case 'filled_triangle_down': return 7
    case 'triangle_down': return 8
    case 'filled_diamond': return 9
    case 'diamond': return 10
    case 'plus': return 11
    case 'cross': return 12
    case 'star': return 41
    default: return 0
  }
}

function lineTypeToCode(lt?: string): number {
  switch (lt) {
    case 'dash':
    case 'dashed': return 2
    case 'dotted': return 3
    case 'dash_dot': return 4
    case 'dash_dot_dot': return 5
    case 'face': return 6
    default: return 1
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
    SERIES_SYMBOL_LINE(lineTypeToCode(ds.options?.lineType), symCode, sizeVal, dotColorBgr),
    ds.smpSeriesFillLine || SERIES_FILL_LINE(hexToBgr(ds.options?.paintColor || COLOR_FACE_HEX)),
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

  datasets.forEach((ds) => {
    const numericPointCount = Math.min(ds.x?.length || 0, ds.y?.length || 0)
    const pointCount = numericPointCount || ds.rawLines?.filter((row) => row.length >= 2).length || 0
    lines.push(...seriesSpecLines(ds, pointCount))
  })

  lines.push('[GRAPH]')
  const left = Math.round(doc.left || DEFAULT_PLOT_GEOM.left)
  const top = Math.round(doc.top || DEFAULT_PLOT_GEOM.top)
  const width = Math.round(doc.width || DEFAULT_PLOT_GEOM.width)
  const height = Math.round(doc.height || DEFAULT_PLOT_GEOM.height)
  lines.push(`${left} ${top} ${width} ${height}`)
  const gTokens = (doc.graphFixed1 || GRAPH_FIXED_1).split(/\s+/)
  if (gTokens.length > 2) gTokens[2] = doc.mergeZeroLabels ? '1' : '0'
  lines.push(gTokens.join(' '))
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
    const tailTokens = (axis?.rawFixedTail || AXIS_FIXED_TAIL).split(/\s+/)
    if (tailTokens.length > 7) tailTokens[7] = axis?.addPlusSign ? '1' : '0'
    const fixedTail = tailTokens.join(' ')
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
      const fontSz = Math.round((axis?.fontSize || 24) * MM_TO_SMP)
      const weight = (axis?.fontWeight || DEFAULT_AXIS.weight) >= DEFAULT_AXIS.boldWeight ? 700 : 400
      const isItalic = axis?.fontStyle === 'italic' ? 1 : 0
      lines.push(`-${fontSz} 0 0 0 ${weight} ${isItalic} 0 0 ${axis.rawFontExtra}`)
    } else {
      const weight = (axis?.fontWeight || DEFAULT_AXIS.weight) >= DEFAULT_AXIS.boldWeight ? 700 : 400
      const fontSz = Math.round((axis?.fontSize || 24) * MM_TO_SMP)
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

  const uIsSynced = doc.syncWithU !== false && doc.axisX.isSynced !== false
  const axisTopExport: SmpAxisSpec = uIsSynced
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

  const rIsSynced = doc.syncWithR !== false && doc.axisY.isSynced !== false
  const axisRightExport: SmpAxisSpec = rIsSynced
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

  const exportList: { isRect?: boolean; isLine?: boolean; isText?: boolean; rawLine?: string; item?: SmpLegendItem; aLine?: SmpLineAnnotation }[] = []

  legendItems.forEach((item) => {
    if (item.rawLine && item.rawLine.startsWith('3')) {
      exportList.push({ isRect: true, rawLine: item.rawLine, item })
    } else if (item.type === 'annotation' || item.x2Norm !== undefined) {
      exportList.push({ isLine: true, item })
    } else {
      exportList.push({ isText: true, item })
    }
  })

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
      let computed: string | null = null
      if (entry.aLine) {
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
        const styleNum = (aLine.style === 'dashed' || aLine.style === 'dash') ? 2 : aLine.style === 'dotted' ? 3 : 1
        computed = `${x1Str} ${y1Str} ${x2Str} ${y2Str} 0 0 40 ${shadeVal} ${shadeBgr} 3 ${thickVal} 1 ${faceBgr} ${roundXVal} ${roundYVal} ${styleNum} 30 100 0`
      } else if (entry.item) {
        const x1Str = formatFloatSci(entry.item.xNorm)
        const y1Str = formatFloatSci(entry.item.yNorm)
        const x2Str = formatFloatSci(entry.item.x2Norm ?? 0)
        const y2Str = formatFloatSci(entry.item.y2Norm ?? 0)
        computed = `${x1Str} ${y1Str} ${x2Str} ${y2Str} 0 0 40 100 0 3 40 1 ${COLOR_WHITE_BGR} 0 0 1 30 100 0`
      }
      lines.push(entry.rawLine && computed !== null && computed === entry.rawLine ? entry.rawLine : (computed ?? entry.rawLine ?? ''))
      lines.push('')
    } else if (entry.isLine) {
      const aLine = entry.aLine
      const item = entry.item
      const itemType = aLine?.rawType || (aLine?.shape === 'measure_line' ? '2' : '0')
      lines.push(itemType)
      let computed: string | null = null
      if (aLine) {
        const x1Str = formatFloatSci(aLine.x1Norm)
        const y1Str = formatFloatSci(aLine.y1Norm)
        const x2Str = formatFloatSci(aLine.x2Norm)
        const y2Str = formatFloatSci(aLine.y2Norm)
        const isMeasureLine = aLine.shape === 'measure_line' || aLine.rawType === '2'
        const unitXCode = aLine.unitX === 'xa' ? 1 : aLine.unitX === 'ua' ? 2 : 0
        const unitYCode = aLine.unitY === 'ya' ? 1 : aLine.unitY === 'ra' ? 2 : 0
        const widthCode = Math.round((aLine.width ?? 0.4) * 100)
        const headCode = Math.round((aLine.arrowhead ?? 5.0) * 100)
        const colorCode = hexToBgr(aLine.color || '#000000')
        const styleCode = lineTypeToCode(aLine.style)
        const faceCode = hexToBgr(aLine.faceColor || '#ffffff')
        const dimKind = isMeasureLine ? 2 : 0
        const modeCode = isMeasureLine
          ? 1
          : aLine.arrowMode !== undefined
            ? aLine.arrowMode
            : aLine.shape === 'arrow_start' ? 2 : aLine.shape === 'arrow_both' ? 3 : aLine.shape === 'line' ? 0 : 1
        const spreadCode = Math.round(aLine.spread ?? 30)
        const shutCode = Math.round(aLine.shut ?? 100)
        computed = `${x1Str} ${y1Str} ${x2Str} ${y2Str} ${unitXCode} ${unitYCode} ${widthCode} ${headCode} ${colorCode} ${dimKind} 300 ${styleCode} ${faceCode} 0 0 ${modeCode} ${spreadCode} ${shutCode} 0`
      } else if (item) {
        const x1Str = formatFloatSci(item.xNorm)
        const y1Str = formatFloatSci(item.yNorm)
        const x2Str = formatFloatSci(item.x2Norm ?? 0)
        const y2Str = formatFloatSci(item.y2Norm ?? 0)
        computed = `${x1Str} ${y1Str} ${x2Str} ${y2Str} 0 0 40 500 0 0 300 1 ${COLOR_WHITE_BGR} 0 0 1 30 100 0`
      }
      const raw = aLine?.rawLineStr || item?.rawLine
      lines.push(raw && computed !== null && computed === raw ? raw : (computed ?? raw ?? ''))
      lines.push('')
    } else if (entry.item) {
      const item = entry.item
      lines.push(String(item.legendType ?? DEFAULT_LEGEND_TYPE))
      const posTail = item.posTail || LEGEND_POS_TAIL
      lines.push(`${Math.round((item.xNorm / 10000) * doc.width)} ${Math.round((item.yNorm / 10000) * doc.height)} ${posTail}`)
      lines.push(unicodeToSmp(item.text || item.rawText || '').replace(/\n/g, '\\n'))
      const rot = Math.round(item.rotation * DEG_TO_SMP)
      const weight = item.fontWeight >= DEFAULT_AXIS.boldWeight ? 700 : 400
      const szVal = Math.round((item.fontSize || DEFAULT_AXIS.fontSize) * MM_TO_SMP)
      lines.push(item.font1Spec || FONT_SPEC_TIMES(szVal, rot, weight))
      lines.push(item.fontFamily || DEFAULT_AXIS.fontFamily)
      lines.push(item.font2Spec || FONT_SPEC_ARCHIC(szVal, rot, weight))
      lines.push(item.optionFontFamily || item.fontFamily || FONT_NAME_ARCHIC)
      lines.push(item.font3Spec || FONT_SPEC_SYMBOL(szVal, rot, weight))
      lines.push(item.symbolFontFamily || FONT_NAME_SYMBOL)
      lines.push('')
    }
  })

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

  if (writeData) {
    lines.push(...dataSectionLines(datasets))
  }

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
        return null
      }
      console.warn('Native showSaveFilePicker failed:', err)
    }
  }
  return undefined
}

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
      byte = codePoint
    }

    bytes[byteCount++] = byte ?? 0x3f
  }

  return buffer.slice(0, byteCount)
}
