import type { NiceScaleResult } from '../types.ts'
import { logMajorMantissas } from './axisLabels.ts'

export type ValueScaleKind = 'linear' | 'log'

// axis scale type codes
export const AXIS_SCALE_TYPE_CODES: Record<string, number> = {
  linear: 0,
  log10: 1,
  inverse_normal: 2,
  log10_normal: 3,
  inverse: 4,
}

export function isLogScaleType(scaleType: number | undefined): boolean {
  return scaleType === 1 || scaleType === 3
}

export function axisScaleTypeName(scaleType: number | undefined, logScale: boolean | undefined): string {
  if (scaleType !== undefined && isLogScaleType(scaleType) === !!logScale) {
    const name = Object.keys(AXIS_SCALE_TYPE_CODES).find((key) => AXIS_SCALE_TYPE_CODES[key] === scaleType)
    if (name) return name
  }
  return logScale ? 'log10_normal' : 'linear'
}

export interface ValueScale {
  kind: ValueScaleKind
  min: number
  max: number
  unitMin: number
  unitMax: number
  pixelStart: number
  pixelEnd: number
  isValid: (value: number) => boolean
  contains: (value: number) => boolean
  valueToUnit: (value: number) => number
  unitToValue: (unit: number) => number
  unitToPixel: (unit: number) => number
  pixelToUnit: (pixel: number) => number
  valueToPixel: (value: number) => number
  pixelToValue: (pixel: number) => number
  clampValue: (value: number) => number
}

function logDomain(min: number, max: number): { min: number; max: number } {
  let lo = Number.isFinite(min) && min > 0 ? min : NaN
  let hi = Number.isFinite(max) && max > 0 ? max : NaN
  if (!Number.isFinite(lo) && !Number.isFinite(hi)) return { min: 0.1, max: 10 }
  if (!Number.isFinite(lo)) lo = Math.max(hi / 1000, Number.MIN_VALUE)
  if (!Number.isFinite(hi)) hi = Math.min(lo * 100, Number.MAX_VALUE)
  if (lo === hi) hi = lo > Number.MAX_VALUE / 10 ? lo / 10 : lo * 10
  return { min: lo, max: hi }
}

export function createValueScale(
  min: number,
  max: number,
  pixelStart: number,
  pixelEnd: number,
  kind: ValueScaleKind = 'linear'
): ValueScale {
  const domain = kind === 'log' ? logDomain(min, max) : {
    min: Number.isFinite(min) ? min : 0,
    max: Number.isFinite(max) ? max : 10,
  }
  if (domain.min === domain.max) domain.max = kind === 'log' ? domain.min * 10 : domain.min + 1
  const unitMin = kind === 'log' ? Math.log10(domain.min) : domain.min
  const unitMax = kind === 'log' ? Math.log10(domain.max) : domain.max
  const unitSpan = unitMax - unitMin
  const isValid = (value: number): boolean =>
    Number.isFinite(value) && (kind === 'linear' || value > 0)
  const valueToUnit = (value: number): number =>
    kind === 'log' ? (isValid(value) ? Math.log10(value) : NaN) : value
  const unitToValue = (unit: number): number =>
    kind === 'log' ? (Number.isFinite(unit) ? Math.pow(10, unit) : NaN) : unit
  const unitToPixel = (unit: number): number => {
    if (!Number.isFinite(unit) || unitSpan === 0) return pixelStart
    return pixelStart + ((unit - unitMin) / unitSpan) * (pixelEnd - pixelStart)
  }
  const pixelToUnit = (pixel: number): number => {
    if (!Number.isFinite(pixel) || pixelEnd === pixelStart) return unitMin
    return unitMin + ((pixel - pixelStart) / (pixelEnd - pixelStart)) * unitSpan
  }
  const valueToPixel = (value: number): number => {
    const unit = valueToUnit(value)
    return kind === 'log' && !Number.isFinite(unit) ? pixelStart : unitToPixel(unit)
  }
  const pixelToValue = (pixel: number): number => unitToValue(pixelToUnit(pixel))
  const low = Math.min(domain.min, domain.max)
  const high = Math.max(domain.min, domain.max)
  const containsTolerance = Math.max(Number.EPSILON * Math.max(Math.abs(low), Math.abs(high), 1), (high - low) * 1e-12)
  return {
    kind,
    min: domain.min,
    max: domain.max,
    unitMin,
    unitMax,
    pixelStart,
    pixelEnd,
    isValid,
    contains: (value: number): boolean => isValid(value) && value >= low - containsTolerance && value <= high + containsTolerance,
    valueToUnit,
    unitToValue,
    unitToPixel,
    pixelToUnit,
    valueToPixel,
    pixelToValue,
    clampValue: (value: number): number => {
      if (kind === 'log' && (!Number.isFinite(value) || value <= 0)) return low
      if (!Number.isFinite(value)) return low
      return Math.max(low, Math.min(high, value))
    },
  }
}

