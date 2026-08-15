import type { ActiveDrag, Dataset, SmpAxisSpec, SmpMetadata, SmpPlotDoc } from '../types.ts'
import { evaluateMathExpr, parseDatasetContent } from '../utils/dataset.ts'
import { parseSmpContent } from '../utils/smpParser.ts'
import { computeAutoStep, formatTick } from '../utils/scale.ts'
import { globalDataManager } from './DataManager.ts'
import { getCanvasZoom } from '../utils/canvasZoom.ts'
import { showTitleDialog } from './TitleDialog.ts'
import { showArrowDialog } from './ArrowDialog.ts'
import { showRectangleDialog } from './RectangleDialog.ts'
import { renderSmpTextToHtml } from '../utils/smpSymbolMapper.ts'
import { addRecentFile } from '../utils/recentFiles.ts'

const SVG_NS = 'http://www.w3.org/2000/svg'

function createSVGElement<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K]
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
function distToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
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

// Geometric hit-test: is the (client) point on the graph — i.e. near a data point
// or the connecting line of any visible series? Used to distinguish "grafik" (open
// Property) from empty area inside the box plot (open Data Manager). Independent of
// which DOM element is the event target, since the SVG re-renders on selection.
export function hitTestGraph(svg: SVGSVGElement, clientX: number, clientY: number): Dataset | null {
  const rawDatasets = svgDataMap.get(svg) || []
  if (rawDatasets.length === 0) return null
  const datasets = rawDatasets.map(ds => getProcessedDataset(ds))
  const w = svg.clientWidth || parseFloat(svg.style.width) || svg.getBoundingClientRect().width || 400
  const h = svg.clientHeight || parseFloat(svg.style.height) || svg.getBoundingClientRect().height || 300
  const margin = PLOT_MARGIN
  const plotW = Math.max(10, w - margin.l - margin.r)
  const plotH = Math.max(10, h - margin.t - margin.b)
  const smpDoc = svgSmpDocMap.get(svg)
  const smpMeta = svgSmpMetaMap.get(svg)
  const baseScale = svgBaseScaleMap.get(svg)
  
  let xMin = smpDoc?.axisX.min ?? smpMeta?.xMin ?? (baseScale ? baseScale.xMin : 0)
  let xMax = smpDoc?.axisX.max ?? smpMeta?.xMax ?? (baseScale ? baseScale.xMax : 10)
  let yMin = smpDoc?.axisY.min ?? smpMeta?.yMin ?? (baseScale ? baseScale.yMin : 0)
  let yMax = smpDoc?.axisY.max ?? smpMeta?.yMax ?? (baseScale ? baseScale.yMax : 10)
  
  if (!smpDoc && !smpMeta && !baseScale && datasets.length > 0) {
    xMin = Infinity
    xMax = -Infinity
    yMin = Infinity
    yMax = -Infinity
    for (const ds of datasets) {
      for (let i = 0; i < ds.x.length; i++) {
        if (ds.x[i] < xMin) xMin = ds.x[i]
        if (ds.x[i] > xMax) xMax = ds.x[i]
        if (ds.y[i] < yMin) yMin = ds.y[i]
        if (ds.y[i] > yMax) yMax = ds.y[i]
      }
    }
    if (xMin === Infinity) xMin = 0
    if (xMax === -Infinity) xMax = 10
    if (yMin === Infinity) yMin = 0
    if (yMax === -Infinity) yMax = 10
    if (yMin > 0) yMin = 0
  }
  
  const sx = (v: number) => margin.l + ((v - xMin) / (xMax - xMin || 1)) * plotW
  const sy = (v: number) => margin.t + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH
  const uMin = smpDoc?.axisTop?.min ?? xMin
  const uMax = smpDoc?.axisTop?.max ?? xMax
  const rMin = smpDoc?.axisRight?.min ?? yMin
  const rMax = smpDoc?.axisRight?.max ?? yMax
  const su = (v: number) => margin.l + ((v - uMin) / (uMax - uMin || 1)) * plotW
  const sr = (v: number) => margin.t + plotH - ((v - rMin) / (rMax - rMin || 1)) * plotH

  const rect = svg.getBoundingClientRect()
  const zoom = getCanvasZoom()
  const gx = (clientX - rect.left) / zoom
  const gy = (clientY - rect.top) / zoom
  const threshold = 6 / zoom

  for (let idx = 0; idx < datasets.length; idx++) {
    const ds = datasets[idx]
    const opts = ds.options || {}
    if (opts.show === false) continue
    const dsSx = opts.axisX === 'u' ? su : sx
    const dsSy = opts.axisY === 'r' ? sr : sy
    const px = ds.x
    const py = ds.y
    for (let i = 1; i < px.length; i++) {
      if (distToSeg(gx, gy, dsSx(px[i - 1]), dsSy(py[i - 1]), dsSx(px[i]), dsSy(py[i])) <= threshold) return rawDatasets[idx]
    }
    const ptR = (opts.size || 3) / zoom + threshold
    for (let i = 0; i < px.length; i++) {
      if (Math.hypot(gx - dsSx(px[i]), gy - dsSy(py[i])) <= ptR) return rawDatasets[idx]
    }
  }
  return null
}

export function isInsidePlotArea(svg: SVGSVGElement, clientX: number, clientY: number): boolean {
  const w = svg.clientWidth || parseFloat(svg.style.width) || svg.getBoundingClientRect().width || 400
  const h = svg.clientHeight || parseFloat(svg.style.height) || svg.getBoundingClientRect().height || 300
  const margin = PLOT_MARGIN
  const plotW = Math.max(10, w - margin.l - margin.r)
  const plotH = Math.max(10, h - margin.t - margin.b)

  const rect = svg.getBoundingClientRect()
  const zoom = getCanvasZoom()
  const gx = (clientX - rect.left) / zoom
  const gy = (clientY - rect.top) / zoom

  return gx >= margin.l && gx <= margin.l + plotW && gy >= margin.t && gy <= margin.t + plotH
}

// Detect whether a click is in an axis zone:
//  - bottom edge / margin -> 'x'
//  - top edge / margin -> 'u'
//  - left edge / margin -> 'y'
//  - right edge / margin -> 'r'
// Returns 'x', 'y', 'u', 'r', or null.
export function hitTestAxisArea(svg: SVGSVGElement, clientX: number, clientY: number): 'x' | 'y' | 'u' | 'r' | null {
  const w = svg.clientWidth || parseFloat(svg.style.width) || svg.getBoundingClientRect().width || 400
  const h = svg.clientHeight || parseFloat(svg.style.height) || svg.getBoundingClientRect().height || 300
  const margin = PLOT_MARGIN
  const plotW = Math.max(10, w - margin.l - margin.r)
  const plotH = Math.max(10, h - margin.t - margin.b)

  const rect = svg.getBoundingClientRect()
  const zoom = getCanvasZoom()
  const gx = (clientX - rect.left) / zoom
  const gy = (clientY - rect.top) / zoom

  const frameL = margin.l
  const frameR = margin.l + plotW
  const frameT = margin.t
  const frameB = margin.t + plotH
  const tol = 6 // px tolerance around border edges

  // Margin zones first:
  if (gy > frameB + tol && gy <= h && gx >= 0 && gx <= w) return 'x'
  if (gy < frameT - tol && gy >= 0 && gx >= 0 && gx <= w) return 'u'
  if (gx < frameL - tol && gx >= 0 && gy >= 0 && gy <= h) return 'y'
  if (gx > frameR + tol && gx <= w && gy >= 0 && gy <= h) return 'r'

  // Near frame border strokes:
  const nearBottom = Math.abs(gy - frameB) <= tol && gx >= frameL - tol && gx <= frameR + tol
  const nearTop = Math.abs(gy - frameT) <= tol && gx >= frameL - tol && gx <= frameR + tol
  const nearLeft = Math.abs(gx - frameL) <= tol && gy >= frameT - tol && gy <= frameB + tol
  const nearRight = Math.abs(gx - frameR) <= tol && gy >= frameT - tol && gy <= frameB + tol

  if (nearBottom) return 'x'
  if (nearTop) return 'u'
  if (nearLeft) return 'y'
  if (nearRight) return 'r'

  return null
}

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

export const svgDataMap = new WeakMap<SVGSVGElement, Dataset[]>()
export const svgSmpMetaMap = new WeakMap<SVGSVGElement, SmpMetadata>()
export const svgSmpDocMap = new WeakMap<SVGSVGElement, SmpPlotDoc>()
const svgBaseScaleMap = new WeakMap<
  SVGSVGElement,
  { xMin: number; xMax: number; yMin: number; yMax: number }
>()

// Plots whose axis scale should auto-fit to the first dataset loaded (fresh
// "New" plots). Cleared as soon as a real SmpPlotDoc replaces the default one
// (e.g. when an .SMP project is loaded) so loaded scales are never overwritten.
const autoScaleSvgs = new WeakSet<SVGSVGElement>()
const svgOverlayMap = new WeakMap<SVGSVGElement, HTMLDivElement>()
const svgCrossbarMap = new WeakMap<SVGSVGElement, { xVal: number; yVal: number }>()

export function getPlotLimits(svg: SVGSVGElement): { xMin: number; xMax: number; yMin: number; yMax: number } {
  const smpDoc = svgSmpDocMap.get(svg)
  const smpMeta = svgSmpMetaMap.get(svg)
  const baseScale = svgBaseScaleMap.get(svg)
  const rawDatasets = svgDataMap.get(svg) || []
  const datasets = rawDatasets.map((ds) => getProcessedDataset(ds))

  let xMin = smpDoc?.axisX.min ?? smpMeta?.xMin ?? (baseScale ? baseScale.xMin : 0)
  let xMax = smpDoc?.axisX.max ?? smpMeta?.xMax ?? (baseScale ? baseScale.xMax : 10)
  let yMin = smpDoc?.axisY.min ?? smpMeta?.yMin ?? (baseScale ? baseScale.yMin : 0)
  let yMax = smpDoc?.axisY.max ?? smpMeta?.yMax ?? (baseScale ? baseScale.yMax : 10)

  if (!smpDoc && !smpMeta && !baseScale && datasets.length > 0) {
    xMin = Infinity
    xMax = -Infinity
    yMin = Infinity
    yMax = -Infinity
    for (const ds of datasets) {
      for (let i = 0; i < ds.x.length; i++) {
        if (ds.x[i] < xMin) xMin = ds.x[i]
        if (ds.x[i] > xMax) xMax = ds.x[i]
        if (ds.y[i] < yMin) yMin = ds.y[i]
        if (ds.y[i] > yMax) yMax = ds.y[i]
      }
    }
    if (xMin === Infinity) xMin = 0
    if (xMax === -Infinity) xMax = 10
    if (yMin === Infinity) yMin = 0
    if (yMax === -Infinity) yMax = 10
  }
  return { xMin, xMax, yMin, yMax }
}

export function setPlotCrossbar(svg: SVGSVGElement, xVal: number | null, yVal: number | null): void {
  if (xVal === null || yVal === null || isNaN(xVal) || isNaN(yVal)) {
    svgCrossbarMap.delete(svg)
    const existing = svg.querySelector('.plot-crossbar')
    if (existing) existing.remove()
    return
  }

  svgCrossbarMap.set(svg, { xVal, yVal })
  renderPlotCrossbar(svg, xVal, yVal)
}

export function removePlotCrossbar(svg: SVGSVGElement): void {
  svgCrossbarMap.delete(svg)
  const existing = svg.querySelector('.plot-crossbar')
  if (existing) existing.remove()
}

function renderPlotCrossbar(svg: SVGSVGElement, xVal: number, yVal: number): void {
  let w = 400
  let h = 300
  const vb = svg.getAttribute('viewBox')
  if (vb) {
    const parts = vb.split(/\s+/).map(Number)
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      w = parts[2]
      h = parts[3]
    }
  } else {
    w = svg.clientWidth || parseFloat(svg.style.width) || svg.getBoundingClientRect().width || 400
    h = svg.clientHeight || parseFloat(svg.style.height) || svg.getBoundingClientRect().height || 300
  }
  const margin = PLOT_MARGIN
  const plotW = Math.max(10, w - margin.l - margin.r)
  const plotH = Math.max(10, h - margin.t - margin.b)

  const limits = getPlotLimits(svg)
  const xMin = limits.xMin
  const xMax = limits.xMax
  const yMin = limits.yMin
  const yMax = limits.yMax

  const px = margin.l + ((xVal - xMin) / (xMax - xMin || 1)) * plotW
  const py = margin.t + plotH - ((yVal - yMin) / (yMax - yMin || 1)) * plotH

  let group = svg.querySelector<SVGGElement>('.plot-crossbar')
  if (!group) {
    group = createSVGElement('g')
    group.setAttribute('class', 'plot-crossbar')
    group.setAttribute('pointer-events', 'none')
    svg.appendChild(group)
  }
  group.replaceChildren()

  // Vertical red crossbar line (thin 0.5)
  const vLine = createSVGElement('line')
  vLine.setAttribute('x1', String(px))
  vLine.setAttribute('y1', String(margin.t))
  vLine.setAttribute('x2', String(px))
  vLine.setAttribute('y2', String(margin.t + plotH))
  vLine.setAttribute('stroke', '#ff0000')
  vLine.setAttribute('stroke-width', '0.5')
  group.appendChild(vLine)

  // Horizontal red crossbar line (thin 0.5)
  const hLine = createSVGElement('line')
  hLine.setAttribute('x1', String(margin.l))
  hLine.setAttribute('y1', String(py))
  hLine.setAttribute('x2', String(margin.l + plotW))
  hLine.setAttribute('y2', String(py))
  hLine.setAttribute('stroke', '#ff0000')
  hLine.setAttribute('stroke-width', '0.5')
  group.appendChild(hLine)
}

let activeDrag: ActiveDrag | null = null
let selectedPlotSvg: SVGSVGElement | null = null
let lastSelectedPlotSvg: SVGSVGElement | null = null
let rafId: number | null = null
let boxCount = 0

export interface SelectableObject {
  kind: 'plot' | 'legend' | 'annotation'
  svg: SVGSVGElement
  itemIdx?: number
  annotationIdx?: number
}

const selectedObjects: SelectableObject[] = []

interface GroupDragItem {
  kind: 'plot' | 'legend' | 'annotation'
  svg: SVGSVGElement
  startLeft?: number
  startTop?: number
  itemIdx?: number
  startXNorm?: number
  startYNorm?: number
  annotationIdx?: number
  startX1Norm?: number
  startY1Norm?: number
  startX2Norm?: number
  startY2Norm?: number
  targetType?: 'start' | 'end' | 'line'
}

let activeGroupDrag: { items: GroupDragItem[]; startX: number; startY: number } | null = null

// Cached overlay elements (populated lazily)
let _cachedTitleOverlay: HTMLElement | null = null
let _cachedArrowOverlay: HTMLElement | null = null
function getCachedTitleOverlay(): HTMLElement | null {
  if (!_cachedTitleOverlay) _cachedTitleOverlay = document.querySelector<HTMLElement>('#titleOverlay')
  return _cachedTitleOverlay
}
function getCachedArrowOverlay(): HTMLElement | null {
  if (!_cachedArrowOverlay) _cachedArrowOverlay = document.querySelector<HTMLElement>('#arrowOverlay')
  return _cachedArrowOverlay
}



function getPlotOverlay(svg: SVGSVGElement): HTMLDivElement {
  let overlay = svgOverlayMap.get(svg)
  // Re-create if the cached overlay is no longer connected (e.g. removed from the
  // DOM by an undo/redo restore) so overlay visuals keep rendering.
  if (!overlay || !overlay.isConnected) {
    overlay = document.createElement('div')
    overlay.className = 'plot-overlay'
    overlay.style.left = parseFloat(svg.style.left) ? `${parseFloat(svg.style.left)}px` : '0px'
    overlay.style.top = parseFloat(svg.style.top) ? `${parseFloat(svg.style.top)}px` : '0px'
    overlay.style.width = parseFloat(svg.style.width) ? `${parseFloat(svg.style.width)}px` : '400px'
    overlay.style.height = parseFloat(svg.style.height) ? `${parseFloat(svg.style.height)}px` : '300px'
    svg.parentElement?.insertBefore(overlay, svg.nextSibling)
    svgOverlayMap.set(svg, overlay)
  }
  return overlay
}

function syncPlotOverlay(svg: SVGSVGElement): void {
  const overlay = svgOverlayMap.get(svg)
  if (!overlay) return
  overlay.style.left = parseFloat(svg.style.left) ? `${parseFloat(svg.style.left)}px` : '0px'
  overlay.style.top = parseFloat(svg.style.top) ? `${parseFloat(svg.style.top)}px` : '0px'
  overlay.style.width = parseFloat(svg.style.width) ? `${parseFloat(svg.style.width)}px` : '400px'
  overlay.style.height = parseFloat(svg.style.height) ? `${parseFloat(svg.style.height)}px` : '300px'
}

