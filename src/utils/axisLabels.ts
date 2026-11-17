import type { SmpAxisSpec } from '../types.ts'

export interface AxisLabelFormat {
  labelCount: number
  labelStart: number
  labelInterval: number
  addPlus: boolean
  keepZeros: boolean
  zeroAsInt: boolean
  intDigits: number
  fracDigits: number
  drawExponent: boolean
}

const DEFAULT_FORMAT: AxisLabelFormat = {
  labelCount: -1,
  labelStart: 0,
  labelInterval: 1,
  addPlus: false,
  keepZeros: false,
  zeroAsInt: true,
  intDigits: 5,
  fracDigits: 5,
  drawExponent: true,
}

const MODERN_TAIL_LENGTH = 14

const LOG_MAJOR_MANTISSAS: Record<number, number[]> = {
  1: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  2: [1, 2, 4],
  3: [1, 3],
  4: [1, 2, 5],
  5: [1, 5],
  10: [1],
}

// format
export function readAxisLabelFormat(spec: SmpAxisSpec | undefined): AxisLabelFormat {
  const tail = (spec?.rawFixedTail || '').trim().split(/\s+/).filter(Boolean)
  if (tail.length < 13) return { ...DEFAULT_FORMAT, addPlus: !!spec?.addPlusSign }
  const int = (index: number, fallback: number): number => {
    const value = parseInt(tail[index], 10)
    return Number.isFinite(value) ? value : fallback
  }
  return {
    labelCount: int(4, DEFAULT_FORMAT.labelCount),
    labelStart: Math.max(0, int(5, DEFAULT_FORMAT.labelStart)),
    labelInterval: Math.max(1, int(6, DEFAULT_FORMAT.labelInterval)),
    addPlus: !!spec?.addPlusSign,
    keepZeros: int(8, 0) !== 0,
    zeroAsInt: int(9, 1) !== 0,
    intDigits: int(10, DEFAULT_FORMAT.intDigits),
    fracDigits: Math.min(20, Math.max(0, int(11, DEFAULT_FORMAT.fracDigits))),
    drawExponent: tail.length >= MODERN_TAIL_LENGTH ? int(13, 1) !== 0 : true,
  }
}

export function axisLabelExponent(min: number, max: number, format: AxisLabelFormat): number {
  const peak = Math.max(Math.abs(min), Math.abs(max))
  if (!Number.isFinite(peak) || peak <= 0) return 0
  const order = Math.floor(Math.log10(peak))
  if (order < 1) return format.fracDigits <= -order ? -order : 0
  return format.intDigits <= order ? -order : 0
}

export function formatAxisValue(value: number, format: AxisLabelFormat, exponent = 0): string {
  const scaled = exponent === 0 ? value : value * Math.pow(10, exponent)
  const epsilon = Math.pow(10, -(format.fracDigits + 2))
  if (format.zeroAsInt && Math.abs(scaled) < epsilon) return '0'
  let text = scaled.toFixed(format.fracDigits)
  if (/^-0(\.0*)?$/.test(text)) text = text.slice(1)
  if (!format.keepZeros && text.includes('.')) text = text.replace(/0+$/, '').replace(/\.$/, '')
  if (format.addPlus && !text.startsWith('-')) text = `+${text}`
  return text
}

// selection
export function selectAxisLabelIndices(count: number, format: AxisLabelFormat): Set<number> {
  const picked = new Set<number>()
  for (let index = 0; index < count; index++) {
    if (index < format.labelStart) continue
    const offset = index - format.labelStart
    if (format.labelCount >= 0 && offset >= format.labelCount * format.labelInterval) break
    if (offset % format.labelInterval === 0) picked.add(index)
  }
  return picked
}

// log
export function logMajorMantissas(increment: number): number[] {
  const key = Math.round(increment)
  return LOG_MAJOR_MANTISSAS[key] || LOG_MAJOR_MANTISSAS[10]
}

export function logDecadeExponent(value: number): number | null {
  if (!(value > 0)) return null
  const exponent = Math.round(Math.log10(value))
  return Math.abs(value / Math.pow(10, exponent) - 1) < 1e-9 ? exponent : null
}
