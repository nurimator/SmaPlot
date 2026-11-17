import type { Dataset } from '../../types.ts'
import type { ValueScale } from '../../utils/scale.ts'
import { getCanvasZoom } from '../../utils/canvasZoom.ts'
import { extractLinearParams, formatLinearExpr, getDatasetRawMinMax } from './dataset.ts'
import { createOverlayEl } from './svg.ts'
import { getPlotOverlay, markerAnchorMap, svgDataMap } from './state.ts'
import { isReadValueMode, isTrimmingMode } from './modes.ts'
import { updatePlotVisual } from './drawPlot.ts'

type TransDir = 'box' | 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
type AxisEdge = 'shift' | 'max' | 'min' | 'none'
type AxisName = 'x' | 'y'
type Linear = { a: number; b: number }
type Margin = { l: number; r: number; t: number; b: number }

interface TransDragContext {
  svg: SVGSVGElement
  dataset: Dataset
  xTransActive: boolean
  yTransActive: boolean
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  plotW: number
  plotH: number
  margin: Margin
  xValueScale: ValueScale
  yValueScale: ValueScale
}

interface AxisDragState {
  active: boolean
  valueScale: ValueScale
  start: Linear
  data: Linear
  rawMin: number
  rawMax: number
  transMin: number
  transMax: number
  viewMin: number
  viewMax: number
}

interface SeriesEls {
  dsGroup: SVGGElement
  scaleGroup: SVGGElement | null
  markers: Array<{ el: Element; px: number; py: number; inSeriesGroup: boolean }>
}

interface ActiveTransDrag {
  svg: SVGSVGElement
  dataset: Dataset
  dir: TransDir
  startX: number
  startY: number
  x: AxisDragState
  y: AxisDragState
  plotW: number
  plotH: number
  margin: Margin
  boxGeoms: Array<{ el: HTMLElement; left: number; top: number; width: number; height: number }>
  series: SeriesEls | null
}

let activeTransDrag: ActiveTransDrag | null = null
let pendingTransPoint: { clientX: number; clientY: number } | null = null
let transRaf: number | null = null

export function getActiveTransDrag(): ActiveTransDrag | null {
  return activeTransDrag
}

let activePropertyTarget: { svg: SVGSVGElement; dataset?: Dataset } | null = null

export function isPropertyTabMode(): boolean {
  return activePropertyTarget !== null
}

export function setPropertyDialogTarget(target: { svg: SVGSVGElement; dataset?: Dataset } | null): void {
  const prevSvg = activePropertyTarget?.svg
  activePropertyTarget = target
  if (prevSvg && prevSvg !== target?.svg) {
    updatePlotVisual(prevSvg)
  }
}

export function isTransformModeFor(svg: SVGSVGElement): boolean {
  if (isTrimmingMode() || isReadValueMode() || !activePropertyTarget || activePropertyTarget.svg !== svg) return false
  const target = activePropertyTarget.dataset
  return (svgDataMap.get(svg) || []).some((ds) =>
    (!target || ds === target) && !!(ds.options?.xTransCheck || ds.options?.yTransCheck)
  )
}

// axis math
function buildAxisState(
  active: boolean,
  valueScale: ValueScale,
  expr: string | undefined,
  axis: AxisName,
  rawMin: number,
  rawMax: number,
  viewMin: number,
  viewMax: number
): AxisDragState {
  const data = extractLinearParams(expr || axis, axis)
  const isLog = valueScale.kind === 'log'
  const logSpan = valueScale.unitMax - valueScale.unitMin
  const t1 = data.a * rawMin + data.b
  const t2 = data.a * rawMax + data.b
  return {
    active,
    valueScale,
    data,
    start: isLog ? { a: data.a || 1, b: 0 } : data,
    rawMin,
    rawMax,
    transMin: isLog ? Math.min(0, logSpan) : Math.min(t1, t2),
    transMax: isLog ? Math.max(0, logSpan) : Math.max(t1, t2),
    viewMin: isLog ? 0 : viewMin,
    viewMax: isLog ? logSpan : viewMax,
  }
}

