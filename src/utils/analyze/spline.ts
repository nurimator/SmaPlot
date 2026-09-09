import { isMissingValue } from './types.ts'

export type SplineMode = 'cubic' | 'parametric' | 'parametric_closed'

function cleanSorted(x: number[], y: number[]): { xs: number[]; ys: number[] } {
  const n = Math.min(x.length, y.length)
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i < n; i++) {
    if (isMissingValue(x[i]) || isMissingValue(y[i])) continue
    pts.push({ x: x[i], y: y[i] })
  }
  pts.sort((a, b) => a.x - b.x)
  const xs: number[] = []
  const ys: number[] = []
  for (const p of pts) {
    if (xs.length > 0 && Math.abs(p.x - xs[xs.length - 1]) < 1e-12) continue
    xs.push(p.x)
    ys.push(p.y)
  }
  return { xs, ys }
}

interface CubicSegment {
  a: number
  b: number
  c: number
  d: number
  x0: number
}

function buildNaturalCubic(xs: number[], ys: number[]): CubicSegment[] {
  const n = xs.length
  if (n < 2) return []
  if (n === 2) {
    return [{ a: ys[0], b: (ys[1] - ys[0]) / (xs[1] - xs[0]), c: 0, d: 0, x0: xs[0] }]
  }
  const h: number[] = []
  for (let i = 0; i < n - 1; i++) h.push(xs[i + 1] - xs[i])
  const alpha: number[] = new Array<number>(n).fill(0)
  for (let i = 1; i < n - 1; i++) {
    alpha[i] = (3 / h[i]) * (ys[i + 1] - ys[i]) - (3 / h[i - 1]) * (ys[i] - ys[i - 1])
  }
  const l: number[] = new Array<number>(n).fill(0)
  const mu: number[] = new Array<number>(n).fill(0)
  const z: number[] = new Array<number>(n).fill(0)
  l[0] = 1
  for (let i = 1; i < n - 1; i++) {
    l[i] = 2 * (xs[i + 1] - xs[i - 1]) - h[i - 1] * mu[i - 1]
    mu[i] = h[i] / l[i]
    z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i]
  }
  l[n - 1] = 1
  const c: number[] = new Array<number>(n).fill(0)
  const b: number[] = new Array<number>(n - 1).fill(0)
  const d: number[] = new Array<number>(n - 1).fill(0)
  for (let j = n - 2; j >= 0; j--) {
    c[j] = z[j] - mu[j] * c[j + 1]
    b[j] = (ys[j + 1] - ys[j]) / h[j] - (h[j] * (c[j + 1] + 2 * c[j])) / 3
    d[j] = (c[j + 1] - c[j]) / (3 * h[j])
  }
  const segs: CubicSegment[] = []
  for (let j = 0; j < n - 1; j++) {
    segs.push({ a: ys[j], b: b[j], c: c[j], d: d[j], x0: xs[j] })
  }
  return segs
}

function evalSegment(segs: CubicSegment[], xs: number[], x: number): number {
  let j = segs.length - 1
  for (let i = 0; i < segs.length; i++) {
    const x1 = i + 1 < xs.length ? xs[i + 1] : Infinity
    if (x <= x1) {
      j = i
      break
    }
  }
  const s = segs[j]
  const dx = x - s.x0
  return s.a + s.b * dx + s.c * dx * dx + s.d * dx * dx * dx
}

export function cubicSpline(x: number[], y: number[], division = 101): { x: number[]; y: number[] } {
  const { xs, ys } = cleanSorted(x, y)
  if (xs.length < 2) return { x: [...xs], y: [...ys] }
  const segs = buildNaturalCubic(xs, ys)
  const count = Math.max(2, Math.min(5000, Math.round(division)))
  const ox: number[] = []
  const oy: number[] = []
  const lo = xs[0]
  const hi = xs[xs.length - 1]
  for (let i = 0; i < count; i++) {
    const xv = count === 1 ? lo : lo + ((hi - lo) * i) / (count - 1)
    ox.push(xv)
    oy.push(evalSegment(segs, xs, xv))
  }
  return { x: ox, y: oy }
}

function chordParams(x: number[], y: number[], closed: boolean): number[] {
  const n = x.length
  const t: number[] = [0]
  const last = closed ? n : n - 1
  for (let i = 0; i < last; i++) {
    const j = (i + 1) % n
    const dx = x[j] - x[i]
    const dy = y[j] - y[i]
    t.push(t[i] + Math.sqrt(dx * dx + dy * dy))
  }
  return t
}

function spline1D(t: number[], v: number[], tout: number[]): number[] {
  const segs = buildNaturalCubic(t, v)
  if (segs.length === 0) return tout.map(() => v[0] ?? 0)
  return tout.map((tv) => evalSegment(segs, t, tv))
}

export function parametricSpline(
  x: number[],
  y: number[],
  division = 101,
  closed = false
): { x: number[]; y: number[] } {
  const n = Math.min(x.length, y.length)
  const px: number[] = []
  const py: number[] = []
  for (let i = 0; i < n; i++) {
    if (isMissingValue(x[i]) || isMissingValue(y[i])) continue
    px.push(x[i])
    py.push(y[i])
  }
  if (px.length < 2) return { x: px, y: py }
  if (closed) {
    px.push(px[0])
    py.push(py[0])
  }
  const t = chordParams(px, py, false)
  const count = Math.max(2, Math.min(5000, Math.round(division)))
  const tEnd = t[t.length - 1]
  const tout: number[] = []
  for (let i = 0; i < count; i++) {
    tout.push(count === 1 ? 0 : (tEnd * i) / (count - 1))
  }
  return { x: spline1D(t, px, tout), y: spline1D(t, py, tout) }
}

export function interpolateSpline(
  x: number[],
  y: number[],
  mode: SplineMode,
  division = 101
): { x: number[]; y: number[] } {
  if (mode === 'parametric') return parametricSpline(x, y, division, false)
  if (mode === 'parametric_closed') return parametricSpline(x, y, division, true)
  return cubicSpline(x, y, division)
}
