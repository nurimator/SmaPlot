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

const mathExprCache = new Map<string, ((v: number) => number) | null>()

const MATH_FN_NAMES = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'exp', 'log', 'sqrt', 'abs', 'ceil', 'floor'] as const

type MathFn = (...args: Array<number | ((v: number) => number)>) => number

const MATH_ARG_VALUES: Array<number | ((v: number) => number)> = [
  Math.PI,
  Math.sin, Math.cos, Math.tan, Math.asin, Math.acos, Math.atan,
  Math.exp, Math.log, Math.sqrt, Math.abs, Math.ceil, Math.floor,
]

function rewriteMathBody(trimmed: string): string {
  let body = trimmed
  body = body.replace(/\bpi\b/g, 'PI')
  body = body.replace(/\bln\b/g, 'log')
  for (const fn of MATH_FN_NAMES) {
    body = body.replace(new RegExp(`\\b${fn}\\b`, 'g'), `M_${fn.toUpperCase()}`)
  }
  return body
}

function isSafeMathBody(body: string): boolean {
  const rest = body.replace(/M_[A-Z]+|PI|[xya-i]/g, '')
  if (/[a-zA-Z_]/.test(rest)) return false
  if (/[^0-9\s+\-*/(),.]/.test(rest)) return false
  return true
}

const mathBodyCache = new Map<string, { body: string; fn: MathFn } | null>()

function compileMathBody(trimmed: string, varName: 'x' | 'y'): { body: string; fn: MathFn } | null {
  const key = `${varName}::${trimmed}`
  let compiled = mathBodyCache.get(key)
  if (compiled === undefined) {
    compiled = null
    const body = rewriteMathBody(trimmed)
    if (isSafeMathBody(body)) {
      try {
        const fn = new Function(
          varName,
          'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'PI',
          'M_SIN', 'M_COS', 'M_TAN', 'M_ASIN', 'M_ACOS', 'M_ATAN',
          'M_EXP', 'M_LOG', 'M_SQRT', 'M_ABS', 'M_CEIL', 'M_FLOOR',
          `return ${body};`
        ) as MathFn
        compiled = { body, fn }
      } catch {
        compiled = null
      }
    }
    mathBodyCache.set(key, compiled)
  }
  return compiled
}

function buildExtendedEvaluator(trimmed: string, varName: 'x' | 'y'): ((v: number) => number) | null {
  if (!/[a-z]/.test(trimmed)) return null
  const compiled = compileMathBody(trimmed, varName)
  if (!compiled) return null
  return (v: number) => {
    try {
      return compiled.fn(v, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...MATH_ARG_VALUES)
    } catch {
      return NaN
    }
  }
}

export function evaluateMathExprWithConstants(
  expr: string,
  val: number,
  varName: 'x' | 'y',
  constants?: number[]
): number {
  if (!expr || !expr.trim()) return val
  const trimmed = expr.trim().toLowerCase()
  if (!trimmed) return val
  const compiled = compileMathBody(trimmed, varName)
  if (!compiled) return val
  const c = constants && constants.length >= 9
    ? constants.slice(0, 9)
    : [0, 0, 0, 0, 0, 0, 0, 0, 0]
  try {
    const res = compiled.fn(val, c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7], c[8], ...MATH_ARG_VALUES)
    return typeof res === 'number' && !isNaN(res) && isFinite(res) ? res : val
  } catch {
    return val
  }
}

export function evaluateMathExpr(expr: string, val: number, varName: 'x' | 'y'): number {
  if (!expr || !expr.trim()) return val
  const trimmed = expr.trim().toLowerCase()
  const key = `${varName}::${trimmed}`

  let evaluator = mathExprCache.get(key)
  if (evaluator === undefined) {
    evaluator = null
      if (trimmed !== varName) {
        const validCharsRegex = new RegExp(`^[0-9\\s\\+\\-\\*/\\(\\)${varName}\\.]+$`)
      if (validCharsRegex.test(trimmed)) {
        try {
          evaluator = new Function(varName, `return ${trimmed};`) as (v: number) => number
        } catch {
        }
      }
      if (evaluator === null) {
        evaluator = buildExtendedEvaluator(trimmed, varName)
      }
    }
    mathExprCache.set(key, evaluator)
  }

  if (evaluator === null) return val
  const res = evaluator(val)
  return typeof res === 'number' && !isNaN(res) && isFinite(res) ? res : val
}
