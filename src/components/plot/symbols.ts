import type { Dataset } from '../../types.ts'
import { createSVGElement, starPoints } from './svg.ts'

export function getLineDashArray(lineType: string | undefined, strokeWidth = 0): string {
  if (lineType === 'dotted') return dashedPair(2, 2, strokeWidth)
  if (lineType === 'dash_dot') return `${dashedPair(6, 3, strokeWidth)} ${dashedPair(2, 3, strokeWidth)}`
  if (lineType === 'dash_dot_dot') {
    return `${dashedPair(6, 3, strokeWidth)} ${dashedPair(2, 3, strokeWidth)} ${dashedPair(2, 3, strokeWidth)}`
  }
  if (lineType === 'dash' || lineType === 'dashed') return dashedPair(6, 3, strokeWidth)
  return 'none'
}

function dashedPair(on: number, gap: number, strokeWidth: number): string {
  if (strokeWidth <= 0) return `${on} ${gap}`
  return `${Math.max(0.5, on - strokeWidth).toFixed(1)} ${Math.max(0.5, gap + strokeWidth).toFixed(1)}`
}

export function createSeriesSymbol(
  plotType: string,
  cx: number,
  cy: number,
  r: number,
  dotColor: string,
  paintColor: string
): SVGElement | null {
  if (plotType === 'no_dot' || plotType === 'none') return null

  if (plotType === 'circle' || plotType === 'filled_circle') {
    const circle = createSVGElement('circle')
    circle.setAttribute('cx', String(cx))
    circle.setAttribute('cy', String(cy))
    circle.setAttribute('r', String(r))
    circle.setAttribute('fill', plotType === 'filled_circle' ? paintColor : dotColor)
    circle.setAttribute('stroke', dotColor)
    circle.setAttribute('stroke-width', '1')
    return circle
  }

  if (plotType === 'square' || plotType === 'filled_square') {
    const rect = createSVGElement('rect')
    rect.setAttribute('x', String(cx - r))
    rect.setAttribute('y', String(cy - r))
    rect.setAttribute('width', String(r * 2))
    rect.setAttribute('height', String(r * 2))
    rect.setAttribute('fill', plotType === 'filled_square' ? paintColor : dotColor)
    rect.setAttribute('stroke', dotColor)
    rect.setAttribute('stroke-width', '1')
    return rect
  }

  if (plotType === 'triangle' || plotType === 'filled_triangle') {
    const poly = createSVGElement('polygon')
    poly.setAttribute('points', `${cx},${cy - r} ${cx - r},${cy + r} ${cx + r},${cy + r}`)
    poly.setAttribute('fill', plotType === 'filled_triangle' ? paintColor : dotColor)
    poly.setAttribute('stroke', dotColor)
    poly.setAttribute('stroke-width', '1')
    return poly
  }

  if (plotType === 'triangle_down' || plotType === 'filled_triangle_down') {
    const poly = createSVGElement('polygon')
    poly.setAttribute('points', `${cx - r},${cy - r} ${cx + r},${cy - r} ${cx},${cy + r}`)
    poly.setAttribute('fill', plotType === 'filled_triangle_down' ? paintColor : dotColor)
    poly.setAttribute('stroke', dotColor)
    poly.setAttribute('stroke-width', '1')
    return poly
  }

  if (plotType === 'diamond' || plotType === 'filled_diamond') {
    const poly = createSVGElement('polygon')
    poly.setAttribute('points', `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`)
    poly.setAttribute('fill', plotType === 'filled_diamond' ? paintColor : dotColor)
    poly.setAttribute('stroke', dotColor)
    poly.setAttribute('stroke-width', '1')
    return poly
  }

  if (plotType === 'star') {
    const poly = createSVGElement('polygon')
    poly.setAttribute('points', starPoints(cx, cy, r))
    poly.setAttribute('fill', paintColor)
    poly.setAttribute('stroke', dotColor)
    poly.setAttribute('stroke-width', '1')
    return poly
  }

  if (plotType === 'plus' || plotType === 'cross') {
    const g = createSVGElement('g')
    const l1 = createSVGElement('line')
    const l2 = createSVGElement('line')
    if (plotType === 'plus') {
      l1.setAttribute('x1', String(cx - r))
      l1.setAttribute('y1', String(cy))
      l1.setAttribute('x2', String(cx + r))
      l1.setAttribute('y2', String(cy))
      l2.setAttribute('x1', String(cx))
      l2.setAttribute('y1', String(cy - r))
      l2.setAttribute('x2', String(cx))
      l2.setAttribute('y2', String(cy + r))
    } else {
      l1.setAttribute('x1', String(cx - r))
      l1.setAttribute('y1', String(cy - r))
      l1.setAttribute('x2', String(cx + r))
      l1.setAttribute('y2', String(cy + r))
      l2.setAttribute('x1', String(cx - r))
      l2.setAttribute('y1', String(cy + r))
      l2.setAttribute('x2', String(cx + r))
      l2.setAttribute('y2', String(cy - r))
    }
    for (const line of [l1, l2]) {
      line.setAttribute('stroke', dotColor)
      line.setAttribute('stroke-width', '1')
      g.appendChild(line)
    }
    return g
  }

  return null
}