function createOverlayEl(className: string): HTMLDivElement {
  const el = document.createElement('div')
  el.className = className
  return el
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

let selectedLegendIndex: number = -1
let selectedAnnotationIndex: number = -1
let lastAnnotationClickTime = 0
let lastAnnotationClickKey = ''

export const allDatasets: Dataset[] = []
export const activeSvgs: SVGSVGElement[] = []

export const SMP_SCALE = 0.02

export function getSvgRectForSmpDoc(doc: SmpPlotDoc): {
  svgLeft: number
  svgTop: number
  svgWidth: number
  svgHeight: number
} {
  const frameLeft = doc.left * SMP_SCALE
  const frameTop = doc.top * SMP_SCALE
  const frameWidth = doc.width * SMP_SCALE
  const frameHeight = doc.height * SMP_SCALE

  const svgLeft = frameLeft - PLOT_MARGIN.l
  const svgTop = frameTop - PLOT_MARGIN.t
  const svgWidth = frameWidth + PLOT_MARGIN.l + PLOT_MARGIN.r
  const svgHeight = frameHeight + PLOT_MARGIN.t + PLOT_MARGIN.b

  return { svgLeft, svgTop, svgWidth, svgHeight }
}

export function setPlotSmpMeta(svg: SVGSVGElement, meta: SmpMetadata): void {
  svgSmpMetaMap.set(svg, meta)
}

export function setPlotSmpDoc(svg: SVGSVGElement, doc: SmpPlotDoc): void {
  svgSmpDocMap.set(svg, doc)
  autoScaleSvgs.delete(svg)
}

export function getPlotSmpDoc(svg: SVGSVGElement): SmpPlotDoc | undefined {
  return svgSmpDocMap.get(svg)
}

export function getPlotDatasets(svg: SVGSVGElement): Dataset[] {
  return svgDataMap.get(svg) || []
}

// Lightweight digest of live workspace state used to skip no-op undo pushes.
// Must cover every mutating source: drag→geometry, delete→counts,
// create/load→counts+geometry, axis/title/arrow dialogs→legend/annotation/axis
// fields, addDataset→dataset count, clearPlotScale→baseScale. Data arrays are
// immutable after load, and selection never triggers a push, so both are excluded.
// Doc fields are projected through exportPlotToSmpDoc() — the exact projection
// captureWorkspaceSnapshot() stores — so the digest always matches what undo/redo
// restores (a plot without a live doc still gets a synthesized one in both).
export function captureWorkspaceDigest(): string {
  return JSON.stringify(
    activeSvgs.map((svg) => {
      const smpMeta = svgSmpMetaMap.get(svg)
      const baseScale = svgBaseScaleMap.get(svg)
      const doc = exportPlotToSmpDoc(svg, svgSmpDocMap.get(svg)?.name || 'PLOT.SMP')
      const datasets = svgDataMap.get(svg) || []

      return {
        left: parseFloat(svg.style.left) || 0,
        top: parseFloat(svg.style.top) || 0,
        width: parseFloat(svg.style.width) || 400,
        height: parseFloat(svg.style.height) || 300,
        baseScale: baseScale
          ? { xMin: baseScale.xMin, xMax: baseScale.xMax, yMin: baseScale.yMin, yMax: baseScale.yMax }
          : null,
        doc: {
          name: doc.name,
          left: doc.left,
          top: doc.top,
          width: doc.width,
          height: doc.height,
          axisX: doc.axisX,
          axisY: doc.axisY,
          axisTop: doc.axisTop || null,
          axisRight: doc.axisRight || null,
          commonWithU: doc.commonWithU ?? true,
          commonWithR: doc.commonWithR ?? true,
          legendItems: doc.legendItems.map((item) => ({
            type: item.type || null,
            text: item.text,
            rawText: item.rawText || null,
            xNorm: item.xNorm,
            yNorm: item.yNorm,
            rotation: item.rotation,
            fontFamily: item.fontFamily,
            fontSize: item.fontSize,
            fontWeight: item.fontWeight,
            align: item.align || null,
            x2Norm: item.x2Norm ?? null,
            y2Norm: item.y2Norm ?? null,
            rawLine: item.rawLine || null,
          })),
          annotationLines: (doc.annotationLines || []).map((aLine) => ({ ...aLine })),
          xLabel: doc.xLabel || null,
          yLabel: doc.yLabel || null,
          datasets: datasets.map((ds) => ({
            name: ds.name,
            color: ds.color,
            xLen: ds.x.length,
            yLen: ds.y.length,
            options: ds.options || null,
          })),
        },
        meta: smpMeta
          ? {
              xMin: smpMeta.xMin ?? null,
              xMax: smpMeta.xMax ?? null,
              xStep: smpMeta.xStep ?? null,
              yMin: smpMeta.yMin ?? null,
              yMax: smpMeta.yMax ?? null,
              yStep: smpMeta.yStep ?? null,
              xLabel: smpMeta.xLabel ?? null,
              yLabel: smpMeta.yLabel ?? null,
              docsLen: smpMeta.docs?.length ?? 0,
            }
          : null,
      }
    })
  )
}

export function getAllPlotSvgs(graphArea: HTMLElement): SVGSVGElement[] {
  return Array.from(graphArea.querySelectorAll<SVGSVGElement>('.plot-svg'))
}

export function exportPlotToSmpDoc(svg: SVGSVGElement, defaultName = 'FTIR.SMP'): SmpPlotDoc {
  const existingDoc = svgSmpDocMap.get(svg)
  const datasets = svgDataMap.get(svg) || []
  const baseScale = svgBaseScaleMap.get(svg)

  const leftPx = parseFloat(svg.style.left) || 40
  const topPx = parseFloat(svg.style.top) || 40
  const widthPx = parseFloat(svg.style.width) || 500
  const heightPx = parseFloat(svg.style.height) || 350

  const frameLeft = leftPx + PLOT_MARGIN.l
  const frameTop = topPx + PLOT_MARGIN.t
  const frameWidth = Math.max(50, widthPx - PLOT_MARGIN.l - PLOT_MARGIN.r)
  const frameHeight = Math.max(50, heightPx - PLOT_MARGIN.t - PLOT_MARGIN.b)

  const left = Math.round(frameLeft / SMP_SCALE)
  const top = Math.round(frameTop / SMP_SCALE)
  const width = Math.round(frameWidth / SMP_SCALE)
  const height = Math.round(frameHeight / SMP_SCALE)

  const axisX: SmpAxisSpec = existingDoc?.axisX || {
    min: baseScale?.xMin ?? 0,
    max: baseScale?.xMax ?? 10,
    step: baseScale ? Math.round((baseScale.xMax - baseScale.xMin) / 5) || 2 : 2,
    subDivs: 5,
    showTicks: true,
    showSubTicks: true,
    showLabels: true,
    insideTicks: true,
    fontFamily: 'Inter, sans-serif',
    fontWeight: 400,
  }

  const axisY: SmpAxisSpec = existingDoc?.axisY || {
    min: baseScale?.yMin ?? 0,
    max: baseScale?.yMax ?? 10,
    step: baseScale ? Math.round((baseScale.yMax - baseScale.yMin) / 5) || 2 : 2,
    subDivs: 5,
    showTicks: true,
    showSubTicks: true,
    showLabels: true,
    insideTicks: true,
    fontFamily: 'Inter, sans-serif',
    fontWeight: 400,
  }

  const commonWithU = existingDoc?.commonWithU ?? (existingDoc?.axisTop ? existingDoc.axisTop.isCommon !== false : true)
  const commonWithR = existingDoc?.commonWithR ?? (existingDoc?.axisRight ? existingDoc.axisRight.isCommon !== false : true)

  const axisTop: SmpAxisSpec = existingDoc?.axisTop || {
    ...axisX,
    showLabels: !commonWithU,
    isCommon: commonWithU,
  }

  const axisRight: SmpAxisSpec = existingDoc?.axisRight || {
    ...axisY,
    showLabels: !commonWithR,
    isCommon: commonWithR,
  }

  return {
    name: existingDoc?.name || defaultName,
    left,
    top,
    width,
    height,
    datasets,
    axisX,
    axisY,
    axisTop,
    axisRight,
    commonWithU,
    commonWithR,
    legendItems: existingDoc?.legendItems || [],
    annotationLines: existingDoc?.annotationLines || [],
    xLabel: existingDoc?.xLabel,
    yLabel: existingDoc?.yLabel,
  }
}

export function getActiveDrag(): ActiveDrag | null {
  return activeDrag
}

export function setSelectedPlotSvg(svg: SVGSVGElement | null): void {
  if (svg) {
    lastSelectedPlotSvg = svg
  }
  if (svg === selectedPlotSvg) return
  const prev = selectedPlotSvg
  selectedPlotSvg = svg
  if (prev) {
    updatePlotVisual(prev)
    updateSelectionBorder(prev)
  }
  if (svg) {
    updatePlotVisual(svg)
    updateSelectionBorder(svg)
  }
}

export function getLastSelectedPlotSvg(): SVGSVGElement | null {
  if (lastSelectedPlotSvg && document.body.contains(lastSelectedPlotSvg)) {
    return lastSelectedPlotSvg
  }
  return null
}

export function getSelectedPlotSvg(): SVGSVGElement | null {
  if (selectedPlotSvg && document.body.contains(selectedPlotSvg)) {
    return selectedPlotSvg
  }
  if (lastSelectedPlotSvg && document.body.contains(lastSelectedPlotSvg)) {
    return lastSelectedPlotSvg
  }
  return activeSvgs[activeSvgs.length - 1] || activeSvgs[0] || null
}

export function getPlotSvgFromElement(el: Element | null): SVGSVGElement | null {
  if (!el) return null
  const plotSvg = el.closest('.plot-svg') as SVGSVGElement | null
  if (plotSvg) return plotSvg
  const overlay = el.closest('.plot-overlay') as HTMLDivElement | null
  if (overlay) {
    for (const svg of activeSvgs) {
      if (svgOverlayMap.get(svg) === overlay) return svg
    }
    if (overlay.previousElementSibling?.classList.contains('plot-svg')) {
      return overlay.previousElementSibling as SVGSVGElement
    }
  }
  return null
}

export function getMultiSelectedSvgs(): SVGSVGElement[] {
  const seen = new Set<SVGSVGElement>()
  selectedObjects.forEach((o) => {
    if (o.kind === 'plot') seen.add(o.svg)
  })
  return [...seen]
}

export function isMultiSelected(svg: SVGSVGElement): boolean {
  return selectedObjects.some((o) => o.kind === 'plot' && o.svg === svg)
}

export function getSelectedObjects(): SelectableObject[] {
  return [...selectedObjects]
}

function updateSelectionBorder(svg: SVGSVGElement): void {
  const ov = svgOverlayMap.get(svg)
  if (!ov) return
  const isSel = isMultiSelected(svg)

  // Remove existing frame border element
  const existing = ov.querySelector('.ov-frame-border')
  if (existing) existing.remove()

  if (isSel) {
    // Add a border element positioned exactly on the inner plot frame
    const border = document.createElement('div')
    border.className = 'ov-frame-border'
    border.style.position = 'absolute'
    border.style.left = `${PLOT_MARGIN.l}px`
    border.style.top = `${PLOT_MARGIN.t}px`
    const w = parseFloat(svg.style.width) || 400
    const h = parseFloat(svg.style.height) || 300
    border.style.width = `${Math.max(10, w - PLOT_MARGIN.l - PLOT_MARGIN.r)}px`
    border.style.height = `${Math.max(10, h - PLOT_MARGIN.t - PLOT_MARGIN.b)}px`
    border.style.border = '1px solid #00ffff'
    border.style.boxSizing = 'border-box'
    border.style.pointerEvents = 'none'
    ov.appendChild(border)
  }
}

export function setObjectSelection(objs: SelectableObject[]): void {
  const objKey = (o: SelectableObject): string =>
    o.kind === 'plot' ? '' : `${o.kind}:${o.itemIdx ?? ''}:${o.annotationIdx ?? ''}`
  const collectInner = (map: Map<SVGSVGElement, Set<string>>, o: SelectableObject): void => {
    if (o.kind === 'plot') return
    if (!map.has(o.svg)) map.set(o.svg, new Set())
    map.get(o.svg)!.add(objKey(o))
  }
  const prevInner = new Map<SVGSVGElement, Set<string>>()
  selectedObjects.forEach((o) => collectInner(prevInner, o))
  const nextInner = new Map<SVGSVGElement, Set<string>>()
  objs.forEach((o) => collectInner(nextInner, o))

  const changed = new Set<SVGSVGElement>()
  new Set([...prevInner.keys(), ...nextInner.keys()]).forEach((s) => {
    const a = prevInner.get(s) ?? new Set<string>()
    const b = nextInner.get(s) ?? new Set<string>()
    if (a.size !== b.size || [...a].some((k) => !b.has(k))) changed.add(s)
  })

  const affectedBorderSvgs = new Set<SVGSVGElement>()
  selectedObjects.forEach((o) => affectedBorderSvgs.add(o.svg))

  selectedObjects.length = 0
  objs.forEach((o) => {
    selectedObjects.push(o)
    affectedBorderSvgs.add(o.svg)
  })

  const last = objs[objs.length - 1]
  if (last) {
    setSelectedPlotSvg(last.svg)
  } else {
    setSelectedPlotSvg(null)
  }

  affectedBorderSvgs.forEach((svg) => updateSelectionBorder(svg))
  changed.forEach((s) => updatePlotVisual(s))
}

export function clearObjectSelection(): void {
  setObjectSelection([])
}

export function deleteSelectedObjects(): boolean {
  const selected = getSelectedObjects()
  let deletedAny = false

  if (selected.length > 0) {
    const plotSvgsToDelete = new Set<SVGSVGElement>()
    const legendDeletions = new Map<SVGSVGElement, number[]>()
    const annotationDeletions = new Map<SVGSVGElement, number[]>()

    selected.forEach((o) => {
      if (o.kind === 'plot') {
        plotSvgsToDelete.add(o.svg)
      } else if (o.kind === 'legend' && o.itemIdx !== undefined) {
        if (!legendDeletions.has(o.svg)) legendDeletions.set(o.svg, [])
        legendDeletions.get(o.svg)!.push(o.itemIdx)
      } else if (o.kind === 'annotation' && o.annotationIdx !== undefined) {
        if (!annotationDeletions.has(o.svg)) annotationDeletions.set(o.svg, [])
        annotationDeletions.get(o.svg)!.push(o.annotationIdx)
      }
    })

    plotSvgsToDelete.forEach((svg) => {
      const idx = activeSvgs.indexOf(svg)
      if (idx !== -1) {
        activeSvgs.splice(idx, 1)
        svg.remove()
        const ov = svgOverlayMap.get(svg)
        if (ov) ov.remove()
        svgSmpDocMap.delete(svg)
        svgSmpMetaMap.delete(svg)
        svgDataMap.delete(svg)
        deletedAny = true
      }
    })

    legendDeletions.forEach((indices, svg) => {
      const smpDoc = svgSmpDocMap.get(svg)
      if (smpDoc && smpDoc.legendItems) {
        indices.sort((a, b) => b - a).forEach((i) => {
          if (i >= 0 && i < smpDoc.legendItems.length) {
            smpDoc.legendItems.splice(i, 1)
            deletedAny = true
          }
        })
        updatePlotVisual(svg)
      }
    })

    annotationDeletions.forEach((indices, svg) => {
      const smpDoc = svgSmpDocMap.get(svg)
      if (smpDoc && smpDoc.annotationLines) {
        const lines = smpDoc.annotationLines
        indices.sort((a, b) => b - a).forEach((i) => {
          if (i >= 0 && i < lines.length) {
            lines.splice(i, 1)
            deletedAny = true
          }
        })
        updatePlotVisual(svg)
      }
    })

    clearObjectSelection()
  } else {
    const selPlot = getSelectedPlotSvg()
    if (selPlot) {
      const idx = activeSvgs.indexOf(selPlot)
      if (idx !== -1) {
        activeSvgs.splice(idx, 1)
        selPlot.remove()
        const ov = svgOverlayMap.get(selPlot)
        if (ov) ov.remove()
        svgSmpDocMap.delete(selPlot)
        svgSmpMetaMap.delete(selPlot)
        svgDataMap.delete(selPlot)
        setSelectedPlotSvg(null)
        clearObjectSelection()
        deletedAny = true
      }
    }
  }

  if (lastSelectedPlotSvg && !document.body.contains(lastSelectedPlotSvg)) {
    lastSelectedPlotSvg = activeSvgs[activeSvgs.length - 1] || null
  }

  return deletedAny
}

export function setMarqueeSelection(svgs: SVGSVGElement[]): void {
  setObjectSelection(svgs.map((svg) => ({ kind: 'plot' as const, svg })))
}

export function clearMarqueeSelection(): void {
  setObjectSelection([])
}

export function isObjectSelected(obj: SelectableObject): boolean {
  return selectedObjects.some(
    (o) => o.kind === obj.kind && o.svg === obj.svg && o.itemIdx === obj.itemIdx && o.annotationIdx === obj.annotationIdx
  )
}

// Trimming mode (toolbar "Trimming" toggle). While active, the left-drag marquee
// selection is suspended and left-drag on a plot's graph area instead defines a
// trim rectangle that re-scopes the plot's X/Y axis start & end (zooming data in).
let trimmingMode = false

export function isTrimmingMode(): boolean {
  return trimmingMode
}

export function setTrimmingMode(on: boolean): void {
  trimmingMode = on
}

let readValueMode = false

export function isReadValueMode(): boolean {
  return readValueMode
}

export function setReadValueMode(on: boolean): void {
  readValueMode = on
}

export function isPropertyTabMode(): boolean {
  return activePropertyTarget !== null
}

// Return the live SmpPlotDoc for a plot, synthesizing & caching one (from the
// base data scale) if it does not yet exist, so axis min/max edits persist.
export function ensureSmpDoc(svg: SVGSVGElement): SmpPlotDoc {
  let doc = svgSmpDocMap.get(svg)
  if (!doc) {
    doc = exportPlotToSmpDoc(svg, svgSmpDocMap.get(svg)?.name || 'PLOT.SMP')
    svgSmpDocMap.set(svg, doc)
  }
  const base = svgBaseScaleMap.get(svg)
  const makeAxis = (min: number, max: number): SmpAxisSpec => ({
    min,
    max,
    step: Math.abs(max - min) / 5 || 2,
    subDivs: 5,
    showTicks: true,
    showSubTicks: true,
    showLabels: true,
    insideTicks: true,
    fontFamily: 'Inter, sans-serif',
    fontWeight: 400,
  })
  if (!doc.axisX) {
    doc.axisX = makeAxis(base?.xMin ?? 0, base?.xMax ?? 10)
  }
  if (!doc.axisY) {
    doc.axisY = makeAxis(base?.yMin ?? 0, base?.yMax ?? 10)
  }
  if (doc.commonWithU === undefined) {
    doc.commonWithU = doc.axisTop ? doc.axisTop.isCommon !== false : true
  }
  if (doc.commonWithR === undefined) {
    doc.commonWithR = doc.axisRight ? doc.axisRight.isCommon !== false : true
  }
  if (!doc.axisTop) {
    doc.axisTop = { ...doc.axisX, showLabels: !doc.commonWithU, isCommon: doc.commonWithU }
  }
  if (!doc.axisRight) {
    doc.axisRight = { ...doc.axisY, showLabels: !doc.commonWithR, isCommon: doc.commonWithR }
  }
  return doc
}

// Every movable object (plot box, legend item, annotation line) with its on-canvas
// bounding box in graph-area local coordinates, for marquee hit-testing.
export function getSelectableObjects(): { obj: SelectableObject; l: number; t: number; w: number; h: number }[] {
  const result: { obj: SelectableObject; l: number; t: number; w: number; h: number }[] = []
  for (const svg of activeSvgs) {
    const left = parseFloat(svg.style.left) || 0
    const top = parseFloat(svg.style.top) || 0
    const width = parseFloat(svg.style.width) || 400
    const height = parseFloat(svg.style.height) || 300
    result.push({
      obj: { kind: 'plot', svg },
      l: left + PLOT_MARGIN.l,
      t: top + PLOT_MARGIN.t,
      w: Math.max(10, width - PLOT_MARGIN.l - PLOT_MARGIN.r),
      h: Math.max(10, height - PLOT_MARGIN.t - PLOT_MARGIN.b),
    })

    const smpDoc = svgSmpDocMap.get(svg)
    if (!smpDoc) continue
    const plotW = Math.max(10, width - PLOT_MARGIN.l - PLOT_MARGIN.r)
    const plotH = Math.max(10, height - PLOT_MARGIN.t - PLOT_MARGIN.b)

    smpDoc.legendItems.forEach((item, itemIdx) => {
      const px = left + PLOT_MARGIN.l + (item.xNorm / 10000) * plotW
      const py = top + PLOT_MARGIN.t + (item.yNorm / 10000) * plotH
      let objW: number
      let objH: number
      if (isSeriesLegendText(item.text)) {
        const lines = item.text.split('\n').length
        objW = 90
        objH = lines * 11 + 6
        result.push({ obj: { kind: 'legend', svg, itemIdx }, l: px - 4, t: py - objH / 2, w: objW + 8, h: objH + 4 })
      } else {
        const isRot = item.rotation !== 0
        const textLines = (item.rawText || item.text).split(/\r?\n|\\n/)
        const maxLineLen = Math.max(...textLines.map((l: string) => l.length))
        const renderFontSz = Math.max(6, Math.round((item.fontSize || 12) * 0.72))
        const textLen = Math.max(40, maxLineLen * (renderFontSz * 0.5) + 8)
        const fontH = renderFontSz * textLines.length + 4
        const anchor = item.align === 'center' ? 'middle' : item.align === 'right' ? 'end' : 'start'

        if (isRot) {
          const topY = anchor === 'end' ? py - textLen : anchor === 'middle' ? py - textLen / 2 : py - textLen
          result.push({
            obj: { kind: 'legend', svg, itemIdx },
            l: px - fontH - 2,
            t: topY - 2,
            w: fontH + 4,
            h: textLen + 4,
          })
        } else {
          const leftX = anchor === 'end' ? px - textLen : anchor === 'middle' ? px - textLen / 2 : px
          result.push({
            obj: { kind: 'legend', svg, itemIdx },
            l: leftX - 2,
            t: py - renderFontSz - 2,
            w: textLen + 4,
            h: fontH + 4,
          })
        }
      }
    })

    smpDoc.annotationLines?.forEach((aLine, annotationIdx) => {
      const docWidthMm = (smpDoc?.width || 10000) / 100
      const docHeightMm = (smpDoc?.height || 10000) / 100
      const scaleX = plotW / (docWidthMm || 100)
      const scaleY = plotH / (docHeightMm || 100)

      const x1 = left + PLOT_MARGIN.l + aLine.x1Norm * scaleX
      const x2 = left + PLOT_MARGIN.l + aLine.x2Norm * scaleX
      const y1 = top + PLOT_MARGIN.t + aLine.y1Norm * scaleY
      const y2 = top + PLOT_MARGIN.t + aLine.y2Norm * scaleY
      const minX = Math.min(x1, x2) - 4
      const minY = Math.min(y1, y2) - 4
      result.push({
        obj: { kind: 'annotation', svg, annotationIdx },
        l: minX,
        t: minY,
        w: Math.abs(x2 - x1) + 8,
        h: Math.abs(y2 - y1) + 8,
      })
    })
  }
  return result
}

// Start state of every selected object for a group move. Inner objects (legend /
// annotation) of a selected plot box are excluded: they ride along with their plot.
function buildGroupDragItems(selection: SelectableObject[]): GroupDragItem[] {
  const selectedPlots = new Set<SVGSVGElement>()
  selection.forEach((o) => {
    if (o.kind === 'plot') selectedPlots.add(o.svg)
  })

  const items: GroupDragItem[] = []
  for (const o of selection) {
    if (o.kind === 'plot') {
      items.push({
        kind: 'plot',
        svg: o.svg,
        startLeft: parseFloat(o.svg.style.left) || 0,
        startTop: parseFloat(o.svg.style.top) || 0,
      })
      continue
    }
    if (selectedPlots.has(o.svg)) continue

    if (o.kind === 'legend') {
      const item = svgSmpDocMap.get(o.svg)?.legendItems[o.itemIdx!]
      if (item) {
        items.push({
          kind: 'legend',
          svg: o.svg,
          itemIdx: o.itemIdx,
          startXNorm: item.xNorm,
          startYNorm: item.yNorm,
        })
      }
    } else if (o.kind === 'annotation') {
      const aLine = svgSmpDocMap.get(o.svg)?.annotationLines?.[o.annotationIdx!]
      if (aLine) {
        items.push({
          kind: 'annotation',
          svg: o.svg,
          annotationIdx: o.annotationIdx,
          startX1Norm: aLine.x1Norm,
          startY1Norm: aLine.y1Norm,
          startX2Norm: aLine.x2Norm,
          startY2Norm: aLine.y2Norm,
        })
      }
    }
  }
  return items
}

function startGroupDrag(startX: number, startY: number): void {
  activeGroupDrag = {
    items: buildGroupDragItems(selectedObjects),
    startX,
    startY,
  }
  document.body.style.userSelect = 'none'
}

export function updatePlotVisual(svg: SVGSVGElement): void {
  const ds = svgDataMap.get(svg) || []
  const w = parseFloat(svg.style.width) || svg.getBoundingClientRect().width
  const h = parseFloat(svg.style.height) || svg.getBoundingClientRect().height
  drawPlot(svg, ds, w, h)
}

export function recalculateBaseScale(
  svg: SVGSVGElement,
  target: 'all' | 'x' | 'y' = 'all'
): void {
  const datasets = svgDataMap.get(svg) || []

  const processedDatasets: Dataset[] = datasets.map((ds) => getProcessedDataset(ds))

  let xMin = Infinity,
    xMax = -Infinity
  let yMin = Infinity,
    yMax = -Infinity

  for (const ds of processedDatasets) {
    for (let i = 0; i < ds.x.length; i++) {
      if (ds.x[i] < xMin) xMin = ds.x[i]
      if (ds.x[i] > xMax) xMax = ds.x[i]
      if (ds.y[i] < yMin) yMin = ds.y[i]
      if (ds.y[i] > yMax) yMax = ds.y[i]
    }
  }

  if (xMin === Infinity || xMax === -Infinity) {
    xMin = 0
    xMax = 10
  }
  if (yMin === Infinity || yMax === -Infinity) {
    yMin = 0
    yMax = 10
  }
  if (yMin > 0) yMin = 0

  const existing = svgBaseScaleMap.get(svg) || { xMin, xMax, yMin, yMax }

  if (target === 'all') {
    svgBaseScaleMap.set(svg, { xMin, xMax, yMin, yMax })
  } else if (target === 'x') {
    svgBaseScaleMap.set(svg, { ...existing, xMin, xMax })
  } else if (target === 'y') {
    svgBaseScaleMap.set(svg, { ...existing, yMin, yMax })
  }
}

export function getTargetPlotSvgs(specificSvg?: SVGSVGElement | null): SVGSVGElement[] {
  if (specificSvg && document.body.contains(specificSvg)) {
    return [specificSvg]
  }
  const multiSelected = getMultiSelectedSvgs()
  if (multiSelected.length > 0) {
    return multiSelected
  }
  if (selectedPlotSvg && document.body.contains(selectedPlotSvg)) {
    return [selectedPlotSvg]
  }
  const fallbackSvg = getSelectedPlotSvg()
  if (fallbackSvg) {
    return [fallbackSvg]
  }
  return []
}

export function hasIndependentUAxis(svg: SVGSVGElement): boolean {
  const doc = svgSmpDocMap.get(svg)
  if (!doc) return false
  const common = doc.commonWithU !== false && doc.axisX.isCommon !== false && (!doc.axisTop || doc.axisTop.isCommon !== false)
  return !common
}

export function hasIndependentRAxis(svg: SVGSVGElement): boolean {
  const doc = svgSmpDocMap.get(svg)
  if (!doc) return false
  const common = doc.commonWithR !== false && doc.axisY.isCommon !== false && (!doc.axisRight || doc.axisRight.isCommon !== false)
  return !common
}

export function canClearAxis(kind: 'u' | 'r', specificSvg?: SVGSVGElement | null): boolean {
  const targets = getTargetPlotSvgs(specificSvg)
  if (targets.length === 0) return false
  const hasIndependent = kind === 'u' ? hasIndependentUAxis : hasIndependentRAxis
  return targets.some((svg) => hasIndependent(svg))
}

export function clearPlotScale(
  target: 'all' | 'x' | 'y' | 'u' | 'r' = 'all',
  specificSvg?: SVGSVGElement | null
): void {
  const targetSvgs = getTargetPlotSvgs(specificSvg)

  for (const svg of targetSvgs) {
    const independentU = hasIndependentUAxis(svg)
    const independentR = hasIndependentRAxis(svg)
    const datasets = svgDataMap.get(svg) || []
    const processed = datasets.map((ds) => getProcessedDataset(ds))

    let xMin = Infinity,
      xMax = -Infinity
    let yMin = Infinity,
      yMax = -Infinity

    for (const ds of processed) {
      for (let i = 0; i < ds.x.length; i++) {
        if (ds.x[i] < xMin) xMin = ds.x[i]
        if (ds.x[i] > xMax) xMax = ds.x[i]
        if (ds.y[i] < yMin) yMin = ds.y[i]
        if (ds.y[i] > yMax) yMax = ds.y[i]
      }
    }

    if (xMin === Infinity || xMax === -Infinity) {
      xMin = 0
      xMax = 10
    }
    if (yMin === Infinity || yMax === -Infinity) {
      yMin = 0
      yMax = 10
    }
    if (yMin > 0) yMin = 0

    const doc = svgSmpDocMap.get(svg)
    if (doc) {
      if (target === 'all' || target === 'x') {
        const reversed = doc.axisX.min > doc.axisX.max
        doc.axisX.min = reversed ? xMax : xMin
        doc.axisX.max = reversed ? xMin : xMax
        doc.axisX.autoStep = true
        const autoX = computeAutoStep(xMin, xMax)
        doc.axisX.step = autoX.increment
        doc.axisX.subDivs = autoX.division
        if (doc.commonWithU !== false && doc.axisTop) {
          doc.axisTop.min = doc.axisX.min
          doc.axisTop.max = doc.axisX.max
          doc.axisTop.step = doc.axisX.step
          doc.axisTop.subDivs = doc.axisX.subDivs
          doc.axisTop.autoStep = true
        }
      }
      if (target === 'all' || target === 'y') {
        const reversed = doc.axisY.min > doc.axisY.max
        doc.axisY.min = reversed ? yMax : yMin
        doc.axisY.max = reversed ? yMin : yMax
        doc.axisY.autoStep = true
        const autoY = computeAutoStep(yMin, yMax)
        doc.axisY.step = autoY.increment
        doc.axisY.subDivs = autoY.division
        if (doc.commonWithR !== false && doc.axisRight) {
          doc.axisRight.min = doc.axisY.min
          doc.axisRight.max = doc.axisY.max
          doc.axisRight.step = doc.axisY.step
          doc.axisRight.subDivs = doc.axisY.subDivs
          doc.axisRight.autoStep = true
        }
      }
      if (target === 'u' && doc.axisTop && independentU) {
        const reversed = doc.axisTop.min > doc.axisTop.max
        doc.axisTop.min = reversed ? xMax : xMin
        doc.axisTop.max = reversed ? xMin : xMax
        doc.axisTop.autoStep = true
        const autoU = computeAutoStep(xMin, xMax)
        doc.axisTop.step = autoU.increment
        doc.axisTop.subDivs = autoU.division
      }
      if (target === 'r' && doc.axisRight && independentR) {
        const reversed = doc.axisRight.min > doc.axisRight.max
        doc.axisRight.min = reversed ? yMax : yMin
        doc.axisRight.max = reversed ? yMin : yMax
        doc.axisRight.autoStep = true
        const autoR = computeAutoStep(yMin, yMax)
        doc.axisRight.step = autoR.increment
        doc.axisRight.subDivs = autoR.division
      }
    }

    const existing = svgBaseScaleMap.get(svg) || { xMin, xMax, yMin, yMax }
    if (target === 'all') {
      svgBaseScaleMap.set(svg, { xMin, xMax, yMin, yMax })
    } else if (target === 'x' || (target === 'u' && independentU)) {
      svgBaseScaleMap.set(svg, { ...existing, xMin, xMax })
    } else if (target === 'y' || (target === 'r' && independentR)) {
      svgBaseScaleMap.set(svg, { ...existing, yMin, yMax })
    }

    updatePlotVisual(svg)
  }
}

export function getPlotBaseScale(
  svg: SVGSVGElement
): { xMin: number; xMax: number; yMin: number; yMax: number } | undefined {
  return svgBaseScaleMap.get(svg)
}

export function setPlotBaseScale(
  svg: SVGSVGElement,
  base: { xMin: number; xMax: number; yMin: number; yMax: number } | null
): void {
  if (base === null) svgBaseScaleMap.delete(svg)
  else svgBaseScaleMap.set(svg, base)
}

interface ActiveTransDrag {
  svg: SVGSVGElement
  dataset: Dataset
  dir: 'box' | 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  startX: number
  startY: number
  xTransActive: boolean
  yTransActive: boolean
  startXLinear: { a: number; b: number }
  startYLinear: { a: number; b: number }
  rawXMin: number
  rawXMax: number
  rawYMin: number
  rawYMax: number
  startXTransMin: number
  startXTransMax: number
  startYTransMin: number
  startYTransMax: number
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  plotW: number
  plotH: number
  margin: { l: number; r: number; t: number; b: number }
}

let activeTransDrag: ActiveTransDrag | null = null

let activePropertyTarget: { svg: SVGSVGElement; dataset?: Dataset } | null = null
export function setPropertyDialogTarget(target: { svg: SVGSVGElement; dataset?: Dataset } | null): void {
  const prevSvg = activePropertyTarget?.svg
  activePropertyTarget = target
  if (prevSvg && prevSvg !== target?.svg) {
    updatePlotVisual(prevSvg)
  }
}

function startTransformDrag(
  e: MouseEvent,
  svg: SVGSVGElement,
  dataset: Dataset,
  dir: 'box' | 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right',
  xTransActive: boolean,
  yTransActive: boolean,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  plotW: number,
  plotH: number,
  margin: { l: number; r: number; t: number; b: number }
): void {
  e.stopPropagation()
  e.preventDefault()

  const opts = dataset.options || {}
  const startXLinear = extractLinearParams(opts.xExpr || 'x', 'x')
  const startYLinear = extractLinearParams(opts.yExpr || 'y', 'y')

  const { rawXMin, rawXMax, rawYMin, rawYMax } = getDatasetRawMinMax(dataset)

  const xTrans1 = startXLinear.a * rawXMin + startXLinear.b
  const xTrans2 = startXLinear.a * rawXMax + startXLinear.b
  const startXTransMin = Math.min(xTrans1, xTrans2)
  const startXTransMax = Math.max(xTrans1, xTrans2)

  const yTrans1 = startYLinear.a * rawYMin + startYLinear.b
  const yTrans2 = startYLinear.a * rawYMax + startYLinear.b
  const startYTransMin = Math.min(yTrans1, yTrans2)
  const startYTransMax = Math.max(yTrans1, yTrans2)

  activeTransDrag = {
    svg,
    dataset,
    dir,
    startX: e.clientX,
    startY: e.clientY,
    xTransActive,
    yTransActive,
    startXLinear,
    startYLinear,
    rawXMin,
    rawXMax,
    rawYMin,
    rawYMax,
    startXTransMin,
    startXTransMax,
    startYTransMin,
    startYTransMax,
    xMin,
    xMax,
    yMin,
    yMax,
    plotW,
    plotH,
    margin,
  }

  document.body.style.userSelect = 'none'
}

function renderDatasetTransformOverlays(
  svg: SVGSVGElement,
  datasets: Dataset[],
  processedDatasets: Dataset[],
  plotW: number,
  plotH: number,
  margin: { l: number; r: number; t: number; b: number },
  sx: (v: number) => number,
  sy: (v: number) => number,
  su: (v: number) => number,
  sr: (v: number) => number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  uMin: number,
  uMax: number,
  rMin: number,
  rMax: number
): void {
  const ov = getPlotOverlay(svg)
  if (isTrimmingMode() || isReadValueMode() || !activePropertyTarget || activePropertyTarget.svg !== svg) return

  for (let dIdx = 0; dIdx < datasets.length; dIdx++) {
    const rawDs = datasets[dIdx]
    const procDs = processedDatasets[dIdx]
    if (!rawDs || !procDs) continue
    if (activePropertyTarget.dataset && rawDs !== activePropertyTarget.dataset) continue

    const opts = rawDs.options || {}
    const xTransActive = !!opts.xTransCheck
    const yTransActive = !!opts.yTransCheck

    if (!xTransActive && !yTransActive) continue

    const dsSx = opts.axisX === 'u' ? su : sx
    const dsSy = opts.axisY === 'r' ? sr : sy

    const effXMin = opts.axisX === 'u' ? uMin : xMin
    const effXMax = opts.axisX === 'u' ? uMax : xMax
    const effYMin = opts.axisY === 'r' ? rMin : yMin
    const effYMax = opts.axisY === 'r' ? rMax : yMax

    if (!procDs.x || procDs.x.length === 0 || !procDs.y || procDs.y.length === 0) continue

    let minPx = Infinity,
      maxPx = -Infinity
    let minPy = Infinity,
      maxPy = -Infinity

    for (let i = 0; i < procDs.x.length; i++) {
      const px = dsSx(procDs.x[i])
      const py = dsSy(procDs.y[i])
      if (!isNaN(px) && !isNaN(py)) {
        if (px < minPx) minPx = px
        if (px > maxPx) maxPx = px
        if (py < minPy) minPy = py
        if (py > maxPy) maxPy = py
      }
    }

    if (minPx === Infinity || maxPx === -Infinity || minPy === Infinity || maxPy === -Infinity) continue

    const boxLeft = minPx
    const boxTop = minPy
    const boxW = Math.max(12, maxPx - minPx)
    const boxH = Math.max(12, maxPy - minPy)

    // Bounding box container
    const boxEl = createOverlayEl('ov-trans-box')
    boxEl.style.left = `${boxLeft}px`
    boxEl.style.top = `${boxTop}px`
    boxEl.style.width = `${boxW}px`
    boxEl.style.height = `${boxH}px`

    if (xTransActive && yTransActive) {
      boxEl.style.cursor = 'move'
    } else if (yTransActive) {
      boxEl.style.cursor = 'ns-resize'
    } else {
      boxEl.style.cursor = 'ew-resize'
    }

    const exprParts: string[] = []
    if (xTransActive) exprParts.push(`X: ${opts.xExpr || 'x'}`)
    if (yTransActive) exprParts.push(`Y: ${opts.yExpr || 'y'}`)
    const exprText = exprParts.join(' | ')
    boxEl.title = `Transform (${exprText}) — Drag to translate, drag handles to resize`

    boxEl.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button !== 0) return
      startTransformDrag(
        e,
        svg,
        rawDs,
        'box',
        xTransActive,
        yTransActive,
        effXMin,
        effXMax,
        effYMin,
        effYMax,
        plotW,
        plotH,
        margin
      )
    })

    ov.appendChild(boxEl)

    const addHandle = (
      hx: number,
      hy: number,
      dir: 'top' | 'bottom' | 'left' | 'right',
      orientation: 'h' | 'v'
    ) => {
      const isHorizontal = orientation === 'h'
      const hw = isHorizontal ? 10 : 5
      const hh = isHorizontal ? 5 : 10
      const cursor = isHorizontal ? 'ns-resize' : 'ew-resize'

      const handle = createOverlayEl(`ov-trans-handle ov-trans-handle-${orientation}`)
      handle.style.left = `${hx - hw / 2}px`
      handle.style.top = `${hy - hh / 2}px`
      handle.style.width = `${hw}px`
      handle.style.height = `${hh}px`
      handle.style.cursor = cursor
      handle.setAttribute('data-trans-dir', dir)
      handle.title = `Scale ${dir.toUpperCase()} (${exprText})`

      handle.addEventListener('mousedown', (e: MouseEvent) => {
        if (e.button !== 0) return
        startTransformDrag(
          e,
          svg,
          rawDs,
          dir,
          xTransActive,
          yTransActive,
          effXMin,
          effXMax,
          effYMin,
          effYMax,
          plotW,
          plotH,
          margin
        )
      })

      ov.appendChild(handle)
    }

    if (yTransActive) {
      addHandle(boxLeft + boxW / 2, boxTop, 'top', 'h')
      addHandle(boxLeft + boxW / 2, boxTop + boxH, 'bottom', 'h')
    }
    if (xTransActive) {
      addHandle(boxLeft, boxTop + boxH / 2, 'left', 'v')
      addHandle(boxLeft + boxW, boxTop + boxH / 2, 'right', 'v')
    }
  }
}

