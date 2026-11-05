import type { Dataset, SmpAxisSpec, SmpLegendItem, SmpLegendRawObject, SmpLineAnnotation, SmpMetadata, SmpPlotDoc } from '../types.ts'
import { smpToUnicode } from './smpSymbolMapper.ts'
import { SYM_CODE_TO_PLOT } from './smpMarkerCodes.ts'
import { sampleFunction as sampleFunctionSpec } from './analyze/functionSeries.ts'
import { readDataCellPair, splitDataFields } from './dataset.ts'
import { isLogScaleType } from './scale.ts'

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
  styleLine?: string
  countLine?: string
  zerosLine?: string
  fixed5?: string
  exprFlag?: string
  userFunctionFlags?: string
  userFunctionExpr?: string
  userFunctionDerivs?: string[]
  userFunctionPadBlanks?: number
}

export interface ParseSmpResult {
  datasets: Dataset[]
  smpMeta: SmpMetadata
}

interface SmpDataTable {
  x: number[]
  y: number[]
  rawLines: string[][]
  rawText?: string[]
  headerRest?: string
  sourceName?: string
  separator?: string
  endLine?: string
  pendingRows?: { parts: string[]; text: string }[]
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
    fontFamily: 'Times New Roman, Segoe UI, sans-serif',
    fontSize: 24,
    fontWeight: 400,
    fontStyle: 'regular',
    labelColor: '#000000',
    shiftRight: 0,
    shiftDown: 0,
  }
}

function trailingWhitespace(line: string): string | undefined {
  const match = /\s+$/.exec(line)
  return match ? match[0] : undefined
}

function splitDataTokens(line: string): string[] {
  return line.trim().split(/[\s,]+/).filter((t) => t !== '')
}

// The native writer stores a [DATA] table with one consistent column separator, but the trailing padding
// varies per row (the first row of a table often has one space, the rest two). Keep each row
// verbatim so a re-save does not rewrite the whole table; `separator` is only the fallback for
// rows that have no verbatim form.
function dataSeparatorFrom(rawLine: string): string | undefined {
  const trimmed = rawLine.trim()
  if (trimmed.includes('\t')) return '\t'
  if (trimmed.includes(' ')) return ' '
  return undefined
}

// Text/legend position line token 3 is the "show background" flag: 2 = show, 1 = hide.
// Returns undefined when the file carries no such token, so an absent flag stays distinct
// from an explicit "hide" and round-trips byte-identically.
function showBgFromPositionParts(parts: string[]): boolean | undefined {
  if (parts.length < 4) return undefined
  const flag = parts[3].trim()
  if (flag === '2') return true
  if (flag === '1') return false
  return undefined
}

function fontSpecToSize(raw: number): number {
  const v = Math.abs(raw)
  if (!isFinite(v) || v <= 0) return 0
  return v >= 100 ? Math.round(v / 100) : Math.round(v)
}

// Font record layout: [-size] [0] [rot] [-rot] [weight] [italic] then unmodeled
// charset/tail tokens. Only the leading six are modeled, so everything from index 6
// on is carried through verbatim.
const FONT_RECORD_TAIL_START = 6

function fontSpecTail(spec: string): string {
  const parts = splitDataTokens(spec)
  return parts.length > FONT_RECORD_TAIL_START ? parts.slice(FONT_RECORD_TAIL_START).join(' ') : ''
}

function italicFromToken(value: string | undefined): boolean {
  return value === '1' || value === '255'
}

interface FontRecord {
  size: number
  rotation: number
  weight: number
  style: string
  tail: string
  italicToken?: string
}

function readFontRecord(spec: string, fallbackSize = 12): FontRecord {
  const parts = splitDataTokens(spec)
  let size = fallbackSize
  let rotation = 0
  let weight = 400
  if (parts.length > 0) {
    const sizeValue = parseFloat(parts[0])
    if (Number.isFinite(sizeValue) && sizeValue !== 0) size = Math.max(6, fontSpecToSize(sizeValue))
  }
  if (parts.length > 2) {
    const rotationValue = Number(parts[2])
    if (Number.isFinite(rotationValue)) rotation = rotationValue / 10
  }
  if (parts.length > 4) {
    const weightValue = parseInt(parts[4], 10)
    if (Number.isFinite(weightValue)) weight = weightValue >= 600 ? 600 : 400
  }
  const italic = parts.length > 5 && italicFromToken(parts[5].trim())
  const style = italic ? 'italic' : weight >= 600 ? 'bold' : 'regular'
  return { size, rotation, weight, style, tail: fontSpecTail(spec), italicToken: italic ? parts[5].trim() : undefined }
}

function optionalNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function lineStyleFromCode(code: number | undefined): string {
  switch (code) {
    case 2: return 'dashed'
    case 3: return 'dotted'
    case 4: return 'dash_dot'
    case 5: return 'dash_dot_dot'
    default: return 'solid'
  }
}

