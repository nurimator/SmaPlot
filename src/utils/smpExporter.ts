import type { Dataset, SmpAxisSpec, SmpLegendItem, SmpLegendRawObject, SmpLineAnnotation, SmpPlotDoc } from '../types.ts'
import { unicodeToSmp } from './smpSymbolMapper.ts'
import { PLOT_TO_SYM_CODE } from './smpMarkerCodes.ts'
import { isLogScaleType } from './scale.ts'
import { withSeriesColumns } from './smpSeriesSpec.ts'

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
const DEFAULT_ANNOTATION = { thickness: 0.4, shade: 0, round: 0, spread: 30, shut: 100 }

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
const SMP_FALLBACK_DIR = 'C:\\SmaPlot\\'
const DEFAULT_DATA_SEPARATOR = '\t'

const SERIES_COUNT_LINE = (n: number): string => `0 0 0 0 0 1 ${n} 0 -1 `
const seriesCountLine = (ds: Dataset, n: number): string => {
  const line = ds.smpSeriesCountLine || SERIES_COUNT_LINE(n)
  if (!ds.options?.xColumn && !ds.options?.yColumn) return line
  return withSeriesColumns(
    line,
    Math.max(0, (ds.options.xColumn || 1) - 1),
    Math.max(0, (ds.options.yColumn || 2) - 1)
  )
}
const SERIES_STYLE_LINE = (prefix: number, color: number): string => `${prefix} ${color} 300 0 0 0 0`
const SERIES_STYLE_LINE_LEGACY = (prefix: number, color: number): string => `${prefix} ${color} 300`
const SERIES_SYMBOL_LINE = (pen: number, sym: number, size: number, color: number): string => `${pen} ${sym} ${size} ${color}`
const SERIES_FILL_LINE = (fillBgr: number): string => `0 0 1 0 0 0 ${fillBgr} 5`
const SERIES_EXPR_LINE = (transformed: boolean): string => `0 ${transformed ? 1 : 0} 0`
const SERIES_ZEROS_LINE = '0 0 0 0 0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00'
const SERIES_FIXED_LINE_5 = '1 40 0 300 1'

// Font record: [-size] [0] [rot] [-rot] [weight] [italic] [charset..mode].
// The first six tokens are modeled and UI-editable; the tail is a per-format
// convention (1.8 writes "0 0 charset 3 2 1 mode", 1.3/1.4 writes "0 0 charset 0 0 2 mode"),
// so it is carried through from the source file and these are only fallbacks for new items.
const FONT_TAIL_TIMES = '0 0 0 3 2 1 18'
const FONT_TAIL_ARCHIC = '0 0 128 3 2 1 17'
const FONT_TAIL_SYMBOL = '0 0 2 3 2 1 18'
const FONT_TAIL_LEGACY_TIMES = '0 0 0 0 0 2 18'
const FONT_TAIL_LEGACY_ARCHIC = '0 0 128 0 0 2 17'

function fontRecordLine(sizePt: number, rot: number, weight: number, italic: boolean, tail: string, italicToken?: string): string {
  return `-${sizePt} 0 ${rot} ${-rot} ${weight} ${italic ? (italicToken || '1') : '0'} ${tail}`
}

function legendFontFamily(item: SmpLegendItem, family: string): string {
  const raw = item.fontFamilyRaw
  if (raw && raw.replace(/\s+[A-Z]{2,4}$/, '') === family) return raw
  return family
}

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
  if (!pt) return 0
  return PLOT_TO_SYM_CODE[pt] ?? 0
}

function lineTypeToCode(lt?: string): number {
  switch (lt) {
    case 'no_line':
    case 'none': return 0
    case 'dash':
    case 'dashed': return 2
    case 'dotted': return 3
    case 'dash_dot': return 4
    case 'dash_dot_dot': return 5
    case 'face': return 6
    default: return 1
  }
}

function markerMatchesName(marker: string | undefined, name: string): boolean {
  if (!marker) return false
  const trimmed = marker.trim()
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return false
  const inner = trimmed.slice(1, -1)
  const versioned = /^(.*?)\s*Sma4Win ver\.\s*[\d.]+\s+SMP file$/i.exec(inner)
  return (versioned ? versioned[1].trim() : inner) === name
}

