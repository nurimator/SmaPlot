import type { Dataset } from '../types.ts'
import { compileMathExpr } from './mathExpr.ts'
import type { MathVar } from './mathExpr.ts'

export async function loadDataset(path: string): Promise<Dataset> {
  const res = await fetch(path)
  const text = await res.text()
  const fileName = path.split('/').pop() || 'Dataset.txt'
  return parseDatasetContent(text, fileName, path)
}

// data rows
const MISSING_CELL = '='
const SKIP_CELL = '|'

export function splitDataFields(line: string): string[] {
  const trimmed = line.trim()
  if (!trimmed) return []
  const cells: string[] = []
  for (const field of trimmed.split(/[,\t]/)) {
    cells.push(...field.trim().split(/ +/))
  }
  return cells
}

function isMissingCell(cell: string): boolean {
  return cell === '' || cell === MISSING_CELL
}

function cellNumber(cell: string): number {
  return parseFloat(cell)
}

export type DataCellPair = { x: number; y: number } | null

export function readDataCellPair(cells: string[], xIdx: number, yIdx: number): DataCellPair {
  const cx = cells[xIdx]
  const cy = cells[yIdx]
  if (cx === undefined || cy === undefined) return null
  if (cx === SKIP_CELL || cy === SKIP_CELL) return null
  const vx = cellNumber(cx)
  const vy = cellNumber(cy)
  const okX = Number.isFinite(vx)
  const okY = Number.isFinite(vy)
  if (okX && okY) return { x: vx, y: vy }
  if ((okX || isMissingCell(cx)) && (okY || isMissingCell(cy))) {
    return { x: okX ? vx : NaN, y: okY ? vy : NaN }
  }
  return null
}

export function readDataColumns(rows: string[][], xIdx: number, yIdx: number): { x: number[]; y: number[] } {
  const x: number[] = []
  const y: number[] = []
  for (const cells of rows) {
    const pair = readDataCellPair(cells, xIdx, yIdx)
    if (!pair) continue
    x.push(pair.x)
    y.push(pair.y)
  }
  return { x, y }
}

export function parseDatasetContent(text: string, fileName: string, filePath?: string): Dataset {
  const rawLines: string[][] = []

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    rawLines.push(splitDataFields(line))
  }
  const { x, y } = readDataColumns(rawLines, 0, 1)

  const cleanName = fileName.replace(/\.txt$/i, '')
  const color = '#000000'

  return {
    name: cleanName,
    color,
    x,
    y,
    rawContent: text,
    rawLines,
    fileName,
    filePath: filePath || fileName,
  }
}

export function evaluateMathExprWithConstants(
  expr: string,
  val: number,
  varName: MathVar,
  constants?: readonly number[]
): number {
  const source = expr ? expr.trim() : ''
  if (!source) return val
  const compiled = compileMathExpr(source, varName)
  if (!compiled) return val
  const res = compiled(val, constants)
  return Number.isFinite(res) ? res : NaN
}

export function evaluateMathExpr(expr: string, val: number, varName: MathVar): number {
  return evaluateMathExprWithConstants(expr, val, varName)
}
