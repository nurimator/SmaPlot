import type { PeakPoint } from './types.ts'
import { isMissingValue } from './types.ts'

export function detectPeaks(x: number[], y: number[], maxPeaks = 20): PeakPoint[] {
  const n = Math.min(x.length, y.length)
  const found: PeakPoint[] = []
  for (let i = 1; i < n - 1; i++) {
    const y0 = y[i - 1]
    const y1 = y[i]
    const y2 = y[i + 1]
    if (isMissingValue(y0) || isMissingValue(y1) || isMissingValue(y2)) continue
    if (isMissingValue(x[i])) continue
    const d1 = y1 - y0
    const d2 = y2 - y1
    if (d1 * d2 < 0 && d1 > 0) {
      const peak: PeakPoint = { x: x[i], y: y1, height: y1 - Math.min(y0, y2) }
      let inserted = false
      for (let k = 0; k < found.length; k++) {
        if (peak.height > found[k].height) {
          found.splice(k, 0, peak)
          inserted = true
          break
        }
      }
      if (!inserted) found.push(peak)
      if (found.length > Math.max(1, maxPeaks)) found.length = maxPeaks
    }
  }
  return found
}

export function filterPeaksByThreshold(peaks: PeakPoint[], threshold: number): PeakPoint[] {
  if (!isFinite(threshold) || threshold <= 0) return peaks
  return peaks.filter((p) => p.height >= threshold)
}

export function findMaximum(x: number[], y: number[]): PeakPoint | null {
  const n = Math.min(x.length, y.length)
  let best: PeakPoint | null = null
  for (let i = 0; i < n; i++) {
    if (isMissingValue(x[i]) || isMissingValue(y[i])) continue
    if (!best || y[i] > best.y) best = { x: x[i], y: y[i], height: 0 }
  }
  return best
}

export function findMinimum(x: number[], y: number[]): PeakPoint | null {
  const n = Math.min(x.length, y.length)
  let best: PeakPoint | null = null
  for (let i = 0; i < n; i++) {
    if (isMissingValue(x[i]) || isMissingValue(y[i])) continue
    if (!best || y[i] < best.y) best = { x: x[i], y: y[i], height: 0 }
  }
  return best
}