function seriesStyleLine(ds: Dataset, prefix: number, color: number, legacy: boolean): string {
  const raw = ds.smpSeriesStyleLine
  if (raw && /^\s*\S+\s+\S+/.test(raw)) {
    return raw.replace(/^(\s*)\S+(\s+)\S+/, `$1${prefix}$2${color}`)
  }
  return legacy ? SERIES_STYLE_LINE_LEGACY(prefix, color) : SERIES_STYLE_LINE(prefix, color)
}

function sourceVersionForDoc(doc: SmpPlotDoc): string | undefined {
  if (doc.sourceVersion) return doc.sourceVersion
  const datasetVersion = doc.datasets?.find((ds) => ds.smpSourceVersion)?.smpSourceVersion
  if (datasetVersion) return datasetVersion
  if (doc.nativeFormatVersion === 5) return '1.3'
  if (doc.nativeFormatVersion === 6) return '1.4'
  if (doc.nativeFormatVersion === 7) return '1.5'
  if (doc.nativeFormatVersion === 8) return '1.6'
  if (doc.nativeFormatVersion === 9) return '1.7'
  if (doc.nativeFormatVersion === 10) return '1.8'
  if (doc.nativeFormatVersion === 11) return '1.9'
  return undefined
}

function isLegacyDoc(doc: SmpPlotDoc): boolean {
  const version = sourceVersionForDoc(doc)
  return version === '1.3' || version === '1.4'
}

function dataTableKey(ds: Dataset): string {
  if (ds.dataFingerprint) return ds.dataFingerprint
  if (ds.dataId) return ds.dataId
  const cleanName = ds.name.replace(/^\d+\s+/, '').replace(/\.txt$/i, '')
  return ds.smpDataName || ds.smpSeriesName || `${cleanName}.txt`
}

function uniqueDataDatasets(datasets: Dataset[]): Dataset[] {
  const positions = new Map<string, number>()
  const unique: Dataset[] = []
  for (const ds of datasets) {
    const key = dataTableKey(ds)
    const existingIndex = positions.get(key)
    if (existingIndex === undefined) {
      positions.set(key, unique.length)
      unique.push(ds)
      continue
    }
    const existing = unique[existingIndex]
    const existingRows = existing.rawLines?.length ?? Math.min(existing.x?.length || 0, existing.y?.length || 0)
    const rows = ds.rawLines?.length ?? Math.min(ds.x?.length || 0, ds.y?.length || 0)
    if (rows > existingRows) unique[existingIndex] = ds
  }
  return unique
}

// Rotation is stored in signed tenths of a degree in both 1.3/1.4 and 1.8, so this must
// not normalize into 0..3599 - the native writer stores -900 for a vertical Y-axis title.
const rotationTenths = (degrees: number): number => Math.round((Number(degrees) || 0) * DEG_TO_SMP)

// 1.3/1.4 store font size in points; 1.8 stores points x 100.
const fontSizeUnit = (legacy: boolean): number => (legacy ? 1 : MM_TO_SMP)

// Annotation records come in three observed shapes: 13 fields (1.3/1.4, integer coordinates,
// no round/spread/shut slots), 18 fields (early 1.8, integer) and 19 fields (current 1.8,
// scientific). Coordinate format and field count are per-file conventions, not version
// properties, so both are read back from the source line instead of derived.
const ANNOTATION_MODELED_TOKENS = 18

function formatCoord(value: number, scientific: boolean): string {
  return scientific ? formatFloatSci(value) : String(Math.round(value))
}