export function createArrowShapeSymbol(shape: string): SVGElement | null {
  const color = '#475569'
  const g = createSVGElement('g')

  const line = createSVGElement('line')
  line.setAttribute('x1', '1.5')
  line.setAttribute('y1', '6')
  line.setAttribute('x2', '10.5')
  line.setAttribute('y2', '6')
  line.setAttribute('stroke', color)
  line.setAttribute('stroke-width', '1.2')
  line.setAttribute('stroke-linecap', 'round')
  g.appendChild(line)

  if (shape === 'arrow_end' || shape === 'arrow_both') {
    const head = createSVGElement('polygon')
    head.setAttribute('points', '10.5,6 8.3,4.4 8.3,7.6')
    head.setAttribute('fill', color)
    g.appendChild(head)
  }
  if (shape === 'arrow_start' || shape === 'arrow_both') {
    const head = createSVGElement('polygon')
    head.setAttribute('points', '1.5,6 3.7,4.4 3.7,7.6')
    head.setAttribute('fill', color)
    g.appendChild(head)
  }
  if (shape === 'measure_line') {
    for (const x of ['1.5', '10.5']) {
      const tick = createSVGElement('line')
      tick.setAttribute('x1', x)
      tick.setAttribute('y1', '3.5')
      tick.setAttribute('x2', x)
      tick.setAttribute('y2', '8.5')
      tick.setAttribute('stroke', color)
      tick.setAttribute('stroke-width', '1.2')
      tick.setAttribute('stroke-linecap', 'round')
      g.appendChild(tick)
    }
  }

  return g
}

export interface SeriesIconOptions {
  color: string
  lineWidthPx: number
  lineType: string
  plotType: string
  dotColor: string
  paintColor: string
  size: number
  markerCount?: number
  viewBoxWidth?: number
}

export function createSeriesIconFromOpts(opts: SeriesIconOptions): SVGSVGElement {
  const count = opts.markerCount ?? 1
  const viewBoxWidth = opts.viewBoxWidth ?? 24
  const svg = createSVGElement('svg')
  svg.setAttribute('class', 'dm-series-icon')
  svg.setAttribute('viewBox', `0 0 ${viewBoxWidth} 14`)
  svg.setAttribute('aria-hidden', 'true')

  const cy = 7

  if (opts.lineType !== 'no_line') {
    const line = createSVGElement('line')
    line.setAttribute('x1', '2')
    line.setAttribute('y1', String(cy))
    line.setAttribute('x2', String(viewBoxWidth - 2))
    line.setAttribute('y2', String(cy))
    line.setAttribute('stroke', opts.color)
    line.setAttribute('stroke-width', String(opts.lineWidthPx))
    line.setAttribute('stroke-linecap', 'round')
    const dashArray = getLineDashArray(opts.lineType, opts.lineWidthPx)
    if (dashArray !== 'none') line.setAttribute('stroke-dasharray', dashArray)
    svg.appendChild(line)
  }

  if (opts.plotType !== 'no_dot' && opts.plotType !== 'none') {
    const r = Math.min(5.5, Math.max(3, opts.size))
    for (let i = 0; i < count; i++) {
      const cx = (viewBoxWidth * (i + 1)) / (count + 1)
      const symbol = createSeriesSymbol(opts.plotType, cx, cy, r, opts.dotColor, opts.paintColor)
      if (symbol) svg.appendChild(symbol)
    }
  }

  return svg
}

export function createSeriesIcon(ds: Dataset): SVGSVGElement {
  const color = ds.options?.lineColor || ds.color || '#000000'
  const widthMm = ds.options?.width ?? (ds.smpSeriesStylePrefix ? ds.smpSeriesStylePrefix / 100 : 0.6)
  return createSeriesIconFromOpts({
    color,
    lineWidthPx: Math.max(1, Number((widthMm * 2).toFixed(2))),
    lineType: ds.options?.lineType || 'solid',
    plotType: ds.options?.plotType || 'no_dot',
    dotColor: ds.options?.dotColor || color,
    paintColor: ds.options?.paintColor || '#ffffff',
    size: ds.options?.size ?? 3.5,
  })
}