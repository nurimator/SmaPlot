import type { Dataset } from '../../types.ts'
import { getProcessedDataset } from '../../components/plot/dataset.ts'
import {
  curveLineToName,
  isKnownCurveLine,
  parseCurveParams,
} from './curveParams.ts'
import { fitExponential, fitLinear, fitLogarithmic, fitPolynomial, fitPower } from './lsFit.ts'
import { fitGeneralFunction, sampleUserFunction } from './userFit.ts'
import { cubicSpline } from './spline.ts'
import { isMissingValue } from './types.ts'

export interface CurveDrawStyle {
  color: string
  width: number
  lineType: string
  pitch: number
}

export function getCurveDrawStyle(ds: Dataset): CurveDrawStyle {
  const cp = parseCurveParams(ds.smpSeriesZerosLine, ds.smpSeriesFixed5)
  const bgr = cp.colorBgr
  const r = bgr & 0xff
  const g = (bgr >> 8) & 0xff
  const b = (bgr >> 16) & 0xff
  const toHex = (n: number): string => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')
  return {
    color: `#${toHex(r)}${toHex(g)}${toHex(b)}`,
    width: cp.width > 0 ? cp.width : 0.4,
    lineType: curveLineToName(cp.line),
    pitch: cp.pitch > 0 ? cp.pitch : 1,
  }
}

export function shouldDrawCurve(ds: Dataset): boolean {
  if (!ds) return false
  if (ds.derivedKind) return false
  if (ds.options && ds.options.show === false) return false
  const cp = parseCurveParams(ds.smpSeriesZerosLine, ds.smpSeriesFixed5)
  if (!isKnownCurveLine(cp.line)) return false
  if (cp.analyzeType !== 0) return true
  const mainLine = ds.options?.lineType || 'solid'
  return mainLine === 'no_line' || mainLine === 'none'
}

function inRangePoints(
  xs: number[],
  ys: number[],
  from: number,
  to: number,
  outrange: boolean
): { fx: number[]; fy: number[] } {
  if (outrange) return { fx: [...xs], fy: [...ys] }
  const lo = Math.min(from, to)
  const hi = Math.max(from, to)
  const fx: number[] = []
  const fy: number[] = []
  for (let i = 0; i < xs.length; i++) {
    if (!isFinite(xs[i]) || !isFinite(ys[i])) continue
    if (xs[i] >= lo && xs[i] <= hi) {
      fx.push(xs[i])
      fy.push(ys[i])
    }
  }
  return { fx, fy }
}

function samplePositions(from: number, to: number, count: number, increment: number): number[] {
  const n = Math.max(2, Math.min(5000, Math.round(count)))
  const lo = Math.min(from, to)
  const hi = Math.max(from, to)
  const out: number[] = []
  if (increment === 1 && lo > 0) {
    const ratio = hi / lo
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1)
      out.push(lo * Math.pow(ratio, t))
    }
    return out
  }
  if (increment === 2) {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1)
      out.push(hi - (hi - lo) * (1 - t) * (1 - t))
    }
    return out
  }
  for (let i = 0; i < n; i++) {
    out.push(n === 1 ? lo : lo + ((hi - lo) * i) / (n - 1))
  }
  return out
}

export function computeCurvePoints(ds: Dataset): { x: number[]; y: number[] } | null {
  const key = curveFingerprint(ds)
  const hit = curvePointCache.get(curveCacheId(ds))
  if (hit && hit.key === key) return hit.result
  const result = computeCurvePointsUncached(ds)
  curvePointCache.set(curveCacheId(ds), { key, result })
  if (curvePointCache.size > CURVE_CACHE_LIMIT) {
    const oldest = curvePointCache.keys().next()
    if (!oldest.done) curvePointCache.delete(oldest.value)
  }
  return result
}

const curvePointCache = new Map<string, { key: string; result: { x: number[]; y: number[] } | null }>()
const CURVE_CACHE_LIMIT = 100

function curveCacheId(ds: Dataset): string {
  return `${ds.smpSeriesName || ds.name}::${ds.filePath || ds.fileName || ''}`
}

function curveFingerprint(ds: Dataset): string {
  const n = Math.min(ds.x.length, ds.y.length)
  let sum = 0
  for (let i = 0; i < n; i += 97) {
    const xv = ds.x[i]
    const yv = ds.y[i]
    if (isFinite(xv) && isFinite(yv)) sum += xv * 0.6180339887 + yv
  }
  const uf = ds.smpUserFunction
  return [
    ds.smpSeriesZerosLine || '', ds.smpSeriesFixed5 || '',
    n, ds.x[0] ?? '', ds.x[n - 1] ?? '', ds.y[0] ?? '', ds.y[n - 1] ?? '',
    sum.toPrecision(8), uf?.expr || '', (uf?.derivs || []).join(';'),
  ].join('|')
}

function computeCurvePointsUncached(ds: Dataset): { x: number[]; y: number[] } | null {
  const cp = parseCurveParams(ds.smpSeriesZerosLine, ds.smpSeriesFixed5)
  const proc = getProcessedDataset(ds)
  const n = Math.min(proc.x.length, proc.y.length)
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i < n; i++) {
    if (isMissingValue(proc.x[i]) || isMissingValue(proc.y[i])) continue
    xs.push(proc.x[i])
    ys.push(proc.y[i])
  }
  if (xs.length < 2) return null
  const { fx, fy } = inRangePoints(xs, ys, cp.from, cp.to, cp.outrange)
  if (fx.length < 2) return null
  const pos = samplePositions(cp.from, cp.to, cp.count, cp.increment)

  switch (cp.analyzeType) {
    case 1: {
      const r = fitExponential(fx, fy)
      if (!isFinite(r.a)) return null
      return { x: pos, y: pos.map((v) => r.a * Math.exp(r.b * v)) }
    }
    case 2: {
      const r = fitLogarithmic(fx, fy)
      if (!isFinite(r.a)) return null
      return { x: pos, y: pos.map((v) => (v <= 0 ? NaN : r.a + r.b * Math.log(v))) }
    }
    case 3: {
      const r = fitPower(fx, fy)
      if (!isFinite(r.a)) return null
      return { x: pos, y: pos.map((v) => (v <= 0 ? NaN : r.a * Math.pow(v, r.b))) }
    }
    case 4: {
      const r = fitPolynomial(fx, fy, 2)
      const coeffs = r.coeffs.length > 0 ? r.coeffs : [r.b, r.a, 0]
      return {
        x: pos,
        y: pos.map((v) => coeffs[0] + coeffs[1] * v + coeffs[2] * v * v),
      }
    }
    case 5: {
      const r = fitLinear(fx, fy)
      return { x: pos, y: pos.map((v) => r.a * v + r.b) }
    }
    case 6: {
      const uf = ds.smpUserFunction
      const expr = uf?.expr || 'a*exp(b*x)'
      const derivs = uf?.derivs || []
      const initial = [1, 1, 0, 0, 0, 0, 0, 0, 0]
      const fit = fitGeneralFunction(expr, derivs, fx, fy, initial)
      if (!isFinite(fit.rmse)) return null
      return sampleUserFunction(expr, fit.constants, Math.min(cp.from, cp.to), Math.max(cp.from, cp.to), cp.count)
    }
    default: {
      const s = cubicSpline(fx, fy, cp.count)
      if (s.x.length === 0) return null
      return s
    }
  }
}