function annotationLineForExport(item: SmpLineAnnotation, isRectangle: boolean): string {
  const rawTokens = item.rawLineStr ? item.rawLineStr.trim().split(/\s+/) : []
  const scientific = rawTokens.length === 0 || /e[+-]?\d/i.test(rawTokens[0])
  const x1 = formatCoord(item.x1Norm, scientific)
  const y1 = formatCoord(item.y1Norm, scientific)
  const x2 = formatCoord(item.x2Norm, scientific)
  const y2 = formatCoord(item.y2Norm, scientific)
  const unitX = item.unitX === 'xa' ? 1 : item.unitX === 'ua' ? 2 : 0
  const unitY = item.unitY === 'ya' ? 1 : item.unitY === 'ra' ? 2 : 0
  const width = Math.round((item.width ?? 0.4) * 100)
  const head = Math.round((item.arrowhead ?? 5) * 100)
  const color = hexToBgr(item.color || COLOR_BLACK_HEX)
  const style = lineTypeToCode(item.style)
  const face = hexToBgr(item.faceColor || COLOR_FACE_HEX)
  const spread = Math.round(item.spread ?? DEFAULT_ANNOTATION.spread)
  const shut = Math.round(item.shut ?? DEFAULT_ANNOTATION.shut)
  const mode = item.arrowMode !== undefined
    ? item.arrowMode
    : item.shape === 'arrow_start' ? 2 : item.shape === 'arrow_both' ? 3 : item.shape === 'line' ? 0 : 1
  const kind = item.annotationKind ?? item.payloadKind ?? item.kind
    ?? (item.shape === 'measure_line' || item.rawType === '2' ? 2 : 0)
  const modeled = isRectangle
    ? [x1, y1, x2, y2, '0', '0', '40',
       String(Math.round((item.shadeDepth ?? DEFAULT_ANNOTATION.shade) * MM_TO_SMP)),
       String(hexToBgr(item.shadeColor || item.color || COLOR_BLACK_HEX)), '3',
       String(Math.round((item.thickness ?? item.width ?? DEFAULT_ANNOTATION.thickness) * MM_TO_SMP)),
       '1', String(face),
       String(Math.round((item.roundX ?? DEFAULT_ANNOTATION.round) * MM_TO_SMP)),
       String(Math.round((item.roundY ?? DEFAULT_ANNOTATION.round) * MM_TO_SMP)),
       String(style), String(DEFAULT_ANNOTATION.spread), String(DEFAULT_ANNOTATION.shut)]
    : [x1, y1, x2, y2, String(unitX), String(unitY), String(width), String(head), String(color),
       String(kind), String(Math.round((item.pitch ?? 3) * 100)), String(style), String(face),
       String(Math.round((item.roundX ?? 0) * 100)), String(Math.round((item.roundY ?? 0) * 100)),
       String(mode), String(spread), String(shut)]
  // A source record narrower than the modeled layout simply has no such slots, so only emit
  // the tokens the file actually had. Anything past the modeled tokens is passed through.
  const keep = rawTokens.length > 0 ? Math.min(ANNOTATION_MODELED_TOKENS, rawTokens.length) : modeled.length
  const tail = rawTokens.slice(ANNOTATION_MODELED_TOKENS)
  const parts = modeled.slice(0, keep)
  if (rawTokens.length === 0) parts.push('0')
  else parts.push(...tail)
  return parts.join(' ') + (item.rawTrail || '')
}

// Text/legend position line token 3 is the "show background" flag: 2 = show, 1 = hide.
// Only that token is touched, so charset/mode and any other trailing values survive untouched.
// showBg === undefined leaves the tail byte-identical to the source file.
function positionTailWithShowBg(posTail: string | undefined, showBg: boolean | undefined): string {
  if (showBg === undefined) return posTail || ''
  const parts = (posTail || '').trim().length > 0 ? (posTail as string).trim().split(/\s+/) : []
  while (parts.length < 2) parts.push('0')
  parts[1] = showBg ? '2' : '1'
  return parts.join(' ')
}

