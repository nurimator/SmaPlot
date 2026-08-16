import type { Dataset } from '../../types.ts'
import { evaluateMathExpr } from '../../utils/dataset.ts'

export interface PlotVisualOptions {
  show?: boolean
  lineStyle?: string
  plotType?: string
  lineType?: string
  dotColor?: string
  paintColor?: string
  lineColor?: string
  size?: number
  width?: number
  pitch?: number
  brush?: string
  xTransCheck?: boolean
  xExpr?: string
  yTransCheck?: boolean
  yExpr?: string
  xColumn?: number
  yColumn?: number
  axisX?: 'x' | 'u'
  axisY?: 'y' | 'r'
}

// Cache of column-mapped + math-transformed coordinates per dataset.
// Redraws only recompute when the relevant options change.
const processedCache = new WeakMap<Dataset, { key: string; x: number[]; y: number[] }>()

export function getRawDatasetCoords(ds: Dataset): { x: number[]; y: number[] } {
  const opts = ds.options || {}
  let sourceX = ds.x
  let sourceY = ds.y

  if (ds.rawLines && ds.rawLines.length > 0) {
    const xIdx = Math.max(0, (opts.xColumn || 1) - 1)
    const yIdx = Math.max(0, (opts.yColumn || 2) - 1)
    const px: number[] = []
    const py: number[] = []
    ds.rawLines.forEach((parts) => {
      if (parts.length > Math.max(xIdx, yIdx)) {
        const vx = parseFloat(parts[xIdx])
        const vy = parseFloat(parts[yIdx])
        if (!isNaN(vx) && !isNaN(vy)) {
          px.push(vx)
          py.push(vy)
        }
      }
    })
    if (px.length > 0 && py.length > 0) {
      sourceX = px
      sourceY = py
    }
  }
  return { x: sourceX, y: sourceY }
}

function formatNumber(num: number): string {
  if (num === 0) return '0'
  const abs = Math.abs(num)
  const roundInt = Math.round(num)
  if (Math.abs(num - roundInt) < 1e-6) {
    return roundInt.toString()
  }

  // Standard case: for normal numbers (>= 0.01), limit strictly to at most 2 decimal places
  if (abs >= 0.01 && abs < 1e7) {
    const fixed2 = parseFloat(num.toFixed(2)).toString()
    if (fixed2 !== '0') {
      return fixed2
    }
  }

  // High precision case: activated only when necessary for small numbers (< 0.01)
  if (abs >= 0.0001 && abs < 0.01) {
    let decimals = 4
    if (abs < 0.001) decimals = 5
    return parseFloat(num.toFixed(decimals)).toString()
  }

  // Micro-scale numbers (< 0.0001)
  return parseFloat(num.toPrecision(3)).toString()
}

export function extractLinearParams(expr: string | undefined, varName: 'x' | 'y'): { a: number; b: number } {
  if (!expr || !expr.trim()) return { a: 1, b: 0 }
  const b = evaluateMathExpr(expr, 0, varName)
  const f1 = evaluateMathExpr(expr, 1, varName)
  const f100 = evaluateMathExpr(expr, 100, varName)
  let a = f1 - b
  if (Math.abs(a) < 1e-7 || isNaN(a) || !isFinite(a)) {
    a = (f100 - b) / 100
  }
  if (isNaN(a) || !isFinite(a) || isNaN(b) || !isFinite(b)) {
    return { a: 1, b: 0 }
  }
  return { a, b }
}

