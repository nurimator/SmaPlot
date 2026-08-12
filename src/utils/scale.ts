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

export function computeAutoStep(min: number, max: number): number {
  const range = Math.abs(max - min)
  if (range === 0) return 1
  const roughStep = range / 5
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)))
  const residual = roughStep / magnitude
  let step: number
  if (residual <= 1.5) step = 1 * magnitude
  else if (residual <= 3.5) step = 2 * magnitude
  else if (residual <= 7.5) step = 5 * magnitude
  else step = 10 * magnitude
  return parseFloat(step.toPrecision(12))
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