// One writer for the legacy [TITLE] section and the modern [LEGEND] text records. The only
// structural difference is the font count: 1.3/1.4 carry a main run plus a glyph run, 1.8
// adds a Symbol run.
function titleItemLines(doc: SmpPlotDoc, item: SmpLegendItem, legacy: boolean, posTailFallback = ''): string[] {
  const lines: string[] = []
  const x = Math.round((item.xNorm / 10000) * doc.width)
  const y = Math.round((item.yNorm / 10000) * doc.height)
  const posTail = positionTailWithShowBg(item.posTail, item.showBg) || posTailFallback
  lines.push(`${x} ${y}${posTail ? ` ${posTail}` : ''}`)
  const textForExport = item.text !== undefined && item.text !== '' ? item.text : (item.rawText || '')
  lines.push(unicodeToSmp(textForExport).replace(/\n/g, '\\n'))

  const unit = fontSizeUnit(legacy)
  const sizePt = Math.max(1, Math.round(item.fontSize || DEFAULT_AXIS.fontSize))
  const weight = item.fontWeight >= DEFAULT_AXIS.boldWeight ? 700 : 400
  const italic = (item.fontStyle || '').toLowerCase().includes('italic')
  const family = item.fontFamily || item.fontFamily1 || DEFAULT_AXIS.fontFamily
  lines.push(fontRecordLine(
    Math.round(sizePt * unit),
    rotationTenths(item.rotation),
    weight,
    italic,
    item.font1Tail || (legacy ? FONT_TAIL_LEGACY_TIMES : FONT_TAIL_TIMES),
    item.font1Italic
  ))
  lines.push(legendFontFamily(item, family))

  const size2Pt = Math.max(1, Math.round(item.font2Size || sizePt))
  const weight2 = item.font2Weight !== undefined ? (item.font2Weight >= DEFAULT_AXIS.boldWeight ? 700 : 400) : weight
  const italic2 = (item.font2Style || '').toLowerCase().includes('italic')
  lines.push(fontRecordLine(
    Math.round(size2Pt * unit),
    rotationTenths(item.font2Rotation !== undefined ? item.font2Rotation : item.rotation),
    weight2,
    italic2,
    item.font2Tail || (legacy ? FONT_TAIL_LEGACY_ARCHIC : FONT_TAIL_ARCHIC),
    item.font2Italic
  ))
  lines.push(legacy ? (item.fontFamily2 || item.optionFontFamily || family) : (item.optionFontFamily || family || FONT_NAME_ARCHIC))

  if (!legacy) {
    const size3Pt = Math.max(1, Math.round(item.font3Size || sizePt))
    const weight3 = item.font3Weight !== undefined ? (item.font3Weight >= DEFAULT_AXIS.boldWeight ? 700 : 400) : weight
    const italic3 = (item.font3Style || '').toLowerCase().includes('italic')
    lines.push(fontRecordLine(
      Math.round(size3Pt * unit),
      rotationTenths(item.font3Rotation !== undefined ? item.font3Rotation : item.rotation),
      weight3,
      italic3,
      item.font3Tail || FONT_TAIL_SYMBOL,
      item.font3Italic
    ))
    lines.push(item.symbolFontFamily || FONT_NAME_SYMBOL)
  }
  lines.push('')
  return lines
}

function legacyTitleSectionLines(doc: SmpPlotDoc): string[] {
  const items = (doc.legendItems || []).filter((item) => item.type !== 'annotation')
  const lines: string[] = ['[TITLE]', String(items.length)]
  items.forEach((item) => {
    lines.push(...titleItemLines(doc, item, true))
  })
  return lines
}

// 1.3/1.4 store arrows in a dedicated [ARROW] section with no per-record type line and no
// blank separator before the following section.
function legacyArrowSectionLines(doc: SmpPlotDoc): string[] {
  const annotations = (doc.annotationLines || []).filter((item) => item.shape !== 'rectangle' && item.shape !== 'rect')
  const lines: string[] = ['[ARROW]', String(annotations.length)]
  annotations.forEach((item, index) => {
    if (index > 0) lines.push('')
    lines.push(annotationLineForExport(item, false))
  })
  if (annotations.length > 0) lines.push('')
  lines.push('[DOT]')
  lines.push('0')
  return lines
}

