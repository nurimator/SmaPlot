import type { Dataset, SmpMetadata, SmpPlotDoc } from '../../types.ts'

const SVG_NS = 'http://www.w3.org/2000/svg'

export function createSVGElement<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K]
}

export function starPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = []
  for (let k = 0; k < 10; k++) {
    const radius = k % 2 === 0 ? r : r * 0.381966
    const ang = -Math.PI / 2 + (k * Math.PI) / 5
    pts.push(`${(cx + radius * Math.cos(ang)).toFixed(2)},${(cy + radius * Math.sin(ang)).toFixed(2)}`)
  }
  return pts.join(' ')
}

const f2 = (n: number): string => n.toFixed(2)

export function triangleUpPoints(cx: number, cy: number, r: number): string {
  const top = r * 1.24
  const halfBase = r * 1.08
  const baseY = r * 0.62
  return `${f2(cx)},${f2(cy - top)} ${f2(cx + halfBase)},${f2(cy + baseY)} ${f2(cx - halfBase)},${f2(cy + baseY)}`
}

export function triangleDownPoints(cx: number, cy: number, r: number): string {
  const bot = r * 1.24
  const halfBase = r * 1.08
  const baseY = r * 0.62
  return `${f2(cx)},${f2(cy + bot)} ${f2(cx + halfBase)},${f2(cy - baseY)} ${f2(cx - halfBase)},${f2(cy - baseY)}`
}

export function diamondPoints(cx: number, cy: number, r: number, scale = 1.428571): string {
  const d = r * scale
  return `${f2(cx)},${f2(cy - d)} ${f2(cx + d)},${f2(cy)} ${f2(cx)},${f2(cy + d)} ${f2(cx - d)},${f2(cy)}`
}

export function pentagonPoints(cx: number, cy: number, r: number, apexUp: boolean): string {
  const pts: string[] = []
  const start = apexUp ? -Math.PI / 2 : Math.PI / 2
  for (let k = 0; k < 5; k++) {
    const ang = start + (k * 2 * Math.PI) / 5
    pts.push(`${f2(cx + r * Math.cos(ang))},${f2(cy + r * Math.sin(ang))}`)
  }
  return pts.join(' ')
}

export function hexagonPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = []
  for (let k = 0; k < 6; k++) {
    const ang = -Math.PI / 2 + (k * Math.PI) / 3
    pts.push(`${f2(cx + r * Math.cos(ang))},${f2(cy + r * Math.sin(ang))}`)
  }
  return pts.join(' ')
}

export const PLOT_MARGIN = { l: 20, r: 20, t: 20, b: 20 }

export const BORDER_TOL = 2

export function hitsRectBorder(gx: number, gy: number, l: number, t: number, w: number, h: number): boolean {
  const r = l + w
  const b = t + h
  if (gx < l - BORDER_TOL || gx > r + BORDER_TOL || gy < t - BORDER_TOL || gy > b + BORDER_TOL) return false
  if (gx > l + BORDER_TOL && gx < r - BORDER_TOL && gy > t + BORDER_TOL && gy < b - BORDER_TOL) return false
  return true
}

export function distToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(px - x1, py - y1)
  let t = ((px - x1) * dx + (py - y1) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const cx = x1 + t * dx
  const cy = y1 + t * dy
  return Math.hypot(px - cx, py - cy)
}

export function createOverlayEl(className: string): HTMLDivElement {
  const el = document.createElement('div')
  el.className = className
  return el
}

export function snapToGridThreshold(val: number, step: number = 100, threshold: number = 6): number {
  const nearest = Math.round(val / step) * step
  if (Math.abs(val - nearest) <= threshold) {
    return nearest
  }
  return val
}

export interface PlotRenderContext {
  svg: SVGSVGElement
  smpDoc?: SmpPlotDoc
  smpMeta?: SmpMetadata
  margin: { l: number; r: number; t: number; b: number }
  plotW: number
  plotH: number
  scaleX: number
  scaleY: number
  sx: (v: number) => number
  sy: (v: number) => number
  su: (v: number) => number
  sr: (v: number) => number
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  uMin: number
  uMax: number
  rMin: number
  rMax: number
  xStep: number
  yStep: number
  autoSubDivsX: number | null
  autoSubDivsY: number | null
  syncWithU: boolean
  syncWithR: boolean
  datasets: Dataset[]
  processedDatasets: Dataset[]
  seriesGroup: SVGGElement
}