import type { ActiveDrag, Dataset, SmpAxisSpec, SmpMetadata, SmpPlotDoc } from '../types.ts'
import { evaluateMathExpr, parseDatasetContent } from '../utils/dataset.ts'
import { parseSmpContent } from '../utils/smpParser.ts'
import { formatTick, niceScale } from '../utils/scale.ts'
import { globalDataManager } from './DataManager.ts'
import { getCanvasZoom } from '../utils/canvasZoom.ts'
import { showTitleDialog } from './TitleDialog.ts'
import { showArrowDialog } from './ArrowDialog.ts'

const SVG_NS = 'http://www.w3.org/2000/svg'

function createSVGElement<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K]
}

export const PLOT_MARGIN = { l: 65, r: 25, t: 25, b: 55 }

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

const svgDataMap = new WeakMap<SVGSVGElement, Dataset[]>()
const svgSmpMetaMap = new WeakMap<SVGSVGElement, SmpMetadata>()
const svgSmpDocMap = new WeakMap<SVGSVGElement, SmpPlotDoc>()
const svgBaseScaleMap = new WeakMap<
  SVGSVGElement,
  { xMin: number; xMax: number; yMin: number; yMax: number }
>()
const svgOverlayMap = new WeakMap<SVGSVGElement, HTMLDivElement>()
let activeDrag: ActiveDrag | null = null
let selectedPlotSvg: SVGSVGElement | null = null
let rafId: number | null = null
let legendDragRafId: number | null = null
let annotationDragRafId: number | null = null
let boxCount = 0

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

// Cache of the last measured legend text bounding box (relative to its anchor).
// getBBox() forces a synchronous SVG layout, and the selected legend item is
// re-measured on every drag frame even though its text metrics never change.
let legendBoxMeasured: { key: string; dx: number; dy: number; w: number; h: number } | null = null

