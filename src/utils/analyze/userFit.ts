import { evaluateMathExprWithConstants } from '../dataset.ts'
import { isMissingValue } from './types.ts'
import { solveLinearSystem } from './linalg.ts'

export interface UserFitResult {
  constants: number[]
  rmse: number
  iterations: number
  expr: string
  converged: boolean
}

const USER_CONSTANT_COUNT = 9

function expressionParameterMask(expr: string): boolean[] {
  const mask = Array<boolean>(USER_CONSTANT_COUNT).fill(false)
  const matches = (expr || '').match(/\b[a-i]\b/gi)
  matches?.forEach((match) => {
    const index = match.toLowerCase().charCodeAt(0) - 97
    if (index >= 0 && index < USER_CONSTANT_COUNT) mask[index] = true
  })
  return mask
}

function flagsParameterMask(flagsLine: string | undefined): boolean[] | undefined {
  if (!flagsLine) return undefined
  const values: boolean[] = []
  flagsLine.trim().split(/\s+/).forEach((token) => {
    token.split(/[|,]/).forEach((part) => {
      if (part === '0' || part === '1') values.push(part === '1')
    })
  })
  if (values.length < 2) return undefined
  const mask = Array<boolean>(USER_CONSTANT_COUNT).fill(false)
  for (let i = 0; i < USER_CONSTANT_COUNT; i++) mask[i] = values[i] ?? false
  return mask.some(Boolean) ? mask : undefined
}

export function inferUserFunctionActiveMask(expr: string, flagsLine?: string): boolean[] {
  const flags = flagsParameterMask(flagsLine)
  if (flags) return flags
  const expression = expressionParameterMask(expr)
  if (expression.some(Boolean)) return expression
  return [true, true, false, false, false, false, false, false, false]
}

function residuals(
  expr: string,
  xs: number[],
  ys: number[],
  constants: number[]
): { r: number[]; rmse: number } {
  const r: number[] = []
  let s = 0
  for (let i = 0; i < xs.length; i++) {
    const p = evaluateMathExprWithConstants(expr, xs[i], 'x', constants)
    const d = isMissingValue(p) ? 0 : ys[i] - p
    r.push(d)
    s += d * d
  }
  return { r, rmse: xs.length > 0 ? Math.sqrt(s / xs.length) : NaN }
}

// Uses the supplied partial derivative when there is one, otherwise a central difference.
// Exposed separately so a column that comes back degenerate can be rebuilt numerically:
// h is floored at 1e-6 so the difference never collapses below the step where the seed
// value used to be the only thing protecting it.
const MIN_DERIV_STEP = 1e-6

function derivativeValue(
  expr: string,
  derivExpr: string | undefined,
  k: number,
  constants: number[],
  x: number
): number {
  if (derivExpr && derivExpr.trim()) {
    const supplied = evaluateMathExprWithConstants(derivExpr, x, 'x', constants)
    return isFinite(supplied) ? supplied : 0
  }
  const h = Math.max(MIN_DERIV_STEP, Math.abs(constants[k]) * 1e-6)
  const up = [...constants]
  up[k] += h
  const dn = [...constants]
  dn[k] -= h
  const fu = evaluateMathExprWithConstants(expr, x, 'x', up)
  const fd = evaluateMathExprWithConstants(expr, x, 'x', dn)
  const d = (fu - fd) / (2 * h)
  return isFinite(d) ? d : 0
}

