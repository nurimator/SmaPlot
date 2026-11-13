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
