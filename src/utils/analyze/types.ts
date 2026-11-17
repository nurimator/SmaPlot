export type AnalyzeTypeCode = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | number

export interface ZerosLineInfo {
  raw: string
  count: number
  analyzeType: number
  increment: number
  from: number
  to: number
}

export interface FitResult {
  a: number
  b: number
  expr: string
  rmse: number
  kind: string
}

export interface PeakPoint {
  x: number
  y: number
  height: number
}

export interface GaussPeak {
  intensity: number
  position: number
  width: number
  active: boolean
}

export const MISSING_SENTINEL = -1e300

export function isMissingValue(v: number): boolean {
  return !isFinite(v) || v <= MISSING_SENTINEL / 2
}