function axisEdge(axis: AxisName, dir: TransDir): AxisEdge {
  if (dir === 'box') return 'shift'
  if (axis === 'x') return dir.endsWith('right') ? 'max' : dir.endsWith('left') ? 'min' : 'none'
  return dir.startsWith('top') ? 'max' : dir.startsWith('bottom') ? 'min' : 'none'
}

function edgeAnchors(edge: 'max' | 'min', inverted: boolean, rawMin: number, rawMax: number): { rawAnchor: number; rawMoving: number } {
  const anchorAtMin = (edge === 'max') !== inverted
  return anchorAtMin ? { rawAnchor: rawMin, rawMoving: rawMax } : { rawAnchor: rawMax, rawMoving: rawMin }
}

function solveAxisDrag(s: AxisDragState, edge: AxisEdge, delta: number): Linear {
  if (edge === 'shift') return { a: s.start.a, b: s.start.b + delta }
  if (edge === 'none') return s.start
  const { rawAnchor, rawMoving } = edgeAnchors(edge, s.start.a < 0, s.rawMin, s.rawMax)
  const rawSpan = rawMoving - rawAnchor
  if (Math.abs(rawSpan) <= 1e-12) return s.start
  const minSpan = Math.max(1e-8, Math.abs(s.viewMax - s.viewMin) * 0.0001)
  const anchor = edge === 'max' ? s.transMin : s.transMax
  const moving = edge === 'max'
    ? Math.max(s.transMax + delta, anchor + minSpan)
    : Math.min(s.transMin + delta, anchor - minSpan)
  const a = (moving - anchor) / rawSpan
  return { a, b: anchor - a * rawAnchor }
}

function toLogValue(unit: number): number {
  return Math.pow(10, Math.max(-300, Math.min(300, unit)))
}

function fitLogAxis(s: AxisDragState, edge: AxisEdge, unit: Linear): Linear {
  if (edge === 'shift') {
    const factor = toLogValue(unit.b)
    return { a: s.data.a * factor, b: s.data.b * factor }
  }
  if (edge === 'none') return s.data
  const { rawAnchor, rawMoving } = edgeAnchors(edge, s.data.a < 0, s.rawMin, s.rawMax)
  const rawSpan = rawMoving - rawAnchor
  if (Math.abs(rawSpan) <= 1e-12) return s.data
  const movingValue = toLogValue(s.valueScale.unitMin + unit.a * rawMoving + unit.b)
  const anchorValue = s.data.a * rawAnchor + s.data.b
  const a = (movingValue - anchorValue) / rawSpan
  return { a, b: anchorValue - a * rawAnchor }
}

// drag lifecycle
function collectSeriesEls(svg: SVGSVGElement, dataset: Dataset): SeriesEls | null {
  const idx = (svgDataMap.get(svg) || []).indexOf(dataset)
  if (idx < 0) return null
  const dsGroup = svg.querySelector<SVGGElement>(`g[data-series="${idx}"]`)
  if (!dsGroup) return null
  const markers: SeriesEls['markers'] = []
  const take = (parent: Element | null, inSeriesGroup: boolean): void => {
    if (!parent) return
    for (const el of Array.from(parent.children)) {
      const anchor = markerAnchorMap.get(el)
      if (anchor) markers.push({ el, px: anchor.px, py: anchor.py, inSeriesGroup })
    }
  }
  take(svg.querySelector(`g[data-series-markers="${idx}"]`), false)
  take(dsGroup, true)
  return { dsGroup, scaleGroup: dsGroup.querySelector<SVGGElement>('g[data-scale-group]'), markers }
}