export interface AxisStepResult extends AutoStepResult {
  automatic: boolean
}

export function resolveAxisStep(
  min: number,
  max: number,
  storedStep: number,
  autoStep: boolean,
  logScale: boolean
): AxisStepResult {
  const stored = Math.abs(storedStep)
  if (logScale) {
    if (autoStep) return { ...computeLogAutoStep(min, max), automatic: true }
    return {
      increment: Number.isFinite(stored) && stored > 0 ? snapLogStep(stored) : 10,
      division: 5,
      automatic: false,
    }
  }
  if (autoStep || !Number.isFinite(stored) || stored <= 0 || stored * 20 < Math.abs(max - min)) {
    return { ...computeAutoStep(min, max), automatic: true }
  }
  return { increment: stored, division: 5, automatic: false }
}

export interface LogAxisTicks {
  major: number[]
  minor: number[]
}

export function getLogAxisTicks(
  min: number,
  max: number,
  showSubTicks = true,
  majorStep = 5
): LogAxisTicks {
  const domain = logDomain(min, max)
  const low = Math.min(domain.min, domain.max)
  const high = Math.max(domain.min, domain.max)
  const tolerance = 1e-12
  const major: number[] = []
  const minor: number[] = []
  const majorMantissas = new Set<number>(logMajorMantissas(Number.isFinite(majorStep) ? majorStep : 10))
  const firstPower = Math.floor(Math.log10(low)) - 1
  const lastPower = Math.ceil(Math.log10(high)) + 1
  for (let power = firstPower; power <= lastPower; power++) {
    const magnitude = Math.pow(10, power)
    for (let mantissa = 1; mantissa <= 9; mantissa++) {
      const raw = mantissa * magnitude
      if (!Number.isFinite(raw) || raw < low * (1 - tolerance) || raw > high * (1 + tolerance)) continue
      const value = parseFloat(raw.toPrecision(12))
      if (majorMantissas.has(mantissa)) major.push(value)
      else if (showSubTicks) minor.push(value)
    }
  }
  return { major, minor }
}

export function niceLogAxisBounds(min: number, max: number): NiceScaleResult {
  const domain = logDomain(min, max)
  const low = Math.min(domain.min, domain.max)
  const high = Math.max(domain.min, domain.max)
  const minPow = Math.pow(10, Math.floor(Math.log10(low)))
  let maxPow = Math.pow(10, Math.ceil(Math.log10(high)))
  if (minPow === maxPow) maxPow *= 10
  return {
    min: parseFloat(minPow.toPrecision(12)),
    max: parseFloat(maxPow.toPrecision(12)),
    step: 1,
  }
}

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
  const mag = Math.pow(10, Math.floor(Math.log10(range)))
  const mantissa = range / mag
  let factor = 2
  let division = 2
  if (mantissa <= 1.1) factor = 0.2
  else if (mantissa < 2) {
    factor = 0.5
    division = 5
  } else if (mantissa <= 6) factor = 1
  return { increment: Number((factor * mag).toPrecision(12)), division }
}

export function computeLogAutoStep(min: number, max: number): AutoStepResult {
  const lo = Math.min(Math.abs(min), Math.abs(max))
  const hi = Math.max(Math.abs(min), Math.abs(max))
  const decades = lo > 0 && Number.isFinite(hi / lo) ? Math.log10(hi / lo) : 1
  if (decades <= 0.5) return { increment: 0.5, division: 10 }
  if (decades <= 1) return { increment: 1, division: 10 }
  if (decades <= 3) return { increment: 5, division: 10 }
  return { increment: 10, division: 1 }
}

const LOG_STEP_TABLE: readonly [number, number][] = [
  [0.1, 1], [0.2, 0.1], [0.5, 0.2], [1, 0.5], [2, 1], [3, 2], [4, 3], [5, 4], [10, 5],
]

export function snapLogStep(step: number): number {
  for (const [limit, value] of LOG_STEP_TABLE) {
    if (step < limit) return value
  }
  return 10
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