export function formatLinearExpr(a: number, b: number, varName: 'x' | 'y'): string {
  if (Math.abs(a) < 1e-12) {
    a = a < 0 ? -1e-12 : 1e-12
  }

  // Snap scale 'a' to integer only if Math.round(a) is non-zero
  const roundA = Math.round(a)
  if (roundA !== 0 && Math.abs(a - roundA) < 0.02) {
    a = roundA
  }

  const absA = Math.abs(a)

  // Snap offset 'b' to 0 or integer
  if (Math.abs(b) < 1e-5) {
    b = 0
  } else {
    const roundB = Math.round(b)
    if (roundB !== 0 && Math.abs(b - roundB) < 0.02) {
      b = roundB
    }
  }

  let termA = ''
  if (Math.abs(absA - 1) < 0.01) {
    termA = a < 0 ? `-${varName}` : varName
  } else if (absA < 1) {
    // For scale < 1 (compress/squeeze), format as division (integer or decimal divisor)
    const invA = 1 / absA
    const roundInvA = Math.round(invA)
    const divisorStr = Math.abs(invA - roundInvA) < 0.02 ? roundInvA.toString() : formatNumber(invA)
    termA = a < 0 ? `-${varName}/${divisorStr}` : `${varName}/${divisorStr}`
  } else {
    // For scale > 1 (stretch/expand), format as multiplication
    const aStr = formatNumber(absA)
    termA = a < 0 ? `-${varName}*${aStr}` : `${varName}*${aStr}`
  }

  if (b === 0) {
    return termA
  }

  const bAbs = Math.abs(b)
  const bStr = formatNumber(bAbs)
  if (b > 0) {
    return `${termA}+${bStr}`
  } else {
    return `${termA}-${bStr}`
  }
}

export function getDatasetRawMinMax(ds: Dataset): {
  rawXMin: number
  rawXMax: number
  rawYMin: number
  rawYMax: number
} {
  const { x, y } = getRawDatasetCoords(ds)
  let rawXMin = Infinity,
    rawXMax = -Infinity
  let rawYMin = Infinity,
    rawYMax = -Infinity

  for (let i = 0; i < x.length; i++) {
    const vx = x[i]
    if (!isNaN(vx)) {
      if (vx < rawXMin) rawXMin = vx
      if (vx > rawXMax) rawXMax = vx
    }
  }
  for (let i = 0; i < y.length; i++) {
    const vy = y[i]
    if (!isNaN(vy)) {
      if (vy < rawYMin) rawYMin = vy
      if (vy > rawYMax) rawYMax = vy
    }
  }
  if (rawXMin === Infinity || rawXMax === -Infinity) {
    rawXMin = 0
    rawXMax = 10
  }
  if (rawYMin === Infinity || rawYMax === -Infinity) {
    rawYMin = 0
    rawYMax = 10
  }
  return { rawXMin, rawXMax, rawYMin, rawYMax }
}

export function getProcessedDataset(ds: Dataset): Dataset {
  const opts = ds.options || {}
  const key = `${opts.xColumn || 1}|${opts.yColumn || 2}|${opts.xTransCheck ? 1 : 0}|${opts.xExpr || ''}|${opts.yTransCheck ? 1 : 0}|${opts.yExpr || ''}`
  const cached = processedCache.get(ds)

  let sourceX: number[]
  let sourceY: number[]
  if (cached && cached.key === key) {
    sourceX = cached.x
    sourceY = cached.y
  } else {
    const rawCoords = getRawDatasetCoords(ds)
    sourceX = rawCoords.x
    sourceY = rawCoords.y

    const newX = opts.xTransCheck && opts.xExpr
      ? sourceX.map((val) => evaluateMathExpr(opts.xExpr!, val, 'x'))
      : sourceX
    const newY = opts.yTransCheck && opts.yExpr
      ? sourceY.map((val) => evaluateMathExpr(opts.yExpr!, val, 'y'))
      : sourceY

    processedCache.set(ds, { key, x: newX, y: newY })
    sourceX = newX
    sourceY = newY
  }

  return { ...ds, x: sourceX, y: sourceY, options: opts }
}

export function datasetIdentifier(ds: Dataset): string {
  return ds.filePath || ds.fileName || `${ds.name}.txt`
}

export function isSeriesLegendText(text: string): boolean {
  return /^%\d+E/.test((text || '').trim())
}