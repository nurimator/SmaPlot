import type { NiceScaleResult } from '../types.ts'

export const AUTO_AXIS_TICKS = 15

export function niceScale(min: number, max: number, maxTicks: number): NiceScaleResult {
  if (min === max) {
    min -= 1
    max += 1
  }
  const range = max - min
  const roughStep = range / (maxTicks - 1)
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)))
  const residual = roughStep / magnitude
  const niceStep =
    residual <= 1.5
      ? 1 * magnitude
      : residual <= 3.5
      ? 2 * magnitude
      : residual <= 7.5
      ? 5 * magnitude
      : 10 * magnitude
  const niceMin = Math.floor(min / niceStep) * niceStep
  const niceMax = Math.ceil(max / niceStep) * niceStep
  return { min: niceMin, max: niceMax, step: niceStep }
}

export function niceAxisBounds(min: number, max: number): NiceScaleResult {
  return niceDataRange(min, max)
}

function niceDataRange(min: number, max: number, maxTicks = AUTO_AXIS_TICKS): NiceScaleResult {
  const r = niceScale(min, max, maxTicks)
  const clean = (v: number) => parseFloat(v.toPrecision(12))
  return { min: clean(r.min), max: clean(r.max), step: clean(r.step) }
}

export interface AutoStepResult {
  increment: number
  division: number
}

export function computeAutoStep(min: number, max: number): AutoStepResult {
  const range = Math.abs(max - min)
  if (!isFinite(range) || range <= 0) {
    return { increment: 1, division: 2 }
  }
  const lo = range / 5
  const hi = range / 2
  const kLo = Math.floor(Math.log10(lo)) - 1
  const kHi = Math.floor(Math.log10(hi)) + 1
  let preferred: number | null = null
  let fallback: number | null = null
  for (let k = kLo; k <= kHi; k++) {
    const mag = Math.pow(10, k)
    for (const mult of [1, 2, 5]) {
      const inc = mult * mag
      if (inc < lo * (1 - 1e-9) || inc > hi * (1 + 1e-9)) continue
      if (mult === 1 || mult === 2) {
        if (preferred === null || inc < preferred) preferred = inc
      } else if (fallback === null || inc < fallback) {
        fallback = inc
      }
    }
  }
  const increment = preferred !== null ? preferred : fallback !== null ? fallback : 1
  const division = preferred !== null ? 2 : 5
  return { increment, division }
}

export function formatTick(value: number): string {
  if (Math.abs(value) < 1e-10) return '0'
  const cleanVal = parseFloat(value.toPrecision(12))
  if (Math.abs(cleanVal) >= 1e7 || (Math.abs(cleanVal) > 0 && Math.abs(cleanVal) < 1e-4)) {
    return cleanVal.toExponential(1)
  }
  if (Number.isInteger(cleanVal)) {
    return cleanVal.toString()
  }
  const str = cleanVal.toFixed(6)
  return str.replace(/\.?0+$/, '')
}

