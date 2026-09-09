import type { ZerosLineInfo } from './types.ts'

export function parseZerosLine(raw: string | undefined): ZerosLineInfo {
  const line = (raw || '').trim()
  const parts = line.split(/\s+/).filter((t) => t !== '')
  const at = (idx: number, fallback: number): number => {
    if (parts.length <= idx) return fallback
    const v = parseFloat(parts[idx])
    return isNaN(v) ? fallback : v
  }
  return {
    raw: line,
    count: parts.length >= 2 ? Math.max(0, Math.round(at(1, 0))) : 0,
    analyzeType: parts.length >= 3 ? Math.round(at(2, 0)) : 0,
    increment: parts.length >= 4 ? Math.round(at(3, 0)) : 0,
    from: parts.length >= 5 ? at(4, 0) : 0,
    to: parts.length >= 6 ? at(5, 10) : 10,
  }
}

export function parseExprFlag(raw: string | undefined): { kind: number; tokens: number[] } {
  const parts = (raw || '').trim().split(/\s+/).map((p) => parseFloat(p))
  const nums = parts.filter((n) => !isNaN(n))
  return { kind: nums.length > 0 ? nums[0] : 0, tokens: nums }
}

export function isFunctionSeries(exprFlag: string | undefined, countLine?: string): boolean {
  if (parseExprFlag(exprFlag).kind === 3) return true
  const first = (countLine || '').trim().split(/\s+/)[0]
  return first === '3'
}
