import type { NiceScaleResult } from '../types.ts'

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

export function formatTick(value: number): string {
  if (Math.abs(value) >= 10000) return value.toExponential(1)
  if (Number.isInteger(value)) return value.toString()
  const fixed = value.toFixed(1)
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed
}
