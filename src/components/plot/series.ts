import { createSVGElement } from './svg.ts'
import type { PlotRenderContext } from './svg.ts'
import { createSeriesSymbol, getLineDashArray } from './symbols.ts'
import { resolveErrorBars } from '../../utils/analyze/errorBars.ts'
import { computeCurvePoints, getCurveDrawStyle, shouldDrawCurve } from '../../utils/analyze/curveRender.ts'
import { evaluateMathExpr } from '../../utils/dataset.ts'
import { getRawDatasetCoords } from './dataset.ts'
import type { Dataset, PlotVisualOptions } from '../../types.ts'

function buildStepOverlayPath(
  xs: number[],
  ys: number[],
  dsSx: (v: number) => number,
  dsSy: (v: number) => number,
  mode: 'step_h' | 'step_v'
): string {
  let d = `M ${dsSx(xs[0]).toFixed(1)},${dsSy(ys[0]).toFixed(1)}`
  for (let i = 1; i < xs.length; i++) {
    const px = dsSx(xs[i]).toFixed(1)
    const py = dsSy(ys[i]).toFixed(1)
    const prevPx = dsSx(xs[i - 1]).toFixed(1)
    const prevPy = dsSy(ys[i - 1]).toFixed(1)
    if (mode === 'step_h') d += ` L ${prevPx},${py} L ${px},${py}`
    else d += ` L ${px},${prevPy} L ${px},${py}`
  }
  return d
}

function renderErrorBars(
  ds: Dataset,
  opts: PlotVisualOptions,
  dsSx: (v: number) => number,
  dsSy: (v: number) => number,
  dsScaleGroup: SVGElement,
  strokeColor: string
): void {
  const errBars = resolveErrorBars(ds)
  if (!errBars) return
  const raw = getRawDatasetCoords(ds)
  const yTrans = opts.yTransCheck && opts.yExpr && opts.yExpr !== 'y'
  const capHalf = 5
  for (let i = 0; i < ds.x.length; i++) {
    const up = errBars.yPlus[i]
    const dn = errBars.yMinus[i]
    if (typeof up !== 'number' || typeof dn !== 'number' || isNaN(up) || isNaN(dn)) continue
    const rawY = raw.y[i] ?? ds.y[i]
    let topV = ds.y[i] + up
    let botV = ds.y[i] + dn
    if (yTrans) {
      const baseT = evaluateMathExpr(opts.yExpr as string, rawY, 'y')
      topV = baseT + (evaluateMathExpr(opts.yExpr as string, rawY + up, 'y') - baseT)
      botV = baseT + (evaluateMathExpr(opts.yExpr as string, rawY + dn, 'y') - baseT)
    }
    const px = dsSx(ds.x[i])
    const pyTop = dsSy(topV)
    const pyBot = dsSy(botV)
    const barLine = createSVGElement('line')
    barLine.setAttribute('x1', String(px))
    barLine.setAttribute('y1', String(pyTop))
    barLine.setAttribute('x2', String(px))
    barLine.setAttribute('y2', String(pyBot))
    barLine.setAttribute('stroke', strokeColor)
    barLine.setAttribute('stroke-width', '1')
    barLine.setAttribute('vector-effect', 'non-scaling-stroke')
    dsScaleGroup.appendChild(barLine)
    for (const py of [pyTop, pyBot]) {
      const cap = createSVGElement('line')
      cap.setAttribute('x1', String(px - capHalf))
      cap.setAttribute('y1', String(py))
      cap.setAttribute('x2', String(px + capHalf))
      cap.setAttribute('y2', String(py))
      cap.setAttribute('stroke', strokeColor)
      cap.setAttribute('stroke-width', '1')
      cap.setAttribute('vector-effect', 'non-scaling-stroke')
      dsScaleGroup.appendChild(cap)
    }
  }
}

