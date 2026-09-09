import type { FitResult } from './types.ts'
import { isMissingValue } from './types.ts'
import { solveLinearSystem } from './linalg.ts'

export type LsKind = 'poly' | 'exp' | 'log' | 'power' | 'linear'

function cleanPairs(x: number[], y: number[]): { xs: number[]; ys: number[] } {
  const xs: number[] = []
  const ys: number[] = []
  const n = Math.min(x.length, y.length)
  for (let i = 0; i < n; i++) {
    if (isMissingValue(x[i]) || isMissingValue(y[i])) continue
    xs.push(x[i])
    ys.push(y[i])
  }
  return { xs, ys }
}

function linearRegression(xs: number[], ys: number[]): { a: number; b: number } {
  const n = xs.length
  if (n === 0) return { a: 1, b: 0 }
  if (n === 1) return { a: 0, b: ys[0] }
  let sx = 0
  let sy = 0
  let sxx = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    sx += xs[i]
    sy += ys[i]
    sxx += xs[i] * xs[i]
    sxy += xs[i] * ys[i]
  }
  const denom = n * sxx - sx * sx
  if (Math.abs(denom) < 1e-12) return { a: 0, b: sy / n }
  const a = (n * sxy - sx * sy) / denom
  const b = (sy - a * sx) / n
  return { a, b }
}

function rmseOf(xs: number[], ys: number[], predict: (x: number) => number): number {
  if (xs.length === 0) return NaN
  let s = 0
  for (let i = 0; i < xs.length; i++) {
    const d = ys[i] - predict(xs[i])
    s += d * d
  }
  return Math.sqrt(s / xs.length)
}

function fmt(n: number): string {
  if (!isFinite(n)) return '0'
  if (Math.abs(n) < 1e-12) return '0'
  const r = Math.round(n)
  if (Math.abs(n - r) < 1e-9 && Math.abs(r) < 1e9) return String(r)
  return String(parseFloat(n.toPrecision(6)))
}

export function fitLinear(x: number[], y: number[]): FitResult {
  const { xs, ys } = cleanPairs(x, y)
  const { a, b } = linearRegression(xs, ys)
  const predict = (v: number): number => a * v + b
  const bPart = b >= 0 ? `+${fmt(b)}` : `${fmt(b)}`
  return { a, b, expr: `${fmt(a)}*x${bPart}`, rmse: rmseOf(xs, ys, predict), kind: 'linear' }
}

export function fitPolynomial(x: number[], y: number[], degree = 1): FitResult & { coeffs: number[] } {
  const { xs, ys } = cleanPairs(x, y)
  const deg = Math.max(1, Math.min(6, Math.round(degree)))
  if (deg === 1) return { ...fitLinear(xs, ys), coeffs: [], kind: 'poly' }
  const m = deg + 1
  const mat: number[][] = []
  const rhs: number[] = []
  for (let r = 0; r < m; r++) {
    mat.push([])
    for (let c = 0; c < m; c++) {
      let s = 0
      for (let i = 0; i < xs.length; i++) s += Math.pow(xs[i], r + c)
      mat[r].push(s)
    }
    let s = 0
    for (let i = 0; i < xs.length; i++) s += ys[i] * Math.pow(xs[i], r)
    rhs.push(s)
  }
  const coeffs = solveLinearSystem(mat, rhs) || new Array<number>(m).fill(0)
  const predict = (v: number): number => {
    let s = 0
    for (let k = 0; k < m; k++) s += coeffs[k] * Math.pow(v, k)
    return s
  }
  const terms: string[] = []
  for (let k = m - 1; k >= 0; k--) {
    const ck = coeffs[k]
    if (Math.abs(ck) < 1e-12) continue
    const mag = k === 0 ? fmt(Math.abs(ck)) : k === 1 ? `${fmt(Math.abs(ck))}*x` : `${fmt(Math.abs(ck))}*x^${k}`
    if (terms.length === 0) terms.push(ck < 0 ? `-${mag}` : mag)
    else terms.push(ck < 0 ? `-${mag}` : `+${mag}`)
  }
  return { a: coeffs[1] ?? 0, b: coeffs[0] ?? 0, expr: terms.join('') || '0', rmse: rmseOf(xs, ys, predict), kind: 'poly', coeffs }
}

export function fitExponential(x: number[], y: number[]): FitResult {
  const { xs, ys } = cleanPairs(x, y)
  const lx: number[] = []
  const ly: number[] = []
  for (let i = 0; i < xs.length; i++) {
    if (ys[i] <= 0) continue
    lx.push(xs[i])
    ly.push(Math.log(ys[i]))
  }
  if (lx.length < 2) return { a: 0, b: 0, expr: '0', rmse: NaN, kind: 'exp' }
  const { a: b, b: lnA } = linearRegression(lx, ly)
  const a = Math.exp(lnA)
  const predict = (v: number): number => a * Math.exp(b * v)
  return { a, b, expr: `${fmt(a)}*exp(${fmt(b)}*x)`, rmse: rmseOf(xs, ys, predict), kind: 'exp' }
}

export function fitLogarithmic(x: number[], y: number[]): FitResult {
  const { xs, ys } = cleanPairs(x, y)
  const lx: number[] = []
  const ly: number[] = []
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] <= 0) continue
    lx.push(Math.log(xs[i]))
    ly.push(ys[i])
  }
  if (lx.length < 2) return { a: 0, b: 0, expr: '0', rmse: NaN, kind: 'log' }
  const { a: b, b: a } = linearRegression(lx, ly)
  const predict = (v: number): number => (v <= 0 ? NaN : a + b * Math.log(v))
  const predSafe = (v: number): number => {
    const p = predict(v)
    return isFinite(p) ? p : 0
  }
  return { a, b, expr: `${fmt(a)}+${fmt(b)}*log(x)`, rmse: rmseOf(xs, ys, predSafe), kind: 'log' }
}

export function fitPower(x: number[], y: number[]): FitResult {
  const { xs, ys } = cleanPairs(x, y)
  const lx: number[] = []
  const ly: number[] = []
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] <= 0 || ys[i] <= 0) continue
    lx.push(Math.log(xs[i]))
    ly.push(Math.log(ys[i]))
  }
  if (lx.length < 2) return { a: 0, b: 0, expr: '0', rmse: NaN, kind: 'power' }
  const { a: b, b: lnA } = linearRegression(lx, ly)
  const a = Math.exp(lnA)
  const predict = (v: number): number => (v <= 0 ? NaN : a * Math.pow(v, b))
  const predSafe = (v: number): number => {
    const p = predict(v)
    return isFinite(p) ? p : 0
  }
  return { a, b, expr: `${fmt(a)}*x^${fmt(b)}`, rmse: rmseOf(xs, ys, predSafe), kind: 'power' }
}

export function evaluateFitExpr(kind: LsKind, a: number, b: number, x: number): number {
  switch (kind) {
    case 'exp': return a * Math.exp(b * x)
    case 'log': return x <= 0 ? NaN : a + b * Math.log(x)
    case 'power': return x <= 0 ? NaN : a * Math.pow(x, b)
    default: return a * x + b
  }
}