function buildArrowAnnotation(
  parts: string[],
  shapeDefault: 'arrow' | 'line' | 'measure_line' | 'arrow_start' | 'arrow_both',
  rawType: string,
  rawLineStr: string
): SmpLineAnnotation {
  const x1Norm = parseFloat(parts[0])
  const y1Norm = parseFloat(parts[1])
  const x2Norm = parseFloat(parts[2])
  const y2Norm = parseFloat(parts[3])

  const rawUnitX = optionalNumber(parts[4])
  const rawUnitY = optionalNumber(parts[5])
  const rawWidth = optionalNumber(parts[6])
  const rawHeadLength = optionalNumber(parts[7])
  const rawColorCode = optionalNumber(parts[8])
  const payloadKind = optionalNumber(parts[9])
  const rawPitch = optionalNumber(parts[10])
  const rawStyleCode = optionalNumber(parts[11])
  const rawFaceColorCode = optionalNumber(parts[12])
  const rawRoundX = optionalNumber(parts[13])
  const rawRoundY = optionalNumber(parts[14])
  const rawArrowMode = optionalNumber(parts[15])
  const rawSpread = optionalNumber(parts[16])
  const rawShut = optionalNumber(parts[17])

  const unitX: 'mm' | 'xa' | 'ua' = rawUnitX === 1 ? 'xa' : rawUnitX === 2 ? 'ua' : 'mm'
  const unitY: 'mm' | 'ya' | 'ra' = rawUnitY === 1 ? 'ya' : rawUnitY === 2 ? 'ra' : 'mm'
  const width = rawWidth !== undefined && rawWidth > 0 ? rawWidth / 100 : 0.4
  // A zero head length is a real value (a plain line with no arrowhead), not a missing one.
  const arrowhead = rawHeadLength !== undefined && rawHeadLength >= 0 ? rawHeadLength / 100 : 5.0
  const color = rawColorCode !== undefined && rawColorCode >= 0 ? bgrToHex(rawColorCode) : '#000000'
  const pitch = rawPitch !== undefined ? rawPitch / 100 : 3
  const style = lineStyleFromCode(rawStyleCode)
  const faceColor = rawFaceColorCode !== undefined && rawFaceColorCode >= 0 ? bgrToHex(rawFaceColorCode) : '#ffffff'
  const roundX = rawRoundX !== undefined ? rawRoundX / 100 : 0
  const roundY = rawRoundY !== undefined ? rawRoundY / 100 : 0
  const annotationKind = payloadKind ?? (shapeDefault === 'measure_line' ? 2 : 0)
  const arrowMode = rawArrowMode ?? (shapeDefault === 'measure_line' ? 0 : 1)
  const spread = rawSpread ?? 30
  const shut = rawShut ?? 100
  const shape = shapeDefault === 'measure_line'
    ? 'measure_line'
    : arrowMode === 0
      ? 'line'
      : arrowMode === 2
        ? 'arrow_start'
        : arrowMode === 3
          ? 'arrow_both'
          : 'arrow'

  return {
    x1Norm,
    y1Norm,
    x2Norm,
    y2Norm,
    unitX,
    unitY,
    width,
    arrowhead,
    pitch,
    color,
    style,
    faceColor,
    roundX,
    roundY,
    shape,
    arrowMode,
    spread,
    shut,
    annotationKind,
    kind: annotationKind,
    payloadKind,
    rawType,
    rawLineStr,
  }
}

const NATIVE_VERSION_CODES: Record<string, number> = {
  '1.0': 2,
  '1.1': 3,
  '1.2': 4,
  '1.3': 5,
  '1.4': 6,
  '1.5': 7,
  '1.6': 8,
  '1.7': 9,
  '1.8': 10,
  '1.9': 11,
}

function parseSmpHeaderVersion(lines: string[]): { sourceVersion?: string; nativeFormatVersion?: number } {
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (/Sma4Win\s+ver\.\s*[0-9.]+\s+SMA\s+file/i.test(line)) {
      return { nativeFormatVersion: 100 }
    }
    const versionMatch = line.match(/Sma4Win\s+ver\.\s*([0-9]+(?:\.[0-9]+)?)/i)
    if (versionMatch) {
      const versionParts = versionMatch[1].split('.')
      const sourceVersion = `${versionParts[0]}.${versionParts[1] || '0'}`
      return {
        sourceVersion,
        nativeFormatVersion: NATIVE_VERSION_CODES[sourceVersion],
      }
    }
  }
  return {}
}

function isLegacySmpVersion(sourceVersion: string | undefined): boolean {
  return sourceVersion === '1.3' || sourceVersion === '1.4'
}

function isSectionHeaderLine(line: string): boolean {
  const trimmed = line.trim()
  return trimmed.startsWith('[') && trimmed.endsWith(']')
}

function nextNonBlankLine(lines: string[], start: number): number {
  let index = start
  while (index < lines.length && lines[index].trim() === '') index++
  return index
}

function parseLegacyFont(
  spec: string,
  family: string,
  fallbackSize = 12
): FontRecord & { family: string } {
  return { ...readFontRecord(spec, fallbackSize), family }
}

function parseLegacyTitleSection(
  lines: string[],
  start: number,
  docWidth: number,
  docHeight: number
): { items: SmpLegendItem[]; xLabel?: string; yLabel?: string; next: number } {
  const items: SmpLegendItem[] = []
  let index = nextNonBlankLine(lines, start)
  if (index >= lines.length) return { items, next: index }
  const count = parseInt(lines[index].trim(), 10)
  index++
  if (!Number.isFinite(count) || count < 0) return { items, next: index }

  for (let recordIndex = 0; recordIndex < count; recordIndex++) {
    while (index < lines.length && lines[index].trim() === '') index++
    if (index >= lines.length || isSectionHeaderLine(lines[index])) break

    const positionLine = lines[index++] || ''
    const positionParts = splitDataTokens(positionLine)
    const textLine = index < lines.length && !isSectionHeaderLine(lines[index]) ? lines[index++] || '' : ''
    const font1Line = index < lines.length && !isSectionHeaderLine(lines[index]) ? lines[index++] || '' : ''
    const fontFamily1 = index < lines.length && !isSectionHeaderLine(lines[index]) ? lines[index++] || '' : ''
    const font2Line = index < lines.length && !isSectionHeaderLine(lines[index]) ? lines[index++] || '' : ''
    const fontFamily2 = index < lines.length && !isSectionHeaderLine(lines[index]) ? lines[index++] || '' : ''

    const xValue = parseFloat(positionParts[0])
    const yValue = parseFloat(positionParts[1])
    const xNorm = Number.isFinite(xValue) && docWidth !== 0 ? Math.round((xValue / docWidth) * 10000) : 0
    const yNorm = Number.isFinite(yValue) && docHeight !== 0 ? Math.round((yValue / docHeight) * 10000) : 0
    const font1 = parseLegacyFont(font1Line, fontFamily1)
    const font2 = parseLegacyFont(font2Line, fontFamily2, font1.size)
    const rawText = textLine
    const text = smpToUnicode(rawText).replace(/\\n/g, '\n')
    const legendType = recordIndex === 0 ? 4 : recordIndex === 1 ? 5 : 8
    const item: SmpLegendItem = {
      type: 'text',
      legendType,
      text,
      rawText,
      xNorm,
      yNorm,
      posTail: positionParts.slice(2).join(' '),
      showBg: showBgFromPositionParts(positionParts),
      rotation: font1.rotation,
      fontFamily: fontFamily1 || 'Times New Roman',
      fontFamily1: fontFamily1,
      fontFamily2: fontFamily2,
      optionFontFamily: fontFamily2,
      symbolFontFamily: fontFamily2,
      font1Tail: font1.tail,
      font2Tail: font2.tail,
      font1Italic: font1.italicToken,
      font2Italic: font2.italicToken,
      legendOrder: recordIndex,
      font2Size: font2.size,
      font2Rotation: font2.rotation,
      font2Weight: font2.weight,
      font2Style: font2.style,
      fontSize: font1.size,
      fontWeight: font1.weight,
      fontStyle: font1.style,
    }
    if (font2.family) {
      item.fontFamily2 = font2.family
    }
    items.push(item)
    while (index < lines.length && lines[index].trim() === '') index++
  }

  return {
    items,
    xLabel: items.find((item) => item.legendType === 4)?.text,
    yLabel: items.find((item) => item.legendType === 5)?.text,
    next: index,
  }
}

