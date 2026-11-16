export interface SmpSeriesCountSpec {
  kind: number
  errorBarX: number
  errorBarY: number
  columnX: number
  columnY: number
}

const COUNT_FIELD_KIND = 0
const COUNT_FIELD_ERR_X = 1
const COUNT_FIELD_ERR_Y = 2
const COUNT_FIELD_COL_X = 4
const COUNT_FIELD_COL_Y = 5

function intField(tokens: string[], idx: number, fallback: number): number {
  const v = parseInt(tokens[idx] ?? '', 10)
  return Number.isFinite(v) ? v : fallback
}

export function parseSeriesCountLine(line: string | undefined): SmpSeriesCountSpec | null {
  if (!line || !line.trim()) return null
  const tokens = line.trim().split(/\s+/)
  if (tokens.length <= COUNT_FIELD_COL_Y) return null
  return {
    kind: intField(tokens, COUNT_FIELD_KIND, 0),
    errorBarX: intField(tokens, COUNT_FIELD_ERR_X, 0),
    errorBarY: intField(tokens, COUNT_FIELD_ERR_Y, 0),
    columnX: Math.max(0, intField(tokens, COUNT_FIELD_COL_X, 0)),
    columnY: Math.max(0, intField(tokens, COUNT_FIELD_COL_Y, 1)),
  }
}

const EXPR_FLAG_PATTERN = /^\s*([01])\s+([01])\s+(\S+)\s*$/

export function parseExprTransformFlags(line: string | undefined): [boolean, boolean] | null {
  const match = EXPR_FLAG_PATTERN.exec(line || '')
  return match ? [match[1] === '1', match[2] === '1'] : null
}

export function withExprTransformFlags(line: string | undefined, xTrans: boolean, yTrans: boolean): string {
  const match = EXPR_FLAG_PATTERN.exec(line || '')
  if (!line || !match) return `${xTrans ? 1 : 0} ${yTrans ? 1 : 0} 0`
  if ((match[1] === '1') === xTrans && (match[2] === '1') === yTrans) return line
  return `${xTrans ? 1 : 0} ${yTrans ? 1 : 0} ${match[3]}`
}

export function withSeriesColumns(line: string, columnX: number, columnY: number): string {
  const spec = parseSeriesCountLine(line)
  if (!spec || (spec.columnX === columnX && spec.columnY === columnY)) return line
  const lead = line.match(/^\s*/)?.[0] ?? ''
  const trail = line.match(/\s*$/)?.[0] ?? ''
  const tokens = line.trim().split(/\s+/)
  tokens[COUNT_FIELD_COL_X] = String(columnX)
  tokens[COUNT_FIELD_COL_Y] = String(columnY)
  return `${lead}${tokens.join(' ')}${trail}`
}