function renderCurveOverlay(
  ds: Dataset,
  dsSx: (v: number) => number,
  dsSy: (v: number) => number,
  dsScaleGroup: SVGElement,
  scaleX: number
): void {
  if (!shouldDrawCurve(ds)) return
  const curve = computeCurvePoints(ds)
  if (!curve || curve.x.length <= 1) return
  const style = getCurveDrawStyle(ds)
  const curveWidthPx = Math.max(0.4, Number((style.width * scaleX).toFixed(2)))
  const pts: string[] = []
  for (let i = 0; i < curve.x.length; i++) {
    const cx = curve.x[i]
    const cy = curve.y[i]
    if (!isFinite(cx) || !isFinite(cy)) continue
    pts.push(`${dsSx(cx).toFixed(1)},${dsSy(cy).toFixed(1)}`)
  }
  if (pts.length <= 1) return
  const path = createSVGElement('polyline')
  path.setAttribute('points', pts.join(' '))
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', style.color)
  path.setAttribute('stroke-width', String(curveWidthPx))
  const dash = getLineDashArray(style.lineType, curveWidthPx, style.pitch * scaleX)
  if (dash) path.setAttribute('stroke-dasharray', dash)
  path.setAttribute('vector-effect', 'non-scaling-stroke')
  dsScaleGroup.appendChild(path)
}

const FRAME_TOLERANCE_PX = 0.5

export function seriesPitchMm(ds: Dataset): number {
  const token = (ds.smpSeriesStyleLine || '').trim().split(/\s+/)[2]
  const pitch = parseFloat(token || '')
  return Number.isFinite(pitch) && pitch > 0 ? pitch / 100 : 3
}