function parseLegacyArrowSection(
  lines: string[],
  start: number
): { annotations: SmpLineAnnotation[]; next: number } {
  const annotations: SmpLineAnnotation[] = []
  let index = nextNonBlankLine(lines, start)
  if (index >= lines.length) return { annotations, next: index }
  const count = parseInt(lines[index].trim(), 10)
  index++
  if (!Number.isFinite(count) || count < 0) return { annotations, next: index }

  for (let recordIndex = 0; recordIndex < count; recordIndex++) {
    while (index < lines.length && lines[index].trim() === '') index++
    if (index >= lines.length || isSectionHeaderLine(lines[index])) break

    let rawType = '0'
    let recordLine = lines[index++] || ''
    let parts = splitDataTokens(recordLine)
    if (parts.length < 4 || parts.slice(0, 4).some((part) => !Number.isFinite(Number(part)))) {
      rawType = parts[0] || rawType
      while (index < lines.length && lines[index].trim() === '') index++
      if (index >= lines.length || isSectionHeaderLine(lines[index])) break
      recordLine = lines[index++] || ''
      parts = splitDataTokens(recordLine)
    }
    if (parts.length < 4) continue
    const shapeDefault = rawType === '2' ? 'measure_line' : 'arrow'
    const annotation = buildArrowAnnotation(parts, shapeDefault, rawType, recordLine.trim())
    annotation.rawTrail = trailingWhitespace(recordLine)
    if (Number.isFinite(annotation.x1Norm) && Number.isFinite(annotation.y1Norm) &&
        Number.isFinite(annotation.x2Norm) && Number.isFinite(annotation.y2Norm)) {
      annotations.push(annotation)
    }
    while (index < lines.length && lines[index].trim() === '') index++
  }
  return { annotations, next: index }
}

function skipLegacyDotSection(lines: string[], start: number): number {
  let index = start
  while (index < lines.length && !isSectionHeaderLine(lines[index])) index++
  return index
}

function parseDataBlockLines(lines: string[]): Record<string, SmpDataTable> {
  const datasetsMap: Record<string, SmpDataTable> = {}
  let activeDataHeader = ''
  let inDataBlock = false
  let sawMasks = false

  const isDataSectionHeader = (inner: string): boolean =>
    inner === 'GRAPH' ||
    inner === 'LEGEND' ||
    inner === 'OTHERS' ||
    inner === 'MASKS' ||
    inner === 'DATA' ||
    inner.startsWith('AXIS-') ||
    inner === 'TITLE' ||
    inner === 'ARROW' ||
    inner === 'DOT'

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line === '[DATA]') {
      inDataBlock = true
      continue
    }
    if (line.startsWith('[OTHERS]') || line.startsWith('[MASKS]')) {
      inDataBlock = false
      if (line.startsWith('[MASKS]')) sawMasks = true
      continue
    }
    if (line.startsWith('[') && line.includes(']')) {
      const cIdx = line.indexOf(']')
      const innerName = line.slice(1, cIdx).trim()
      if (/\.SMP$/i.test(innerName)) {
        sawMasks = false
        inDataBlock = false
        activeDataHeader = ''
        continue
      }
      if (isDataSectionHeader(innerName)) {
        inDataBlock = innerName === 'DATA'
        continue
      }
      if (sawMasks && !inDataBlock) {
        inDataBlock = true
      }
    }
    if (!inDataBlock) continue

    if (line.includes('[End of Data]')) {
      const cleanLine = line.replace('[End of Data]', '').trim()
      const table = activeDataHeader ? datasetsMap[activeDataHeader] : undefined
      if (table) {
        commitPendingRows(table)
        if (cleanLine) {
          const parts = splitDataFields(cleanLine)
          const pair = parts.length >= 2 ? readDataCellPair(parts, 0, 1) : null
          if (pair) {
            table.x.push(pair.x)
            table.y.push(pair.y)
            if (table.separator === undefined) table.separator = dataSeparatorFrom(rawLine)
          }
          table.rawLines.push(parts)
          ;(table.rawText ||= []).push(cleanLine)
          table.endLine = rawLine.replace(/^\s+/, '')
        }
      }
      activeDataHeader = ''
      continue
    }

    if (line.startsWith('[') && line.includes(']')) {
      const closeBracketIdx = line.indexOf(']')
      const sourceName = line.slice(1, closeBracketIdx).trim()
      const headerRest = line.slice(closeBracketIdx + 1).trim()
      if (sourceName.toLowerCase().includes('end of data')) {
        activeDataHeader = ''
        continue
      }
      let headerName = sourceName
      if (datasetsMap[headerName]) {
        let occurrence = 1
        while (datasetsMap[`${sourceName}#${occurrence}`]) occurrence++
        headerName = `${sourceName}#${occurrence}`
      }
      activeDataHeader = headerName
      datasetsMap[headerName] = { x: [], y: [], rawLines: [], headerRest, sourceName }
      continue
    }

    if (!activeDataHeader) continue

    if (line.startsWith('#')) {
      const table = datasetsMap[activeDataHeader]
      commitPendingRows(table)
      table.rawLines.push([line])
      ;(table.rawText ||= []).push(line)
      continue
    }

    const table = datasetsMap[activeDataHeader]
    const parts = splitDataFields(line)
    const pair = parts.length >= 2 ? readDataCellPair(parts, 0, 1) : null
    if (pair) {
      commitPendingRows(table)
      table.x.push(pair.x)
      table.y.push(pair.y)
      table.rawLines.push(parts)
      if (table.separator === undefined) table.separator = dataSeparatorFrom(rawLine)
      ;(table.rawText ||= []).push(rawLine.replace(/^\s+/, ''))
    } else {
      ;(table.pendingRows ||= []).push({ parts, text: rawLine })
    }
  }

  for (const table of Object.values(datasetsMap)) table.pendingRows = undefined
  return datasetsMap
}