export function drawPlot(
  svg: SVGSVGElement,
  datasets: Dataset[] = [],
  explicitW?: number,
  explicitH?: number
): void {
  const w = explicitW || svg.clientWidth || parseFloat(svg.style.width) || 400
  const h = explicitH || svg.clientHeight || parseFloat(svg.style.height) || 300
  if (w <= 0 || h <= 0) return

  // Apply column mapping and math expression transformations to X and Y coordinates
  const processedDatasets: Dataset[] = datasets.map((ds) => getProcessedDataset(ds))

  // Lock base scale bounds on initial dataset load
  if (!svgBaseScaleMap.has(svg) && datasets.length > 0) {
    let origXMin = Infinity,
      origXMax = -Infinity
    let origYMin = Infinity,
      origYMax = -Infinity

    for (const ds of datasets) {
      for (let i = 0; i < ds.x.length; i++) {
        if (ds.x[i] < origXMin) origXMin = ds.x[i]
        if (ds.x[i] > origXMax) origXMax = ds.x[i]
        if (ds.y[i] < origYMin) origYMin = ds.y[i]
        if (ds.y[i] > origYMax) origYMax = ds.y[i]
      }
    }
    if (origXMin === Infinity || origXMax === -Infinity) {
      origXMin = 0
      origXMax = 10
    }
    if (origYMin === Infinity || origYMax === -Infinity) {
      origYMin = 0
      origYMax = 10
    }
    if (origYMin > 0) origYMin = 0

    svgBaseScaleMap.set(svg, {
      xMin: origXMin,
      xMax: origXMax,
      yMin: origYMin,
      yMax: origYMax,
    })
  }

  svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
  svg.replaceChildren()
  getPlotOverlay(svg).replaceChildren()

  const smpDoc = svgSmpDocMap.get(svg)
  const smpMeta = svgSmpMetaMap.get(svg)

  const margin = PLOT_MARGIN
  const plotW = Math.max(10, w - margin.l - margin.r)
  const plotH = Math.max(10, h - margin.t - margin.b)

  const baseScale = svgBaseScaleMap.get(svg)
  let xMin = smpDoc?.axisX.min ?? smpMeta?.xMin ?? (baseScale ? baseScale.xMin : 0)
  let xMax = smpDoc?.axisX.max ?? smpMeta?.xMax ?? (baseScale ? baseScale.xMax : 10)
  let yMin = smpDoc?.axisY.min ?? smpMeta?.yMin ?? (baseScale ? baseScale.yMin : 0)
  let yMax = smpDoc?.axisY.max ?? smpMeta?.yMax ?? (baseScale ? baseScale.yMax : 10)

  if (!smpDoc && !smpMeta && !baseScale && processedDatasets.length > 0) {
    xMin = Infinity
    xMax = -Infinity
    yMin = Infinity
    yMax = -Infinity
    for (const ds of processedDatasets) {
      for (let i = 0; i < ds.x.length; i++) {
        if (ds.x[i] < xMin) xMin = ds.x[i]
        if (ds.x[i] > xMax) xMax = ds.x[i]
        if (ds.y[i] < yMin) yMin = ds.y[i]
        if (ds.y[i] > yMax) yMax = ds.y[i]
      }
    }
    if (xMin === Infinity) xMin = 0
    if (xMax === -Infinity) xMax = 10
    if (yMin === Infinity) yMin = 0
    if (yMax === -Infinity) yMax = 10
    if (yMin > 0) yMin = 0
  }

  // Determine steps for X and Y axes
  let xStep = Math.abs(smpDoc?.axisX.step || smpMeta?.xStep || 0)
  let autoSubDivsX: number | null = null
  if (smpDoc?.axisX.autoStep || xStep <= 0) {
    const autoX = computeAutoStep(xMin, xMax)
    xStep = autoX.increment
    autoSubDivsX = autoX.division
  }

  let yStep = Math.abs(smpDoc?.axisY.step || smpMeta?.yStep || 0)
  let autoSubDivsY: number | null = null
  if (smpDoc?.axisY.autoStep || yStep <= 0) {
    const autoY = computeAutoStep(yMin, yMax)
    yStep = autoY.increment
    autoSubDivsY = autoY.division
  }

  const sx = (v: number) => margin.l + ((v - xMin) / (xMax - xMin)) * plotW
  const sy = (v: number) => margin.t + plotH - ((v - yMin) / (yMax - yMin)) * plotH

  const docWidthMm = (smpDoc?.width || 10000) / 100
  const docHeightMm = (smpDoc?.height || 10000) / 100
  const scaleX = plotW / (docWidthMm || 100)
  const scaleY = plotH / (docHeightMm || 100)

  // Outer plot frame
  const frameWidthMm = smpDoc?.frameWidth ?? 0.4
  const frameStrokeWidth = Math.max(0.4, Number((frameWidthMm * scaleX).toFixed(2)))
  const frameColor = smpDoc?.frameColor || '#000000'
  const frame = createSVGElement('rect')
  frame.setAttribute('x', String(margin.l))
  frame.setAttribute('y', String(margin.t))
  frame.setAttribute('width', String(plotW))
  frame.setAttribute('height', String(plotH))
  frame.setAttribute('fill', 'none')
  frame.setAttribute('stroke', frameColor)
  frame.setAttribute('stroke-width', String(frameStrokeWidth))
  svg.appendChild(frame)

  // ----------------------------------------------------
  // SVG CLIP-PATH & PLOT CONTAINER (Clips series & annotations within box)
  // ----------------------------------------------------
  const clipId = `plot-clip-${Math.random().toString(36).substring(2, 9)}`
  const defs = createSVGElement('defs')
  const clipPath = createSVGElement('clipPath')
  clipPath.setAttribute('id', clipId)
  const clipRect = createSVGElement('rect')
  clipRect.setAttribute('x', String(margin.l))
  clipRect.setAttribute('y', String(margin.t))
  clipRect.setAttribute('width', String(plotW))
  clipRect.setAttribute('height', String(plotH))
  clipPath.appendChild(clipRect)
  defs.appendChild(clipPath)
  svg.appendChild(defs)

  const seriesGroup = createSVGElement('g')
  seriesGroup.setAttribute('clip-path', `url(#${clipId})`)
  svg.appendChild(seriesGroup)

  // ----------------------------------------------------
  // 4-AXIS INSIDE/OUTSIDE TICKS & LABELS ENGINE
  // ----------------------------------------------------
  const commonWithU = smpDoc ? (smpDoc.commonWithU !== false && smpDoc.axisX.isCommon !== false) : true
  const commonWithR = smpDoc ? (smpDoc.commonWithR !== false && smpDoc.axisY.isCommon !== false) : true

  const getMajorTicks = (minVal: number, maxVal: number, stepVal: number): number[] => {
    const ticks: number[] = []
    if (stepVal <= 0) return [minVal, maxVal]
    const isRev = minVal > maxVal
    const startB = isRev ? maxVal : minVal
    const endB = isRev ? minVal : maxVal
    let startT = Math.ceil(startB / stepVal) * stepVal
    if (Math.abs(startB) < 1e-9) startT = 0
    const eps = stepVal * 1e-6
    for (let v = startT; v <= endB + eps; v += stepVal) {
      const cleanV = parseFloat(v.toPrecision(12))
      if (cleanV >= startB - eps && cleanV <= endB + eps) {
        ticks.push(cleanV)
      }
    }
    return ticks
  }

  const getMinorTicks = (minVal: number, maxVal: number, stepVal: number, divs: number, majors: number[]): number[] => {
    const minors: number[] = []
    if (divs <= 1 || stepVal <= 0) return minors
    const isRev = minVal > maxVal
    const startB = isRev ? maxVal : minVal
    const endB = isRev ? minVal : maxVal
    const subStep = stepVal / divs
    let startSub = Math.ceil(startB / subStep) * subStep
    if (Math.abs(startB) < 1e-9) startSub = 0
    const eps = subStep * 1e-5
    for (let v = startSub; v <= endB + eps; v += subStep) {
      const cleanV = parseFloat(v.toPrecision(12))
      if (cleanV >= startB - eps && cleanV <= endB + eps) {
        const isMajor = majors.some((m) => Math.abs(m - cleanV) < eps)
        if (!isMajor) {
          minors.push(cleanV)
        }
      }
    }
    return minors
  }

  // --- AXIS-0 (Bottom / X) ---
  const subDivsX = autoSubDivsX !== null ? autoSubDivsX : smpDoc?.axisX.subDivs || 5
  const xMajorTicks = getMajorTicks(xMin, xMax, xStep)
  const xMinorTicks = getMinorTicks(xMin, xMax, xStep, subDivsX, xMajorTicks)

  const xFontFamily = smpDoc?.axisX.fontFamily || 'Times New Roman, Inter, sans-serif'
  const xRenderFontSize = Math.max(7, Math.round((smpDoc?.axisX.fontSize || 24) * 0.72))
  const xFontWeight = smpDoc?.axisX.fontWeight || 400
  const xFontStyle = smpDoc?.axisX.fontStyle || 'regular'
  const xLabelColor = smpDoc?.axisX.labelColor || '#000000'
  const xShiftRight = smpDoc?.axisX.shiftRight || 0
  const xShiftDown = smpDoc?.axisX.shiftDown || 0

  const showXLabels = smpDoc?.axisX.showLabels !== false
  const showXTicks = smpDoc?.axisX.showTicks !== false

  const xMajIn = smpDoc?.axisX.majorIn ?? (smpDoc?.axisX.insideTicks !== false)
  const xMajOut = smpDoc?.axisX.majorOut ?? false
  const xMajLen = smpDoc?.axisX.majorLength ?? 6
  const xMajW = Math.max(0.4, Number(((smpDoc?.axisX.majorWidth ?? 0.4) * scaleX).toFixed(2)))
  const xMajColor = smpDoc?.axisX.majorColor || '#000000'
  const xMajStyle = smpDoc?.axisX.majorStyle || 'solid'

  const xMinIn = smpDoc?.axisX.minorIn ?? (smpDoc?.axisX.insideTicks !== false)
  const xMinOut = smpDoc?.axisX.minorOut ?? false
  const xMinLen = smpDoc?.axisX.minorLength ?? 3
  const xMinW = Math.max(0.4, Number(((smpDoc?.axisX.minorWidth ?? 0.4) * scaleX).toFixed(2)))
  const xMinColor = smpDoc?.axisX.minorColor || '#000000'
  const xMinStyle = smpDoc?.axisX.minorStyle || 'solid'

  const bottomY = margin.t + plotH
  const topY = margin.t

  let xTickPathD = ''
  let xSubTickPathD = ''
  const xLabelFrag = document.createDocumentFragment()

  if (showXTicks) {
    xMajorTicks.forEach((v) => {
      const px = sx(v)
      if (px > margin.l + 0.5 && px < margin.l + plotW - 0.5) {
        const bYStart = xMajOut ? bottomY + xMajLen : bottomY
        const bYEnd = xMajIn ? bottomY - xMajLen : bottomY
        if (xMajIn || xMajOut) {
          xTickPathD += `M${px} ${bYStart}V${bYEnd}`
        }
      }
    })

    xMinorTicks.forEach((v) => {
      const px = sx(v)
      if (px > margin.l + 0.5 && px < margin.l + plotW - 0.5) {
        const bYStart = xMinOut ? bottomY + xMinLen : bottomY
        const bYEnd = xMinIn ? bottomY - xMinLen : bottomY
        if (xMinIn || xMinOut) {
          xSubTickPathD += `M${px} ${bYStart}V${bYEnd}`
        }
      }
    })
  }

  if (showXLabels) {
    xMajorTicks.forEach((v) => {
      const px = sx(v)
      if (px >= margin.l - 2 && px <= margin.l + plotW + 2) {
        const label = createSVGElement('text')
        label.setAttribute('x', String(px + xShiftRight))
        label.setAttribute('y', String(bottomY + 1 + xShiftDown))
        label.setAttribute('text-anchor', 'middle')
        label.setAttribute('dominant-baseline', 'hanging')
        label.setAttribute('font-size', String(xRenderFontSize))
        label.setAttribute('font-family', xFontFamily)
        if (xFontStyle === 'italic') label.setAttribute('font-style', 'italic')
        if (xFontStyle === 'bold' || xFontWeight >= 600) label.setAttribute('font-weight', 'bold')
        label.setAttribute('fill', xLabelColor)
        label.textContent = formatTick(v)
        xLabelFrag.appendChild(label)
      }
    })
  }

  if (xTickPathD) {
    const xTickPath = createSVGElement('path')
    xTickPath.setAttribute('d', xTickPathD)
    xTickPath.setAttribute('stroke', xMajColor)
    xTickPath.setAttribute('stroke-width', String(xMajW))
    xTickPath.setAttribute('stroke-linecap', 'square')
    if (xMajStyle === 'dashed') xTickPath.setAttribute('stroke-dasharray', '4 4')
    else if (xMajStyle === 'dotted') xTickPath.setAttribute('stroke-dasharray', '2 2')
    xTickPath.setAttribute('fill', 'none')
    svg.appendChild(xTickPath)
  }
  if (xSubTickPathD) {
    const xSubTickPath = createSVGElement('path')
    xSubTickPath.setAttribute('d', xSubTickPathD)
    xSubTickPath.setAttribute('stroke', xMinColor)
    xSubTickPath.setAttribute('stroke-width', String(xMinW))
    xSubTickPath.setAttribute('stroke-linecap', 'square')
    if (xMinStyle === 'dashed') xSubTickPath.setAttribute('stroke-dasharray', '4 4')
    else if (xMinStyle === 'dotted') xSubTickPath.setAttribute('stroke-dasharray', '2 2')
    xSubTickPath.setAttribute('fill', 'none')
    svg.appendChild(xSubTickPath)
  }
  svg.appendChild(xLabelFrag)

  // --- AXIS-2 (Top / U) ---
  const uSpec = smpDoc?.axisTop || smpDoc?.axisX
  let uMin = xMin
  let uMax = xMax
  let uStep = xStep
  let subDivsU = subDivsX
  let uMajorTicks = xMajorTicks
  let uMinorTicks = xMinorTicks
  let showUTicks = smpDoc?.axisTop?.showTicks ?? showXTicks
  let showULabels = false

  if (!commonWithU && smpDoc?.axisTop) {
    uMin = smpDoc.axisTop.min ?? 0
    uMax = smpDoc.axisTop.max ?? 100
    uStep = Math.abs(smpDoc.axisTop.step || 0)
    let autoSubDivsU: number | null = null
    if (smpDoc.axisTop.autoStep || uStep <= 0) {
      const autoU = computeAutoStep(uMin, uMax)
      uStep = autoU.increment
      autoSubDivsU = autoU.division
    }
    subDivsU = autoSubDivsU !== null ? autoSubDivsU : (smpDoc.axisTop.subDivs || 5)
    uMajorTicks = getMajorTicks(uMin, uMax, uStep)
    uMinorTicks = getMinorTicks(uMin, uMax, uStep, subDivsU, uMajorTicks)
    showUTicks = smpDoc.axisTop.showTicks !== false
    showULabels = smpDoc.axisTop.showLabels !== false
  }

  const su = (v: number) => margin.l + ((v - uMin) / (uMax - uMin)) * plotW

  const uFontFamily = uSpec?.fontFamily || xFontFamily
  const uRenderFontSize = Math.max(7, Math.round((uSpec?.fontSize || 24) * 0.72))
  const uFontWeight = uSpec?.fontWeight || 400
  const uFontStyle = uSpec?.fontStyle || 'regular'
  const uLabelColor = uSpec?.labelColor || '#000000'
  const uShiftRight = uSpec?.shiftRight || 0
  const uShiftDown = uSpec?.shiftDown || 0

  const uMajIn = uSpec?.majorIn ?? (uSpec?.insideTicks !== false)
  const uMajOut = uSpec?.majorOut ?? false
  const uMajLen = uSpec?.majorLength ?? 6
  const uMajW = Math.max(0.4, Number(((uSpec?.majorWidth ?? 0.4) * scaleX).toFixed(2)))
  const uMajColor = uSpec?.majorColor || '#000000'
  const uMajStyle = uSpec?.majorStyle || 'solid'

  const uMinIn = uSpec?.minorIn ?? (uSpec?.insideTicks !== false)
  const uMinOut = uSpec?.minorOut ?? false
  const uMinLen = uSpec?.minorLength ?? 3
  const uMinW = Math.max(0.4, Number(((uSpec?.minorWidth ?? 0.4) * scaleX).toFixed(2)))
  const uMinColor = uSpec?.minorColor || '#000000'
  const uMinStyle = uSpec?.minorStyle || 'solid'

  let uTickPathD = ''
  let uSubTickPathD = ''
  const uLabelFrag = document.createDocumentFragment()

  if (showUTicks) {
    uMajorTicks.forEach((v) => {
      const px = su(v)
      if (px > margin.l + 0.5 && px < margin.l + plotW - 0.5) {
        const tYStart = uMajOut ? topY - uMajLen : topY
        const tYEnd = uMajIn ? topY + uMajLen : topY
        if (uMajIn || uMajOut) {
          uTickPathD += `M${px} ${tYStart}V${tYEnd}`
        }
      }
    })

    uMinorTicks.forEach((v) => {
      const px = su(v)
      if (px > margin.l + 0.5 && px < margin.l + plotW - 0.5) {
        const tYStart = uMinOut ? topY - uMinLen : topY
        const tYEnd = uMinIn ? topY + uMinLen : topY
        if (uMinIn || uMinOut) {
          uSubTickPathD += `M${px} ${tYStart}V${tYEnd}`
        }
      }
    })
  }

  if (showULabels) {
    uMajorTicks.forEach((v) => {
      const px = su(v)
      if (px >= margin.l - 2 && px <= margin.l + plotW + 2) {
        const label = createSVGElement('text')
        label.setAttribute('x', String(px + uShiftRight))
        label.setAttribute('y', String(topY - 4 + uShiftDown))
        label.setAttribute('text-anchor', 'middle')
        label.setAttribute('dominant-baseline', 'auto')
        label.setAttribute('font-size', String(uRenderFontSize))
        label.setAttribute('font-family', uFontFamily)
        if (uFontStyle === 'italic') label.setAttribute('font-style', 'italic')
        if (uFontStyle === 'bold' || uFontWeight >= 600) label.setAttribute('font-weight', 'bold')
        label.setAttribute('fill', uLabelColor)
        label.textContent = formatTick(v)
        uLabelFrag.appendChild(label)
      }
    })
  }

  if (uTickPathD) {
    const uTickPath = createSVGElement('path')
    uTickPath.setAttribute('d', uTickPathD)
    uTickPath.setAttribute('stroke', uMajColor)
    uTickPath.setAttribute('stroke-width', String(uMajW))
    uTickPath.setAttribute('stroke-linecap', 'square')
    if (uMajStyle === 'dashed') uTickPath.setAttribute('stroke-dasharray', '4 4')
    else if (uMajStyle === 'dotted') uTickPath.setAttribute('stroke-dasharray', '2 2')
    uTickPath.setAttribute('fill', 'none')
    svg.appendChild(uTickPath)
  }
  if (uSubTickPathD) {
    const uSubTickPath = createSVGElement('path')
    uSubTickPath.setAttribute('d', uSubTickPathD)
    uSubTickPath.setAttribute('stroke', uMinColor)
    uSubTickPath.setAttribute('stroke-width', String(uMinW))
    uSubTickPath.setAttribute('stroke-linecap', 'square')
    if (uMinStyle === 'dashed') uSubTickPath.setAttribute('stroke-dasharray', '4 4')
    else if (uMinStyle === 'dotted') uSubTickPath.setAttribute('stroke-dasharray', '2 2')
    uSubTickPath.setAttribute('fill', 'none')
    svg.appendChild(uSubTickPath)
  }
  svg.appendChild(uLabelFrag)

  // --- AXIS-1 (Left / Y) ---
  const subDivsY = autoSubDivsY !== null ? autoSubDivsY : smpDoc?.axisY.subDivs || 5
  const yMajorTicks = getMajorTicks(yMin, yMax, yStep)
  const yMinorTicks = getMinorTicks(yMin, yMax, yStep, subDivsY, yMajorTicks)

  const yFontFamily = smpDoc?.axisY.fontFamily || 'Times New Roman, Inter, sans-serif'
  const yRenderFontSize = Math.max(7, Math.round((smpDoc?.axisY.fontSize || 24) * 0.72))
  const yFontWeight = smpDoc?.axisY.fontWeight || 400
  const yFontStyle = smpDoc?.axisY.fontStyle || 'regular'
  const yLabelColor = smpDoc?.axisY.labelColor || '#000000'
  const yShiftRight = smpDoc?.axisY.shiftRight || 0
  const yShiftDown = smpDoc?.axisY.shiftDown || 0

  const showYLabels = smpDoc?.axisY.showLabels !== false
  const showYTicks = smpDoc?.axisY.showTicks !== false

  const yMajIn = smpDoc?.axisY.majorIn ?? (smpDoc?.axisY.insideTicks !== false)
  const yMajOut = smpDoc?.axisY.majorOut ?? false
  const yMajLen = smpDoc?.axisY.majorLength ?? 6
  const yMajW = Math.max(0.4, Number(((smpDoc?.axisY.majorWidth ?? 0.4) * scaleX).toFixed(2)))
  const yMajColor = smpDoc?.axisY.majorColor || '#000000'
  const yMajStyle = smpDoc?.axisY.majorStyle || 'solid'

  const yMinIn = smpDoc?.axisY.minorIn ?? (smpDoc?.axisY.insideTicks !== false)
  const yMinOut = smpDoc?.axisY.minorOut ?? false
  const yMinLen = smpDoc?.axisY.minorLength ?? 3
  const yMinW = Math.max(0.4, Number(((smpDoc?.axisY.minorWidth ?? 0.4) * scaleX).toFixed(2)))
  const yMinColor = smpDoc?.axisY.minorColor || '#000000'
  const yMinStyle = smpDoc?.axisY.minorStyle || 'solid'

  const leftX = margin.l
  const rightX = margin.l + plotW

  let yTickPathD = ''
  let ySubTickPathD = ''
  const yLabelFrag = document.createDocumentFragment()

  if (showYTicks) {
    yMajorTicks.forEach((v) => {
      const py = sy(v)
      if (py > margin.t + 0.5 && py < margin.t + plotH - 0.5) {
        const lXStart = yMajOut ? leftX - yMajLen : leftX
        const lXEnd = yMajIn ? leftX + yMajLen : leftX
        if (yMajIn || yMajOut) {
          yTickPathD += `M${lXStart} ${py}H${lXEnd}`
        }
      }
    })

    yMinorTicks.forEach((v) => {
      const py = sy(v)
      if (py > margin.t + 0.5 && py < margin.t + plotH - 0.5) {
        const lXStart = yMinOut ? leftX - yMinLen : leftX
        const lXEnd = yMinIn ? leftX + yMinLen : leftX
        if (yMinIn || yMinOut) {
          ySubTickPathD += `M${lXStart} ${py}H${lXEnd}`
        }
      }
    })
  }

  if (showYLabels) {
    yMajorTicks.forEach((v) => {
      const py = sy(v)
      if (py >= margin.t - 2 && py <= margin.t + plotH + 2) {
        const label = createSVGElement('text')
        label.setAttribute('x', String(leftX - 1 + yShiftRight))
        label.setAttribute('y', String(py + Math.round(yRenderFontSize * 0.35) + yShiftDown))
        label.setAttribute('text-anchor', 'end')
        label.setAttribute('font-size', String(yRenderFontSize))
        label.setAttribute('font-family', yFontFamily)
        if (yFontStyle === 'italic') label.setAttribute('font-style', 'italic')
        if (yFontStyle === 'bold' || yFontWeight >= 600) label.setAttribute('font-weight', 'bold')
        label.setAttribute('fill', yLabelColor)
        label.textContent = formatTick(v)
        yLabelFrag.appendChild(label)
      }
    })
  }

  if (yTickPathD) {
    const yTickPath = createSVGElement('path')
    yTickPath.setAttribute('d', yTickPathD)
    yTickPath.setAttribute('stroke', yMajColor)
    yTickPath.setAttribute('stroke-width', String(yMajW))
    yTickPath.setAttribute('stroke-linecap', 'square')
    if (yMajStyle === 'dashed') yTickPath.setAttribute('stroke-dasharray', '4 4')
    else if (yMajStyle === 'dotted') yTickPath.setAttribute('stroke-dasharray', '2 2')
    yTickPath.setAttribute('fill', 'none')
    svg.appendChild(yTickPath)
  }
  if (ySubTickPathD) {
    const ySubTickPath = createSVGElement('path')
    ySubTickPath.setAttribute('d', ySubTickPathD)
    ySubTickPath.setAttribute('stroke', yMinColor)
    ySubTickPath.setAttribute('stroke-width', String(yMinW))
    ySubTickPath.setAttribute('stroke-linecap', 'square')
    if (yMinStyle === 'dashed') ySubTickPath.setAttribute('stroke-dasharray', '4 4')
    else if (yMinStyle === 'dotted') ySubTickPath.setAttribute('stroke-dasharray', '2 2')
    ySubTickPath.setAttribute('fill', 'none')
    svg.appendChild(ySubTickPath)
  }
  svg.appendChild(yLabelFrag)

  // --- AXIS-3 (Right / R) ---
  const rSpec = smpDoc?.axisRight || smpDoc?.axisY
  let rMin = yMin
  let rMax = yMax
  let rStep = yStep
  let subDivsR = subDivsY
  let rMajorTicks = yMajorTicks
  let rMinorTicks = yMinorTicks
  let showRTicks = smpDoc?.axisRight?.showTicks ?? showYTicks
  let showRLabels = false

  if (!commonWithR && smpDoc?.axisRight) {
    rMin = smpDoc.axisRight.min ?? 0
    rMax = smpDoc.axisRight.max ?? 100
    rStep = Math.abs(smpDoc.axisRight.step || 0)
    let autoSubDivsR: number | null = null
    if (smpDoc.axisRight.autoStep || rStep <= 0) {
      const autoR = computeAutoStep(rMin, rMax)
      rStep = autoR.increment
      autoSubDivsR = autoR.division
    }
    subDivsR = autoSubDivsR !== null ? autoSubDivsR : (smpDoc.axisRight.subDivs || 5)
    rMajorTicks = getMajorTicks(rMin, rMax, rStep)
    rMinorTicks = getMinorTicks(rMin, rMax, rStep, subDivsR, rMajorTicks)
    showRTicks = smpDoc.axisRight.showTicks !== false
    showRLabels = smpDoc.axisRight.showLabels !== false
  }

  const sr = (v: number) => margin.t + plotH - ((v - rMin) / (rMax - rMin)) * plotH

  const rFontFamily = rSpec?.fontFamily || yFontFamily
  const rRenderFontSize = Math.max(7, Math.round((rSpec?.fontSize || 24) * 0.72))
  const rFontWeight = rSpec?.fontWeight || 400
  const rFontStyle = rSpec?.fontStyle || 'regular'
  const rLabelColor = rSpec?.labelColor || '#000000'
  const rShiftRight = rSpec?.shiftRight || 0
  const rShiftDown = rSpec?.shiftDown || 0

  const rMajIn = rSpec?.majorIn ?? (rSpec?.insideTicks !== false)
  const rMajOut = rSpec?.majorOut ?? false
  const rMajLen = rSpec?.majorLength ?? 6
  const rMajW = Math.max(0.4, Number(((rSpec?.majorWidth ?? 0.4) * scaleX).toFixed(2)))
  const rMajColor = rSpec?.majorColor || '#000000'
  const rMajStyle = rSpec?.majorStyle || 'solid'

  const rMinIn = rSpec?.minorIn ?? (rSpec?.insideTicks !== false)
  const rMinOut = rSpec?.minorOut ?? false
  const rMinLen = rSpec?.minorLength ?? 3
  const rMinW = Math.max(0.4, Number(((rSpec?.minorWidth ?? 0.4) * scaleX).toFixed(2)))
  const rMinColor = rSpec?.minorColor || '#000000'
  const rMinStyle = rSpec?.minorStyle || 'solid'

  let rTickPathD = ''
  let rSubTickPathD = ''
  const rLabelFrag = document.createDocumentFragment()

  if (showRTicks) {
    rMajorTicks.forEach((v) => {
      const py = sr(v)
      if (py > margin.t + 0.5 && py < margin.t + plotH - 0.5) {
        const rXStart = rMajOut ? rightX + rMajLen : rightX
        const rXEnd = rMajIn ? rightX - rMajLen : rightX
        if (rMajIn || rMajOut) {
          rTickPathD += `M${rXStart} ${py}H${rXEnd}`
        }
      }
    })

    rMinorTicks.forEach((v) => {
      const py = sr(v)
      if (py > margin.t + 0.5 && py < margin.t + plotH - 0.5) {
        const rXStart = rMinOut ? rightX + rMinLen : rightX
        const rXEnd = rMinIn ? rightX - rMinLen : rightX
        if (rMinIn || rMinOut) {
          rSubTickPathD += `M${rXStart} ${py}H${rXEnd}`
        }
      }
    })
  }

  if (showRLabels) {
    rMajorTicks.forEach((v) => {
      const py = sr(v)
      if (py >= margin.t - 2 && py <= margin.t + plotH + 2) {
        const label = createSVGElement('text')
        label.setAttribute('x', String(rightX + 4 + rShiftRight))
        label.setAttribute('y', String(py + Math.round(rRenderFontSize * 0.35) + rShiftDown))
        label.setAttribute('text-anchor', 'start')
        label.setAttribute('font-size', String(rRenderFontSize))
        label.setAttribute('font-family', rFontFamily)
        if (rFontStyle === 'italic') label.setAttribute('font-style', 'italic')
        if (rFontStyle === 'bold' || rFontWeight >= 600) label.setAttribute('font-weight', 'bold')
        label.setAttribute('fill', rLabelColor)
        label.textContent = formatTick(v)
        rLabelFrag.appendChild(label)
      }
    })
  }

  if (rTickPathD) {
    const rTickPath = createSVGElement('path')
    rTickPath.setAttribute('d', rTickPathD)
    rTickPath.setAttribute('stroke', rMajColor)
    rTickPath.setAttribute('stroke-width', String(rMajW))
    rTickPath.setAttribute('stroke-linecap', 'square')
    if (rMajStyle === 'dashed') rTickPath.setAttribute('stroke-dasharray', '4 4')
    else if (rMajStyle === 'dotted') rTickPath.setAttribute('stroke-dasharray', '2 2')
    rTickPath.setAttribute('fill', 'none')
    svg.appendChild(rTickPath)
  }
  if (rSubTickPathD) {
    const rSubTickPath = createSVGElement('path')
    rSubTickPath.setAttribute('d', rSubTickPathD)
    rSubTickPath.setAttribute('stroke', rMinColor)
    rSubTickPath.setAttribute('stroke-width', String(rMinW))
    rSubTickPath.setAttribute('stroke-linecap', 'square')
    if (rMinStyle === 'dashed') rSubTickPath.setAttribute('stroke-dasharray', '4 4')
    else if (rMinStyle === 'dotted') rSubTickPath.setAttribute('stroke-dasharray', '2 2')
    rSubTickPath.setAttribute('fill', 'none')
    svg.appendChild(rSubTickPath)
  }
  svg.appendChild(rLabelFrag)

  // ----------------------------------------------------
  // ANNOTATION LINES & RECTANGLES (Page mm Coordinates)
  // ----------------------------------------------------
  const annotationLines = smpDoc?.annotationLines || []
  annotationLines.forEach((aLine, aIdx) => {
    let x1: number, y1: number, x2: number, y2: number

    if (aLine.unitX === 'xa') {
      x1 = sx(aLine.x1Norm)
      x2 = sx(aLine.x2Norm)
    } else if (aLine.unitX === 'ua') {
      x1 = su(aLine.x1Norm)
      x2 = su(aLine.x2Norm)
    } else {
      x1 = margin.l + aLine.x1Norm * scaleX
      x2 = margin.l + aLine.x2Norm * scaleX
    }

    if (aLine.unitY === 'ya') {
      y1 = sy(aLine.y1Norm)
      y2 = sy(aLine.y2Norm)
    } else if (aLine.unitY === 'ra') {
      y1 = sr(aLine.y1Norm)
      y2 = sr(aLine.y2Norm)
    } else {
      y1 = margin.t + aLine.y1Norm * scaleY
      y2 = margin.t + aLine.y2Norm * scaleY
    }

    const isSelected = isObjectSelected({ kind: 'annotation', svg, annotationIdx: aIdx })

    const handleMouseDown = (targetType: 'start' | 'end' | 'line') => (e: MouseEvent) => {
      if (e.button !== 0) return
      if (isTrimmingMode() || isReadValueMode() || isPropertyTabMode()) return
      const wasSelected = isObjectSelected({ kind: 'annotation', svg, annotationIdx: aIdx })

      if (!wasSelected) {
        // Not yet selected — don't stopPropagation, let MarqueeSelect handle.
        return
      }

      const now = Date.now()
      const clickKey = `annot-${aIdx}`
      if (lastAnnotationClickKey === clickKey && now - lastAnnotationClickTime < 450) {
        lastAnnotationClickTime = 0
        lastAnnotationClickKey = ''
        e.stopPropagation()
        e.preventDefault()
        setSelectedPlotSvg(svg)
        selectedAnnotationIndex = aIdx
        selectedLegendIndex = -1
        updatePlotVisual(svg)
        if (isRect) {
          const rectOverlayEl = document.querySelector<HTMLElement>('#rectangleOverlay')
          if (rectOverlayEl) showRectangleDialog(rectOverlayEl, aIdx, svg)
        } else {
          const arrowOverlayEl = document.querySelector<HTMLElement>('#arrowOverlay')
          if (arrowOverlayEl) showArrowDialog(arrowOverlayEl, aIdx, svg)
        }
        return
      }
      lastAnnotationClickTime = now
      lastAnnotationClickKey = clickKey

      // Object was already selected — stopPropagation and start group drag
      e.stopPropagation()
      setSelectedPlotSvg(svg)
      selectedAnnotationIndex = aIdx
      selectedLegendIndex = -1
      updatePlotVisual(svg)

      const selection = getSelectedObjects()
      if (selection.length > 1) {
        activeGroupDrag = {
          items: buildGroupDragItems(selection).map((it) =>
            it.kind === 'annotation' && it.svg === svg && it.annotationIdx === aIdx ? { ...it, targetType } : it
          ),
          startX: e.clientX,
          startY: e.clientY,
        }
        document.body.style.userSelect = 'none'
        return
      }

      // Single annotation: keep endpoint editing behavior
      activeGroupDrag = {
        items: [
          {
            kind: 'annotation',
            svg,
            annotationIdx: aIdx,
            targetType,
            startX1Norm: aLine.x1Norm,
            startY1Norm: aLine.y1Norm,
            startX2Norm: aLine.x2Norm,
            startY2Norm: aLine.y2Norm,
          },
        ],
        startX: e.clientX,
        startY: e.clientY,
      }
      document.body.style.userSelect = 'none'
    }

    const isRect = aLine.shape === 'rectangle' || aLine.shape === 'rect' || aLine.rawType === '3'

    if (isRect) {
      const rx1 = Math.min(x1, x2)
      const ry1 = Math.min(y1, y2)
      const rw = Math.max(1, Math.abs(x2 - x1))
      const rh = Math.max(1, Math.abs(y2 - y1))

      const shadeDepth = aLine.shadeDepth ?? 0
      if (shadeDepth > 0) {
        const shadePx = shadeDepth * scaleX
        const shadowElem = createSVGElement('rect')
        shadowElem.setAttribute('x', String(rx1 + shadePx))
        shadowElem.setAttribute('y', String(ry1 + shadePx))
        shadowElem.setAttribute('width', String(rw))
        shadowElem.setAttribute('height', String(rh))
        if (aLine.roundX) {
          const rxPx = aLine.roundX * scaleX
          shadowElem.setAttribute('rx', String(rxPx))
        }
        if (aLine.roundY) {
          const ryPx = aLine.roundY * scaleY
          shadowElem.setAttribute('ry', String(ryPx))
        }
        shadowElem.setAttribute('fill', aLine.shadeColor || '#000000')
        shadowElem.setAttribute('stroke', 'none')
        shadowElem.setAttribute('pointer-events', 'all')
        shadowElem.style.cursor = 'pointer'
        shadowElem.addEventListener('mousedown', handleMouseDown('line'))
        shadowElem.addEventListener('dblclick', (e: MouseEvent) => {
          e.stopPropagation()
          e.preventDefault()
          setSelectedPlotSvg(svg)
          selectedAnnotationIndex = aIdx
          selectedLegendIndex = -1
          updatePlotVisual(svg)
          const rectOverlayEl = document.querySelector<HTMLElement>('#rectangleOverlay')
          if (rectOverlayEl) {
            showRectangleDialog(rectOverlayEl, aIdx, svg)
          }
        })
        svg.appendChild(shadowElem)
      }

      const rectElem = createSVGElement('rect')
      rectElem.setAttribute('x', String(rx1))
      rectElem.setAttribute('y', String(ry1))
      rectElem.setAttribute('width', String(rw))
      rectElem.setAttribute('height', String(rh))
      if (aLine.roundX) {
        const rxPx = aLine.roundX * scaleX
        rectElem.setAttribute('rx', String(rxPx))
      }
      if (aLine.roundY) {
        const ryPx = aLine.roundY * scaleY
        rectElem.setAttribute('ry', String(ryPx))
      }
      rectElem.setAttribute('fill', aLine.faceColor && aLine.faceColor !== 'none' ? aLine.faceColor : 'transparent')
      rectElem.setAttribute('stroke', aLine.shadeColor || aLine.color || '#000000')
      const aWidthMm = aLine.thickness || aLine.width || 0.4
      rectElem.setAttribute('stroke-width', String(Math.max(0.4, Number((aWidthMm * scaleX).toFixed(2)))))
      rectElem.setAttribute('pointer-events', 'all')
      if (aLine.style === 'dashed') {
        rectElem.setAttribute('stroke-dasharray', '4 4')
      } else if (aLine.style === 'dotted') {
        rectElem.setAttribute('stroke-dasharray', '2 2')
      }
      rectElem.style.cursor = 'pointer'
      rectElem.addEventListener('mousedown', handleMouseDown('line'))
      rectElem.addEventListener('dblclick', (e: MouseEvent) => {
        e.stopPropagation()
        e.preventDefault()
        setSelectedPlotSvg(svg)
        selectedAnnotationIndex = aIdx
        selectedLegendIndex = -1
        updatePlotVisual(svg)
        const rectOverlayEl = document.querySelector<HTMLElement>('#rectangleOverlay')
        if (rectOverlayEl) {
          showRectangleDialog(rectOverlayEl, aIdx, svg)
        }
      })
      svg.appendChild(rectElem)
    } else {
      const dx = x2 - x1
      const dy = y2 - y1
      const len = Math.hypot(dx, dy)
      const aColor = aLine.color || '#000000'
      const aWidthMm = aLine.width ?? 0.4
      const aStrokeW = Math.max(0.4, Number((aWidthMm * scaleX).toFixed(2)))
      const aLineStyle = aLine.style || 'solid'

      let dashArray = 'none'
      if (aLineStyle === 'dashed') {
        dashArray = `${Math.max(2, Number((1.5 * scaleX).toFixed(1)))} ${Math.max(2, Number((1.5 * scaleX).toFixed(1)))}`
      } else if (aLineStyle === 'dotted') {
        dashArray = `0.1 ${Math.max(4, Number((4.5 * scaleX).toFixed(1)))}`
      } else if (aLineStyle === 'dash_dot') {
        dashArray = `${Math.max(3, Number((3.0 * scaleX).toFixed(1)))} ${Math.max(2, Number((1.5 * scaleX).toFixed(1)))} 0.1 ${Math.max(2, Number((1.5 * scaleX).toFixed(1)))}`
      }

      const isDimension = aLine.shape === 'dimension' || aLine.rawType === '2'
      const mode = aLine.arrowMode !== undefined ? aLine.arrowMode : (
        aLine.shape === 'arrow_start' ? 2 :
        aLine.shape === 'arrow_both' ? 3 :
        aLine.shape === 'line' || isDimension ? 0 :
        (aLine.shape === 'arrow' || aLine.arrowhead ? 1 : 0)
      )

      const handleArrowDblClick = (e: MouseEvent) => {
        e.stopPropagation()
        setSelectedPlotSvg(svg)
        selectedAnnotationIndex = aIdx
        selectedLegendIndex = -1
        updatePlotVisual(svg)
        const arrowOverlayEl = document.querySelector<HTMLElement>('#arrowOverlay')
        if (arrowOverlayEl) {
          showArrowDialog(arrowOverlayEl, aIdx, svg)
        }
      }

      if (isDimension && len > 1e-4) {
        const ux = dx / len
        const uy = dy / len
        const px = -uy
        const py = ux
        const capLen = ((aLine.arrowhead ?? 5.0) * scaleX)

        const cap1_x1 = x1 - (capLen / 2) * px
        const cap1_y1 = y1 - (capLen / 2) * py
        const cap1_x2 = x1 + (capLen / 2) * px
        const cap1_y2 = y1 + (capLen / 2) * py

        const cap2_x1 = x2 - (capLen / 2) * px
        const cap2_y1 = y2 - (capLen / 2) * py
        const cap2_x2 = x2 + (capLen / 2) * px
        const cap2_y2 = y2 + (capLen / 2) * py

        const dimPathD = `M${cap1_x1.toFixed(1)},${cap1_y1.toFixed(1)}L${cap1_x2.toFixed(1)},${cap1_y2.toFixed(1)}M${cap2_x1.toFixed(1)},${cap2_y1.toFixed(1)}L${cap2_x2.toFixed(1)},${cap2_y2.toFixed(1)}M${x1.toFixed(1)},${y1.toFixed(1)}L${x2.toFixed(1)},${y2.toFixed(1)}`

        const dimElem = createSVGElement('path')
        dimElem.setAttribute('d', dimPathD)
        dimElem.setAttribute('stroke', aColor)
        dimElem.setAttribute('stroke-width', String(aStrokeW))
        dimElem.setAttribute('fill', 'none')
        dimElem.setAttribute('stroke-linecap', 'round')
        dimElem.setAttribute('stroke-linejoin', 'round')
        if (dashArray !== 'none') dimElem.setAttribute('stroke-dasharray', dashArray)
        dimElem.style.cursor = 'pointer'
        dimElem.addEventListener('mousedown', handleMouseDown('line'))
        dimElem.addEventListener('dblclick', handleArrowDblClick)
        svg.appendChild(dimElem)
      } else if (len > 1e-4) {
        const ux = dx / len
        const uy = dy / len
        const px = -uy
        const py = ux

        const rawHeadLen = (aLine.arrowhead ?? 5.0) * scaleX
        const headLenPx = Math.min(rawHeadLen, len * 0.45)
        const spreadVal = aLine.spread ?? 30
        const halfWidthPx = headLenPx * (spreadVal / 150)
        const shutPct = (aLine.shut !== undefined ? aLine.shut : 100) / 100
        const notchDist = headLenPx * shutPct

        let startX = x1
        let startY = y1
        let endX = x2
        let endY = y2

        // Arrowhead at End (x2, y2)
        if (mode === 1 || mode === 3) {
          const tipX = x2
          const tipY = y2
          const baseX = tipX - headLenPx * ux
          const baseY = tipY - headLenPx * uy
          const notchX = tipX - notchDist * ux
          const notchY = tipY - notchDist * uy
          const c1X = baseX + halfWidthPx * px
          const c1Y = baseY + halfWidthPx * py
          const c2X = baseX - halfWidthPx * px
          const c2Y = baseY - halfWidthPx * py

          const headElem = createSVGElement('path')
          headElem.setAttribute('d', `M${c1X.toFixed(1)},${c1Y.toFixed(1)}L${tipX.toFixed(1)},${tipY.toFixed(1)}L${c2X.toFixed(1)},${c2Y.toFixed(1)}L${notchX.toFixed(1)},${notchY.toFixed(1)}Z`)
          headElem.setAttribute('fill', aColor)
          headElem.setAttribute('stroke', aColor)
          headElem.setAttribute('stroke-width', '1')
          headElem.setAttribute('stroke-linejoin', 'miter')
          headElem.setAttribute('stroke-miterlimit', '10')
          headElem.setAttribute('stroke-linecap', 'butt')
          headElem.style.cursor = 'pointer'
          headElem.addEventListener('mousedown', handleMouseDown('end'))
          headElem.addEventListener('dblclick', handleArrowDblClick)
          svg.appendChild(headElem)

          endX = notchX
          endY = notchY
        }

        // Arrowhead at Start (x1, y1)
        if (mode === 2 || mode === 3) {
          const tipX = x1
          const tipY = y1
          const baseX = tipX + headLenPx * ux
          const baseY = tipY + headLenPx * uy
          const notchX = tipX + notchDist * ux
          const notchY = tipY + notchDist * uy
          const c1X = baseX + halfWidthPx * px
          const c1Y = baseY + halfWidthPx * py
          const c2X = baseX - halfWidthPx * px
          const c2Y = baseY - halfWidthPx * py

          const headElem = createSVGElement('path')
          headElem.setAttribute('d', `M${c1X.toFixed(1)},${c1Y.toFixed(1)}L${tipX.toFixed(1)},${tipY.toFixed(1)}L${c2X.toFixed(1)},${c2Y.toFixed(1)}L${notchX.toFixed(1)},${notchY.toFixed(1)}Z`)
          headElem.setAttribute('fill', aColor)
          headElem.setAttribute('stroke', aColor)
          headElem.setAttribute('stroke-width', '1')
          headElem.setAttribute('stroke-linejoin', 'miter')
          headElem.setAttribute('stroke-miterlimit', '10')
          headElem.setAttribute('stroke-linecap', 'butt')
          headElem.style.cursor = 'pointer'
          headElem.addEventListener('mousedown', handleMouseDown('start'))
          headElem.addEventListener('dblclick', handleArrowDblClick)
          svg.appendChild(headElem)

          startX = notchX
          startY = notchY
        }

        // Body line
        const lineElem = createSVGElement('path')
        lineElem.setAttribute('d', `M${startX.toFixed(1)},${startY.toFixed(1)}L${endX.toFixed(1)},${endY.toFixed(1)}`)
        lineElem.setAttribute('stroke', aColor)
        lineElem.setAttribute('stroke-width', String(aStrokeW))
        lineElem.setAttribute('stroke-linecap', 'round')
        lineElem.setAttribute('stroke-linejoin', 'round')
        lineElem.setAttribute('fill', 'none')
        if (dashArray !== 'none') lineElem.setAttribute('stroke-dasharray', dashArray)
        lineElem.style.cursor = 'pointer'
        lineElem.addEventListener('mousedown', handleMouseDown('line'))
        lineElem.addEventListener('dblclick', handleArrowDblClick)
        svg.appendChild(lineElem)
      } else {
        const l = createSVGElement('line')
        l.setAttribute('x1', String(x1))
        l.setAttribute('y1', String(y1))
        l.setAttribute('x2', String(x2))
        l.setAttribute('y2', String(y2))
        l.setAttribute('stroke', aColor)
        l.setAttribute('stroke-width', String(aStrokeW))
        if (dashArray !== 'none') l.setAttribute('stroke-dasharray', dashArray)
        l.style.cursor = 'pointer'
        l.addEventListener('mousedown', handleMouseDown('line'))
        l.addEventListener('dblclick', handleArrowDblClick)
        svg.appendChild(l)
      }
    }

    if (isSelected) {
      if (isRect) {
        const rx1 = Math.min(x1, x2)
        const ry1 = Math.min(y1, y2)
        const rw = Math.max(1, Math.abs(x2 - x1))
        const rh = Math.max(1, Math.abs(y2 - y1))
        const ov = getPlotOverlay(svg)

        const highlightEl = createOverlayEl('ov-box-multi')
        highlightEl.style.left = `${rx1 - 0.5}px`
        highlightEl.style.top = `${ry1 - 0.5}px`
        highlightEl.style.width = `${rw + 1}px`
        highlightEl.style.height = `${rh + 1}px`
        highlightEl.addEventListener('mousedown', handleMouseDown('line'))
        highlightEl.addEventListener('dblclick', (e: MouseEvent) => {
          e.stopPropagation()
          const rectOverlayEl = document.querySelector<HTMLElement>('#rectangleOverlay')
          if (rectOverlayEl) showRectangleDialog(rectOverlayEl, aIdx, svg)
        })
        ov.appendChild(highlightEl)

        const handleTL = createOverlayEl('ov-handle')
        handleTL.style.left = `${rx1 - 2}px`
        handleTL.style.top = `${ry1 - 2}px`
        handleTL.addEventListener('mousedown', handleMouseDown('start'))
        ov.appendChild(handleTL)

        const handleTR = createOverlayEl('ov-handle')
        handleTR.style.left = `${rx1 + rw - 2}px`
        handleTR.style.top = `${ry1 - 2}px`
        handleTR.addEventListener('mousedown', handleMouseDown('start'))
        ov.appendChild(handleTR)

        const handleBL = createOverlayEl('ov-handle')
        handleBL.style.left = `${rx1 - 2}px`
        handleBL.style.top = `${ry1 + rh - 2}px`
        handleBL.addEventListener('mousedown', handleMouseDown('end'))
        ov.appendChild(handleBL)

        const handleBR = createOverlayEl('ov-handle')
        handleBR.style.left = `${rx1 + rw - 2}px`
        handleBR.style.top = `${ry1 + rh - 2}px`
        handleBR.addEventListener('mousedown', handleMouseDown('end'))
        ov.appendChild(handleBR)
      } else {
        const len = Math.hypot(x2 - x1, y2 - y1) || 1
        const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI
        const ov = getPlotOverlay(svg)

        const cyanLineEl = createOverlayEl('ov-line')
        cyanLineEl.style.left = `${x1}px`
        cyanLineEl.style.top = `${y1}px`
        cyanLineEl.style.width = `${len}px`
        cyanLineEl.style.transformOrigin = '0 50%'
        cyanLineEl.style.transform = `rotate(${angle}deg)`
        cyanLineEl.addEventListener('mousedown', handleMouseDown('line'))
        cyanLineEl.addEventListener('dblclick', (e: MouseEvent) => {
          e.stopPropagation()
          const arrowOverlayEl = document.querySelector<HTMLElement>('#arrowOverlay')
          if (arrowOverlayEl) showArrowDialog(arrowOverlayEl, aIdx, svg)
        })
        ov.appendChild(cyanLineEl)

        const handle1 = createOverlayEl('ov-handle')
        handle1.style.left = `${x1 - 2}px`
        handle1.style.top = `${y1 - 2}px`
        handle1.addEventListener('mousedown', handleMouseDown('start'))
        ov.appendChild(handle1)

        const handle2 = createOverlayEl('ov-handle')
        handle2.style.left = `${x2 - 2}px`
        handle2.style.top = `${y2 - 2}px`
        handle2.addEventListener('mousedown', handleMouseDown('end'))
        ov.appendChild(handle2)
      }
    }
  })

  // ----------------------------------------------------
  // LEGEND ITEMS & ANNOTATIONS (10000ths Normalized Coordinates)
  // ----------------------------------------------------
  if (smpDoc && smpDoc.legendItems.length === 0) {
    const xLbl = smpDoc?.xLabel
    const yLbl = smpDoc?.yLabel
    if (xLbl) {
      smpDoc.legendItems.push({
        type: 'text',
        legendType: 4,
        text: xLbl,
        rawText: xLbl,
        xNorm: 2400,
        yNorm: 11400,
        rotation: 0,
        fontFamily: 'Times New Roman',
        fontSize: 12,
        fontWeight: 400,
      })
    }
    if (yLbl) {
      smpDoc.legendItems.push({
        type: 'text',
        legendType: 5,
        text: yLbl,
        rawText: yLbl,
        xNorm: -400,
        yNorm: 5000,
        rotation: -90,
        fontFamily: 'Times New Roman',
        fontSize: 12,
        fontWeight: 400,
      })
    }
  }

  const legendItems = smpDoc?.legendItems || []
  if (legendItems.length > 0) {
    legendItems.forEach((item, itemIdx) => {
      const isRotated = item.rotation !== 0
      const px = margin.l + (item.xNorm / 10000) * plotW
      const renderPx = px
      const py = margin.t + (item.yNorm / 10000) * plotH

      const isSelected = isObjectSelected({ kind: 'legend', svg, itemIdx })

      let lastClickTime = 0

      const openTitleModal = (e: MouseEvent) => {
        e.stopPropagation()
        setSelectedPlotSvg(svg)
        selectedLegendIndex = itemIdx
        updatePlotVisual(svg)
        const titleOverlayEl = document.querySelector<HTMLElement>('#titleOverlay')
        if (titleOverlayEl) {
          showTitleDialog(titleOverlayEl, itemIdx, svg)
        }
      }

      const handleLegendMouseDown = (e: MouseEvent) => {
        if (e.button !== 0) return
        if (isTrimmingMode() || isReadValueMode() || isPropertyTabMode()) return
        const wasSelected = isObjectSelected({ kind: 'legend', svg, itemIdx })

        // Double-click detection (always works)
        const now = Date.now()
        if (now - lastClickTime < 350 || e.detail >= 2) {
          lastClickTime = 0
          e.stopPropagation()
          setSelectedPlotSvg(svg)
          selectedLegendIndex = itemIdx
          selectedAnnotationIndex = -1
          updatePlotVisual(svg)
          openTitleModal(e)
          return
        }
        lastClickTime = now

        if (!wasSelected) {
          // Not yet selected — don't stopPropagation, let MarqueeSelect handle.
          return
        }

        // Object was already selected — stopPropagation and start group drag
        e.stopPropagation()
        setSelectedPlotSvg(svg)
        selectedLegendIndex = itemIdx
        selectedAnnotationIndex = -1
        updatePlotVisual(svg)
        startGroupDrag(e.clientX, e.clientY)
      }

      if (isSeriesLegendText(item.text)) {
        // Series Legend Box e.g. %01E KP\n%02E SG\n%03E GS  or  %01E%01N
        const rawLines = item.text.split('\n')
        let legY = py
        rawLines.forEach((lineStr) => {
          const head = lineStr.match(/%(\d+)E/)
          if (!head) return
          const idx = parseInt(head[1], 10) - 1
          const ds = processedDatasets[idx]
          const color = ds?.options?.lineColor || ds?.color || '#000000'

          // %nN is dataset n name; %nE corresponds to graphic style of dataset n (removed from text)
          const labelText = lineStr
            .replace(/%(\d+)N/g, (_m, n) => processedDatasets[parseInt(n, 10) - 1]?.name || `Series ${n}`)
            .replace(/%(\d+)E/g, '')
            .trim()

          // Draw legend line sample
          const legLine = createSVGElement('line')
          legLine.setAttribute('x1', String(renderPx))
          legLine.setAttribute('y1', String(legY))
          legLine.setAttribute('x2', String(renderPx + 18))
          legLine.setAttribute('y2', String(legY))
          legLine.setAttribute('stroke', color)
          const legWidthMm = ds?.options?.width ?? (ds?.smpSeriesStylePrefix ? ds.smpSeriesStylePrefix / 100 : 0.6)
          legLine.setAttribute('stroke-width', String(Math.max(0.4, Number((legWidthMm * scaleX).toFixed(2)))))

          const brush = ds?.options?.brush || ds?.options?.lineStyle || 'solid'
          const lineType = ds?.options?.lineType || 'solid'
          let dashArray = 'none'
          if (lineType === 'dotted' || brush === 'dot' || brush === 'dotted') {
            dashArray = '2 2'
          } else if (lineType === 'dash_dot') {
            dashArray = '6 3 2 3'
          } else if (lineType === 'dash_dot_dot') {
            dashArray = '6 3 2 3 2 3'
          } else if (brush === 'dash' || brush === 'dashed') {
            dashArray = '6 3'
          }
          if (dashArray !== 'none') legLine.setAttribute('stroke-dasharray', dashArray)

          legLine.style.cursor = isSelected ? 'move' : 'pointer'
          legLine.addEventListener('mousedown', handleLegendMouseDown)
          legLine.addEventListener('dblclick', openTitleModal)
          svg.appendChild(legLine)

          // Draw legend marker symbol if set
          const plotType = ds?.options?.plotType || 'no_dot'
          if (plotType !== 'no_dot' && plotType !== 'none') {
            const dotColor = ds?.options?.dotColor || color
            const paintColor = ds?.options?.paintColor || '#ffffff'
            const r = Math.max(3, ds?.options?.size || 3.5)
            const cx = renderPx + 9

            if (plotType === 'circle' || plotType === 'filled_circle') {
              const circle = createSVGElement('circle')
              circle.setAttribute('cx', String(cx))
              circle.setAttribute('cy', String(legY))
              circle.setAttribute('r', String(r))
              circle.setAttribute('fill', plotType === 'filled_circle' ? dotColor : 'none')
              circle.setAttribute('stroke', plotType === 'filled_circle' ? paintColor : dotColor)
              circle.setAttribute('stroke-width', '1')
              circle.style.cursor = isSelected ? 'move' : 'pointer'
              circle.addEventListener('mousedown', handleLegendMouseDown)
              circle.addEventListener('dblclick', openTitleModal)
              svg.appendChild(circle)
            } else if (plotType === 'square' || plotType === 'filled_square') {
              const rect = createSVGElement('rect')
              rect.setAttribute('x', String(cx - r))
              rect.setAttribute('y', String(legY - r))
              rect.setAttribute('width', String(r * 2))
              rect.setAttribute('height', String(r * 2))
              rect.setAttribute('fill', plotType === 'filled_square' ? dotColor : 'none')
              rect.setAttribute('stroke', plotType === 'filled_square' ? paintColor : dotColor)
              rect.setAttribute('stroke-width', '1')
              rect.style.cursor = isSelected ? 'move' : 'pointer'
              rect.addEventListener('mousedown', handleLegendMouseDown)
              rect.addEventListener('dblclick', openTitleModal)
              svg.appendChild(rect)
            } else if (plotType === 'triangle' || plotType === 'filled_triangle') {
              const poly = createSVGElement('polygon')
              const p1 = `${cx},${legY - r}`
              const p2 = `${cx - r},${legY + r}`
              const p3 = `${cx + r},${legY + r}`
              poly.setAttribute('points', `${p1} ${p2} ${p3}`)
              poly.setAttribute('fill', plotType === 'filled_triangle' ? dotColor : 'none')
              poly.setAttribute('stroke', plotType === 'filled_triangle' ? paintColor : dotColor)
              poly.setAttribute('stroke-width', '1')
              poly.style.cursor = isSelected ? 'move' : 'pointer'
              poly.addEventListener('mousedown', handleLegendMouseDown)
              poly.addEventListener('dblclick', openTitleModal)
              svg.appendChild(poly)
            } else if (plotType === 'diamond' || plotType === 'filled_diamond') {
              const poly = createSVGElement('polygon')
              const p1 = `${cx},${legY - r}`
              const p2 = `${cx + r},${legY}`
              const p3 = `${cx},${legY + r}`
              const p4 = `${cx - r},${legY}`
              poly.setAttribute('points', `${p1} ${p2} ${p3} ${p4}`)
              poly.setAttribute('fill', plotType === 'filled_diamond' ? dotColor : 'none')
              poly.setAttribute('stroke', plotType === 'filled_diamond' ? paintColor : dotColor)
              poly.setAttribute('stroke-width', '1')
              poly.style.cursor = isSelected ? 'move' : 'pointer'
              poly.addEventListener('mousedown', handleLegendMouseDown)
              poly.addEventListener('dblclick', openTitleModal)
              svg.appendChild(poly)
            }
          }

          // Draw legend text next to icon (foreignObject + renderSmpTextToHtml)
          const legStr = renderSmpTextToHtml(labelText)
          const legFontSz = 10
          const legFo = createSVGElement('foreignObject')
          legFo.setAttribute('x', String(renderPx + 22))
          legFo.setAttribute('y', String(legY - 6))
          legFo.setAttribute('width', '600')
          legFo.setAttribute('height', '400')
          legFo.style.overflow = 'visible'
          legFo.style.cursor = isSelected ? 'move' : 'pointer'

          const legContainer = document.createElement('div')
          legContainer.className = 'smp-latex-item'
          legContainer.style.fontSize = `${legFontSz}px`
          legContainer.style.fontFamily = item.fontFamily || 'Times New Roman, serif'
          legContainer.style.fontWeight = String(item.fontWeight)
          legContainer.style.color = '#000000'
          legContainer.style.display = 'inline-block'
          legContainer.style.verticalAlign = 'top'
          legContainer.style.userSelect = 'none'
          legContainer.style.cursor = isSelected ? 'move' : 'pointer'
          legContainer.innerHTML = legStr
          legContainer.addEventListener('mousedown', handleLegendMouseDown)
          legContainer.addEventListener('dblclick', openTitleModal)
          legFo.appendChild(legContainer)
          svg.appendChild(legFo)

          legY += 11
        })
      } else {
        const rawStr = item.rawText || item.text
        const htmlStr = renderSmpTextToHtml(rawStr)
        const fontSz = Math.max(6, Math.round((item.fontSize || 12) * 0.72))

        const fo = createSVGElement('foreignObject')
        fo.setAttribute('x', String(renderPx))
        fo.setAttribute('y', String(py - fontSz - 2))
        fo.setAttribute('width', '600')
        fo.setAttribute('height', '400')
        fo.style.overflow = 'visible'
        fo.style.cursor = isSelected ? 'move' : 'pointer'

        if (isRotated) {
          fo.setAttribute('transform', `rotate(${item.rotation} ${renderPx} ${py})`)
        }

        const container = document.createElement('div')
        container.className = 'smp-latex-item'
        container.style.fontSize = `${fontSz}px`
        container.style.fontFamily = item.fontFamily || 'Times New Roman, serif'
        container.style.fontWeight = String(item.fontWeight || 400)
        container.style.color = '#000000'
        container.style.display = 'inline-block'
        container.style.verticalAlign = 'top'
        container.style.userSelect = 'none'
        container.style.cursor = isSelected ? 'move' : 'pointer'

        if (item.align === 'center') {
          container.style.textAlign = 'center'
          container.style.transform = 'translateX(-50%)'
        } else if (item.align === 'right') {
          container.style.textAlign = 'right'
          container.style.transform = 'translateX(-100%)'
        } else {
          container.style.textAlign = 'left'
        }

        container.innerHTML = htmlStr
        container.addEventListener('mousedown', handleLegendMouseDown)
        container.addEventListener('dblclick', openTitleModal)
        fo.appendChild(container)
        svg.appendChild(fo)

        if (isSelected) {
          const measuredW = container.offsetWidth || (rawStr.length * (fontSz * 0.5) + 10)
          const measuredH = container.offsetHeight || (fontSz + 4)

          let boxW = Math.max(30, measuredW + 6)
          let boxH = Math.max(10, measuredH + 2)
          let boxX = renderPx - 3
          let boxY = py - fontSz - 3

          const anchor = item.align === 'center' ? 'middle' : item.align === 'right' ? 'end' : 'start'
          if (anchor === 'middle') {
            boxX = renderPx - boxW / 2
          } else if (anchor === 'end') {
            boxX = renderPx - boxW + 4
          }

          const ov = getPlotOverlay(svg)
          let parentEl: HTMLElement = ov

          if (isRotated) {
            const rotWrap = createOverlayEl('ov-rot-wrap')
            rotWrap.style.left = `${renderPx}px`
            rotWrap.style.top = `${py}px`
            rotWrap.style.transform = `rotate(${item.rotation}deg)`
            ov.appendChild(rotWrap)
            parentEl = rotWrap
          }

          const offsetX = isRotated ? boxX - renderPx : boxX
          const offsetY = isRotated ? boxY - py : boxY

          const cyanBox = createOverlayEl('ov-box')
          cyanBox.style.left = `${offsetX}px`
          cyanBox.style.top = `${offsetY}px`
          cyanBox.style.width = `${boxW}px`
          cyanBox.style.height = `${boxH}px`
          cyanBox.addEventListener('mousedown', handleLegendMouseDown)
          cyanBox.addEventListener('dblclick', openTitleModal)
          parentEl.appendChild(cyanBox)

          const corners = [
            { x: offsetX - 1.5, y: offsetY - 1.5 },
            { x: offsetX + boxW - 1.5, y: offsetY - 1.5 },
            { x: offsetX - 1.5, y: offsetY + boxH - 1.5 },
            { x: offsetX + boxW - 1.5, y: offsetY + boxH - 1.5 },
          ]
          corners.forEach((c) => {
            const handle = createOverlayEl('ov-box-corner')
            handle.style.left = `${c.x}px`
            handle.style.top = `${c.y}px`
            parentEl.appendChild(handle)
          })
        }
      }

      if (isSelected && isSeriesLegendText(item.text)) {
        let boxX = renderPx - 4
        let boxY = py - 6
        let boxW = 60
        let boxH = item.text.split('\n').length * 11 + 6

        const ov = getPlotOverlay(svg)

        const cyanBox = createOverlayEl('ov-box')
        cyanBox.style.left = `${boxX}px`
        cyanBox.style.top = `${boxY}px`
        cyanBox.style.width = `${boxW}px`
        cyanBox.style.height = `${boxH}px`
        cyanBox.addEventListener('mousedown', handleLegendMouseDown)
        cyanBox.addEventListener('dblclick', openTitleModal)
        ov.appendChild(cyanBox)

        const corners = [
          { x: boxX - 1.5, y: boxY - 1.5 },
          { x: boxX + boxW - 1.5, y: boxY - 1.5 },
          { x: boxX - 1.5, y: boxY + boxH - 1.5 },
          { x: boxX + boxW - 1.5, y: boxY + boxH - 1.5 },
        ]
        corners.forEach((c) => {
          const handle = createOverlayEl('ov-box-corner')
          handle.style.left = `${c.x}px`
          handle.style.top = `${c.y}px`
          ov.appendChild(handle)
        })
      }
    })
  } else {
    // Fallback axis labels if not in legendItems
    const xLabel = smpDoc?.xLabel
    if (xLabel) {
      const xTitle = createSVGElement('text')
      xTitle.setAttribute('x', String(margin.l + plotW / 2))
      xTitle.setAttribute('y', String(margin.t + plotH + 42))
      xTitle.setAttribute('text-anchor', 'middle')
      xTitle.setAttribute('font-size', '12')
      xTitle.setAttribute('font-family', 'Times New Roman, serif')
      xTitle.setAttribute('fill', '#000000')
      xTitle.textContent = xLabel
      svg.appendChild(xTitle)
    }
    const yLabel = smpDoc?.yLabel
    if (yLabel) {
      const yTitle = createSVGElement('text')
      const cx = margin.l - 42
      const cy = margin.t + plotH / 2
      yTitle.setAttribute('x', String(cx))
      yTitle.setAttribute('y', String(cy))
      yTitle.setAttribute('transform', `rotate(-90 ${cx} ${cy})`)
      yTitle.setAttribute('text-anchor', 'middle')
      yTitle.setAttribute('font-size', '12')
      yTitle.setAttribute('font-family', 'Times New Roman, serif')
      yTitle.setAttribute('fill', '#000000')
      yTitle.textContent = yLabel
      svg.appendChild(yTitle)
    }
  }



  // Render Data Series according to Property Visual Options
  for (const ds of processedDatasets) {
    const opts = ds.options || {}
    const isShow = opts.show !== false
    if (!isShow) continue

    const dsSx = opts.axisX === 'u' ? su : sx
    const dsSy = opts.axisY === 'r' ? sr : sy

    const strokeColor = opts.lineColor || ds.color
    const seriesWidthMm = opts.width ?? (ds.smpSeriesStylePrefix ? ds.smpSeriesStylePrefix / 100 : 0.6)
    const strokeWidth = String(Math.max(0.4, Number((seriesWidthMm * scaleX).toFixed(2))))
    const dotColor = opts.dotColor || '#000000'
    const paintColor = opts.paintColor || '#ffffff'
    const dotSize = opts.size || 3
    const plotType = opts.plotType || 'no_dot'
    const lineType = opts.lineType || 'solid'
    const brush = opts.brush || opts.lineStyle || 'solid'

      // Line style dash array handling for exact Sma4Win line types
      let dashArray = 'none'
      if (lineType === 'dotted' || brush === 'dot' || brush === 'dotted') {
        dashArray = '2 2'
      } else if (lineType === 'dash_dot') {
        dashArray = '6 3 2 3'
      } else if (lineType === 'dash_dot_dot') {
        dashArray = '6 3 2 3 2 3'
      } else if (brush === 'dash' || brush === 'dashed') {
        dashArray = '6 3'
      }

      if (plotType === 'bar') {
        const barW = Math.max(2, Math.floor(plotW / (ds.x.length || 1) - 2))
        const zeroY = dsSy(0)
        for (let i = 0; i < ds.x.length; i++) {
          const px = dsSx(ds.x[i])
          const py = dsSy(ds.y[i])
          const bar = createSVGElement('rect')
          bar.setAttribute('x', String(px - barW / 2))
          bar.setAttribute('y', String(Math.min(py, zeroY)))
          bar.setAttribute('width', String(barW))
          bar.setAttribute('height', String(Math.abs(py - zeroY)))
          bar.setAttribute('fill', paintColor)
          bar.setAttribute('stroke', strokeColor)
          bar.setAttribute('stroke-width', strokeWidth)
          seriesGroup.appendChild(bar)
        }
      } else {
        // Draw Line Path / Face Area Fill
        if (lineType !== 'no_line' && ds.x.length > 0) {
          const points: string[] = []
          for (let i = 0; i < ds.x.length; i++) {
            points.push(`${dsSx(ds.x[i]).toFixed(1)},${dsSy(ds.y[i]).toFixed(1)}`)
          }

          if (lineType === 'face') {
            // Fill area below line down to Y = 0 baseline
            const zeroY = dsSy(0).toFixed(1)
            const firstX = dsSx(ds.x[0]).toFixed(1)
            const lastX = dsSx(ds.x[ds.x.length - 1]).toFixed(1)

            const areaPathD = `M ${firstX},${zeroY} L ${points.join(' L ')} L ${lastX},${zeroY} Z`
            const areaPath = createSVGElement('path')
            areaPath.setAttribute('d', areaPathD)
            areaPath.setAttribute('fill', strokeColor)
            areaPath.setAttribute('fill-opacity', '0.35')
            areaPath.setAttribute('stroke', 'none')
            seriesGroup.appendChild(areaPath)
          }

          // Top boundary curve line
          const path = createSVGElement('path')
          path.setAttribute('d', `M ${points.join(' ')}`)
          path.setAttribute('fill', 'none')
          path.setAttribute('stroke', strokeColor)
          path.setAttribute('stroke-width', strokeWidth)
          if (dashArray !== 'none') path.setAttribute('stroke-dasharray', dashArray)
          path.setAttribute('stroke-linejoin', 'round')
          path.setAttribute('stroke-linecap', 'round')
          seriesGroup.appendChild(path)
        }

        // Draw Dot / Symbol Markers based on exact Plot type shape with pitch interval
        if (plotType !== 'no_dot') {
          const step = Math.max(1, opts.pitch || 1)
          for (let i = 0; i < ds.x.length; i += step) {
            const px = dsSx(ds.x[i])
            const py = dsSy(ds.y[i])

            if (plotType === 'circle' || plotType === 'filled_circle') {
              const circle = createSVGElement('circle')
              circle.setAttribute('cx', String(px))
              circle.setAttribute('cy', String(py))
              circle.setAttribute('r', String(dotSize))
              circle.setAttribute('fill', plotType === 'filled_circle' ? dotColor : 'none')
              circle.setAttribute('stroke', plotType === 'filled_circle' ? paintColor : dotColor)
              circle.setAttribute('stroke-width', '1')
              seriesGroup.appendChild(circle)
            } else if (plotType === 'square' || plotType === 'filled_square') {
              const rect = createSVGElement('rect')
              rect.setAttribute('x', String(px - dotSize))
              rect.setAttribute('y', String(py - dotSize))
              rect.setAttribute('width', String(dotSize * 2))
              rect.setAttribute('height', String(dotSize * 2))
              rect.setAttribute('fill', plotType === 'filled_square' ? dotColor : 'none')
              rect.setAttribute('stroke', plotType === 'filled_square' ? paintColor : dotColor)
              rect.setAttribute('stroke-width', '1')
              seriesGroup.appendChild(rect)
            } else if (plotType === 'triangle' || plotType === 'filled_triangle') {
              const poly = createSVGElement('polygon')
              const p1 = `${px},${py - dotSize}`
              const p2 = `${px - dotSize},${py + dotSize}`
              const p3 = `${px + dotSize},${py + dotSize}`
              poly.setAttribute('points', `${p1} ${p2} ${p3}`)
              poly.setAttribute('fill', plotType === 'filled_triangle' ? dotColor : 'none')
              poly.setAttribute('stroke', plotType === 'filled_triangle' ? paintColor : dotColor)
              poly.setAttribute('stroke-width', '1')
              seriesGroup.appendChild(poly)
            } else if (plotType === 'diamond' || plotType === 'filled_diamond') {
              const poly = createSVGElement('polygon')
              const p1 = `${px},${py - dotSize}`
              const p2 = `${px + dotSize},${py}`
              const p3 = `${px},${py + dotSize}`
              const p4 = `${px - dotSize},${py}`
              poly.setAttribute('points', `${p1} ${p2} ${p3} ${p4}`)
              poly.setAttribute('fill', plotType === 'filled_diamond' ? dotColor : 'none')
              poly.setAttribute('stroke', plotType === 'filled_diamond' ? paintColor : dotColor)
              poly.setAttribute('stroke-width', '1')
              seriesGroup.appendChild(poly)
            }
          }
        }
      }
    }

  // Series legends are inserted manually (Insert → Insert Legend) and only
  // rendered from smpDoc.legendItems that contain %nE codes. They are no longer
  // auto-generated from the plotted datasets on import.

  // Edge and Corner drag handles aligned with plot frame box (selected plots only)
  if (isMultiSelected(svg)) {
    const hs = 10
    const addHandle = (x: number, y: number, width: number, height: number, dir: string) => {
      const r = createSVGElement('rect')
      r.setAttribute('x', String(x))
      r.setAttribute('y', String(y))
      r.setAttribute('width', String(Math.max(1, width)))
      r.setAttribute('height', String(Math.max(1, height)))
      r.setAttribute('fill', 'transparent')
      r.setAttribute('data-dir', dir)
      r.setAttribute('class', `handle handle-${dir}`)
      svg.appendChild(r)
    }

    const fx = margin.l
    const fy = margin.t
    const fw = plotW
    const fh = plotH

    // Edges on plot frame
    addHandle(fx + hs, fy - hs / 2, fw - 2 * hs, hs, 'top')
    addHandle(fx + hs, fy + fh - hs / 2, fw - 2 * hs, hs, 'bottom')
    addHandle(fx - hs / 2, fy + hs, hs, fh - 2 * hs, 'left')
    addHandle(fx + fw - hs / 2, fy + hs, hs, fh - 2 * hs, 'right')

    // Corners on plot frame
    addHandle(fx - hs / 2, fy - hs / 2, hs, hs, 'top-left')
    addHandle(fx + fw - hs / 2, fy - hs / 2, hs, hs, 'top-right')
    addHandle(fx - hs / 2, fy + fh - hs / 2, hs, hs, 'bottom-left')
    addHandle(fx + fw - hs / 2, fy + fh - hs / 2, hs, hs, 'bottom-right')

    // Visual control dots
    const ov = getPlotOverlay(svg)
    const addVisualHandle = (cx: number, cy: number) => {
      const dot = createOverlayEl('ov-dot')
      dot.style.left = `${cx - 3}px`
      dot.style.top = `${cy - 3}px`
      ov.appendChild(dot)
    }

    // 4 corners of plot frame
    addVisualHandle(fx, fy)
    addVisualHandle(fx + fw, fy)
    addVisualHandle(fx, fy + fh)
    addVisualHandle(fx + fw, fy + fh)

    // 4 edge midpoints of plot frame
    addVisualHandle(fx + fw / 2, fy)
    addVisualHandle(fx + fw / 2, fy + fh)
    addVisualHandle(fx, fy + fh / 2)
    addVisualHandle(fx + fw, fy + fh / 2)
  }

  renderDatasetTransformOverlays(
    svg,
    datasets,
    processedDatasets,
    plotW,
    plotH,
    margin,
    sx,
    sy,
    su,
    sr,
    xMin,
    xMax,
    yMin,
    yMax,
    uMin,
    uMax,
    rMin,
    rMax
  )

  syncPlotOverlay(svg)
  updateSelectionBorder(svg)
  const cb = svgCrossbarMap.get(svg)
  if (cb) {
    renderPlotCrossbar(svg, cb.xVal, cb.yVal)
  }
}

