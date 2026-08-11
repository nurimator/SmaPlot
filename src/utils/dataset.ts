import type { Dataset } from '../types.ts'

export async function loadDataset(path: string): Promise<Dataset> {
  const res = await fetch(path)
  const text = await res.text()
  const fileName = path.split('/').pop() || 'Dataset.txt'
  return parseDatasetContent(text, fileName, path)
}

export function parseDatasetContent(text: string, fileName: string, filePath?: string): Dataset {
  const x: number[] = []
  const y: number[] = []
  const rawLines: string[][] = []

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const parts = line.trim().split(/\s+/)
    rawLines.push(parts)
    if (parts.length >= 2) {
      const px = parseFloat(parts[0])
      const py = parseFloat(parts[1])
      if (!isNaN(px) && !isNaN(py)) {
        x.push(px)
        y.push(py)
      }
    }
  }

  const cleanName = fileName.replace(/\.txt$/i, '')
  const PALETTE = ['#ef4444', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899']
  let hash = 0
  for (let i = 0; i < cleanName.length; i++) {
    hash = (hash << 5) - hash + cleanName.charCodeAt(i)
  }
  const color = PALETTE[Math.abs(hash) % PALETTE.length]

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

const mathExprCache = new Map<string, ((v: number) => number) | null>()

export function evaluateMathExpr(expr: string, val: number, varName: 'x' | 'y'): number {
  if (!expr || !expr.trim()) return val
  const trimmed = expr.trim().toLowerCase()
  const key = `${varName}::${trimmed}`

  let evaluator = mathExprCache.get(key)
  if (evaluator === undefined) {
    evaluator = null
    if (trimmed !== varName) {
      // Strictly enforce basic arithmetic only (+, -, *, /, parentheses, digits, decimal points, and variable)
      const validCharsRegex = new RegExp(`^[0-9\\s\\+\\-\\*/\\(\\)${varName}\\.]+$`)
      if (validCharsRegex.test(trimmed)) {
        try {
          evaluator = new Function(varName, `return ${trimmed};`) as (v: number) => number
        } catch {
          // keep null (invalid expression)
        }
      }
    }
    mathExprCache.set(key, evaluator)
  }

  if (evaluator === null) return val
  const res = evaluator(val)
  return typeof res === 'number' && !isNaN(res) && isFinite(res) ? res : val
}