function seriesSpecLines(ds: Dataset, pointCount: number, legacy: boolean): string[] {
  const cleanName = ds.name.replace(/^\d+\s+/, '').replace(/\.txt$/i, '')
  const seriesTag = ds.smpSeriesName || ds.smpDataName || `${cleanName}.txt`
  // A path read from a source file is written back verbatim: 1.3/1.4 store a bare file name
  // while 1.8 stores a full path. Only synthesize a path when there is none (dropped .TXT,
  // freshly created plot), because the browser cannot know the original directory.
  const srcPathRaw = ds.smpSeriesSrcPath || ds.filePath || seriesTag
  const srcPath = ds.smpSeriesSrcPath
    ? srcPathRaw
    : /^[A-Za-z]:/.test(srcPathRaw) ? srcPathRaw : `${SMP_FALLBACK_DIR}${srcPathRaw.replace(/^.*[\\/]/, '')}`
  const bgrColor = hexToBgr(ds.options?.lineColor || ds.color || COLOR_BLACK_HEX)
  const symCode = plotTypeToCode(ds.options?.plotType)
  const dotColorBgr = hexToBgr(ds.options?.dotColor || ds.options?.lineColor || ds.color || COLOR_BLACK_HEX)
  const sizeVal = Math.round((ds.options?.size || DEFAULT_SERIES_SIZE) * MM_TO_SMP)
  const xExpr = ds.options?.xExpr || 'x'
  const yExpr = ds.options?.yExpr || 'y'
  const hasTransform = ds.options?.xTransCheck || ds.options?.yTransCheck || xExpr !== 'x' || yExpr !== 'y'
  const widthMm = ds.options?.width ?? (ds.smpSeriesStylePrefix ? ds.smpSeriesStylePrefix / 100 : 0.6)
  const stylePrefix = Math.round(widthMm * 100)
  const styleLine = seriesStyleLine(ds, stylePrefix, bgrColor, legacy)
  const exprFlag = ds.smpExprFlag || SERIES_EXPR_LINE(hasTransform)
  const zerosLine = ds.smpSeriesZerosLine || SERIES_ZEROS_LINE
  const fixed5 = ds.smpSeriesFixed5 || SERIES_FIXED_LINE_5
  const out: string[] = [
    `[${seriesTag}]`,
    srcPath,
    seriesCountLine(ds, pointCount),
    styleLine,
    SERIES_SYMBOL_LINE(lineTypeToCode(ds.options?.lineType), symCode, sizeVal, dotColorBgr),
    ds.smpSeriesFillLine || SERIES_FILL_LINE(hexToBgr(ds.options?.paintColor || COLOR_FACE_HEX)),
    exprFlag,
    xExpr,
    yExpr,
    zerosLine,
    fixed5,
  ]
  const padBlanks = ds.smpUserFunction?.padBlanks ?? 2
  if (ds.smpUserFunction) {
    if (ds.smpUserFunction.flagsLine) out.push(ds.smpUserFunction.flagsLine)
    out.push(ds.smpUserFunction.expr)
    for (const d of ds.smpUserFunction.derivs || []) out.push(d)
  }
  for (let i = 0; i < padBlanks; i++) out.push('')
  return out
}

