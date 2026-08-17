import type { Dataset } from '../../types.ts'
import { computeAutoStep } from '../../utils/scale.ts'
import { renderAnnotations } from './annotations.ts'
import { renderAxes } from './axes.ts'
import { renderPlotCrossbar } from './crossbar.ts'
import { getProcessedDataset } from './dataset.ts'
import { renderLegend } from './legend.ts'
import { renderSeries } from './series.ts'
import { isMultiSelected, updateSelectionBorder } from './selection.ts'
import { renderDatasetTransformOverlays } from './transform.ts'
import { createOverlayEl, createSVGElement, PLOT_MARGIN } from './svg.ts'
import type { PlotRenderContext } from './svg.ts'
import {
  getPlotOverlay,
  svgBaseScaleMap,
  svgCrossbarMap,
  svgDataMap,
  svgSmpDocMap,
  svgSmpMetaMap,
  syncPlotOverlay,
} from './state.ts'

export function drawPlot(
  svg: SVGSVGElement,
  datasets: Dataset[] = [],
  explicitW?: number,
  explicitH?: number
): void {
  const w = explicitW || svg.clientWidth || parseFloat(svg.style.width) || 400
  const h = explicitH || svg.clientHeight || parseFloat(svg.style.height) || 300
  if (w <= 0 || h <= 0) return

  const processedDatasets: Dataset[] = datasets.map((ds) => getProcessedDataset(ds))

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

  const frameWidthMm = smpDoc?.frameWidth ?? 0.4
  const frameStrokeWidth = Math.max(0.4, Number((frameWidthMm * scaleX).toFixed(2)))
  const frameColor = smpDoc?.frameColor || '#000000'
  const drawEdge = (x1: number, y1: number, x2: number, y2: number) => {
    const edge = createSVGElement('line')
    edge.setAttribute('x1', String(x1))
    edge.setAttribute('y1', String(y1))
    edge.setAttribute('x2', String(x2))
    edge.setAttribute('y2', String(y2))
    edge.setAttribute('stroke', frameColor)
    edge.setAttribute('stroke-width', String(frameStrokeWidth))
    edge.setAttribute('stroke-linecap', 'butt')
    svg.appendChild(edge)
  }
  const showXTicks = smpDoc?.axisX.showTicks !== false
  const showYTicks = smpDoc?.axisY.showTicks !== false
  const showUTicks = smpDoc?.axisTop?.showTicks ?? showXTicks
  const showRTicks = smpDoc?.axisRight?.showTicks ?? showYTicks
  if (showYTicks) drawEdge(margin.l, margin.t, margin.l, margin.t + plotH)
  if (showUTicks) drawEdge(margin.l, margin.t, margin.l + plotW, margin.t)
  if (showXTicks) drawEdge(margin.l, margin.t + plotH, margin.l + plotW, margin.t + plotH)
  if (showRTicks) drawEdge(margin.l + plotW, margin.t, margin.l + plotW, margin.t + plotH)

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

  const syncWithU = smpDoc ? (smpDoc.syncWithU !== false && smpDoc.axisX.isSynced !== false) : true
  const syncWithR = smpDoc ? (smpDoc.syncWithR !== false && smpDoc.axisY.isSynced !== false) : true

  const ctx: PlotRenderContext = {
    svg,
    smpDoc,
    smpMeta,
    margin,
    plotW,
    plotH,
    scaleX,
    scaleY,
    sx,
    sy,
    su: sx,
    sr: sy,
    xMin,
    xMax,
    yMin,
    yMax,
    uMin: xMin,
    uMax: xMax,
    rMin: yMin,
    rMax: yMax,
    xStep,
    yStep,
    autoSubDivsX,
    autoSubDivsY,
    syncWithU,
    syncWithR,
    datasets,
    processedDatasets,
    seriesGroup,
  }

  renderAxes(ctx)
  renderAnnotations(ctx)
  renderLegend(ctx)
  renderSeries(ctx)

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

    const topQuarterW = Math.max(1, fw * 0.25 - hs)
    const moveZoneW = Math.max(1, fw * 0.5)
    addHandle(fx + hs, fy - hs / 2, topQuarterW, hs, 'top')
    addHandle(fx + fw * 0.25, fy - hs / 2, moveZoneW, hs, 'move')
    addHandle(fx + fw * 0.75, fy - hs / 2, topQuarterW, hs, 'top')
    addHandle(fx + hs, fy + fh - hs / 2, fw - 2 * hs, hs, 'bottom')
    addHandle(fx - hs / 2, fy + hs, hs, fh - 2 * hs, 'left')
    addHandle(fx + fw - hs / 2, fy + hs, hs, fh - 2 * hs, 'right')

    addHandle(fx - hs / 2, fy - hs / 2, hs, hs, 'top-left')
    addHandle(fx + fw - hs / 2, fy - hs / 2, hs, hs, 'top-right')
    addHandle(fx - hs / 2, fy + fh - hs / 2, hs, hs, 'bottom-left')
    addHandle(fx + fw - hs / 2, fy + fh - hs / 2, hs, hs, 'bottom-right')

    const ov = getPlotOverlay(svg)
    const addVisualHandle = (cx: number, cy: number) => {
      const dot = createOverlayEl('ov-dot')
      dot.style.left = `${cx - 3}px`
      dot.style.top = `${cy - 3}px`
      ov.appendChild(dot)
    }

    addVisualHandle(fx, fy)
    addVisualHandle(fx + fw, fy)
    addVisualHandle(fx, fy + fh)
    addVisualHandle(fx + fw, fy + fh)

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
    ctx.su,
    ctx.sr,
    xMin,
    xMax,
    yMin,
    yMax,
    ctx.uMin,
    ctx.uMax,
    ctx.rMin,
    ctx.rMax
  )

  syncPlotOverlay(svg)
  updateSelectionBorder(svg)
  const cb = svgCrossbarMap.get(svg)
  if (cb) {
    renderPlotCrossbar(svg, cb.xVal, cb.yVal)
  }
}

export function updatePlotVisual(svg: SVGSVGElement): void {
  const ds = svgDataMap.get(svg) || []
  const w = parseFloat(svg.style.width) || svg.getBoundingClientRect().width
  const h = parseFloat(svg.style.height) || svg.getBoundingClientRect().height
  drawPlot(svg, ds, w, h)
}