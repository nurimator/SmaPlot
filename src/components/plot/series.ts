import { createSVGElement, starPoints } from './svg.ts'
import type { PlotRenderContext } from './svg.ts'
import { getLineDashArray } from './symbols.ts'

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
            circle.setAttribute('fill', plotType === 'filled_circle' ? paintColor : dotColor)
            circle.setAttribute('stroke', dotColor)
            circle.setAttribute('stroke-width', '1')
            dsGroup.appendChild(circle)
          } else if (plotType === 'square' || plotType === 'filled_square') {
            const rect = createSVGElement('rect')
            rect.setAttribute('x', String(px - dotSize))
            rect.setAttribute('y', String(py - dotSize))
            rect.setAttribute('width', String(dotSize * 2))
            rect.setAttribute('height', String(dotSize * 2))
            rect.setAttribute('fill', plotType === 'filled_square' ? paintColor : dotColor)
            rect.setAttribute('stroke', dotColor)
            rect.setAttribute('stroke-width', '1')
            dsGroup.appendChild(rect)
          } else if (plotType === 'triangle' || plotType === 'filled_triangle') {
            const poly = createSVGElement('polygon')
            const p1 = `${px},${py - dotSize}`
            const p2 = `${px - dotSize},${py + dotSize}`
            const p3 = `${px + dotSize},${py + dotSize}`
            poly.setAttribute('points', `${p1} ${p2} ${p3}`)
            poly.setAttribute('fill', plotType === 'filled_triangle' ? paintColor : dotColor)
            poly.setAttribute('stroke', dotColor)
            poly.setAttribute('stroke-width', '1')
            dsGroup.appendChild(poly)
          } else if (plotType === 'triangle_down' || plotType === 'filled_triangle_down') {
            const poly = createSVGElement('polygon')
            const p1 = `${px - dotSize},${py - dotSize}`
            const p2 = `${px + dotSize},${py - dotSize}`
            const p3 = `${px},${py + dotSize}`
            poly.setAttribute('points', `${p1} ${p2} ${p3}`)
            poly.setAttribute('fill', plotType === 'filled_triangle_down' ? paintColor : dotColor)
            poly.setAttribute('stroke', dotColor)
            poly.setAttribute('stroke-width', '1')
            dsGroup.appendChild(poly)
          } else if (plotType === 'diamond' || plotType === 'filled_diamond') {
            const poly = createSVGElement('polygon')
            const p1 = `${px},${py - dotSize}`
            const p2 = `${px + dotSize},${py}`
            const p3 = `${px},${py + dotSize}`
            const p4 = `${px - dotSize},${py}`
            poly.setAttribute('points', `${p1} ${p2} ${p3} ${p4}`)
            poly.setAttribute('fill', plotType === 'filled_diamond' ? paintColor : dotColor)
            poly.setAttribute('stroke', dotColor)
            poly.setAttribute('stroke-width', '1')
            dsGroup.appendChild(poly)
          } else if (plotType === 'star') {
            const poly = createSVGElement('polygon')
            poly.setAttribute('points', starPoints(px, py, dotSize))
            poly.setAttribute('fill', paintColor)
            poly.setAttribute('stroke', dotColor)
            poly.setAttribute('stroke-width', '1')
            dsGroup.appendChild(poly)
          } else if (plotType === 'plus' || plotType === 'cross') {
            const g = createSVGElement('g')
            const l1 = createSVGElement('line')
            const l2 = createSVGElement('line')
            if (plotType === 'plus') {
              l1.setAttribute('x1', String(px - dotSize))
              l1.setAttribute('y1', String(py))
              l1.setAttribute('x2', String(px + dotSize))
              l1.setAttribute('y2', String(py))
              l2.setAttribute('x1', String(px))
              l2.setAttribute('y1', String(py - dotSize))
              l2.setAttribute('x2', String(px))
              l2.setAttribute('y2', String(py + dotSize))
            } else {
              l1.setAttribute('x1', String(px - dotSize))
              l1.setAttribute('y1', String(py - dotSize))
              l1.setAttribute('x2', String(px + dotSize))
              l1.setAttribute('y2', String(py + dotSize))
              l2.setAttribute('x1', String(px - dotSize))
              l2.setAttribute('y1', String(py + dotSize))
              l2.setAttribute('x2', String(px + dotSize))
              l2.setAttribute('y2', String(py - dotSize))
            }
            for (const line of [l1, l2]) {
              line.setAttribute('stroke', dotColor)
              line.setAttribute('stroke-width', '1')
              g.appendChild(line)
            }
            dsGroup.appendChild(g)
          }
        }
      }
    }
  }
}