function startTransformDrag(clientX: number, clientY: number, ctx: TransDragContext, dir: TransDir): void {
  const { svg, dataset } = ctx
  const opts = dataset.options || {}
  const { rawXMin, rawXMax, rawYMin, rawYMax } = getDatasetRawMinMax(dataset)

  const boxGeoms: ActiveTransDrag['boxGeoms'] = []
  getPlotOverlay(svg)
    .querySelectorAll<HTMLElement>('.ov-trans-box, .ov-trans-handle')
    .forEach((el) => {
      const left = parseFloat(el.style.left)
      const top = parseFloat(el.style.top)
      const width = parseFloat(el.style.width)
      const height = parseFloat(el.style.height)
      if (isNaN(left) || isNaN(top)) return
      boxGeoms.push({ el, left, top, width: isNaN(width) ? 0 : width, height: isNaN(height) ? 0 : height })
    })

  activeTransDrag = {
    svg,
    dataset,
    dir,
    startX: clientX,
    startY: clientY,
    x: buildAxisState(ctx.xTransActive, ctx.xValueScale, opts.xExpr, 'x', rawXMin, rawXMax, ctx.xMin, ctx.xMax),
    y: buildAxisState(ctx.yTransActive, ctx.yValueScale, opts.yExpr, 'y', rawYMin, rawYMax, ctx.yMin, ctx.yMax),
    plotW: ctx.plotW,
    plotH: ctx.plotH,
    margin: ctx.margin,
    boxGeoms,
    series: collectSeriesEls(svg, dataset),
  }
  pendingTransPoint = null
  document.body.style.userSelect = 'none'
}

export function moveTransDrag(clientX: number, clientY: number): void {
  pendingTransPoint = { clientX, clientY }
  if (transRaf === null) transRaf = requestAnimationFrame(flushTransDrag)
}

function flushTransDrag(): void {
  transRaf = null
  const point = pendingTransPoint
  pendingTransPoint = null
  if (point && activeTransDrag) processTransMove(activeTransDrag, point.clientX, point.clientY)
}

export function endTransDrag(): void {
  if (!activeTransDrag) return
  if (transRaf !== null) {
    cancelAnimationFrame(transRaf)
    transRaf = null
  }
  flushTransDrag()
  const { svg } = activeTransDrag
  activeTransDrag = null
  document.body.style.userSelect = ''
  if (svgDataMap.get(svg)) updatePlotVisual(svg)
}

function processTransMove(drag: ActiveTransDrag, clientX: number, clientY: number): void {
  const zoom = getCanvasZoom()
  const delta: Record<AxisName, number> = {
    x: ((clientX - drag.startX) / zoom / drag.plotW) * (drag.x.viewMax - drag.x.viewMin),
    y: -((clientY - drag.startY) / zoom / drag.plotH) * (drag.y.viewMax - drag.y.viewMin),
  }
  if (!drag.dataset.options) drag.dataset.options = {}
  const opts = drag.dataset.options

  const fullRedraw = (['x', 'y'] as const).some((axis) => drag[axis].active && drag[axis].valueScale.kind === 'log')
  const preview: Record<AxisName, Linear | null> = { x: null, y: null }

  for (const axis of ['y', 'x'] as const) {
    const s = drag[axis]
    if (!s.active) continue
    const edge = axisEdge(axis, drag.dir)
    const unit = solveAxisDrag(s, edge, delta[axis])
    const isLog = s.valueScale.kind === 'log'
    const fitted = isLog ? fitLogAxis(s, edge, unit) : unit
    const expr = formatLinearExpr(fitted.a, fitted.b, axis)
    if (axis === 'x') opts.xExpr = expr
    else opts.yExpr = expr
    const input = document.querySelector<HTMLInputElement>(axis === 'x' ? '#propXTransExpr' : '#propYTransExpr')
    if (input) input.value = expr
    if (!isLog) preview[axis] = fitted
  }

  if (fullRedraw || !applyLinearPreview(drag, preview.x, preview.y)) updatePlotVisual(drag.svg)
}

// preview
function setTransformAttr(el: Element, value: string | null): void {
  if (value) el.setAttribute('transform', value)
  else el.removeAttribute('transform')
}