function commitPendingRows(table: SmpDataTable): void {
  if (!table.pendingRows) return
  for (const row of table.pendingRows) {
    table.rawLines.push(row.parts)
    ;(table.rawText ||= []).push(row.text)
  }
  table.pendingRows = undefined
}

function dataSourceName(key: string): string {
  return key.replace(/#\d+$/, '')
}

function collectDataHeaderOrder(lines: string[]): string[] {
  const order: string[] = []
  let inData = false
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line === '[DATA]') {
      inData = true
      continue
    }
    const header = /^\[([^\]]+)\]/.exec(line)
    if (!header) continue
    const name = header[1].trim()
    if (/^(GRAPH|LEGEND|OTHERS|MASKS|TITLE|ARROW|DOT|AXIS-\d+)$/.test(name)) {
      inData = false
      continue
    }
    if (inData && !/end of data/i.test(name)) order.push(name)
  }
  return order
}

function dataTableOrder(order: string[], key: string): number {
  const name = dataSourceName(key)
  const occurrence = /#(\d+)$/.exec(key)
  const wanted = occurrence ? parseInt(occurrence[1], 10) : 0
  let seen = 0
  let first = -1
  for (let i = 0; i < order.length; i++) {
    if (order[i] !== name) continue
    if (first < 0) first = i
    if (seen === wanted) return i
    seen++
  }
  return first
}

function dataTableFingerprint(key: string, data: SmpDataTable): string {
  const value = `${dataSourceName(key)}|${data.headerRest || ''}|${data.rawLines.map((row) => row.join('\u0001')).join('\u0002')}`
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `${dataSourceName(key)}#${(hash >>> 0).toString(16)}`
}

function mergeDataTables(globalTables: Record<string, SmpDataTable>, localTables: Record<string, SmpDataTable>): Record<string, SmpDataTable> {
  const merged: Record<string, SmpDataTable> = { ...globalTables }
  const localNames = new Set(Object.keys(localTables).map(dataSourceName))
  Object.keys(merged).forEach((key) => {
    if (localNames.has(dataSourceName(key)) && !Object.prototype.hasOwnProperty.call(localTables, key)) {
      delete merged[key]
    }
  })
  Object.entries(localTables).forEach(([key, value]) => {
    merged[key] = value
  })
  return merged
}