export function addDatasetToPlot(svg: SVGSVGElement, dataset: Dataset): void {
  const currentDatasets = svgDataMap.get(svg) || []
  currentDatasets.push(dataset)
  svgDataMap.set(svg, currentDatasets)

  if (!allDatasets.some((d) => d.name === dataset.name && d.filePath === dataset.filePath)) {
    allDatasets.push(dataset)
  }
  globalDataManager.addDataset(dataset)

  const w = parseFloat(svg.style.width) || svg.getBoundingClientRect().width
  const h = parseFloat(svg.style.height) || svg.getBoundingClientRect().height
  drawPlot(svg, currentDatasets, w, h)

  // Fresh "New" plots auto-fit their axis to the first dataset loaded. Once a
  // real SmpPlotDoc replaces the default (e.g. an .SMP project load), this flag
  // is already cleared, so loaded scales are never overwritten here.
  if (autoScaleSvgs.has(svg)) {
    const baseScale = svgBaseScaleMap.get(svg)
    const doc = svgSmpDocMap.get(svg)
    if (baseScale && doc) {
      doc.axisX.min = baseScale.xMin
      doc.axisX.max = baseScale.xMax
      doc.axisY.min = baseScale.yMin
      doc.axisY.max = baseScale.yMax
      updatePlotVisual(svg)
    }
    autoScaleSvgs.delete(svg)
  }
}