export function serializeSmpDoc(doc: SmpPlotDoc, isMultiDoc = false, writeData = true): string {
  const lines: string[] = []

  if (isMultiDoc && doc.name) {
    lines.push(markerMatchesName(doc.rawMarker, doc.name) ? (doc.rawMarker as string) : `[${doc.name}]`)
  }
  const sourceVersion = sourceVersionForDoc(doc)
  const legacy = isLegacyDoc(doc)
  lines.push(sourceVersion ? ` Sma4Win ver. ${sourceVersion}  SMP file` : HEADER_SMP_FILE)
  if (doc.headerLines) {
    lines.push(...doc.headerLines)
  } else {
    lines.push('')
    // 1.3/1.4 have no page-setup line; the series count follows the header block directly.
    if (!legacy) lines.push(doc.pageSetupLine || PAGE_SETUP_LINE)
  }

  const datasets = doc.datasets || []
  lines.push(`${datasets.length}`)

  datasets.forEach((ds) => {
    const numericPointCount = Math.min(ds.x?.length || 0, ds.y?.length || 0)
    const pointCount = numericPointCount || ds.rawLines?.filter((row) => row.length >= 2).length || 0
    lines.push(...seriesSpecLines(ds, pointCount, legacy))
  })

  lines.push('[GRAPH]')
  const left = Math.round(doc.left || DEFAULT_PLOT_GEOM.left)
  const top = Math.round(doc.top || DEFAULT_PLOT_GEOM.top)
  const width = Math.round(doc.width || DEFAULT_PLOT_GEOM.width)
  const height = Math.round(doc.height || DEFAULT_PLOT_GEOM.height)
  lines.push(`${left} ${top} ${width} ${height}`)
  const gTokens = (doc.graphFixed1 || GRAPH_FIXED_1).split(/\s+/)
  if (doc.frameType !== undefined && gTokens.length > 1) {
    gTokens[1] = String(doc.frameType)
  }
  if (gTokens.length > 2) gTokens[2] = doc.mergeZeroLabels ? '1' : '0'
  lines.push(gTokens.join(' '))
  // Frame width/color/background are owned by FrameDialog, so those three tokens are
  // regenerated; the rest (token 2 and anything past token 3) is per-file and preserved.
  const g2 = (doc.graphFixed2 || '').trim().split(/\s+/).filter(Boolean)
  const g2Mid = g2.length >= 3 ? g2[2] : '300'
  const g2Tail = g2.length > 4 ? ` ${g2.slice(4).join(' ')}` : ''
  const fw = Math.round((doc.frameWidth ?? 0.4) * 100)
  const fc = hexToBgr(doc.frameColor || COLOR_BLACK_HEX)
  const bg = hexToBgr(doc.frameBgColor || COLOR_FACE_HEX)
  if (g2.length > 0 && g2.length < 4 && bg === COLOR_WHITE_BGR) {
    lines.push(`${fw} ${fc} ${g2Mid}`)
  } else if (g2.length > 0) {
    lines.push(`${fw} ${fc} ${g2Mid} ${bg}${g2Tail}`)
  } else {
    lines.push(GRAPH_FIXED_2)
  }
  lines.push('')

  const formatAxis = (idx: number, axis: SmpAxisSpec | undefined, synced: boolean) => {
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

    const showTicks = axis?.showTicks !== false ? 1 : 0
    const showLabels = axis?.showLabels !== false ? 1 : 0
    const shiftR = Math.round((axis?.shiftRight || 0) * MM_TO_SMP)
    const shiftD = Math.round((axis?.shiftDown || 0) * MM_TO_SMP)
    const autoSt = axis?.autoStep ? 1 : 0
    const labelColor = axis?.labelColorCode || (AXIS_LABEL_COLOR[idx] ?? '300')
    const l2Tail = axis?.rawLine2Tail || '100 0'
    const linked = (axis?.linkedAxis ?? synced) ? 1 : 0
    const subDivs = axis?.subDivs || DEFAULT_AXIS.subDivs
    const scaleType = axis?.scaleType !== undefined && isLogScaleType(axis.scaleType) === !!axis.logScale
      ? axis.scaleType
      : axis?.logScale ? 3 : 0
    lines.push(`${subDivs} ${scaleType} ${autoSt} ${linked} ${showTicks} ${showLabels} ${shiftR} ${shiftD} 0 ${labelColor} ${l2Tail}`)

    const weight = (axis?.fontWeight || DEFAULT_AXIS.weight) >= DEFAULT_AXIS.boldWeight ? 700 : 400
    const italic = axis?.fontStyle === 'italic'
    // The native format uses 255 as well as 1 for italic, so keep the source token when still italic.
    const italicToken = italic ? (axis?.rawFontItalic || '1') : '0'
    const fontSz = Math.round((axis?.fontSize || 24) * fontSizeUnit(legacy))
    const fontExtra = axis?.rawFontExtra
      || ((idx === 0 || idx === 1) ? AXIS_FONT_EXTRA[0] : AXIS_FONT_EXTRA[1])
    lines.push(`-${fontSz} 0 0 0 ${weight} ${italicToken} 0 0 ${fontExtra}`)
    lines.push(axis?.fontFamily || DEFAULT_AXIS.fontFamily)

    // Tick line: [in] [out] [length] [width] [color] [unmodeled] [style] [unmodeled].
    // Tokens 5 and 7+ are preserved from the source because they carry per-file values
    // (SAMPLE1 writes 0, SAMPLE3 writes 200) that the writer must not invent.
    const majIn = axis?.majorIn !== false ? 1 : 0
    const majOut = axis?.majorOut ? 1 : 0
    const majLen = Math.round((axis?.majorLength ?? DEFAULT_AXIS.majorLength) / SMP_TICK_UNIT_MM)
    const majWidth = Math.round((axis?.majorWidth ?? DEFAULT_AXIS.majorWidth) * MM_TO_SMP)
    const majColorBgr = hexToBgr(axis?.majorColor || COLOR_BLACK_HEX)
    const majStyleNum = axis?.majorStyle === 'dashed' ? 2 : axis?.majorStyle === 'dotted' ? 3 : 1
    const majPad = axis?.rawMajorTickPad ? ` ${axis.rawMajorTickPad}` : ''
    lines.push(`${majIn} ${majOut} ${majLen} ${majWidth} ${majColorBgr} ${axis?.rawMajorTickMid ?? 300} ${majStyleNum}${majPad}`)

    const minIn = axis?.minorIn !== false ? 1 : 0
    const minOut = axis?.minorOut ? 1 : 0
    const minLen = Math.round((axis?.minorLength ?? DEFAULT_AXIS.minorLength) / SMP_TICK_UNIT_MM)
    const minWidth = Math.round((axis?.minorWidth ?? DEFAULT_AXIS.minorWidth) * MM_TO_SMP)
    const minColorBgr = hexToBgr(axis?.minorColor || COLOR_BLACK_HEX)
    const minStyleNum = axis?.minorStyle === 'dashed' ? 2 : axis?.minorStyle === 'dotted' ? 3 : 1
    const minPad = axis?.rawMinorTickPad ? ` ${axis.rawMinorTickPad}` : ''
    lines.push(`${minIn} ${minOut} ${minLen} ${minWidth} ${minColorBgr} ${axis?.rawMinorTickMid ?? 300} ${minStyleNum}${minPad}`)
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
        logScale: doc.axisX.logScale,
        scaleType: doc.axisX.scaleType,
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
        logScale: doc.axisY.logScale,
        scaleType: doc.axisY.scaleType,
        showLabels: false,
      }
    : (doc.axisRight || doc.axisY)

  formatAxis(0, doc.axisX, uIsSynced)
  formatAxis(1, doc.axisY, rIsSynced)
  formatAxis(2, axisTopExport, uIsSynced)
  formatAxis(3, axisRightExport, rIsSynced)

  if (legacy) {
    lines.push(...legacyTitleSectionLines(doc))
    lines.push(...legacyArrowSectionLines(doc))
  } else {
    const legendItems: SmpLegendItem[] = [...(doc.legendItems || [])].filter(
      (it) => !(it.legendType === 3 && it.type === 'text' && !(it.rawLine && it.rawLine.startsWith('3')))
    )
    // frameTitle is stored-only until native mapping is proven; never export as [LEGEND] 3 (native rectangle).
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

    const exportList: { isRect?: boolean; isLine?: boolean; isText?: boolean; rawLine?: string; item?: SmpLegendItem; aLine?: SmpLineAnnotation; rawObject?: SmpLegendRawObject; order?: number }[] = []

    legendItems.forEach((item) => {
      if (item.rawLine && item.rawLine.startsWith('3')) {
        exportList.push({ isRect: true, rawLine: item.rawLine, item, order: item.legendOrder })
      } else if (item.type === 'annotation' || item.x2Norm !== undefined) {
        exportList.push({ isLine: true, item, order: item.legendOrder })
      } else {
        exportList.push({ isText: true, item, order: item.legendOrder })
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
          exportList.push({ isRect: true, aLine, order: aLine.legendOrder })
        } else {
          exportList.push({ isLine: true, aLine, order: aLine.legendOrder })
        }
      }
    })

    for (const rawObject of doc.legendRawObjects || []) {
      exportList.push({ rawObject, order: rawObject.legendOrder })
    }

    const orderedList = exportList
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => (a.entry.order ?? Infinity) - (b.entry.order ?? Infinity) || a.index - b.index)
      .map(({ entry }) => entry)

    lines.push(`${orderedList.length}`)

    orderedList.forEach((entry) => {
      if (entry.rawObject) {
        lines.push(String(entry.rawObject.legendType))
        lines.push(...entry.rawObject.lines)
        lines.push('')
      } else if (entry.isRect) {
        lines.push('3')
        if (entry.aLine) {
          lines.push(annotationLineForExport(entry.aLine, true))
        } else if (entry.item) {
          const x1Str = formatFloatSci(entry.item.xNorm)
          const y1Str = formatFloatSci(entry.item.yNorm)
          const x2Str = formatFloatSci(entry.item.x2Norm ?? 0)
          const y2Str = formatFloatSci(entry.item.y2Norm ?? 0)
          lines.push(`${x1Str} ${y1Str} ${x2Str} ${y2Str} 0 0 40 100 0 3 40 1 ${COLOR_WHITE_BGR} 0 0 1 30 100 0`)
        } else {
          lines.push(entry.rawLine?.trim() ?? '')
        }
        lines.push('')
      } else if (entry.isLine) {
        const aLine = entry.aLine
        const item = entry.item
        const itemType = aLine?.rawType || (aLine?.shape === 'measure_line' ? '2' : '0')
        lines.push(itemType)
        if (aLine) {
          lines.push(annotationLineForExport(aLine, false))
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
        lines.push(...titleItemLines(doc, item, false, LEGEND_POS_TAIL))
      }
    })
  }

  lines.push('[OTHERS]')
  lines.push(OTHERS_HEADER)
  lines.push(doc.othersZerosLine || OTHERS_ZEROS)
  lines.push(doc.othersSymbolLine || OTHERS_SYMBOL_LINE)
  lines.push(FONT_NAME_SYMBOL)
  lines.push('')
  // 1.3/1.4 have no [MASKS] section.
  if (!legacy) {
    lines.push('[MASKS]')
    if (doc.masksLines && doc.masksLines.length > 0) {
      lines.push(...doc.masksLines)
    } else {
      lines.push(MASKS_HEADER)
      lines.push('0')
      lines.push('0')
    }
    lines.push('')
  }

  if (writeData) {
    const dataLines = dataSectionLines(datasets, legacy)
    lines.push(...dataLines)
    if (dataLines.length === 0) lines.push('')
  }

  return lines.join('\r\n')
}

