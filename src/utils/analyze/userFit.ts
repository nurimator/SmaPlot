import { evaluateMathExprWithConstants } from '../dataset.ts'
import { isMissingValue } from './types.ts'
import { solveLinearSystem } from './linalg.ts'

export interface UserFitResult {
  constants: number[]
  rmse: number
  iterations: number
  expr: string
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
  const constants = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  for (let k = 0; k < 9; k++) {
    const v = initial[k]
    constants[k] = typeof v === 'number' && isFinite(v) ? v : 0
  }
  const active = (activeMask || []).map((v) => !!v)
  while (active.length < 9) active.push(true)
  const freeIdx: number[] = []
  for (let k = 0; k < 9; k++) {
    if (active[k]) freeIdx.push(k)
  }
  if (freeIdx.length === 0 || cx.length === 0) {
    return { constants, rmse: residuals(expr, cx, cy, constants).rmse, iterations: 0, expr }
  }
  let lambda = 0.01
  let cur = residuals(expr, cx, cy, constants)
  let iterations = 0
  for (let iter = 0; iter < 60; iter++) {
    iterations = iter + 1
    const m = freeIdx.length
    const jt: number[][] = []
    for (let i = 0; i < cx.length; i++) {
      const row: number[] = []
      for (let j = 0; j < m; j++) {
        const k = freeIdx[j]
        const dExpr = derivs[k]
        let d: number
        if (dExpr && dExpr.trim()) {
          d = evaluateMathExprWithConstants(dExpr, cx[i], 'x', constants)
          if (!isFinite(d)) d = 0
        } else {
          const h = Math.abs(constants[k]) * 1e-6 + 1e-8
          const up = [...constants]
          up[k] += h
          const dn = [...constants]
          dn[k] -= h
          const fu = evaluateMathExprWithConstants(expr, cx[i], 'x', up)
          const fd = evaluateMathExprWithConstants(expr, cx[i], 'x', dn)
          d = (fu - fd) / (2 * h)
          if (!isFinite(d)) d = 0
        }
        row.push(-d)
      }
      jt.push(row)
    }
    const jtj: number[][] = []
    const jtr: number[] = []
    for (let a2 = 0; a2 < m; a2++) {
      jtj.push([])
      for (let b2 = 0; b2 < m; b2++) {
        let s = 0
        for (let i = 0; i < cx.length; i++) s += jt[i][a2] * jt[i][b2]
        jtj[a2].push(s)
      }
      let s = 0
      for (let i = 0; i < cx.length; i++) s += jt[i][a2] * cur.r[i]
      jtr.push(s)
    }
    for (let a2 = 0; a2 < m; a2++) jtj[a2][a2] *= 1 + lambda
    const step = solveLinearSystem(jtj, jtr.map((v) => -v))
    if (step === null) {
      lambda *= 10
      if (lambda > 1e7) break
      continue
    }
    const trial = [...constants]
    for (let j = 0; j < m; j++) trial[freeIdx[j]] += step[j]
    const nxt = residuals(expr, cx, cy, trial)
    if (nxt.rmse < cur.rmse) {
      for (let k = 0; k < 9; k++) constants[k] = trial[k]
      cur = nxt
      lambda = Math.max(1e-7, lambda / 10)
      let maxStep = 0
      for (const s of step) maxStep = Math.max(maxStep, Math.abs(s))
      if (maxStep < 1e-9) break
    } else {
      lambda *= 10
      if (lambda > 1e7) break
    }
  }
  return { constants, rmse: cur.rmse, iterations, expr }
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