function datasetIdentifier(ds: Dataset): string {
  return ds.filePath || ds.fileName || `${ds.name}.txt`
}

function isSeriesLegendText(text: string): boolean {
  return /^%\d+E/.test((text || '').trim())
}

export function removeDatasetFromPlot(svg: SVGSVGElement, identifier: string): void {
  const ds = svgDataMap.get(svg) || []
  const filtered = ds.filter((d) => datasetIdentifier(d) !== identifier)
  if (filtered.length !== ds.length) {
    svgDataMap.set(svg, filtered)
    updatePlotVisual(svg)
  }
}

export function removeDatasetFromAllPlots(identifier: string): void {
  const gds = globalDataManager.getDatasets()
  const idx = gds.findIndex((d) => datasetIdentifier(d) === identifier)
  if (idx >= 0) {
    globalDataManager.removeDataset(idx)
  }

  for (let i = allDatasets.length - 1; i >= 0; i--) {
    if (datasetIdentifier(allDatasets[i]) === identifier) {
      allDatasets.splice(i, 1)
    }
  }

  for (const svg of activeSvgs) {
    const ds = svgDataMap.get(svg) || []
    const filtered = ds.filter((d) => datasetIdentifier(d) !== identifier)
    if (filtered.length !== ds.length) {
      svgDataMap.set(svg, filtered)
      updatePlotVisual(svg)
    }
  }
}