function getPlotOverlay(svg: SVGSVGElement): HTMLDivElement {
  let overlay = svgOverlayMap.get(svg)
  if (!overlay) {
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

function getProcessedDataset(ds: Dataset): Dataset {
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

interface ActiveLegendItemDrag {
  svg: SVGSVGElement
  itemIdx: number
  startX: number
  startY: number
  startXNorm: number
  startYNorm: number
}
let activeLegendItemDrag: ActiveLegendItemDrag | null = null
let selectedLegendIndex: number = -1

interface ActiveAnnotationDrag {
  svg: SVGSVGElement
  annotationIdx: number
  targetType: 'start' | 'end' | 'line'
  startX: number
  startY: number
  startX1Norm: number
  startY1Norm: number
  startX2Norm: number
  startY2Norm: number
}
let activeAnnotationDrag: ActiveAnnotationDrag | null = null
let selectedAnnotationIndex: number = -1

const allDatasets: Dataset[] = []
const activeSvgs: SVGSVGElement[] = []

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
}

export function getPlotSmpDoc(svg: SVGSVGElement): SmpPlotDoc | undefined {
  return svgSmpDocMap.get(svg)
}

export function getPlotDatasets(svg: SVGSVGElement): Dataset[] {
  return svgDataMap.get(svg) || []
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
  if (prev) updatePlotVisual(prev)
  if (svg) updatePlotVisual(svg)
}

export function getSelectedPlotSvg(): SVGSVGElement | null {
  return selectedPlotSvg
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
    recalculateBaseScale(svg, target)
    const ds = svgDataMap.get(svg) || []
    const w = parseFloat(svg.style.width) || svg.getBoundingClientRect().width
    const h = parseFloat(svg.style.height) || svg.getBoundingClientRect().height
    drawPlot(svg, ds, w, h)
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

  const isReversedX = xMin > xMax
  const xScale = isReversedX ? { min: xMin, max: xMax, step: smpDoc?.axisX.step || smpMeta?.xStep || -1000 } : niceScale(xMin, xMax, 6)
  const yScale = niceScale(yMin, yMax, 5)

  const sx = (v: number) => margin.l + ((v - xScale.min) / (xScale.max - xScale.min)) * plotW
  const sy = (v: number) => margin.t + plotH - ((v - yScale.min) / (yScale.max - yScale.min)) * plotH

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
  const subDivsX = smpDoc?.axisX.subDivs || 5
  const subDivsY = smpDoc?.axisY.subDivs || 5

  // X ticks (Bottom AXIS-0 & Top AXIS-2)
  const xMajorTicks: number[] = []
  const xStep = Math.abs(xScale.step)
  if (isReversedX) {
    const startTick = Math.floor(xMin / xStep) * xStep
    const endTick = Math.ceil(xMax / xStep) * xStep
    for (let v = startTick; v >= endTick; v -= xStep) {
      xMajorTicks.push(v)
    }
  } else {
    for (let v = xScale.min; v <= xScale.max + xStep * 0.5; v += xStep) {
      xMajorTicks.push(v)
    }
  }

  // Draw X Major & Minor ticks (batched into single path elements)
  let xTickPathD = ''
  let xSubTickPathD = ''
  const xLabelFrag = document.createDocumentFragment()
  const xFontFamily = smpDoc?.axisX.fontFamily || 'Inter, system-ui, sans-serif'
  const showXLabels = smpDoc?.axisX.showLabels !== false
  const bottomY = margin.t + plotH
  const topY = margin.t

  for (let i = 0; i < xMajorTicks.length; i++) {
    const v = xMajorTicks[i]
    const px = sx(v)

    if (px >= margin.l - 2 && px <= margin.l + plotW + 2) {
      // Bottom + Top Major Ticks
      xTickPathD += `M${px} ${bottomY}V${bottomY - 6}M${px} ${topY}V${topY + 6}`

      // X Label
      if (showXLabels) {
        const label = createSVGElement('text')
        label.setAttribute('x', String(px))
        label.setAttribute('y', String(bottomY + 18))
        label.setAttribute('text-anchor', 'middle')
        label.setAttribute('font-size', '11')
        label.setAttribute('font-family', xFontFamily)
        label.setAttribute('fill', '#1e293b')
        label.textContent = formatTick(v)
        xLabelFrag.appendChild(label)
      }
    }

    // Minor Sub-ticks
    if (i < xMajorTicks.length - 1) {
      const vNext = xMajorTicks[i + 1]
      const subStep = (vNext - v) / subDivsX
      for (let s = 1; s < subDivsX; s++) {
        const subPx = sx(v + subStep * s)
        if (subPx >= margin.l && subPx <= margin.l + plotW) {
          xSubTickPathD += `M${subPx} ${bottomY}V${bottomY - 3}M${subPx} ${topY}V${topY + 3}`
        }
      }
    }
  }

  if (xTickPathD) {
    const xTickPath = createSVGElement('path')
    xTickPath.setAttribute('d', xTickPathD)
    xTickPath.setAttribute('stroke', '#000000')
    xTickPath.setAttribute('stroke-width', '1')
    xTickPath.setAttribute('fill', 'none')
    svg.appendChild(xTickPath)
  }
  if (xSubTickPathD) {
    const xSubTickPath = createSVGElement('path')
    xSubTickPath.setAttribute('d', xSubTickPathD)
    xSubTickPath.setAttribute('stroke', '#000000')
    xSubTickPath.setAttribute('stroke-width', '1')
    xSubTickPath.setAttribute('fill', 'none')
    svg.appendChild(xSubTickPath)
  }
  svg.appendChild(xLabelFrag)

  // Y ticks (Left AXIS-1 & Right AXIS-3 — batched into single path elements)
  const yMajorTicks: number[] = []
  const yStep = Math.abs(yScale.step)
  for (let v = yScale.min; v <= yScale.max + yStep * 0.5; v += yStep) {
    yMajorTicks.push(v)
  }

  let yTickPathD = ''
  let ySubTickPathD = ''
  const yLabelFrag = document.createDocumentFragment()
  const yFontFamily = smpDoc?.axisY.fontFamily || 'Inter, system-ui, sans-serif'
  const showYLabels = smpDoc?.axisY.showLabels !== false
  const leftX = margin.l
  const rightX = margin.l + plotW

  for (let i = 0; i < yMajorTicks.length; i++) {
    const v = yMajorTicks[i]
    const py = sy(v)

    if (py >= margin.t - 2 && py <= margin.t + plotH + 2) {
      // Left + Right Major Ticks
      yTickPathD += `M${leftX} ${py}H${leftX + 6}M${rightX} ${py}H${rightX - 6}`

      // Y Label
      if (showYLabels) {
        const label = createSVGElement('text')
        label.setAttribute('x', String(leftX - 8))
        label.setAttribute('y', String(py + 4))
        label.setAttribute('text-anchor', 'end')
        label.setAttribute('font-size', '11')
        label.setAttribute('font-family', yFontFamily)
        label.setAttribute('fill', '#1e293b')
        label.textContent = formatTick(v)
        yLabelFrag.appendChild(label)
      }
    }

    // Minor Sub-ticks
    if (i < yMajorTicks.length - 1) {
      const vNext = yMajorTicks[i + 1]
      const subStep = (vNext - v) / subDivsY
      for (let s = 1; s < subDivsY; s++) {
        const subPy = sy(v + subStep * s)
        if (subPy >= margin.t && subPy <= margin.t + plotH) {
          ySubTickPathD += `M${leftX} ${subPy}H${leftX + 3}M${rightX} ${subPy}H${rightX - 3}`
        }
      }
    }
  }

  if (yTickPathD) {
    const yTickPath = createSVGElement('path')
    yTickPath.setAttribute('d', yTickPathD)
    yTickPath.setAttribute('stroke', '#000000')
    yTickPath.setAttribute('stroke-width', '1')
    yTickPath.setAttribute('fill', 'none')
    svg.appendChild(yTickPath)
  }
  if (ySubTickPathD) {
    const ySubTickPath = createSVGElement('path')
    ySubTickPath.setAttribute('d', ySubTickPathD)
    ySubTickPath.setAttribute('stroke', '#000000')
    ySubTickPath.setAttribute('stroke-width', '1')
    ySubTickPath.setAttribute('fill', 'none')
    svg.appendChild(ySubTickPath)
  }
  svg.appendChild(yLabelFrag)

  // ----------------------------------------------------
  // ANNOTATION LINES (Normalized Coordinates)
  // ----------------------------------------------------
  const annotationLines = smpDoc?.annotationLines || []
  annotationLines.forEach((aLine, aIdx) => {
    const x1 = margin.l + (aLine.x1Norm / 100) * plotW
    const y1 = margin.t + (aLine.y1Norm / 100) * plotH
    const x2 = margin.l + (aLine.x2Norm / 100) * plotW
    const y2 = margin.t + (aLine.y2Norm / 100) * plotH

    const isSelected = selectedAnnotationIndex === aIdx && svg === getSelectedPlotSvg()

    const handleMouseDown = (targetType: 'start' | 'end' | 'line') => (e: MouseEvent) => {
      if (e.button !== 0) return
      e.stopPropagation()
      setSelectedPlotSvg(svg)
      if (selectedAnnotationIndex === aIdx && targetType === 'line') {
        selectedAnnotationIndex = -1
        updatePlotVisual(svg)
        return
      }
      selectedAnnotationIndex = aIdx
      selectedLegendIndex = -1
      updatePlotVisual(svg)

      activeAnnotationDrag = {
        svg,
        annotationIdx: aIdx,
        targetType,
        startX: e.clientX,
        startY: e.clientY,
        startX1Norm: aLine.x1Norm,
        startY1Norm: aLine.y1Norm,
        startX2Norm: aLine.x2Norm,
        startY2Norm: aLine.y2Norm,
      }
    }

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
    // Annotations render outside the clipped series group so they are never
    // cut off by the plot frame, and keep their on-page position when the
    // frame is resized (same behavior as legend text items).
    svg.appendChild(l)

    if (isSelected) {
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
      handle1.style.left = `${x1 - 3}px`
      handle1.style.top = `${y1 - 3}px`
      handle1.addEventListener('mousedown', handleMouseDown('start'))
      ov.appendChild(handle1)

      const handle2 = createOverlayEl('ov-handle')
      handle2.style.left = `${x2 - 3}px`
      handle2.style.top = `${y2 - 3}px`
      handle2.addEventListener('mousedown', handleMouseDown('end'))
      ov.appendChild(handle2)
    }
  })

  // ----------------------------------------------------
  // LEGEND ITEMS & ANNOTATIONS (10000ths Normalized Coordinates)
  // ----------------------------------------------------
  if (smpDoc && smpDoc.legendItems.length === 0) {
    const xLbl = smpMeta?.xLabel || smpDoc?.xLabel
    const yLbl = smpMeta?.yLabel || smpDoc?.yLabel
    if (xLbl) {
      smpDoc.legendItems.push({
        type: 'text',
        text: xLbl,
        rawText: xLbl,
        xNorm: 2400,
        yNorm: 11400,
        rotation: 0,
        fontFamily: 'cambria',
        fontSize: 12,
        fontWeight: 400,
      })
    }
    if (yLbl) {
      smpDoc.legendItems.push({
        type: 'text',
        text: yLbl,
        rawText: yLbl,
        xNorm: -400,
        yNorm: 3000,
        rotation: -90,
        fontFamily: 'cambria',
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
      const isYAxisLabel = isRotated && item.xNorm < 0
      const py = isYAxisLabel
        ? margin.t + plotH / 2
        : margin.t + (item.yNorm / 10000) * plotH

      const isSelected = selectedLegendIndex === itemIdx && svg === getSelectedPlotSvg()

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
        e.stopPropagation()
        setSelectedPlotSvg(svg)
        if (selectedLegendIndex === itemIdx) {
          selectedLegendIndex = -1
          selectedAnnotationIndex = -1
          updatePlotVisual(svg)
          return
        }
        selectedLegendIndex = itemIdx
        selectedAnnotationIndex = -1
        updatePlotVisual(svg)

        const now = Date.now()
        if (now - lastClickTime < 350 || e.detail >= 2) {
          lastClickTime = 0
          openTitleModal(e)
          return
        }
        lastClickTime = now

        activeLegendItemDrag = {
          svg,
          itemIdx,
          startX: e.clientX,
          startY: e.clientY,
          startXNorm: item.xNorm,
          startYNorm: item.yNorm,
        }
        document.body.style.userSelect = 'none'
      }

      if (item.text.startsWith('%01E')) {
        // Series Legend Box e.g. %01ESG\n%02EKP\n%03EGS
        const rawLines = item.text.split('\n')
        let legY = py
        rawLines.forEach((lineStr) => {
          const match = lineStr.match(/^%(\d+)E\s*(.*)/)
          if (match) {
            const idx = parseInt(match[1], 10) - 1
            const labelText = match[2].trim()
            const ds = processedDatasets[idx]
            const color = ds?.options?.lineColor || ds?.color || '#000000'

            const legLine = createSVGElement('line')
            legLine.setAttribute('x1', String(renderPx))
            legLine.setAttribute('y1', String(legY))
            legLine.setAttribute('x2', String(renderPx + 16))
            legLine.setAttribute('y2', String(legY))
            legLine.setAttribute('stroke', color)
            legLine.setAttribute('stroke-width', String(ds?.options?.width || 1))
            legLine.style.cursor = 'move'
            legLine.addEventListener('mousedown', handleLegendMouseDown)
            legLine.addEventListener('dblclick', openTitleModal)
            svg.appendChild(legLine)

            const legTxt = createSVGElement('text')
            legTxt.setAttribute('x', String(renderPx + 20))
            legTxt.setAttribute('y', String(legY + 3))
            legTxt.setAttribute('font-size', '10')
            legTxt.setAttribute('font-family', item.fontFamily || 'Cambria, Times New Roman, serif')
            legTxt.setAttribute('font-weight', String(item.fontWeight))
            legTxt.setAttribute('fill', '#000000')
            legTxt.textContent = labelText
            legTxt.style.cursor = 'move'
            legTxt.addEventListener('mousedown', handleLegendMouseDown)
            legTxt.addEventListener('dblclick', openTitleModal)
            svg.appendChild(legTxt)

            legY += 11
          }
        })
      } else {
        const textEl = createSVGElement('text')
        textEl.setAttribute('x', String(renderPx))
        textEl.setAttribute('y', String(py))
        textEl.setAttribute('font-size', String(item.fontSize || 12))
        textEl.setAttribute('font-family', item.fontFamily)
        textEl.setAttribute('font-weight', String(item.fontWeight))
        textEl.setAttribute('fill', '#000000')

        const anchor = item.align === 'center' ? 'middle' : item.align === 'right' ? 'end' : (isRotated ? 'middle' : 'start')
        textEl.setAttribute('text-anchor', anchor)

        if (isRotated) {
          textEl.setAttribute('transform', `rotate(${item.rotation} ${renderPx} ${py})`)
        }
        textEl.textContent = item.text
        textEl.style.cursor = 'move'
        textEl.addEventListener('mousedown', handleLegendMouseDown)
        textEl.addEventListener('dblclick', openTitleModal)
        svg.appendChild(textEl)

        if (isSelected) {
          let boxX = renderPx - 4
          let boxY = py - 12
          let boxW = 80
          let boxH = 20

          const metricsKey = `${item.text}|${item.fontSize}|${item.fontFamily}|${item.fontWeight}|${item.rotation}|${anchor}`
          if (legendBoxMeasured && legendBoxMeasured.key === metricsKey) {
            boxX = renderPx + legendBoxMeasured.dx
            boxY = py + legendBoxMeasured.dy
            boxW = legendBoxMeasured.w
            boxH = legendBoxMeasured.h
          } else {
            try {
              const bbox = textEl.getBBox()
              if (bbox.width > 0 && bbox.height > 0) {
                boxX = bbox.x - 4
                boxY = bbox.y - 2
                boxW = bbox.width + 8
                boxH = bbox.height + 4
              }
            } catch {
              boxW = Math.max(40, item.text.length * 7 + 8)
              boxH = (item.fontSize || 12) + 6
              boxY = py - (item.fontSize || 12)
            }
            legendBoxMeasured = {
              key: metricsKey,
              dx: boxX - renderPx,
              dy: boxY - py,
              w: boxW,
              h: boxH,
            }
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
            { x: offsetX - 2, y: offsetY - 2 },
            { x: offsetX + boxW - 2, y: offsetY - 2 },
            { x: offsetX - 2, y: offsetY + boxH - 2 },
            { x: offsetX + boxW - 2, y: offsetY + boxH - 2 },
          ]
          corners.forEach((c) => {
            const handle = createOverlayEl('ov-box-corner')
            handle.style.left = `${c.x}px`
            handle.style.top = `${c.y}px`
            parentEl.appendChild(handle)
          })
        }
      }

      if (isSelected && item.text.startsWith('%01E')) {
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
          { x: boxX - 2, y: boxY - 2 },
          { x: boxX + boxW - 2, y: boxY - 2 },
          { x: boxX - 2, y: boxY + boxH - 2 },
          { x: boxX + boxW - 2, y: boxY + boxH - 2 },
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
    const xLabel = smpMeta?.xLabel || smpDoc?.xLabel
    if (xLabel) {
      const xTitle = createSVGElement('text')
      xTitle.setAttribute('x', String(margin.l + plotW / 2))
      xTitle.setAttribute('y', String(margin.t + plotH + 42))
      xTitle.setAttribute('text-anchor', 'middle')
      xTitle.setAttribute('font-size', '12')
      xTitle.setAttribute('font-family', 'Cambria, Times New Roman, serif')
      xTitle.setAttribute('fill', '#000000')
      xTitle.textContent = xLabel
      svg.appendChild(xTitle)
    }
    const yLabel = smpMeta?.yLabel || smpDoc?.yLabel
    if (yLabel) {
      const yTitle = createSVGElement('text')
      const cx = margin.l - 42
      const cy = margin.t + plotH / 2
      yTitle.setAttribute('x', String(cx))
      yTitle.setAttribute('y', String(cy))
      yTitle.setAttribute('transform', `rotate(-90 ${cx} ${cy})`)
      yTitle.setAttribute('text-anchor', 'middle')
      yTitle.setAttribute('font-size', '12')
      yTitle.setAttribute('font-family', 'Cambria, Times New Roman, serif')
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
            }
          }
        }
      }
    }

  // Fallback Legend if not provided by smpDoc legendItems
  const hasSeriesLegendInDoc = (smpDoc?.legendItems || []).some((item) => item.text.startsWith('%01E'))
  if (processedDatasets.length > 0 && !hasSeriesLegendInDoc) {
    const legendX = Math.max(margin.l, margin.l + plotW - 110)
    const legendY = margin.t + 10
    let drawnLegends = 0
    for (let i = 0; i < processedDatasets.length; i++) {
      const ds = processedDatasets[i]
      const dsOpts = ds.options || {}
      if (dsOpts.show === false) continue

      const ly = legendY + drawnLegends * 11
      const line = createSVGElement('line')
      line.setAttribute('x1', String(legendX))
      line.setAttribute('y1', String(ly))
      line.setAttribute('x2', String(legendX + 16))
      line.setAttribute('y2', String(ly))
      line.setAttribute('stroke', dsOpts.lineColor || ds.color)
      line.setAttribute('stroke-width', String(dsOpts.width || 1))
      svg.appendChild(line)

      const text = createSVGElement('text')
      text.setAttribute('x', String(legendX + 20))
      text.setAttribute('y', String(ly + 3))
      text.setAttribute('font-size', '10')
      text.setAttribute('font-family', 'Cambria, Times New Roman, serif')
      text.setAttribute('fill', '#000000')
      text.textContent = ds.name
      svg.appendChild(text)

      drawnLegends++
    }
  }

  // Edge and Corner drag handles aligned with plot frame box (selected plots only)
  if (svg === getSelectedPlotSvg()) {
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
}

export function setupPlotFileDrop(svg: SVGSVGElement): void {
  svg.addEventListener('dragover', (e: DragEvent) => {
    e.preventDefault()
    e.dataTransfer!.dropEffect = 'copy'
  })

  svg.addEventListener('drop', (e: DragEvent) => {
    e.preventDefault()
    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return

    const graphArea = svg.parentElement || document.querySelector<HTMLElement>('.graph-area')

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.name.toLowerCase().endsWith('.smp')) {
        const reader = new FileReader()
        reader.onload = async (evt) => {
          const content = evt.target?.result as string
          if (content) {
            const { smpMeta } = parseSmpContent(content, file.name)
            if (smpMeta.docs && smpMeta.docs.length > 0) {
              for (let d = 0; d < smpMeta.docs.length; d++) {
                const doc = smpMeta.docs[d]
                const { svgLeft, svgTop, svgWidth, svgHeight } = getSvgRectForSmpDoc(doc)

                let targetSvg = d === 0 ? svg : (graphArea ? await createPlot(graphArea, svgLeft, svgTop, [], svgWidth, svgHeight) : svg)
                if (targetSvg) {
                  targetSvg.style.left = `${svgLeft}px`
                  targetSvg.style.top = `${svgTop}px`
                  targetSvg.style.width = `${svgWidth}px`
                  targetSvg.style.height = `${svgHeight}px`
                  setPlotSmpDoc(targetSvg, doc)
                  setPlotSmpMeta(targetSvg, smpMeta)
                  for (const ds of doc.datasets) {
                    addDatasetToPlot(targetSvg, ds)
                  }
                }
              }
            }
          }
        }
        reader.readAsText(file)
      } else if (file.name.endsWith('.txt') || file.type.startsWith('text/')) {
        const reader = new FileReader()
        reader.onload = (evt) => {
          const content = evt.target?.result as string
          if (content) {
            const ds = parseDatasetContent(content, file.name)
            addDatasetToPlot(svg, ds)
          }
        }
        reader.readAsText(file)
      }
    }
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
  setSelectedPlotSvg(svg)

  svgDataMap.set(svg, initialDatasets)
  setupPlotFileDrop(svg)
  drawPlot(svg, initialDatasets, width, height)

  svg.addEventListener('click', (e: MouseEvent) => {
    setSelectedPlotSvg(svg)
    if (e.target === svg || (e.target as SVGElement).tagName === 'rect' && !(e.target as SVGElement).getAttribute('data-dir')) {
      if (selectedLegendIndex !== -1 || selectedAnnotationIndex !== -1) {
        selectedLegendIndex = -1
        selectedAnnotationIndex = -1
        updatePlotVisual(svg)
      }
    }
  })

  svg.addEventListener('mousedown', (e: MouseEvent) => {
    setSelectedPlotSvg(svg)
    const target = e.target as SVGElement
    const dir = target.getAttribute('data-dir')
    if (!dir) return
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
    const initialAnnotationPositions = smpDoc?.annotationLines?.map((aLine) => ({
      x1Px: (aLine.x1Norm / 100) * startPlotW,
      y1Px: (aLine.y1Norm / 100) * startPlotH,
      x2Px: (aLine.x2Norm / 100) * startPlotW,
      y2Px: (aLine.y2Norm / 100) * startPlotH,
    }))

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

  return svg
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

// Global mousemove & mouseup listeners for resize with snap to grid
export function initPlotDragListeners(): void {
  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (activeLegendItemDrag) {
      const dragRef = activeLegendItemDrag
      if (legendDragRafId) cancelAnimationFrame(legendDragRafId)
      const clientX = e.clientX
      const clientY = e.clientY
      legendDragRafId = requestAnimationFrame(() => {
        legendDragRafId = null
        const { svg, itemIdx, startX, startY, startXNorm, startYNorm } = dragRef
        const smpDoc = getPlotSmpDoc(svg)
        if (smpDoc && smpDoc.legendItems[itemIdx]) {
          const zoom = getCanvasZoom()
          const dx = (clientX - startX) / zoom
          const dy = (clientY - startY) / zoom

          const widthPx = parseFloat(svg.style.width) || 500
          const heightPx = parseFloat(svg.style.height) || 350
          const plotW = Math.max(50, widthPx - PLOT_MARGIN.l - PLOT_MARGIN.r)
          const plotH = Math.max(50, heightPx - PLOT_MARGIN.t - PLOT_MARGIN.b)

          const dxNorm = Math.round((dx / plotW) * 10000)
          const dyNorm = Math.round((dy / plotH) * 10000)

          const item = smpDoc.legendItems[itemIdx]
          item.xNorm = startXNorm + dxNorm
          item.yNorm = startYNorm + dyNorm

          updatePlotVisual(svg)

          const titleOverlayEl = getCachedTitleOverlay()
          if (titleOverlayEl && titleOverlayEl.style.display !== 'none') {
            showTitleDialog(titleOverlayEl, itemIdx, svg)
          }
        }
      })
      return
    }

    if (activeAnnotationDrag) {
      const dragRef = activeAnnotationDrag
      if (annotationDragRafId) cancelAnimationFrame(annotationDragRafId)
      const clientX = e.clientX
      const clientY = e.clientY
      const shiftKey = e.shiftKey
      annotationDragRafId = requestAnimationFrame(() => {
        annotationDragRafId = null
        const { svg, annotationIdx, targetType, startX, startY, startX1Norm, startY1Norm, startX2Norm, startY2Norm } = dragRef
        const smpDoc = getPlotSmpDoc(svg)
        if (smpDoc && smpDoc.annotationLines && smpDoc.annotationLines[annotationIdx]) {
          const zoom = getCanvasZoom()
          const dx = (clientX - startX) / zoom
          const dy = (clientY - startY) / zoom

          const widthPx = parseFloat(svg.style.width) || 500
          const heightPx = parseFloat(svg.style.height) || 350
          const plotW = Math.max(50, widthPx - PLOT_MARGIN.l - PLOT_MARGIN.r)
          const plotH = Math.max(50, heightPx - PLOT_MARGIN.t - PLOT_MARGIN.b)

          const dxNorm = (dx / plotW) * 100
          const dyNorm = (dy / plotH) * 100

          const aLine = smpDoc.annotationLines[annotationIdx]
          if (targetType === 'start') {
            const rawX1 = startX1Norm + dxNorm
            const rawY1 = startY1Norm + dyNorm
            if (shiftKey) {
              const dxPx = ((rawX1 - startX2Norm) / 100) * plotW
              const dyPx = ((rawY1 - startY2Norm) / 100) * plotH
              const angle = Math.atan2(dyPx, dxPx) * (180 / Math.PI)
              const snappedAngle = Math.round(angle / 90) * 90
              if (snappedAngle % 180 === 0) {
                aLine.y1Norm = startY2Norm
                aLine.x1Norm = rawX1
              } else {
                aLine.x1Norm = startX2Norm
                aLine.y1Norm = rawY1
              }
            } else {
              aLine.x1Norm = rawX1
              aLine.y1Norm = rawY1
            }
          } else if (targetType === 'end') {
            const rawX2 = startX2Norm + dxNorm
            const rawY2 = startY2Norm + dyNorm
            if (shiftKey) {
              const dxPx = ((rawX2 - startX1Norm) / 100) * plotW
              const dyPx = ((rawY2 - startY1Norm) / 100) * plotH
              const angle = Math.atan2(dyPx, dxPx) * (180 / Math.PI)
              const snappedAngle = Math.round(angle / 90) * 90
              if (snappedAngle % 180 === 0) {
                aLine.y2Norm = startY1Norm
                aLine.x2Norm = rawX2
              } else {
                aLine.x2Norm = startX1Norm
                aLine.y2Norm = rawY2
              }
            } else {
              aLine.x2Norm = rawX2
              aLine.y2Norm = rawY2
            }
          } else {
            aLine.x1Norm = startX1Norm + dxNorm
            aLine.y1Norm = startY1Norm + dyNorm
            aLine.x2Norm = startX2Norm + dxNorm
            aLine.y2Norm = startY2Norm + dyNorm
          }

          updatePlotVisual(svg)

          const arrowOverlayEl = getCachedArrowOverlay()
          if (arrowOverlayEl && arrowOverlayEl.style.display !== 'none') {
            showArrowDialog(arrowOverlayEl, annotationIdx, svg)
          }
        }
      })
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
            aLine.x1Norm = (initPos.x1Px / newPlotW) * 100
            aLine.y1Norm = (initPos.y1Px / newPlotH) * 100
            aLine.x2Norm = (initPos.x2Px / newPlotW) * 100
            aLine.y2Norm = (initPos.y2Px / newPlotH) * 100
          }
        })
      }

      if (ds) drawPlot(currentDrag.svg, ds, newWidth, newHeight)
      rafId = null
    })
  })

  document.addEventListener('mouseup', () => {
    if (activeLegendItemDrag) {
      activeLegendItemDrag = null
      document.body.style.userSelect = ''
      if (legendDragRafId) { cancelAnimationFrame(legendDragRafId); legendDragRafId = null }
    }
    if (activeAnnotationDrag) {
      activeAnnotationDrag = null
      document.body.style.userSelect = ''
      if (annotationDragRafId) { cancelAnimationFrame(annotationDragRafId); annotationDragRafId = null }
    }

    if (!activeDrag) return
    const { svg } = activeDrag
    activeDrag = null
    document.body.style.userSelect = ''
    const ds = svgDataMap.get(svg)
    if (ds) {
      const w = parseFloat(svg.style.width) || svg.getBoundingClientRect().width
      const h = parseFloat(svg.style.height) || svg.getBoundingClientRect().height
      drawPlot(svg, ds, w, h)
    }
  })
}