function dataSectionLines(datasets: Dataset[], legacy: boolean): string[] {
  // A series derived from a formula (or from analysis) has no source data table - the native format
  // stores only the expression. Emitting the sampled points would fabricate a data block.
  const sourceDatasets = uniqueDataDatasets(datasets)
    .filter((ds) => !ds.derivedKind)
    .map((ds, index) => ({ ds, index }))
    .sort((a, b) => (a.ds.smpDataOrder ?? Infinity) - (b.ds.smpDataOrder ?? Infinity) || a.index - b.index)
    .map(({ ds }) => ds)
  // 1.8 always writes a [DATA] header, even with no series; 1.3/1.4 omit it entirely.
  if (sourceDatasets.length === 0 && legacy) return []

  const lines: string[] = ['[DATA]']
  const nowStamp = formatDateTimestamp()

  let first = true
  for (const ds of sourceDatasets) {
    if (!first) lines.push('')
    first = false

    const cleanName = ds.name.replace(/^\d+\s+/, '').replace(/\.txt$/i, '')
    const headerInfo = ds.smpDataHeaderRest || nowStamp
    const dataTag = ds.smpDataName || ds.smpSeriesName || `${cleanName}.txt`
    lines.push(`[${dataTag}] ${headerInfo}`)

    const rows: string[][] =
      ds.rawLines && ds.rawLines.length > 0
        ? ds.rawLines
        : (ds.x || []).map((x, i) => [String(x), String(ds.y?.[i] ?? 0)])

    // A table read from an .SMP reuses each row verbatim, which keeps the column separator and
    // the per-row trailing padding the file used. A table built in SmaPlot has no stored text, so
    // fall back to the table's separator (tab when even that is unknown).
    const separator = ds.smpDataSeparator || DEFAULT_DATA_SEPARATOR
    const rawText = ds.smpDataRawText
    const endInline = ds.smpDataEndLine !== undefined && rawText !== undefined && rawText.length === rows.length && rows.length > 0

    const rowCount = endInline ? rows.length - 1 : rows.length
    for (let i = 0; i < rowCount; i++) {
      lines.push(rawText?.[i] ?? rows[i].join(separator))
    }
    lines.push(endInline ? (ds.smpDataEndLine as string) : '[End of Data]')
  }

  lines.push('')
  if (sourceDatasets.length > 0) lines.push('')
  return lines

}

export function serializeSmpProject(docs: SmpPlotDoc[]): string {
  if (docs.length === 0) return ''
  if (docs.length === 1) return serializeSmpDoc(docs[0], false)

  const chunks: string[] = [
    HEADER_SMA_FILE,
    ` ${docs.length} 0 0 0 0 100`,
    ...docs.map((doc) => serializeSmpDoc(doc, true, false)),
  ]

  const allDatasets = uniqueDataDatasets(docs.flatMap((doc) => doc.datasets || []))
  chunks.push(dataSectionLines(allDatasets, false).join('\r\n'))

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

const WINDOWS_1252_SPECIAL_BYTES = new Map<number, number>([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
  [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
])

export function encodeWindows1252(text: string): ArrayBuffer {
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