export function clearAllPlots(graphArea: HTMLElement): void {
  for (const svg of activeSvgs) {
    const overlay = svgOverlayMap.get(svg)
    if (overlay && overlay.parentElement) {
      overlay.parentElement.removeChild(overlay)
    }
    if (svg.parentElement) {
      svg.parentElement.removeChild(svg)
    }
  }

  const remaining = graphArea.querySelectorAll('.plot-svg, .plot-overlay')
  remaining.forEach((el) => el.remove())

  activeSvgs.length = 0
  allDatasets.length = 0
  globalDataManager.clearDatasets()
  setObjectSelection([])
  setSelectedPlotSvg(null)
  lastSelectedPlotSvg = null
  selectedLegendIndex = -1
  selectedAnnotationIndex = -1
  boxCount = 0
}

export async function loadSmpProject(
  graphArea: HTMLElement,
  content: string,
  fileName: string
): Promise<boolean> {
  const { smpMeta } = parseSmpContent(content, fileName)
  if (!smpMeta.docs || smpMeta.docs.length === 0) return false

  clearAllPlots(graphArea)

  for (let d = 0; d < smpMeta.docs.length; d++) {
    const doc = smpMeta.docs[d]
    const { svgLeft, svgTop, svgWidth, svgHeight } = getSvgRectForSmpDoc(doc)
    const svg = await createPlot(graphArea, svgLeft, svgTop, [], svgWidth, svgHeight)
    setPlotSmpDoc(svg, doc)
    setPlotSmpMeta(svg, smpMeta)
    for (const ds of doc.datasets) {
      addDatasetToPlot(svg, ds)
    }
    updatePlotVisual(svg)
  }

  const statusFileEl = document.querySelector<HTMLElement>('#statusFileText')
  if (statusFileEl) {
    statusFileEl.textContent = `1:${fileName}`
  }
  const statusDotEl = document.querySelector<HTMLElement>('.status-dot')
  if (statusDotEl) {
    statusDotEl.classList.remove('status-dot-idle')
  }

  const appTitleEl = document.querySelector<HTMLElement>('.app-title')
  if (appTitleEl) {
    appTitleEl.textContent = `SmaPlot - ${fileName}`
  }
  document.title = `SmaPlot - ${fileName}`

  return true
}