function applyLinearPreview(drag: ActiveTransDrag, xLin: Linear | null, yLin: Linear | null): boolean {
  const { margin, plotW, plotH } = drag
  let mx = 1
  let my = 1
  let kx = 0
  let ky = 0

  if (xLin) {
    const { start, viewMin, viewMax } = drag.x
    if (Math.abs(start.a) < 1e-9) return false
    mx = xLin.a / start.a
    const c = xLin.b - mx * start.b
    const sx = plotW / (viewMax - viewMin || 1)
    kx = (1 - mx) * (margin.l - viewMin * sx) + c * sx
  }

  if (yLin) {
    const { start, viewMin, viewMax } = drag.y
    if (Math.abs(start.a) < 1e-9) return false
    my = yLin.a / start.a
    const c = yLin.b - my * start.b
    const sy = plotH / (viewMax - viewMin || 1)
    ky = (1 - my) * (margin.t + plotH + viewMin * sy) - c * sy
  }

  if (!drag.series?.dsGroup.isConnected) drag.series = collectSeriesEls(drag.svg, drag.dataset)
  const series = drag.series
  if (series) {
    setTransformAttr(series.dsGroup, kx !== 0 || ky !== 0 ? `translate(${kx}, ${ky})` : null)
    if (series.scaleGroup) setTransformAttr(series.scaleGroup, mx !== 1 || my !== 1 ? `scale(${mx}, ${my})` : null)
    for (const m of series.markers) {
      const dx = (mx - 1) * m.px + (m.inSeriesGroup ? 0 : kx)
      const dy = (my - 1) * m.py + (m.inSeriesGroup ? 0 : ky)
      setTransformAttr(m.el, dx !== 0 || dy !== 0 ? `translate(${dx}, ${dy})` : null)
    }
  }

  for (const g of drag.boxGeoms) {
    g.el.style.left = `${mx * g.left + kx}px`
    g.el.style.top = `${my * g.top + ky}px`
    if (g.el.classList.contains('ov-trans-box')) {
      g.el.style.width = `${mx * g.width}px`
      g.el.style.height = `${my * g.height}px`
    }
  }

  return true
}

function bindTransStart(el: HTMLElement, ctx: TransDragContext, dir: TransDir): void {
  el.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    startTransformDrag(e.clientX, e.clientY, ctx, dir)
  })
  el.addEventListener(
    'touchstart',
    (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      e.preventDefault()
      e.stopPropagation()
      startTransformDrag(e.touches[0].clientX, e.touches[0].clientY, ctx, dir)
    },
    { passive: false }
  )
}

export function renderDatasetTransformOverlays(
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
  rMax: number,
  xValueScale: ValueScale,
  yValueScale: ValueScale,
  uValueScale: ValueScale,
  rValueScale: ValueScale
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
    const dsXValueScale = opts.axisX === 'u' ? uValueScale : xValueScale
    const dsYValueScale = opts.axisY === 'r' ? rValueScale : yValueScale

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

    const ctx: TransDragContext = {
      svg,
      dataset: rawDs,
      xTransActive,
      yTransActive,
      xMin: effXMin,
      xMax: effXMax,
      yMin: effYMin,
      yMax: effYMax,
      plotW,
      plotH,
      margin,
      xValueScale: dsXValueScale,
      yValueScale: dsYValueScale,
    }
    bindTransStart(boxEl, ctx, 'box')

    ov.appendChild(boxEl)

    const addHandle = (
      hx: number,
      hy: number,
      dir: 'top' | 'bottom' | 'left' | 'right',
      orientation: 'h' | 'v'
    ) => {
      const cursor = orientation === 'h' ? 'ns-resize' : 'ew-resize'

      const handle = createOverlayEl(`ov-trans-handle ov-trans-handle-${orientation}`)
      handle.style.left = `${hx}px`
      handle.style.top = `${hy}px`
      handle.style.cursor = cursor
      handle.setAttribute('data-trans-dir', dir)
      handle.title = `Scale ${dir.toUpperCase()} (${exprText})`

      bindTransStart(handle, ctx, dir)

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