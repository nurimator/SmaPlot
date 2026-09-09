import type { Dataset } from '../../types.ts'

export interface ErrorBarData {
  yPlus: number[]
  yMinus: number[]
}

export function extractErrorBars(ds: Dataset): ErrorBarData | null {
  const lines = ds.rawLines
  if (!lines || lines.length === 0) return null
  const yPlus: number[] = []
  const yMinus: number[] = []
  let found = false
  for (const parts of lines) {
    if (parts.length >= 4) {
      const up = parseFloat(parts[2])
      const dn = parseFloat(parts[3])
      if (!isNaN(up) && !isNaN(dn)) {
        yPlus.push(up)
        yMinus.push(dn)
        found = true
        continue
      }
    }
    yPlus.push(NaN)
    yMinus.push(NaN)
  }
  if (!found) return null
  return { yPlus, yMinus }
}

export function resolveErrorBars(ds: Dataset): ErrorBarData | null {
  if (ds.yPlus && ds.yMinus && ds.yPlus.length > 0) {
    return { yPlus: ds.yPlus, yMinus: ds.yMinus }
  }
  return extractErrorBars(ds)
}