export function renderSeries(ctx: PlotRenderContext): void {
  const { processedDatasets, seriesGroup, markerGroup, margin, plotW, plotH, scaleX, sx, sy, su, sr, xValueScale, yValueScale, uValueScale, rValueScale } = ctx
  const insideFrame = (px: number, py: number): boolean =>
    px >= margin.l - FRAME_TOLERANCE_PX && px <= margin.l + plotW + FRAME_TOLERANCE_PX &&
    py >= margin.t - FRAME_TOLERANCE_PX && py <= margin.t + plotH + FRAME_TOLERANCE_PX

  for (let dIdx = 0; dIdx < processedDatasets.length; dIdx++) {
    const ds = processedDatasets[dIdx]
    const opts = ds.options || {}
    const isShow = opts.show !== false
    if (!isShow) continue

    const dsGroup = createSVGElement('g')
    dsGroup.setAttribute('data-series', String(dIdx))
    seriesGroup.appendChild(dsGroup)

    const dsScaleGroup = createSVGElement('g')
    dsScaleGroup.setAttribute('data-scale-group', '1')
    dsGroup.appendChild(dsScaleGroup)

    const dsSx = opts.axisX === 'u' ? su : sx
    const dsSy = opts.axisY === 'r' ? sr : sy
    const xScale = opts.axisX === 'u' ? uValueScale : xValueScale
    const yScale = opts.axisY === 'r' ? rValueScale : yValueScale
    const isValidPoint = (index: number): boolean =>
      xScale.isValid(ds.x[index]) && yScale.isValid(ds.y[index])

    const strokeColor = opts.lineColor || ds.color
    const seriesWidthMm = opts.width ?? (ds.smpSeriesStylePrefix ? ds.smpSeriesStylePrefix / 100 : 0.6)
    const strokeWidth = String(Math.max(0.4, Number((seriesWidthMm * scaleX).toFixed(2))))
    const dotColor = opts.dotColor || '#000000'
    const paintColor = opts.paintColor || '#ffffff'
    const dotSize = opts.size || 3
    const plotType = opts.plotType || 'no_dot'
    const lineType = opts.lineType || 'solid'

    const dashArray = getLineDashArray(lineType, parseFloat(strokeWidth), seriesPitchMm(ds) * scaleX)

    if (plotType === 'bar') {
      const barW = Math.max(2, Math.floor(plotW / (ds.x.length || 1) - 2))
      const zeroY = dsSy(0)
      for (let i = 0; i < ds.x.length; i++) {
        if (!xScale.isValid(ds.x[i]) || !yScale.isValid(ds.y[i])) continue
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
        bar.setAttribute('vector-effect', 'non-scaling-stroke')
        dsScaleGroup.appendChild(bar)
      }
    } else {
      if (lineType !== 'no_line' && ds.x.length > 0) {
        const segments: string[][] = []
        let current: string[] = []
        for (let i = 0; i < ds.x.length; i++) {
          if (!isValidPoint(i)) {
            if (current.length > 1) segments.push(current)
            current = []
            continue
          }
          current.push(`${dsSx(ds.x[i]).toFixed(1)},${dsSy(ds.y[i]).toFixed(1)}`)
        }
        if (current.length > 1) segments.push(current)

        if (lineType === 'face') {
          const zeroY = dsSy(0).toFixed(1)
          segments.forEach((points) => {
            const firstPoint = points[0].split(',')
            const lastPoint = points[points.length - 1].split(',')
            const areaPathD = `M ${firstPoint[0]},${zeroY} L ${points.join(' L ')} L ${lastPoint[0]},${zeroY} Z`
            const areaPath = createSVGElement('path')
            areaPath.setAttribute('d', areaPathD)
            areaPath.setAttribute('fill', strokeColor)
            areaPath.setAttribute('stroke', 'none')
            dsScaleGroup.appendChild(areaPath)
          })
        }

        segments.forEach((points) => {
          const path = createSVGElement('path')
          path.setAttribute('d', `M ${points.join(' ')}`)
          path.setAttribute('fill', 'none')
          path.setAttribute('stroke', strokeColor)
          path.setAttribute('stroke-width', strokeWidth)
          path.setAttribute('vector-effect', 'non-scaling-stroke')
          if (dashArray !== 'none') path.setAttribute('stroke-dasharray', dashArray)
          path.setAttribute('stroke-linejoin', 'round')
          path.setAttribute('stroke-linecap', 'round')
          dsScaleGroup.appendChild(path)
        })
      }

      // step
      if ((plotType === 'step_h' || plotType === 'step_v') && ds.x.length > 1) {
        const stepIndices: number[] = []
        for (let i = 0; i < ds.x.length; i++) if (isValidPoint(i)) stepIndices.push(i)
        if (stepIndices.length >= 2) {
          const stepX = stepIndices.map((index) => ds.x[index])
          const stepY = stepIndices.map((index) => ds.y[index])
          const markerSw = parseFloat(strokeWidth)
          const overlay = createSVGElement('path')
          overlay.setAttribute('d', buildStepOverlayPath(stepX, stepY, dsSx, dsSy, plotType))
          overlay.setAttribute('fill', 'none')
          overlay.setAttribute('stroke', dotColor)
          overlay.setAttribute('stroke-width', String(markerSw))
          overlay.setAttribute('vector-effect', 'non-scaling-stroke')
          overlay.setAttribute('stroke-linejoin', 'round')
          overlay.setAttribute('stroke-linecap', 'round')
          dsGroup.appendChild(overlay)
        }
      }

      if (
        plotType !== 'no_dot' &&
        plotType !== 'none' &&
        plotType !== 'bar' &&
        plotType !== 'step_h' &&
        plotType !== 'step_v'
      ) {
        const step = Math.max(1, opts.pitch || 1)
        const markerSw = parseFloat(strokeWidth)
        const markerParent = markerGroup ? createSVGElement('g') : dsGroup
        if (markerGroup) {
          markerParent.setAttribute('data-series-markers', String(dIdx))
          markerGroup.appendChild(markerParent)
        }
        for (let i = 0; i < ds.x.length; i += step) {
          if (!isValidPoint(i)) continue
          const px = dsSx(ds.x[i])
          const py = dsSy(ds.y[i])
          if (markerGroup && !insideFrame(px, py)) continue
          const symbol = createSeriesSymbol(plotType, px, py, dotSize, dotColor, paintColor, markerSw)
          if (symbol) markerParent.appendChild(symbol)
        }
      }

      renderErrorBars(ds, opts, dsSx, dsSy, dsScaleGroup, strokeColor)
      renderCurveOverlay(ds, dsSx, dsSy, dsScaleGroup, scaleX)
    }
  }
}