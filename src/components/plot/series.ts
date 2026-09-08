import { createSVGElement } from './svg.ts'
import type { PlotRenderContext } from './svg.ts'
import { createSeriesSymbol, getLineDashArray } from './symbols.ts'

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

export function renderSeries(ctx: PlotRenderContext): void {
  const { processedDatasets, seriesGroup, plotW, scaleX, sx, sy, su, sr } = ctx

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

    const strokeColor = opts.lineColor || ds.color
    const seriesWidthMm = opts.width ?? (ds.smpSeriesStylePrefix ? ds.smpSeriesStylePrefix / 100 : 0.6)
    const strokeWidth = String(Math.max(0.4, Number((seriesWidthMm * scaleX).toFixed(2))))
    const dotColor = opts.dotColor || '#000000'
    const paintColor = opts.paintColor || '#ffffff'
    const dotSize = opts.size || 3
    const plotType = opts.plotType || 'no_dot'
    const lineType = opts.lineType || 'solid'

    const dashArray = getLineDashArray(lineType, parseFloat(strokeWidth))

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
        bar.setAttribute('vector-effect', 'non-scaling-stroke')
        dsScaleGroup.appendChild(bar)
      }
    } else {
      if (lineType !== 'no_line' && ds.x.length > 0) {
        const points: string[] = []
        for (let i = 0; i < ds.x.length; i++) {
          points.push(`${dsSx(ds.x[i]).toFixed(1)},${dsSy(ds.y[i]).toFixed(1)}`)
        }

        if (lineType === 'face') {
          const zeroY = dsSy(0).toFixed(1)
          const firstX = dsSx(ds.x[0]).toFixed(1)
          const lastX = dsSx(ds.x[ds.x.length - 1]).toFixed(1)

          const areaPathD = `M ${firstX},${zeroY} L ${points.join(' L ')} L ${lastX},${zeroY} Z`
          const areaPath = createSVGElement('path')
          areaPath.setAttribute('d', areaPathD)
          areaPath.setAttribute('fill', strokeColor)
          areaPath.setAttribute('stroke', 'none')
          dsScaleGroup.appendChild(areaPath)
        }

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
      }

      // step
      if ((plotType === 'step_h' || plotType === 'step_v') && ds.x.length > 1) {
        const markerSw = parseFloat(strokeWidth)
        const overlay = createSVGElement('path')
        overlay.setAttribute('d', buildStepOverlayPath(ds.x, ds.y, dsSx, dsSy, plotType))
        overlay.setAttribute('fill', 'none')
        overlay.setAttribute('stroke', dotColor)
        overlay.setAttribute('stroke-width', String(markerSw))
        overlay.setAttribute('vector-effect', 'non-scaling-stroke')
        overlay.setAttribute('stroke-linejoin', 'round')
        overlay.setAttribute('stroke-linecap', 'round')
        dsGroup.appendChild(overlay)
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
        for (let i = 0; i < ds.x.length; i += step) {
          const px = dsSx(ds.x[i])
          const py = dsSy(ds.y[i])
          const symbol = createSeriesSymbol(plotType, px, py, dotSize, dotColor, paintColor, markerSw)
          if (symbol) dsGroup.appendChild(symbol)
        }
      }
    }
  }
}