export function setupPlotFileDrop(svg: SVGSVGElement): void {
  svg.addEventListener('dragover', (e: DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  })

  svg.addEventListener('drop', (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return

    const graphArea = svg.parentElement || document.querySelector<HTMLElement>('.graph-area')

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const ext = file.name.toLowerCase().split('.').pop()
      if (ext === 'smp' || ext === 'sma') {
        const reader = new FileReader()
        reader.onload = async (evt) => {
          const content = evt.target?.result as string
          if (content && graphArea) {
            await loadSmpProject(graphArea, content, file.name)
            addRecentFile(file.name, content)
          }
        }
        reader.readAsText(file, 'windows-1252')
      } else if (ext === 'txt' || file.type.startsWith('text/')) {
        const reader = new FileReader()
        reader.onload = (evt) => {
          const content = evt.target?.result as string
          if (content) {
            const ds = parseDatasetContent(content, file.name)
            addDatasetToPlot(svg, ds)
          }
        }
        reader.readAsText(file, 'windows-1252')
      }
    }
  })
}



export function wirePlotInteractions(svg: SVGSVGElement): void {
  setupPlotFileDrop(svg)

  svg.addEventListener('click', (e: MouseEvent) => {
    if (isReadValueMode() || isPropertyTabMode()) return
    lastSelectedPlotSvg = svg
    if (e.target === svg || ((e.target as SVGElement).tagName === 'rect' && !(e.target as SVGElement).getAttribute('data-dir'))) {
      if (selectedLegendIndex !== -1 || selectedAnnotationIndex !== -1) {
        selectedLegendIndex = -1
        selectedAnnotationIndex = -1
        updatePlotVisual(svg)
      }
    }
  })

  svg.addEventListener('mousedown', (e: MouseEvent) => {
    if (isTrimmingMode() || isReadValueMode() || isPropertyTabMode()) return
    lastSelectedPlotSvg = svg
    const target = e.target as SVGElement
    const dir = target.getAttribute('data-dir')
    const graphArea = svg.parentElement || document.body
    if (!dir) {
      // Left-drag on the plot body: if the plot is already marquee-selected AND click is on frame border line,
      // start a group-move. Otherwise, let MarqueeSelect handle it.
      if (e.button !== 0) return
      const rect = graphArea.getBoundingClientRect()
      const zoom = getCanvasZoom()
      const gx = (e.clientX - rect.left) / zoom
      const gy = (e.clientY - rect.top) / zoom

      const left = parseFloat(svg.style.left) || 0
      const top = parseFloat(svg.style.top) || 0
      const width = parseFloat(svg.style.width) || 400
      const height = parseFloat(svg.style.height) || 300
      const l = left + PLOT_MARGIN.l
      const t = top + PLOT_MARGIN.t
      const w = Math.max(10, width - PLOT_MARGIN.l - PLOT_MARGIN.r)
      const h = Math.max(10, height - PLOT_MARGIN.t - PLOT_MARGIN.b)

      const hitBorder = hitsRectBorder(gx, gy, l, t, w, h)

      if (isMultiSelected(svg) && hitBorder) {
        e.stopPropagation()
        startGroupDrag(e.clientX, e.clientY)
      }
      // Don't stopPropagation — MarqueeSelect will start marquee selection or point hit-test
      return
    }
    setSelectedPlotSvg(svg)
    e.preventDefault()
    e.stopPropagation()

    const rect = svg.getBoundingClientRect()
    const parentRect = graphArea.getBoundingClientRect()

    const smpDoc = getPlotSmpDoc(svg)
    const margin = PLOT_MARGIN
    const curW = parseFloat(svg.style.width) || rect.width
    const curH = parseFloat(svg.style.height) || rect.height
    const startPlotW = Math.max(10, curW - margin.l - margin.r)
    const startPlotH = Math.max(10, curH - margin.t - margin.b)
    const initialItemPositions = smpDoc?.legendItems.map((item) => ({
      xPx: (item.xNorm / 10000) * startPlotW,
      yPx: (item.yNorm / 10000) * startPlotH,
      x2Px: item.x2Norm !== undefined ? (item.x2Norm / 10000) * startPlotW : undefined,
      y2Px: item.y2Norm !== undefined ? (item.y2Norm / 10000) * startPlotH : undefined,
    }))
    const initialAnnotationPositions = smpDoc?.annotationLines?.map((aLine) => {
      const useMm = aLine.x1Norm > 100 || aLine.y1Norm > 100 || aLine.x1Norm < 0 || aLine.y1Norm < 0 || aLine.shape === 'rectangle' || aLine.shape === 'rect'
      return {
        useMm,
        x1Norm: aLine.x1Norm,
        y1Norm: aLine.y1Norm,
        x2Norm: aLine.x2Norm,
        y2Norm: aLine.y2Norm,
        x1Px: useMm ? aLine.x1Norm : (aLine.x1Norm / 100) * startPlotW,
        y1Px: useMm ? aLine.y1Norm : (aLine.y1Norm / 100) * startPlotH,
        x2Px: useMm ? aLine.x2Norm : (aLine.x2Norm / 100) * startPlotW,
        y2Px: useMm ? aLine.y2Norm : (aLine.y2Norm / 100) * startPlotH,
      }
    })

    activeDrag = {
      svg,
      dir,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: parseFloat(svg.style.left) || rect.left - parentRect.left,
      startTop: parseFloat(svg.style.top) || rect.top - parentRect.top,
      startWidth: curW,
      startHeight: curH,
      initialItemPositions,
      initialAnnotationPositions,
    }
    document.body.style.userSelect = 'none'
  })
}

