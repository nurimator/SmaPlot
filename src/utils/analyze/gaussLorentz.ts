import type { GaussPeak } from './types.ts'
import { isMissingValue } from './types.ts'
import { solveLinearSystem } from './linalg.ts'

export function gaussValue(x: number, peak: GaussPeak, offset: number): number {
  if (!peak.width || Math.abs(peak.width) < 1e-12) return offset
  const d = (x - peak.position) / peak.width
  return peak.intensity * Math.exp(-d * d) + offset
}

export function lorentzValue(x: number, peak: GaussPeak, offset: number): number {
  if (!peak.width || Math.abs(peak.width) < 1e-12) return offset
  const d = (x - peak.position) / peak.width
  return peak.intensity / (d * d + 1) + offset
}

export function evalGaussLorentz(
  kind: 'gauss' | 'lorentz',
  peaks: GaussPeak[],
  offset: number,
  x: number
): number {
  let s = offset
  for (const p of peaks) {
    if (!p.active) continue
    s += kind === 'gauss' ? gaussValue(x, p, 0) : lorentzValue(x, p, 0)
  }
  return s
}

export interface MultiPeakFit {
  peaks: GaussPeak[]
  offset: number
  rmse: number
  iterations: number
}

export function fitGaussLorentz(
  kind: 'gauss' | 'lorentz',
  xs: number[],
  ys: number[],
  initial: GaussPeak[],
  fitOffset: boolean,
  initialOffset = 0
): MultiPeakFit {
  const cx: number[] = []
  const cy: number[] = []
  const n = Math.min(xs.length, ys.length)
  for (let i = 0; i < n; i++) {
    if (isMissingValue(xs[i]) || isMissingValue(ys[i])) continue
    cx.push(xs[i])
    cy.push(ys[i])
  }
  const peaks: GaussPeak[] = initial.slice(0, 6).map((p) => ({ ...p }))
  let offset = isFinite(initialOffset) ? initialOffset : 0
  const evalAt = (x: number, pp: GaussPeak[], off: number): number => evalGaussLorentz(kind, pp, off, x)
  const rmseOf = (pp: GaussPeak[], off: number): number => {
    if (cx.length === 0) return NaN
    let s = 0
    for (let i = 0; i < cx.length; i++) {
      const d = cy[i] - evalAt(cx[i], pp, off)
      s += d * d
    }
    return Math.sqrt(s / cx.length)
  }
  const freeIdx: number[] = []
  peaks.forEach((p, i) => {
    if (p.active) freeIdx.push(i)
  })
  const dim = freeIdx.length * 3 + (fitOffset ? 1 : 0)
  if (dim === 0 || cx.length === 0) {
    return { peaks, offset, rmse: rmseOf(peaks, offset), iterations: 0 }
  }
  const getVec = (): number[] => {
    const v: number[] = []
    for (const i of freeIdx) {
      v.push(peaks[i].intensity, peaks[i].position, peaks[i].width)
    }
    if (fitOffset) v.push(offset)
    return v
  }
  const setVec = (v: number[]): void => {
    let k = 0
    for (const i of freeIdx) {
      peaks[i].intensity = v[k++]
      peaks[i].position = v[k++]
      let w = v[k++]
      if (!isFinite(w) || Math.abs(w) < 1e-9) w = w < 0 ? -1e-9 : 1e-9
      peaks[i].width = w
    }
    if (fitOffset) offset = v[k] ?? offset
  }
  let lambda = 0.01
  let cur = rmseOf(peaks, offset)
  let iterations = 0
  for (let iter = 0; iter < 50; iter++) {
    iterations = iter + 1
    const v0 = getVec()
    const m = v0.length
    const jt: number[][] = []
    const res: number[] = []
    for (let i = 0; i < cx.length; i++) {
      const row: number[] = []
      const f0 = evalAt(cx[i], peaks, offset)
      res.push(cy[i] - f0)
      for (let j = 0; j < m; j++) {
        const h = Math.abs(v0[j]) * 1e-6 + 1e-8
        const up = [...v0]
        up[j] += h
        const dn = [...v0]
        dn[j] -= h
        const pu = (() => {
          const pp = peaks.map((p) => ({ ...p }))
          let off = offset
          let k = 0
          for (const pi of freeIdx) {
            pp[pi].intensity = up[k++]
            pp[pi].position = up[k++]
            pp[pi].width = up[k++]
          }
          if (fitOffset) off = up[k] ?? off
          return evalAt(cx[i], pp, off)
        })()
        const pd = (() => {
          const pp = peaks.map((p) => ({ ...p }))
          let off = offset
          let k = 0
          for (const pi of freeIdx) {
            pp[pi].intensity = dn[k++]
            pp[pi].position = dn[k++]
            pp[pi].width = dn[k++]
          }
          if (fitOffset) off = dn[k] ?? off
          return evalAt(cx[i], pp, off)
        })()
        let d = (pu - pd) / (2 * h)
        if (!isFinite(d)) d = 0
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
      for (let i = 0; i < cx.length; i++) s += jt[i][a2] * res[i]
      jtr.push(s)
    }
    for (let a2 = 0; a2 < m; a2++) jtj[a2][a2] *= 1 + lambda
    const step = solveLinearSystem(jtj, jtr.map((v) => -v))
    if (step === null) {
      lambda *= 10
      if (lambda > 1e7) break
      continue
    }
    const trial = v0.map((v, j) => v + step[j])
    const keepP = peaks.map((p) => ({ ...p }))
    const keepO = offset
    setVec(trial)
    const nxt = rmseOf(peaks, offset)
    if (nxt < cur) {
      cur = nxt
      lambda = Math.max(1e-7, lambda / 10)
      let mx = 0
      for (const s of step) mx = Math.max(mx, Math.abs(s))
      if (mx < 1e-9) break
    } else {
      for (let k = 0; k < peaks.length; k++) peaks[k] = keepP[k]
      offset = keepO
      lambda *= 10
      if (lambda > 1e7) break
    }
  }
  return { peaks, offset, rmse: cur, iterations }
}

export function sampleGaussLorentz(
  kind: 'gauss' | 'lorentz',
  peaks: GaussPeak[],
  offset: number,
  xMin: number,
  xMax: number,
  count = 200
): { x: number[]; y: number[] } {
  const num = Math.max(2, Math.min(2000, Math.round(count)))
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i < num; i++) {
    const x = num === 1 ? xMin : xMin + ((xMax - xMin) * i) / (num - 1)
    xs.push(x)
    ys.push(evalGaussLorentz(kind, peaks, offset, x))
  }
  return { x: xs, y: ys }
}

export function formatPeakResult(index: number, peak: GaussPeak): string {
  return `${index + 1}:Int.=${peak.intensity} Pos=${peak.position} Width=${peak.width}`
}