export function parseSmpContent(text: string, defaultFileName: string): ParseSmpResult {
  const lines = text.split(/\r?\n/)
  const fileHeaderVersion = parseSmpHeaderVersion(lines)
  const globalFileDatasetsMap = parseDataBlockLines(lines)
  const dataHeaderOrder = collectDataHeaderOrder(lines)

  const docBlocks: { name: string; lines: string[]; marker?: string }[] = []
  let currentDocName = defaultFileName
  let currentDocMarker: string | undefined
  let currentDocLines: string[] = []

  const isRealDocLines = (larr: string[]) =>
    larr.some((l) => {
      const t = l.trim()
      return t === '[GRAPH]' || t.startsWith('[AXIS-') || t === '[DATA]'
    })

  // A multi-frame document is introduced by a marker line immediately followed by that frame's
  // version line. Three marker spellings occur in the wild:
  //   [Sheet.SMP]                                       - the common native form
  //   [Sheet<version header>]                           - version header glued to an extension-less name
  //   [Sheet]                                           - what SmaPlot itself writes
  // Missing a form silently merges every frame into a single plot, or makes a re-save unstable.
  const versionLine = (t: string): boolean => /^Sma4Win ver\.\s*[\d.]+\s+SMP file$/i.test(t)
  const docMarkerName = (t: string, next: string | undefined): string | null => {
    if (!t.startsWith('[') || !t.endsWith(']')) return null
    if (next === undefined || !versionLine(next)) return null
    const versioned = /^\[(.*?)\s*Sma4Win ver\.\s*[\d.]+\s+SMP file\]$/i.exec(t)
    if (versioned) return versioned[1].trim()
    return t.slice(1, -1)
  }

  for (let li = 0; li < lines.length; li++) {
    const markerName = docMarkerName(lines[li].trim(), lines[li + 1]?.trim())
    if (markerName !== null) {
      if (isRealDocLines(currentDocLines)) {
        docBlocks.push({ name: currentDocName, lines: currentDocLines, marker: currentDocMarker })
      }
      currentDocName = markerName
      currentDocMarker = lines[li]
      currentDocLines = []
    } else {
      currentDocLines.push(lines[li])
    }
  }
  if (isRealDocLines(currentDocLines)) {
    docBlocks.push({ name: currentDocName, lines: currentDocLines, marker: currentDocMarker })
  }

  const docs: SmpPlotDoc[] = []
  const allDatasets: Dataset[] = []

  docBlocks.forEach((docBlock, documentIndex) => {
    const docLines = docBlock.lines
    const docHeaderVersion = parseSmpHeaderVersion(docLines)
    const sourceVersion = docHeaderVersion.sourceVersion || fileHeaderVersion.sourceVersion
    const nativeFormatVersion = docHeaderVersion.nativeFormatVersion ?? fileHeaderVersion.nativeFormatVersion
    const documentName = docBlock.name || defaultFileName
    const duplicateDocumentName = docBlocks.slice(0, documentIndex).some((block) => block.name === docBlock.name)
    const documentId = duplicateDocumentName ? `${documentName}#${documentIndex}` : documentName
    const seriesSpecs: SmpSeriesSpec[] = []

    let docLeft = 4000
    let docTop = 4000
    let docWidth = 10000
    let docHeight = 10000
    let frameWidth = 0.4
    let frameColor = '#000000'
    let frameBgColor = '#ffffff'
    let frameType = 1
    let graphFixed1 = ''
    let graphFixed2 = ''
    let mergeZeroLabels = false

    let axisX = createDefaultAxis(0, 100, 20)
    let axisY = createDefaultAxis(0, 100, 20)
    let axisTop: SmpAxisSpec | undefined
    let axisRight: SmpAxisSpec | undefined

    const legendItems: SmpLegendItem[] = []
    const annotationLines: SmpLineAnnotation[] = []
    const legendRawObjects: SmpLegendRawObject[] = []
    let legendCounter = 0
    let masksLines: string[] | undefined
    let othersZerosLine = ''
    let othersSymbolLine = ''
    let xLabel: string | undefined
    let yLabel: string | undefined

    let currentSection = ''
    let inDataBlock = false
    let seenGraph = false
    let i = 0

    // The header block is: version line, optional comment, optional page-setup line, series
    // count. Only 1.5+ writes a page-setup line, so it is identified as the all-numeric line
    // preceding the bare-integer series count.
    let pageSetupLine = ''
    let headerLines: string[] | undefined
    const versionIdx = docLines.findIndex((l) => /Sma4Win\s+ver\./i.test(l))
    for (let h = Math.max(1, versionIdx + 1); h < docLines.length; h++) {
      const head = docLines[h].trim()
      if (/^\d+$/.test(head)) {
        if (versionIdx >= 0) headerLines = docLines.slice(versionIdx + 1, h)
        break
      }
      if (head === '') continue
      const headParts = head.split(/\s+/)
      if (headParts.length >= 3 && headParts.every((t) => isFinite(Number(t)))) pageSetupLine = head
    }

    while (i < docLines.length) {
      const rawLine = docLines[i]
      const line = rawLine.trim()

      if (!line) {
        i++
        continue
      }

      if (line.startsWith('[') && line.endsWith(']')) {
        const inner = line.slice(1, -1).trim()
        if (inDataBlock) {
          if (
            inner === 'GRAPH' ||
            inner === 'LEGEND' ||
            inner === 'OTHERS' ||
            inner === 'MASKS' ||
            inner === 'DATA' ||
            inner === 'TITLE' ||
            inner === 'ARROW' ||
            inner === 'DOT' ||
            inner.startsWith('AXIS-')
          ) {
            inDataBlock = false
          } else {
            i++
            continue
          }
        }
        currentSection = inner
        if (currentSection === 'DATA') inDataBlock = true
        if (currentSection === 'GRAPH') seenGraph = true
        i++
        if (currentSection === 'LEGEND' && i < docLines.length && /^\d+$/.test(docLines[i].trim())) {
          i++
        }
        continue
      }

      if (inDataBlock) {
        i++
        continue
      }

      if (currentSection === 'TITLE' && isLegacySmpVersion(sourceVersion)) {
        const parsedTitles = parseLegacyTitleSection(docLines, i, docWidth, docHeight)
        legendItems.push(...parsedTitles.items)
        if (parsedTitles.xLabel !== undefined) xLabel = parsedTitles.xLabel
        if (parsedTitles.yLabel !== undefined) yLabel = parsedTitles.yLabel
        i = parsedTitles.next
        currentSection = ''
        continue
      }

      if (currentSection === 'ARROW') {
        const parsedArrows = parseLegacyArrowSection(docLines, i)
        annotationLines.push(...parsedArrows.annotations)
        i = parsedArrows.next
        currentSection = ''
        continue
      }

      if (currentSection === 'DOT') {
        i = skipLegacyDotSection(docLines, i)
        currentSection = ''
        continue
      }

      const lowerSection = currentSection.toLowerCase()
      const isSeriesName = currentSection.match(/^\d+\s+/) ||
        ((lowerSection.endsWith('.txt') || lowerSection.endsWith('.dat')) && !currentSection.startsWith('AXIS'))
      if (isSeriesName && !seenGraph) {
        const specHeader = currentSection
        // Only the extension is dropped: a leading "200 " is part of the file name, not a
        // legend type index, and stripping it would conflate 100/200/400 gray fotokatalis.
        const cleanName = specHeader.replace(/\.(txt|dat)$/i, '')
        let filePath = ''
        if (i < docLines.length) {
          filePath = docLines[i].trim()
          i++
        }
        let countLine = ''
        if (i < docLines.length) {
          // Native writes a trailing space on the series-count line, so keep the raw line.
          countLine = docLines[i]
          i++
        }
        let color = '#000000'
        let width = 0.6
        let stylePrefix = 60
        let styleLine: string | undefined
        if (i < docLines.length) {
          styleLine = docLines[i]
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
          if (parts.length >= 1) {
            const penCode = parseInt(parts[0], 10)
            if (!isNaN(penCode)) {
              if (penCode === 0) lineType = 'no_line'
              else if (penCode === 2) lineType = 'dash'
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
              const mapped = SYM_CODE_TO_PLOT[symCode]
              if (mapped !== undefined) plotType = mapped
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
          i++
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
          i++
        }
        let fixed5 = ''
        if (i < docLines.length) {
          fixed5 = docLines[i].trim()
          i++
        }

        let userFunctionFlags: string | undefined
        let userFunctionExpr: string | undefined
        let userFunctionDerivs: string[] | undefined
        let userFunctionPadBlanks: number | undefined
        if (zerosLine.trim().split(/\s+/)[2] === '6') {
          if (i < docLines.length && !docLines[i].trim().startsWith('[') && docLines[i].trim() !== '') {
            userFunctionFlags = docLines[i].trim()
            i++
          }
          if (i < docLines.length && !docLines[i].trim().startsWith('[')) {
            const exprLine = docLines[i].trim()
            if (exprLine !== '') {
              userFunctionExpr = exprLine
              i++
              const derivs: string[] = []
              for (let k = 0; k < 8 && i < docLines.length; k++) {
                const dl = docLines[i].trim()
                if (dl === '' || dl.startsWith('[')) break
                if (/^[a-z]/i.test(dl) || dl.includes('*') || dl.includes('(') || dl.includes('x')) {
                  derivs.push(dl)
                  i++
                } else {
                  break
                }
              }
              if (derivs.length > 0) userFunctionDerivs = derivs
            }
          }
          let padBlanks = 0
          while (i < docLines.length && docLines[i].trim() === '') {
            padBlanks++
            i++
          }
          userFunctionPadBlanks = padBlanks
        }

        seriesSpecs.push({
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
          styleLine,
          countLine,
          exprFlag,
          zerosLine,
          fixed5,
          userFunctionFlags,
          userFunctionExpr,
          userFunctionDerivs,
          userFunctionPadBlanks,
        })
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
          if (gParts.length > 1) {
            const ft = parseInt(gParts[1], 10)
            if (!isNaN(ft)) frameType = ft
          }
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
        let axisLine2Parsed = false
        if (parts1.length >= 3) {
          axisSpec.min = parseFloat(parts1[0])
          axisSpec.max = parseFloat(parts1[1])
          axisSpec.step = parseFloat(parts1[2])
          axisSpec.rawFormatSci = parts1[0].includes('e') || parts1[0].includes('E')
          axisSpec.rawFixedTail = parts1.slice(3).join(' ')
          if (parts1.length >= 15) {
            axisSpec.subDivs = parseInt(parts1[14], 10) || 5
          }
          if (parts1.length > 10) {
            axisSpec.addPlusSign = parts1[10] === '1'
          }
        }

        i++
        if (i < docLines.length) {
          const parts2 = docLines[i].trim().split(/\s+/)
          if (parts2.length >= 1) {
            const divs = parseInt(parts2[0], 10)
            if (!isNaN(divs) && divs > 0) axisSpec.subDivs = divs
          }
          if (parts2.length >= 2) {
            const scaleType = parseInt(parts2[1], 10)
            if (Number.isFinite(scaleType)) axisSpec.scaleType = scaleType
            axisSpec.logScale = isLogScaleType(scaleType)
          }
          if (parts2.length >= 6) {
            axisSpec.insideTicks = parts2[2] === '1'
            axisSpec.autoStep = parts2[3] === '1'
            axisSpec.showTicks = parts2[4] === '1'
            axisSpec.showLabels = parts2[5] === '1'
            axisLine2Parsed = true
          } else if (parts2.length >= 4) {
            axisSpec.autoStep = parts2[2] === '1'
            axisSpec.showTicks = parts2[3] === '1'
          }
          if (parts2.length >= 8) {
            const sr = parseFloat(parts2[6])
            const sd = parseFloat(parts2[7])
            if (!isNaN(sr)) axisSpec.shiftRight = sr / 100
            if (!isNaN(sd)) axisSpec.shiftDown = sd / 100
          }
          if (parts2.length >= 10) {
            axisSpec.labelColorCode = parts2[9]
          }
          axisSpec.rawLine2Tail = parts2.length >= 11 ? parts2.slice(10).join(' ') : '100 0'
          i++
        }

        if (i < docLines.length) {
          const parts3 = docLines[i].trim().split(/\s+/)
          if (parts3.length >= 5) {
            const sizeVal = Math.abs(parseFloat(parts3[0]))
            if (!isNaN(sizeVal) && sizeVal > 0) {
              axisSpec.fontSize = fontSpecToSize(sizeVal)
            }
            const weightNum = parseInt(parts3[4], 10)
            axisSpec.fontWeight = weightNum >= 600 ? 700 : 400
            if (parts3.length >= 6 && italicFromToken(parts3[5].trim())) {
              axisSpec.rawFontItalic = parts3[5].trim()
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
          const parts5 = docLines[i].trim().split(/\s+/)
          if (parts5.length >= 5) {
            axisSpec.majorIn = parts5[0] === '1'
            axisSpec.majorOut = parts5[1] === '1'
            if (axisSpec.majorIn && !axisLine2Parsed) axisSpec.insideTicks = true
            axisSpec.majorLength = Math.max(1, (parseFloat(parts5[2]) * 0.02) || 6)
            axisSpec.majorWidth = (parseFloat(parts5[3]) / 100) || 0.4
            const cInt = parseInt(parts5[4], 10)
            if (!isNaN(cInt)) axisSpec.majorColor = bgrToHex(cInt)
            if (parts5.length >= 7) {
              axisSpec.majorStyle = parts5[6] === '2' ? 'dashed' : parts5[6] === '3' ? 'dotted' : 'solid'
            } else {
              axisSpec.majorStyle = 'solid'
            }
            axisSpec.rawMajorTickMid = parts5[5]
            axisSpec.rawMajorTickPad = parts5.slice(7).join(' ')
          }
          i++
        }

        if (i < docLines.length && !docLines[i].trim().startsWith('[')) {
          const parts6 = docLines[i].trim().split(/\s+/)
          if (parts6.length >= 5) {
            axisSpec.minorIn = parts6[0] === '1'
            axisSpec.minorOut = parts6[1] === '1'
            axisSpec.minorLength = Math.max(1, (parseFloat(parts6[2]) * 0.02) || 3)
            axisSpec.minorWidth = (parseFloat(parts6[3]) / 100) || 0.4
            const cInt = parseInt(parts6[4], 10)
            if (!isNaN(cInt)) axisSpec.minorColor = bgrToHex(cInt)
            if (parts6.length >= 7) {
              axisSpec.minorStyle = parts6[6] === '2' ? 'dashed' : parts6[6] === '3' ? 'dotted' : 'solid'
            } else {
              axisSpec.minorStyle = 'solid'
            }
            axisSpec.rawMinorTickMid = parts6[5]
            axisSpec.rawMinorTickPad = parts6.slice(7).join(' ')
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

      if (currentSection === 'MASKS') {
        const masks: string[] = []
        while (i < docLines.length && docLines[i].trim() !== '' && !isSectionHeaderLine(docLines[i])) {
          masks.push(docLines[i])
          i++
        }
        masksLines = masks
        currentSection = ''
        continue
      }

      if (currentSection === 'LEGEND') {
        const legendOrder = legendCounter++
        if (line === '4' || line === '5' || line === '6' || line === '7' || line === '8') {
          const legendType = parseInt(line, 10)
          i++
          if (i < docLines.length) {
            const posParts = docLines[i].trim().split(/\s+/)
            const xNorm = Math.round((parseFloat(posParts[0]) / docWidth) * 10000)
            const yNorm = Math.round((parseFloat(posParts[1]) / docHeight) * 10000)
            const posTail = posParts.slice(2).join(' ')
            const showBg = showBgFromPositionParts(posParts)
            i++
            if (i < docLines.length) {
              const rawTxt = docLines[i]
              const txt = smpToUnicode(rawTxt).replace(/\\n/g, '\n')
              i++
              let rotation = 0
              let fontWeight = 400
              let fontStyle = 'regular'
              let fontSize = 12
              let font2Size = 0
              let font2Weight = 0
              let font2Style = ''
              let font2Rotation: number | undefined
              let font3Size = 0
              let font3Weight = 0
              let font3Style = ''
              let font3Rotation: number | undefined
              let font1Tail = ''
              let font1Italic: string | undefined
              let font2Italic: string | undefined
              let font3Italic: string | undefined
              if (i < docLines.length) {
                const font1 = readFontRecord(docLines[i].trim())
                font1Tail = font1.tail
                font1Italic = font1.italicToken
                rotation = font1.rotation
                fontWeight = font1.weight
                fontStyle = font1.style
                fontSize = font1.size
                i++
              }
              let fontFamily = 'Times New Roman'
              let fontFamilyRaw: string | undefined
              if (i < docLines.length && !docLines[i].trim().startsWith('[')) {
                fontFamilyRaw = docLines[i].trim()
                fontFamily = fontFamilyRaw.replace(/\s+[A-Z]{2,4}$/, '') || 'Times New Roman'
                i++
              }
              let font2Tail = ''
              let optionFontFamily = ''
              if (i < docLines.length && !docLines[i].trim().startsWith('[')) {
                const font2 = readFontRecord(docLines[i].trim())
                font2Tail = font2.tail
                font2Italic = font2.italicToken
                font2Size = font2.size
                font2Weight = font2.weight
                font2Style = font2.style
                font2Rotation = font2.rotation
                i++
              }
              if (i < docLines.length && !docLines[i].trim().startsWith('[')) {
                optionFontFamily = docLines[i].trim()
                i++
              }
              let font3Tail = ''
              let symbolFontFamily = ''
              if (i < docLines.length && !docLines[i].trim().startsWith('[')) {
                const font3 = readFontRecord(docLines[i].trim())
                font3Tail = font3.tail
                font3Italic = font3.italicToken
                font3Size = font3.size
                font3Weight = font3.weight
                font3Style = font3.style
                font3Rotation = font3.rotation
                i++
              }
              if (i < docLines.length && !docLines[i].trim().startsWith('[')) {
                symbolFontFamily = docLines[i].trim()
                i++
              }
              if (i < docLines.length && !docLines[i].trim()) i++

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
                showBg,
                rotation,
                fontFamily,
                fontFamilyRaw,
                optionFontFamily,
                symbolFontFamily,
                font1Tail,
                font2Tail,
                font3Tail,
                font1Italic,
                font2Italic,
                font3Italic,
                legendOrder,
                fontSize,
                fontWeight,
                fontStyle,
                font2Size: font2Size || undefined,
                font2Weight: font2Weight || undefined,
                font2Style: font2Style || undefined,
                font2Rotation,
                font3Size: font3Size || undefined,
                font3Weight: font3Weight || undefined,
                font3Style: font3Style || undefined,
                font3Rotation,
              })
            }
          }
          continue
        } else if (line === '0' || line === '1' || line === '2') {
          const itemType = line
          i++
          if (i < docLines.length) {
            const rawLineStr = docLines[i].trim()
            const parts = splitDataTokens(rawLineStr)
            if (parts.length >= 4) {
              const arrow = buildArrowAnnotation(parts, itemType === '2' ? 'measure_line' : 'arrow', itemType, rawLineStr)
              arrow.legendOrder = legendOrder
              arrow.rawTrail = trailingWhitespace(docLines[i])
              if (!isNaN(arrow.x1Norm) && !isNaN(arrow.y1Norm) && !isNaN(arrow.x2Norm) && !isNaN(arrow.y2Norm)) {
                annotationLines.push(arrow)
              }
            }
            i++
            if (i < docLines.length && !docLines[i].trim()) i++
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
                style = lineStyleFromCode(optionalNumber(parts[15]))
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
                  annotationKind: 3,
                  kind: 3,
                  rawType: '3',
                  rawLineStr,
                  rawTrail: trailingWhitespace(docLines[i]),
                  legendOrder,
                }
                annotationLines.push(rectAnnotation)
              }
            }
            i++
            if (i < docLines.length && !docLines[i].trim()) i++
          }
          continue
        } else if (line === '9') {
          i++
          const objectLines: string[] = []
          while (i < docLines.length && !isSectionHeaderLine(docLines[i])) {
            if (docLines[i].trim()) {
              objectLines.push(docLines[i])
              i++
            } else {
              i++
              break
            }
          }
          legendRawObjects.push({ legendType: 9, lines: objectLines, legendOrder })
          continue
        }
        legendCounter--
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
          if (i < docLines.length) i++
          if (i < docLines.length && !docLines[i].trim()) i++
        }
        currentSection = ''
        continue
      }

      i++
    }

    const localDatasetsMap = parseDataBlockLines(docLines)
    const mergedDatasetsMap = mergeDataTables(globalFileDatasetsMap, localDatasetsMap)

    const docDatasets: Dataset[] = []
    const seriesNameOccurrences = new Map<string, number>()

    seriesSpecs.forEach((spec, seriesIndex) => {
      const specKey = spec.name
      if (specKey.toLowerCase().includes('end of data')) return
      const cleanSpecName = spec.cleanName
      const allDataKeys = Object.keys(mergedDatasetsMap)
      // A data table name can carry a duplicate-index suffix, so compare on both the raw key and
      // the de-indexed name. Only fall back to a loose name match when no exact one exists,
      // otherwise "200 gray fotokatalis" could bind to an earlier "100 gray fotokatalis" table.
      const exactDataKeys = allDataKeys.filter(
        (key) => key === specKey || dataSourceName(key) === spec.name
      )
      const matchingDataKeys = exactDataKeys.length > 0
        ? exactDataKeys
        : allDataKeys.filter((key) => dataSourceName(key).replace(/\.(txt|dat)$/i, '') === cleanSpecName)
      const occurrence = seriesNameOccurrences.get(cleanSpecName) || 0
      seriesNameOccurrences.set(cleanSpecName, occurrence + 1)
      const rawDataKey = matchingDataKeys[Math.min(occurrence, Math.max(0, matchingDataKeys.length - 1))] || specKey
      const data = mergedDatasetsMap[rawDataKey] || { x: [], y: [], rawLines: [] }
      const dataOrder = dataTableOrder(dataHeaderOrder, rawDataKey)
      const dataFingerprint = dataTableFingerprint(rawDataKey, data)
      const matchingFingerprints = new Set(matchingDataKeys.map((key) => dataTableFingerprint(key, mergedDatasetsMap[key])))
      const dataId = matchingFingerprints.size > 1 ? dataFingerprint : dataSourceName(rawDataKey)
      const seriesId = `${documentId}#${seriesIndex}#${spec.name}`

      let seriesX = [...data.x]
      let seriesY = [...data.y]
      let seriesRawLines = [...data.rawLines]
      let seriesRawText: string[] | undefined = data.rawText ? [...data.rawText] : undefined
      let funcKind: string | undefined
      const flagKind = parseInt((spec.countLine || '').trim().split(/\s+/)[0] || '0', 10)
      const hasFormula = spec.yExpr && spec.yExpr !== 'y' && /[a-z(]/.test(spec.yExpr)
      if (seriesX.length === 0 && flagKind === 3 && hasFormula) {
        const zParts = (spec.zerosLine || '').trim().split(/\s+/)
        let fxMin = axisX && isFinite(axisX.min) ? axisX.min : 0
        let fxMax = axisX && isFinite(axisX.max) ? axisX.max : 10
        if (zParts.length >= 6) {
          const a = parseFloat(zParts[4])
          const b = parseFloat(zParts[5])
          if (isFinite(a) && isFinite(b) && a !== b) {
            fxMin = Math.min(a, b)
            fxMax = Math.max(a, b)
          }
        }
        const sampled = sampleFunctionSpec(spec.yExpr, fxMin, fxMax, 200)
        if (sampled.x.length > 0) {
          seriesX = sampled.x
          seriesY = sampled.y
          seriesRawLines = sampled.x.map((vx, idx) => [String(vx), String(sampled.y[idx] ?? 0)])
          // Sampled rows have no verbatim form, so drop the stored text to stay row-aligned.
          seriesRawText = undefined
          funcKind = 'function'
        }
      }

      const ds: Dataset = {
        name: spec.cleanName,
        color: spec.color,
        x: seriesX,
        y: seriesY,
        rawLines: seriesRawLines,
        fileName: docBlock.name,
        filePath: spec.filePath || `${docBlock.name} > ${spec.name}`,
        seriesId,
        dataId,
        dataFingerprint,
        seriesIndex,
        documentId,
        smpSourceVersion: sourceVersion,
        smpSeriesName: spec.name,
        smpSeriesSrcPath: spec.filePath || undefined,
        smpDataName: dataSourceName(rawDataKey),
        smpDataHeaderRest: data.headerRest,
        smpDataSeparator: data.separator,
        smpDataRawText: seriesRawText,
        smpDataEndLine: seriesRawText ? data.endLine : undefined,
        smpDataOrder: dataOrder >= 0 ? dataOrder : undefined,
        smpSeriesStylePrefix: spec.stylePrefix,
        smpSeriesStyleLine: spec.styleLine,
        smpSeriesCountLine: spec.countLine || undefined,
        smpSeriesZerosLine: spec.zerosLine,
        smpSeriesFixed5: spec.fixed5,
        smpSeriesFillLine: spec.fillLine,
        smpExprFlag: spec.exprFlag,
        derivedKind: funcKind,
        smpUserFunction: spec.userFunctionExpr
          ? {
              flagsLine: spec.userFunctionFlags,
              expr: spec.userFunctionExpr,
              derivs: spec.userFunctionDerivs || [],
              padBlanks: spec.userFunctionPadBlanks,
            }
          : undefined,
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

    const cleanLegendItems = legendItems.filter((it) => !(it.legendType === 3 && it.type === 'text'))

    docs.push({
      name: docBlock.name,
      sourceVersion,
      nativeFormatVersion,
      pageSetupLine: pageSetupLine || undefined,
      headerLines,
      rawMarker: docBlock.marker,
      masksLines,
      legendRawObjects: legendRawObjects.length > 0 ? legendRawObjects : undefined,
      left: docLeft,
      top: docTop,
      width: docWidth,
      height: docHeight,
      frameWidth,
      frameColor,
      frameBgColor,
      frameType,
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
      legendItems: cleanLegendItems,
      annotationLines,
      othersZerosLine,
      othersSymbolLine,
      xLabel,
      yLabel,
    })
  })

  const firstDoc = docs[0]
  const legacyMeta: SmpMetadata = {
    docs,
    sourceVersion: firstDoc?.sourceVersion,
    nativeFormatVersion: firstDoc?.nativeFormatVersion,
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


