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

  const rect = svg.getBoundingClientRect()
  const zoom = getCanvasZoom()
  const gx = (clientX - rect.left) / zoom
  const gy = (clientY - rect.top) / zoom
  const threshold = 6 / zoom

  for (let idx = 0; idx < datasets.length; idx++) {
    const ds = datasets[idx]
    const opts = ds.options || {}
    if (opts.show === false) continue
    const px = ds.x
    const py = ds.y
    for (let i = 1; i < px.length; i++) {
      if (distToSeg(gx, gy, sx(px[i - 1]), sy(py[i - 1]), sx(px[i]), sy(py[i])) <= threshold) return rawDatasets[idx]
    }
    const ptR = (opts.size || 3) / zoom + threshold
    for (let i = 0; i < px.length; i++) {
      if (Math.hypot(gx - sx(px[i]), gy - sy(py[i])) <= ptR) return rawDatasets[idx]
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
//  - border frame stroke (±5px around the 4 edges of the plot box)
//  - bottom margin (X-axis labels/ticks area, below bottom edge)
//  - left margin (Y-axis labels/ticks area, left of left edge)
// Returns 'x', 'y', or null.
export function hitTestAxisArea(svg: SVGSVGElement, clientX: number, clientY: number): 'x' | 'y' | null {
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

  // Inside the plot box (not axis area)
  const insideX = gx > frameL + tol && gx < frameR - tol

  // On or near the frame border strokes
  const onLeftEdge = gx >= frameL - tol && gx <= frameL + tol && gy >= frameT - tol && gy <= frameB + tol
  const onRightEdge = gx >= frameR - tol && gx <= frameR + tol && gy >= frameT - tol && gy <= frameB + tol
  const onTopEdge = gy >= frameT - tol && gy <= frameT + tol && gx >= frameL - tol && gx <= frameR + tol
  const onBottomEdge = gy >= frameB - tol && gy <= frameB + tol && gx >= frameL - tol && gx <= frameR + tol

  // Bottom margin zone (X labels/ticks below box, top margin above box)
  const inXMarginBottom = gy > frameB + tol && gy <= h && gx >= frameL && gx <= frameR
  const inXMarginTop = gy < frameT - tol && gy >= 0 && gx >= frameL && gx <= frameR

  // Left margin zone (Y labels/ticks left of box), right margin (right of box)
  const inYMarginLeft = gx < frameL - tol && gx >= 0 && gy >= frameT && gy <= frameB
  const inYMarginRight = gx > frameR + tol && gx <= w && gy >= frameT && gy <= frameB

  if (inXMarginBottom || inXMarginTop || onBottomEdge || onTopEdge) {
    // bottom/top edges and margins → X axis
    if (onBottomEdge || onTopEdge || inXMarginBottom || inXMarginTop) return 'x'
  }
  if (inYMarginLeft || inYMarginRight || onLeftEdge || onRightEdge) {
    if (insideX && (onTopEdge || onBottomEdge)) return 'x' // horizontal edges take priority inside
    return 'y'
  }

  // On the border frame itself (corner hits etc.)
  if (onLeftEdge || onRightEdge) return 'y'
  if (onTopEdge || onBottomEdge) return 'x'

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
    sourceX = ds.x
    sourceY = ds.y

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

  return {
    name: existingDoc?.name || defaultName,
    left,
    top,
    width,
    height,
    datasets,
    axisX,
    axisY,
    axisTop: existingDoc?.axisTop,
    axisRight: existingDoc?.axisRight,
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

export function getSelectedPlotSvg(): SVGSVGElement | null {
  if (selectedPlotSvg && document.body.contains(selectedPlotSvg)) {
    return selectedPlotSvg
  }
  return activeSvgs[0] || null
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
      const docWidthMm = (smpDoc?.width || 14000) / 100
      const docHeightMm = (smpDoc?.height || 10000) / 100
      const scaleX = plotW / (docWidthMm || 140)
      const scaleY = plotH / (docHeightMm || 100)

      let x1: number, y1: number, x2: number, y2: number
      if (aLine.x1Norm > 100 || aLine.y1Norm > 100 || aLine.x1Norm < 0 || aLine.y1Norm < 0 || aLine.shape === 'rectangle' || aLine.shape === 'rect') {
        x1 = left + PLOT_MARGIN.l + aLine.x1Norm * scaleX
        y1 = top + PLOT_MARGIN.t + aLine.y1Norm * scaleY
        x2 = left + PLOT_MARGIN.l + aLine.x2Norm * scaleX
        y2 = top + PLOT_MARGIN.t + aLine.y2Norm * scaleY
      } else {
        x1 = left + PLOT_MARGIN.l + (aLine.x1Norm / 100) * plotW
        y1 = top + PLOT_MARGIN.t + (aLine.y1Norm / 100) * plotH
        x2 = left + PLOT_MARGIN.l + (aLine.x2Norm / 100) * plotW
        y2 = top + PLOT_MARGIN.t + (aLine.y2Norm / 100) * plotH
      }
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

export function clearPlotScale(target: 'all' | 'x' | 'y' = 'all'): void {
  for (const svg of activeSvgs) {
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
      }
      if (target === 'all' || target === 'y') {
        const reversed = doc.axisY.min > doc.axisY.max
        doc.axisY.min = reversed ? yMax : yMin
        doc.axisY.max = reversed ? yMin : yMax
        doc.axisY.autoStep = true
        const autoY = computeAutoStep(yMin, yMax)
        doc.axisY.step = autoY.increment
        doc.axisY.subDivs = autoY.division
      }
    }

    const existing = svgBaseScaleMap.get(svg) || { xMin, xMax, yMin, yMax }
    if (target === 'all') {
      svgBaseScaleMap.set(svg, { xMin, xMax, yMin, yMax })
    } else if (target === 'x') {
      svgBaseScaleMap.set(svg, { ...existing, xMin, xMax })
    } else if (target === 'y') {
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

  // Outer plot frame
  const frame = createSVGElement('rect')
  frame.setAttribute('x', String(margin.l))
  frame.setAttribute('y', String(margin.t))
  frame.setAttribute('width', String(plotW))
  frame.setAttribute('height', String(plotH))
  frame.setAttribute('fill', 'none')
  frame.setAttribute('stroke', '#000000')
  frame.setAttribute('stroke-width', '1')
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
  // 4-AXIS INSIDE TICKS & MINOR SUB-TICKS ENGINE
  // ----------------------------------------------------
  const subDivsX = autoSubDivsX !== null ? autoSubDivsX : smpDoc?.axisX.subDivs || 5
  const subDivsY = autoSubDivsY !== null ? autoSubDivsY : smpDoc?.axisY.subDivs || 5

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

  const xMajorTicks = getMajorTicks(xMin, xMax, xStep)
  const xMinorTicks = getMinorTicks(xMin, xMax, xStep, subDivsX, xMajorTicks)

  const yMajorTicks = getMajorTicks(yMin, yMax, yStep)
  const yMinorTicks = getMinorTicks(yMin, yMax, yStep, subDivsY, yMajorTicks)

  // X ticks (Bottom AXIS-0 & Top AXIS-2)
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
  const xMajW = Math.max(1, (smpDoc?.axisX.majorWidth ?? 1) * 1.5)
  const xMajColor = smpDoc?.axisX.majorColor || '#000000'
  const xMajStyle = smpDoc?.axisX.majorStyle || 'solid'

  const xMinIn = smpDoc?.axisX.minorIn ?? (smpDoc?.axisX.insideTicks !== false)
  const xMinOut = smpDoc?.axisX.minorOut ?? false
  const xMinLen = smpDoc?.axisX.minorLength ?? 3
  const xMinW = Math.max(1, (smpDoc?.axisX.minorWidth ?? 1) * 1.5)
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
      if (px >= margin.l - 1 && px <= margin.l + plotW + 1) {
        const bYStart = xMajOut ? bottomY + xMajLen : bottomY
        const bYEnd = xMajIn ? bottomY - xMajLen : bottomY
        const tYStart = xMajOut ? topY - xMajLen : topY
        const tYEnd = xMajIn ? topY + xMajLen : topY
        xTickPathD += `M${px} ${bYStart}V${bYEnd}M${px} ${tYStart}V${tYEnd}`
      }
    })

    xMinorTicks.forEach((v) => {
      const px = sx(v)
      if (px >= margin.l && px <= margin.l + plotW) {
        const bYStart = xMinOut ? bottomY + xMinLen : bottomY
        const bYEnd = xMinIn ? bottomY - xMinLen : bottomY
        const tYStart = xMinOut ? topY - xMinLen : topY
        const tYEnd = xMinIn ? topY + xMinLen : topY
        xSubTickPathD += `M${px} ${bYStart}V${bYEnd}M${px} ${tYStart}V${tYEnd}`
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

  // Y ticks (Left AXIS-1 & Right AXIS-3)
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
  const yMajLen = smpDoc?.axisY.majorLength ?? 3
  const yMajW = Math.max(1, (smpDoc?.axisY.majorWidth ?? 1) * 1.5)
  const yMajColor = smpDoc?.axisY.majorColor || '#000000'
  const yMajStyle = smpDoc?.axisY.majorStyle || 'solid'

  const yMinIn = smpDoc?.axisY.minorIn ?? (smpDoc?.axisY.insideTicks !== false)
  const yMinOut = smpDoc?.axisY.minorOut ?? false
  const yMinLen = smpDoc?.axisY.minorLength ?? 1.5
  const yMinW = Math.max(1, (smpDoc?.axisY.minorWidth ?? 1) * 1.5)
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
      if (py >= margin.t - 1 && py <= margin.t + plotH + 1) {
        const lXStart = yMajOut ? leftX - yMajLen : leftX
        const lXEnd = yMajIn ? leftX + yMajLen : leftX
        const rXStart = yMajOut ? rightX + yMajLen : rightX
        const rXEnd = yMajIn ? rightX - yMajLen : rightX
        yTickPathD += `M${lXStart} ${py}H${lXEnd}M${rXStart} ${py}H${rXEnd}`
      }
    })

    yMinorTicks.forEach((v) => {
      const py = sy(v)
      if (py >= margin.t && py <= margin.t + plotH) {
        const lXStart = yMinOut ? leftX - yMinLen : leftX
        const lXEnd = yMinIn ? leftX + yMinLen : leftX
        const rXStart = yMinOut ? rightX + yMinLen : rightX
        const rXEnd = yMinIn ? rightX - yMinLen : rightX
        ySubTickPathD += `M${lXStart} ${py}H${lXEnd}M${rXStart} ${py}H${rXEnd}`
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

  // ----------------------------------------------------
  // ANNOTATION LINES & RECTANGLES (Page mm Coordinates)
  // ----------------------------------------------------
  const docWidthMm = (smpDoc?.width || 14000) / 100
  const docHeightMm = (smpDoc?.height || 10000) / 100
  const scaleX = plotW / (docWidthMm || 140)
  const scaleY = plotH / (docHeightMm || 100)

  const annotationLines = smpDoc?.annotationLines || []
  annotationLines.forEach((aLine, aIdx) => {
    let x1: number, y1: number, x2: number, y2: number
    const useMm = aLine.x1Norm > 100 || aLine.y1Norm > 100 || aLine.x1Norm < 0 || aLine.y1Norm < 0 || aLine.shape === 'rectangle' || aLine.shape === 'rect'

    if (useMm) {
      x1 = margin.l + aLine.x1Norm * scaleX
      y1 = margin.t + aLine.y1Norm * scaleY
      x2 = margin.l + aLine.x2Norm * scaleX
      y2 = margin.t + aLine.y2Norm * scaleY
    } else {
      x1 = margin.l + (aLine.x1Norm / 100) * plotW
      y1 = margin.t + (aLine.y1Norm / 100) * plotH
      x2 = margin.l + (aLine.x2Norm / 100) * plotW
      y2 = margin.t + (aLine.y2Norm / 100) * plotH
    }

    const isSelected = isObjectSelected({ kind: 'annotation', svg, annotationIdx: aIdx })

    const handleMouseDown = (targetType: 'start' | 'end' | 'line') => (e: MouseEvent) => {
      if (e.button !== 0) return
      if (isTrimmingMode()) return
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

    const isRect = aLine.shape === 'rectangle' || aLine.shape === 'rect'

    if (isRect) {
      const rx1 = Math.min(x1, x2)
      const ry1 = Math.min(y1, y2)
      const rw = Math.max(1, Math.abs(x2 - x1))
      const rh = Math.max(1, Math.abs(y2 - y1))

      const shadeDepth = aLine.shadeDepth ?? 0
      if (shadeDepth > 0) {
        const shadePx = useMm ? shadeDepth * scaleX : (shadeDepth / 100) * plotW
        const shadowElem = createSVGElement('rect')
        shadowElem.setAttribute('x', String(rx1 + shadePx))
        shadowElem.setAttribute('y', String(ry1 + shadePx))
        shadowElem.setAttribute('width', String(rw))
        shadowElem.setAttribute('height', String(rh))
        if (aLine.roundX) {
          const rxPx = useMm ? aLine.roundX * scaleX : (aLine.roundX / 100) * plotW
          shadowElem.setAttribute('rx', String(rxPx))
        }
        if (aLine.roundY) {
          const ryPx = useMm ? aLine.roundY * scaleY : (aLine.roundY / 100) * plotH
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
        const rxPx = useMm ? aLine.roundX * scaleX : (aLine.roundX / 100) * plotW
        rectElem.setAttribute('rx', String(rxPx))
      }
      if (aLine.roundY) {
        const ryPx = useMm ? aLine.roundY * scaleY : (aLine.roundY / 100) * plotH
        rectElem.setAttribute('ry', String(ryPx))
      }
      rectElem.setAttribute('fill', aLine.faceColor && aLine.faceColor !== 'none' ? aLine.faceColor : 'transparent')
      rectElem.setAttribute('stroke', aLine.shadeColor || aLine.color || '#000000')
      rectElem.setAttribute('stroke-width', String(aLine.thickness || aLine.width || 0.4))
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
      const l = createSVGElement('line')
      l.setAttribute('x1', String(x1))
      l.setAttribute('y1', String(y1))
      l.setAttribute('x2', String(x2))
      l.setAttribute('y2', String(y2))
      l.setAttribute('stroke', aLine.color || '#000000')
      l.setAttribute('stroke-width', String(aLine.width || 1))
      if (aLine.style === 'dashed') {
        l.setAttribute('stroke-dasharray', '4 4')
      }
      l.style.cursor = 'pointer'
      l.addEventListener('mousedown', handleMouseDown('line'))
      l.addEventListener('dblclick', (e: MouseEvent) => {
        e.stopPropagation()
        setSelectedPlotSvg(svg)
        selectedAnnotationIndex = aIdx
        selectedLegendIndex = -1
        updatePlotVisual(svg)
        const arrowOverlayEl = document.querySelector<HTMLElement>('#arrowOverlay')
        if (arrowOverlayEl) {
          showArrowDialog(arrowOverlayEl, aIdx, svg)
        }
      })
      svg.appendChild(l)
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
        if (isTrimmingMode()) return
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
          legLine.setAttribute('stroke-width', String(ds?.options?.width || 1))

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

          // Draw legend text next to icon (foreignObject + renderSmpTextToHtml so
          // ^...@ superscripts, _...@ subscripts, %I/%K styles and symbol codes render)
          const legStr = renderSmpTextToHtml(labelText)
          const legFontSz = 10
          const legCorrection = Math.max(1, Math.round(legFontSz * 0.15))
          const legFo = createSVGElement('foreignObject')
          legFo.setAttribute('x', String(renderPx + 22))
          legFo.setAttribute('y', String(legY + 3.5 - legFontSz - legCorrection))
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
        // The HTML line box adds a small amount of leading above the glyphs.
        // Keep the SMP anchor and selection box unchanged, but lift the
        // foreignObject so the rendered text sits inside that box correctly.
        const textVerticalCorrection = Math.max(1, Math.round(fontSz * 0.15))

        const fo = createSVGElement('foreignObject')
        fo.setAttribute('x', String(renderPx))
        fo.setAttribute('y', String(py - fontSz - textVerticalCorrection))
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
        container.style.userSelect = 'none'
        container.style.cursor = isSelected ? 'move' : 'pointer'

        if (item.align === 'center') container.style.textAlign = 'center'
        else if (item.align === 'right') container.style.textAlign = 'right'
        else container.style.textAlign = 'left'

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
          let boxY = py - fontSz - 2

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

    const strokeColor = opts.lineColor || ds.color
    const strokeWidth = String(opts.width || 1)
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
        const zeroY = sy(0)
        for (let i = 0; i < ds.x.length; i++) {
          const px = sx(ds.x[i])
          const py = sy(ds.y[i])
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
            points.push(`${sx(ds.x[i]).toFixed(1)},${sy(ds.y[i]).toFixed(1)}`)
          }

          if (lineType === 'face') {
            // Fill area below line down to Y = 0 baseline
            const zeroY = sy(0).toFixed(1)
            const firstX = sx(ds.x[0]).toFixed(1)
            const lastX = sx(ds.x[ds.x.length - 1]).toFixed(1)

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
            const px = sx(ds.x[i])
            const py = sy(ds.y[i])

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
    if (e.target === svg || ((e.target as SVGElement).tagName === 'rect' && !(e.target as SVGElement).getAttribute('data-dir'))) {
      if (selectedLegendIndex !== -1 || selectedAnnotationIndex !== -1) {
        selectedLegendIndex = -1
        selectedAnnotationIndex = -1
        updatePlotVisual(svg)
      }
    }
  })

  svg.addEventListener('mousedown', (e: MouseEvent) => {
    if (isTrimmingMode()) return
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

          const useMm = aLine.x1Norm > 100 || aLine.y1Norm > 100 || aLine.x1Norm < 0 || aLine.y1Norm < 0 || aLine.shape === 'rectangle' || aLine.shape === 'rect'
          const dxNorm = useMm ? dx / scaleX : (dx / plotW) * 100
          const dyNorm = useMm ? dy / scaleY : (dy / plotH) * 100

          if (item.targetType === 'start') {
            const rawX1 = item.startX1Norm! + dxNorm
            const rawY1 = item.startY1Norm! + dyNorm
            if (shiftKey) {
              const dxPx = ((rawX1 - item.startX2Norm!) / 100) * plotW
              const dyPx = ((rawY1 - item.startY2Norm!) / 100) * plotH
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
              const dxPx = ((rawX2 - item.startX1Norm!) / 100) * plotW
              const dyPx = ((rawY2 - item.startY1Norm!) / 100) * plotH
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