export function fitGeneralFunction(
  expr: string,
  derivs: string[],
  xs: number[],
  ys: number[],
  initial: number[],
  activeMask?: boolean[]
): UserFitResult {
  const cx: number[] = []
  const cy: number[] = []
  const n = Math.min(xs.length, ys.length)
  for (let i = 0; i < n; i++) {
    if (isMissingValue(xs[i]) || isMissingValue(ys[i])) continue
    cx.push(xs[i])
    cy.push(ys[i])
  }

  const constants = Array<number>(USER_CONSTANT_COUNT).fill(0)
  for (let k = 0; k < USER_CONSTANT_COUNT; k++) {
    const value = initial[k]
    constants[k] = typeof value === 'number' && isFinite(value) ? value : 0
  }

  const expressionMask = expressionParameterMask(expr)
  const inferredMask = inferUserFunctionActiveMask(expr)
  const active = (activeMask && activeMask.length > 0 ? activeMask : inferredMask).map((value) => !!value)
  while (active.length < USER_CONSTANT_COUNT) active.push(false)
  let freeIdx: number[] = []
  for (let k = 0; k < USER_CONSTANT_COUNT; k++) {
    if (active[k] && (expressionMask[k] || !activeMask || activeMask.length === 0)) freeIdx.push(k)
  }
  if (freeIdx.length === 0) {
    freeIdx = inferUserFunctionActiveMask(expr)
      .map((value, index) => (value ? index : -1))
      .filter((index) => index >= 0)
  }
  if (freeIdx.length === 0 || cx.length === 0) {
    return { constants, rmse: residuals(expr, cx, cy, constants).rmse, iterations: 0, expr, converged: false }
  }
  const initialConstants = [...constants]
  for (const k of freeIdx) {
    if (constants[k] === 0) constants[k] = 1
  }

  let lambda = 0.01
  let cur = residuals(expr, cx, cy, constants)
  let iterations = 0
  let acceptedAnyStep = false
  for (let iter = 0; iter < 60; iter++) {
    iterations = iter + 1
    let m = freeIdx.length
    if (m === 0) break
    const jt: number[][] = []
    for (let i = 0; i < cx.length; i++) {
      const row: number[] = []
      for (let j = 0; j < m; j++) {
        const k = freeIdx[j]
        row.push(-derivativeValue(expr, derivs[k], k, constants, cx[i]))
      }
      jt.push(row)
    }

    const columnNorm = (column: number): number => {
      let sum = 0
      for (let i = 0; i < jt.length; i++) sum += jt[i][column] * jt[i][column]
      return Math.sqrt(sum)
    }
    const norms = freeIdx.map((_, column) => columnNorm(column))

    // A supplied derivative can be identically zero (a typo, or a parameter that does not
    // affect this expression). Dropping such a column would leave the seed value in the
    // result and stall the other parameters, so rebuild it numerically first.
    for (let column = 0; column < m; column++) {
      if (norms[column] > 1e-10) continue
      const k = freeIdx[column]
      for (let i = 0; i < jt.length; i++) {
        jt[i][column] = -derivativeValue(expr, undefined, k, constants, cx[i])
      }
      norms[column] = columnNorm(column)
    }

    const usable = freeIdx.map((k, index) => ({ k, index, norm: norms[index] })).filter((item) => item.norm > 1e-10)
    if (usable.length < m) {
      const kept = new Set(usable.map((item) => item.k))
      for (const k of freeIdx) {
        if (!kept.has(k)) constants[k] = initialConstants[k]
      }
      freeIdx = usable.map((item) => item.k)
      m = freeIdx.length
      if (m === 0) break
      continue
    }
    const columns = usable.map((item) => item.index)
    const jtj: number[][] = []
    const jtr: number[] = []
    for (let a2 = 0; a2 < m; a2++) {
      jtj.push([])
      for (let b2 = 0; b2 < m; b2++) {
        let sum = 0
        for (let i = 0; i < cx.length; i++) sum += jt[i][columns[a2]] * jt[i][columns[b2]]
        jtj[a2].push(sum)
      }
      let sum = 0
      for (let i = 0; i < cx.length; i++) sum += jt[i][columns[a2]] * cur.r[i]
      jtr.push(sum)
    }
    for (let a2 = 0; a2 < m; a2++) jtj[a2][a2] *= 1 + lambda
    const step = solveLinearSystem(jtj, jtr.map((value) => -value))
    if (step === null) {
      if (freeIdx.length > 1) {
        let weakest = 0
        for (let i = 1; i < norms.length; i++) {
          if (norms[i] < norms[weakest]) weakest = i
        }
        const dropped = freeIdx[weakest]
        freeIdx.splice(weakest, 1)
        constants[dropped] = initialConstants[dropped]
        continue
      }
      lambda *= 10
      if (lambda > 1e7) break
      continue
    }
    const trial = [...constants]
    for (let j = 0; j < m; j++) trial[freeIdx[j]] += step[j]
    const nxt = residuals(expr, cx, cy, trial)
    if (nxt.rmse < cur.rmse) {
      for (let k = 0; k < USER_CONSTANT_COUNT; k++) constants[k] = trial[k]
      cur = nxt
      acceptedAnyStep = true
      lambda = Math.max(1e-7, lambda / 10)
      let maxStep = 0
      for (const value of step) maxStep = Math.max(maxStep, Math.abs(value))
      if (maxStep < 1e-9) break
    } else {
      lambda *= 10
      if (lambda > 1e7) break
    }
  }
  return { constants, rmse: cur.rmse, iterations, expr, converged: acceptedAnyStep }
}

export function sampleUserFunction(
  expr: string,
  constants: number[],
  xMin: number,
  xMax: number,
  count = 200
): { x: number[]; y: number[] } {
  const n = Math.max(2, Math.min(2000, Math.round(count)))
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? xMin : xMin + ((xMax - xMin) * i) / (n - 1)
    const y = evaluateMathExprWithConstants(expr, x, 'x', constants)
    if (isMissingValue(y)) continue
    xs.push(x)
    ys.push(y)
  }
  return { x: xs, y: ys }
}