export async function createPlot(
  graphArea: HTMLElement,
  x: number,
  y: number,
  initialDatasets: Dataset[] = [],
  width: number = 400,
  height: number = 300
): Promise<SVGSVGElement> {
  boxCount++

  const svg = createSVGElement('svg')
  svg.setAttribute('class', 'plot-svg')
  svg.style.left = `${x}px`
  svg.style.top = `${y}px`
  svg.style.width = `${width}px`
  svg.style.height = `${height}px`

  graphArea.appendChild(svg)
  activeSvgs.push(svg)
  setObjectSelection([{ kind: 'plot', svg }])

  svgDataMap.set(svg, initialDatasets)
  setPlotSmpDoc(svg, makeDefaultPlotDoc(svg))
  autoScaleSvgs.add(svg)
  wirePlotInteractions(svg)
  drawPlot(svg, initialDatasets, width, height)

  return svg
}

function makeDefaultPlotDoc(svg: SVGSVGElement): SmpPlotDoc {
  const leftPx = parseFloat(svg.style.left) || 40
  const topPx = parseFloat(svg.style.top) || 40
  const widthPx = parseFloat(svg.style.width) || 500
  const heightPx = parseFloat(svg.style.height) || 350

  const frameLeft = leftPx + PLOT_MARGIN.l
  const frameTop = topPx + PLOT_MARGIN.t
  const frameWidth = Math.max(50, widthPx - PLOT_MARGIN.l - PLOT_MARGIN.r)
  const frameHeight = Math.max(50, heightPx - PLOT_MARGIN.t - PLOT_MARGIN.b)

  const left = Math.round(frameLeft / SMP_SCALE)
  const top = Math.round(frameTop / SMP_SCALE)
  const width = Math.round(frameWidth / SMP_SCALE)
  const height = Math.round(frameHeight / SMP_SCALE)

  const defaultAxis = (): SmpAxisSpec => ({
    min: 0,
    max: 10,
    step: 2,
    subDivs: 5,
    autoStep: true,
    showTicks: true,
    showSubTicks: true,
    showLabels: true,
    insideTicks: true,
    fontFamily: 'Times New Roman',
    fontWeight: 400,
  })

  return {
    name: 'PLOT.SMP',
    left,
    top,
    width,
    height,
    datasets: [],
    axisX: defaultAxis(),
    axisY: defaultAxis(),
    legendItems: [],
    annotationLines: [],
  }
}

export function getBoxCount(): number {
  return boxCount
}

export function getDatasets(): Dataset[] {
  return allDatasets
}

function snapToGridThreshold(val: number, step: number = 100, threshold: number = 6): number {
  const nearest = Math.round(val / step) * step
  if (Math.abs(val - nearest) <= threshold) {
    return nearest
  }
  return val
}

// Global mousemove & mouseup listeners for resize with snap to grid.
// onDragCommit is invoked after a resize/group-move finishes, letting the caller
// (e.g. undo manager) record the mutation without Plot importing it.
export function initPlotDragListeners(onDragCommit?: () => void): void {
  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (activeTransDrag) {
      const zoom = getCanvasZoom()
      const dxPx = (e.clientX - activeTransDrag.startX) / zoom
      const dyPx = (e.clientY - activeTransDrag.startY) / zoom

      const {
        svg,
        dataset,
        dir,
        xTransActive,
        yTransActive,
        startXLinear,
        startYLinear,
        rawXMin,
        rawXMax,
        rawYMin,
        rawYMax,
        startXTransMin,
        startXTransMax,
        startYTransMin,
        startYTransMax,
        xMin,
        xMax,
        yMin,
        yMax,
        plotW,
        plotH,
      } = activeTransDrag

      const deltaVx = (dxPx / plotW) * (xMax - xMin)
      const deltaVy = -(dyPx / plotH) * (yMax - yMin)

      if (!dataset.options) dataset.options = {}

      // Handle Y transformation
      if (yTransActive) {
        let newAy = startYLinear.a
        let newBy = startYLinear.b
        const isYInverted = startYLinear.a < 0

        if (dir === 'box') {
          newBy = startYLinear.b + deltaVy
        } else if (dir === 'top' || dir === 'top-left' || dir === 'top-right') {
          const rawYAnchor = isYInverted ? rawYMax : rawYMin
          const rawYMoving = isYInverted ? rawYMin : rawYMax
          const yBottom = startYTransMin
          const minSpanY = Math.max(1e-8, Math.abs(yMax - yMin) * 0.0001)
          let yMovingNew = startYTransMax + deltaVy
          if (yMovingNew < yBottom + minSpanY) yMovingNew = yBottom + minSpanY

          const rawSpan = rawYMoving - rawYAnchor
          if (Math.abs(rawSpan) > 1e-12) {
            newAy = (yMovingNew - yBottom) / rawSpan
            newBy = yBottom - newAy * rawYAnchor
          }
        } else if (dir === 'bottom' || dir === 'bottom-left' || dir === 'bottom-right') {
          const rawYAnchor = isYInverted ? rawYMin : rawYMax
          const rawYMoving = isYInverted ? rawYMax : rawYMin
          const yTop = startYTransMax
          const minSpanY = Math.max(1e-8, Math.abs(yMax - yMin) * 0.0001)
          let yMovingNew = startYTransMin + deltaVy
          if (yMovingNew > yTop - minSpanY) yMovingNew = yTop - minSpanY

          const rawSpan = rawYMoving - rawYAnchor
          if (Math.abs(rawSpan) > 1e-12) {
            newAy = (yMovingNew - yTop) / rawSpan
            newBy = yTop - newAy * rawYAnchor
          }
        }

        const formattedY = formatLinearExpr(newAy, newBy, 'y')
        dataset.options.yExpr = formattedY

        const propYInput = document.querySelector<HTMLInputElement>('#propYTransExpr')
        if (propYInput) propYInput.value = formattedY
      }

      // Handle X transformation
      if (xTransActive) {
        let newAx = startXLinear.a
        let newBx = startXLinear.b
        const isXInverted = startXLinear.a < 0

        if (dir === 'box') {
          newBx = startXLinear.b + deltaVx
        } else if (dir === 'right' || dir === 'top-right' || dir === 'bottom-right') {
          const rawXAnchor = isXInverted ? rawXMax : rawXMin
          const rawXMoving = isXInverted ? rawXMin : rawXMax
          const xLeft = startXTransMin
          const minSpanX = Math.max(1e-8, Math.abs(xMax - xMin) * 0.0001)
          let xMovingNew = startXTransMax + deltaVx
          if (xMovingNew < xLeft + minSpanX) xMovingNew = xLeft + minSpanX

          const rawSpan = rawXMoving - rawXAnchor
          if (Math.abs(rawSpan) > 1e-12) {
            newAx = (xMovingNew - xLeft) / rawSpan
            newBx = xLeft - newAx * rawXAnchor
          }
        } else if (dir === 'left' || dir === 'top-left' || dir === 'bottom-left') {
          const rawXAnchor = isXInverted ? rawXMax : rawXMin
          const rawXMoving = isXInverted ? rawXMax : rawXMin
          const xRight = startXTransMax
          const minSpanX = Math.max(1e-8, Math.abs(xMax - xMin) * 0.0001)
          let xMovingNew = startXTransMin + deltaVx
          if (xMovingNew > xRight - minSpanX) xMovingNew = xRight - minSpanX

          const rawSpan = rawXMoving - rawXAnchor
          if (Math.abs(rawSpan) > 1e-12) {
            newAx = (xMovingNew - xRight) / rawSpan
            newBx = xRight - newAx * rawXAnchor
          }
        }

        const formattedX = formatLinearExpr(newAx, newBx, 'x')
        dataset.options.xExpr = formattedX

        const propXInput = document.querySelector<HTMLInputElement>('#propXTransExpr')
        if (propXInput) propXInput.value = formattedX
      }

      updatePlotVisual(svg)
      return
    }

    if (activeGroupDrag) {
      const dragRef = activeGroupDrag
      const zoom = getCanvasZoom()
      const dx = (e.clientX - dragRef.startX) / zoom
      const dy = (e.clientY - dragRef.startY) / zoom
      const shiftKey = e.shiftKey
      const touchedSvgs = new Set<SVGSVGElement>()

      for (const item of dragRef.items) {
        if (item.kind === 'plot') {
          const snappedLeft = snapToGridThreshold(item.startLeft! + PLOT_MARGIN.l + dx, 100, 6) - PLOT_MARGIN.l
          const snappedTop = snapToGridThreshold(item.startTop! + PLOT_MARGIN.t + dy, 100, 6) - PLOT_MARGIN.t
          item.svg.style.left = `${snappedLeft}px`
          item.svg.style.top = `${snappedTop}px`
          syncPlotOverlay(item.svg)
        } else if (item.kind === 'legend') {
          const smpDoc = getPlotSmpDoc(item.svg)
          const legendItem = smpDoc?.legendItems[item.itemIdx!]
          if (!smpDoc || !legendItem) continue
          const widthPx = parseFloat(item.svg.style.width) || 500
          const heightPx = parseFloat(item.svg.style.height) || 350
          const plotW = Math.max(50, widthPx - PLOT_MARGIN.l - PLOT_MARGIN.r)
          const plotH = Math.max(50, heightPx - PLOT_MARGIN.t - PLOT_MARGIN.b)
          legendItem.xNorm = Math.round(item.startXNorm! + (dx / plotW) * 10000)
          legendItem.yNorm = Math.round(item.startYNorm! + (dy / plotH) * 10000)
          touchedSvgs.add(item.svg)
        } else if (item.kind === 'annotation') {
          const smpDoc = getPlotSmpDoc(item.svg)
          const aLine = smpDoc?.annotationLines?.[item.annotationIdx!]
          if (!smpDoc || !aLine) continue
          const widthPx = parseFloat(item.svg.style.width) || 500
          const heightPx = parseFloat(item.svg.style.height) || 350
          const plotW = Math.max(50, widthPx - PLOT_MARGIN.l - PLOT_MARGIN.r)
          const plotH = Math.max(50, heightPx - PLOT_MARGIN.t - PLOT_MARGIN.b)
          const docWidthMm = (smpDoc.width || 14000) / 100
          const docHeightMm = (smpDoc.height || 10000) / 100
          const scaleX = plotW / (docWidthMm || 140)
          const scaleY = plotH / (docHeightMm || 100)

          let dxNorm: number
          if (aLine.unitX === 'xa') {
            const xRange = (smpDoc.axisX?.max ?? 100) - (smpDoc.axisX?.min ?? 0) || 100
            dxNorm = (dx / plotW) * xRange
          } else if (aLine.unitX === 'ua') {
            const uRange = (smpDoc.axisTop?.max ?? 100) - (smpDoc.axisTop?.min ?? 0) || 100
            dxNorm = (dx / plotW) * uRange
          } else {
            dxNorm = dx / scaleX
          }

          let dyNorm: number
          if (aLine.unitY === 'ya') {
            const yRange = (smpDoc.axisY?.max ?? 100) - (smpDoc.axisY?.min ?? 0) || 100
            dyNorm = -(dy / plotH) * yRange
          } else if (aLine.unitY === 'ra') {
            const rRange = (smpDoc.axisRight?.max ?? 100) - (smpDoc.axisRight?.min ?? 0) || 100
            dyNorm = -(dy / plotH) * rRange
          } else {
            dyNorm = dy / scaleY
          }

          if (item.targetType === 'start') {
            const rawX1 = item.startX1Norm! + dxNorm
            const rawY1 = item.startY1Norm! + dyNorm
            if (shiftKey) {
              const dxPx = (rawX1 - item.startX2Norm!) * scaleX
              const dyPx = (rawY1 - item.startY2Norm!) * scaleY
              const angle = Math.atan2(dyPx, dxPx) * (180 / Math.PI)
              const snappedAngle = Math.round(angle / 90) * 90
              if (snappedAngle % 180 === 0) {
                aLine.y1Norm = item.startY2Norm!
                aLine.x1Norm = rawX1
              } else {
                aLine.x1Norm = item.startX2Norm!
                aLine.y1Norm = rawY1
              }
            } else {
              aLine.x1Norm = rawX1
              aLine.y1Norm = rawY1
            }
          } else if (item.targetType === 'end') {
            const rawX2 = item.startX2Norm! + dxNorm
            const rawY2 = item.startY2Norm! + dyNorm
            if (shiftKey) {
              const dxPx = (rawX2 - item.startX1Norm!) * scaleX
              const dyPx = (rawY2 - item.startY1Norm!) * scaleY
              const angle = Math.atan2(dyPx, dxPx) * (180 / Math.PI)
              const snappedAngle = Math.round(angle / 90) * 90
              if (snappedAngle % 180 === 0) {
                aLine.y2Norm = item.startY1Norm!
                aLine.x2Norm = rawX2
              } else {
                aLine.x2Norm = item.startX1Norm!
                aLine.y2Norm = rawY2
              }
            } else {
              aLine.x2Norm = rawX2
              aLine.y2Norm = rawY2
            }
          } else {
            aLine.x1Norm = item.startX1Norm! + dxNorm
            aLine.y1Norm = item.startY1Norm! + dyNorm
            aLine.x2Norm = item.startX2Norm! + dxNorm
            aLine.y2Norm = item.startY2Norm! + dyNorm
          }
          touchedSvgs.add(item.svg)
        }
      }

      for (const svg of touchedSvgs) {
        updatePlotVisual(svg)
      }

      // Keep the Title / Arrow dialogs in sync with the dragged object
      const firstLegend = dragRef.items.find((it) => it.kind === 'legend')
      if (firstLegend) {
        const titleOverlayEl = getCachedTitleOverlay()
        if (titleOverlayEl && titleOverlayEl.style.display !== 'none') {
          showTitleDialog(titleOverlayEl, firstLegend.itemIdx!, firstLegend.svg)
        }
      }
      const firstAnnotation = dragRef.items.find((it) => it.kind === 'annotation')
      if (firstAnnotation) {
        const arrowOverlayEl = getCachedArrowOverlay()
        if (arrowOverlayEl && arrowOverlayEl.style.display !== 'none') {
          showArrowDialog(arrowOverlayEl, firstAnnotation.annotationIdx!, firstAnnotation.svg)
        }
      }
      return
    }

    if (!activeDrag) return
    const { svg, dir, startX, startY, startLeft, startTop, startWidth, startHeight } = activeDrag
    const zoom = getCanvasZoom()
    const dx = (e.clientX - startX) / zoom
    const dy = (e.clientY - startY) / zoom
    let newLeft = startLeft
    let newTop = startTop
    let newWidth = startWidth
    let newHeight = startHeight

    const GRID_SIZE = 100 // Major grid step (100px per major grid square = 50 statusbar units)
    const SNAP_THRESHOLD = 6 // Magnetic snap threshold (only snaps when within 6px of major grid lines)
    const margin = PLOT_MARGIN
    const minPlotW = 120
    const minPlotH = 80

    const startPlotW = startWidth - margin.l - margin.r
    const startPlotH = startHeight - margin.t - margin.b

    if (dir === 'left' || dir === 'top' || dir === 'top-left') {
      // MOVE: Both X and Y axes move freely with magnetic grid snap on axis lines
      const rawLeftFrame = startLeft + margin.l + dx
      const snappedLeftFrame = snapToGridThreshold(rawLeftFrame, GRID_SIZE, SNAP_THRESHOLD)
      newLeft = snappedLeftFrame - margin.l

      const rawTopFrame = startTop + margin.t + dy
      const snappedTopFrame = snapToGridThreshold(rawTopFrame, GRID_SIZE, SNAP_THRESHOLD)
      newTop = snappedTopFrame - margin.t
    } else {
      if (dir.includes('right')) {
        const rawRight = startLeft + margin.l + startPlotW + dx
        const snappedRight = snapToGridThreshold(rawRight, GRID_SIZE, SNAP_THRESHOLD)
        const currentLeftFrame = startLeft + margin.l
        const newPlotW = Math.max(minPlotW, snappedRight - currentLeftFrame)
        newWidth = newPlotW + margin.l + margin.r
      }

      if (dir.includes('left')) {
        const rawLeftFrame = startLeft + margin.l + dx
        const snappedLeftFrame = snapToGridThreshold(rawLeftFrame, GRID_SIZE, SNAP_THRESHOLD)
        const currentRightFrame = startLeft + margin.l + startPlotW
        newLeft = snappedLeftFrame - margin.l
        const newPlotW = Math.max(minPlotW, currentRightFrame - snappedLeftFrame)
        newWidth = newPlotW + margin.l + margin.r
      }

      if (dir.includes('bottom')) {
        const rawBottom = startTop + margin.t + startPlotH + dy
        const snappedBottom = snapToGridThreshold(rawBottom, GRID_SIZE, SNAP_THRESHOLD)
        const currentTopFrame = startTop + margin.t
        const newPlotH = Math.max(minPlotH, snappedBottom - currentTopFrame)
        newHeight = newPlotH + margin.t + margin.b
      }

      if (dir.includes('top')) {
        const rawTopFrame = startTop + margin.t + dy
        const snappedTopFrame = snapToGridThreshold(rawTopFrame, GRID_SIZE, SNAP_THRESHOLD)
        const currentBottomFrame = startTop + margin.t + startPlotH
        newTop = snappedTopFrame - margin.t
        const newPlotH = Math.max(minPlotH, currentBottomFrame - snappedTopFrame)
        newHeight = newPlotH + margin.t + margin.b
      }
    }

    svg.style.left = `${newLeft}px`
    svg.style.top = `${newTop}px`
    svg.style.width = `${newWidth}px`
    svg.style.height = `${newHeight}px`
    syncPlotOverlay(svg)

    if (rafId) cancelAnimationFrame(rafId)
    const currentDrag = activeDrag
    rafId = requestAnimationFrame(() => {
      if (!currentDrag) return
      const ds = svgDataMap.get(currentDrag.svg)
      const smpDoc = getPlotSmpDoc(currentDrag.svg)

      const newPlotW = Math.max(10, newWidth - margin.l - margin.r)
      const newPlotH = Math.max(10, newHeight - margin.t - margin.b)

      if (smpDoc && currentDrag.initialItemPositions && smpDoc.legendItems) {
        smpDoc.legendItems.forEach((item, idx) => {
          const initPos = currentDrag.initialItemPositions?.[idx]
          if (initPos) {
            item.xNorm = Math.round((initPos.xPx / newPlotW) * 10000)
            item.yNorm = Math.round((initPos.yPx / newPlotH) * 10000)
            if (item.x2Norm !== undefined && initPos.x2Px !== undefined) {
              item.x2Norm = Math.round((initPos.x2Px / newPlotW) * 10000)
            }
            if (item.y2Norm !== undefined && initPos.y2Px !== undefined) {
              item.y2Norm = Math.round((initPos.y2Px / newPlotH) * 10000)
            }
          }
        })
      }

      if (smpDoc && currentDrag.initialAnnotationPositions && smpDoc.annotationLines) {
        smpDoc.annotationLines.forEach((aLine, idx) => {
          const initPos = currentDrag.initialAnnotationPositions?.[idx]
          if (initPos) {
            if (initPos.useMm && initPos.x1Norm !== undefined && initPos.y1Norm !== undefined && initPos.x2Norm !== undefined && initPos.y2Norm !== undefined) {
              aLine.x1Norm = initPos.x1Norm
              aLine.y1Norm = initPos.y1Norm
              aLine.x2Norm = initPos.x2Norm
              aLine.y2Norm = initPos.y2Norm
            } else {
              aLine.x1Norm = (initPos.x1Px / newPlotW) * 100
              aLine.y1Norm = (initPos.y1Px / newPlotH) * 100
              aLine.x2Norm = (initPos.x2Px / newPlotW) * 100
              aLine.y2Norm = (initPos.y2Px / newPlotH) * 100
            }
          }
        })
      }

      if (ds) drawPlot(currentDrag.svg, ds, newWidth, newHeight)
      rafId = null
    })
  })

  document.addEventListener('mouseup', () => {
    let wasDragging = false
    if (activeTransDrag) {
      activeTransDrag = null
      document.body.style.userSelect = ''
      wasDragging = true
    }

    if (activeGroupDrag) {
      activeGroupDrag = null
      document.body.style.userSelect = ''
      wasDragging = true
    }

    if (activeDrag) {
      const { svg } = activeDrag
      activeDrag = null
      document.body.style.userSelect = ''
      const ds = svgDataMap.get(svg)
      if (ds) {
        const w = parseFloat(svg.style.width) || svg.getBoundingClientRect().width
        const h = parseFloat(svg.style.height) || svg.getBoundingClientRect().height
        drawPlot(svg, ds, w, h)
      }
      wasDragging = true
    }

    if (wasDragging) {
      onDragCommit?.()
    }
  })
}
