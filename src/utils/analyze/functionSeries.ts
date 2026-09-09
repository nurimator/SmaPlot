import { evaluateMathExprWithConstants } from '../dataset.ts'
import { isMissingValue } from './types.ts'

export interface FunctionSample {
  x: number[]
  y: number[]
}

export function sampleFunction(
  yExpr: string,
  xMin: number,
  xMax: number,
  count = 200,
  constants?: number[]
): FunctionSample {
  const n = Math.max(2, Math.min(2000, Math.round(count)))
  const lo = isFinite(xMin) ? xMin : 0
  const hi = isFinite(xMax) ? xMax : 10
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? lo : lo + ((hi - lo) * i) / (n - 1)
    const y = evaluateMathExprWithConstants(yExpr, x, 'x', constants)
    if (isMissingValue(y)) continue
    xs.push(x)
    ys.push(y)
  }
  return { x: xs, y: ys }
}
