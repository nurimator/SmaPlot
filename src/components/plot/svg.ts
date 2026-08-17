import type { Dataset, SmpMetadata, SmpPlotDoc } from '../../types.ts'

const SVG_NS = 'http://www.w3.org/2000/svg'

export function createSVGElement<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K]
}

// 5-point star polygon centered at (cx,cy), point-up, outer radius r.
export function starPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = []
  for (let k = 0; k < 10; k++) {
    const radius = k % 2 === 0 ? r : r * 0.45
    const ang = -Math.PI / 2 + (k * Math.PI) / 5
    pts.push(`${(cx + radius * Math.cos(ang)).toFixed(2)},${(cy + radius * Math.sin(ang)).toFixed(2)}`)
  }
  return pts.join(' ')
}

export const PLOT_MARGIN = { l: 65, r: 25, t: 25, b: 55 }

export const BORDER_TOL = 2 // px tolerance for clicking on plot frame border lines

// Check if a point is on the border (edges only) of a rectangle, within tolerance.
export function hitsRectBorder(gx: number, gy: number, l: number, t: number, w: number, h: number): boolean {
  const r = l + w
  const b = t + h
  // Must be within the outer padded rect
  if (gx < l - BORDER_TOL || gx > r + BORDER_TOL || gy < t - BORDER_TOL || gy > b + BORDER_TOL) return false
  // Must NOT be fully inside the inner rect (i.e. must be near an edge)
  if (gx > l + BORDER_TOL && gx < r - BORDER_TOL && gy > t + BORDER_TOL && gy < b - BORDER_TOL) return false
  return true
}

// Distance from point (px,py) to segment (x1,y1)-(x2,y2).
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

// Shared render context handed by drawPlot to the axes/series/annotations/legend/
// transform renderers. Su/sr and the U/R limits start as the X/Y defaults and are
// refined by renderAxes when an independent top/right axis exists.
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