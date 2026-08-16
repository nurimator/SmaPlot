import type { Dataset } from '../../types.ts'
import { createSVGElement, starPoints } from './svg.ts'

// Dash-array pattern shared by the data series, legend line samples, and the
// Data Manager series icon. Returns 'none' when the line is solid.
export function getLineDashArray(lineType: string | undefined): string {
  let dashArray = 'none'
  if (lineType === 'dotted') {
    dashArray = '2 2'
  } else if (lineType === 'dash_dot') {
    dashArray = '6 3 2 3'
  } else if (lineType === 'dash_dot_dot') {
    dashArray = '6 3 2 3 2 3'
  } else if (lineType === 'dash' || lineType === 'dashed') {
    dashArray = '6 3'
  }
  return dashArray
}

// Marker symbol for one data point. Shared by the plot data series, the legend
// line samples, and the Data Manager series icon. Returns null for 'no_dot'/'none'.
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

// Legend-style series icon: line sample (color + dash pattern) with the plot
// marker shape on top, mirroring the legend rendering in the plot. Purely
// visual — not clickable.
export function createSeriesIcon(ds: Dataset): SVGSVGElement {
  const svg = createSVGElement('svg')
  svg.setAttribute('class', 'dm-series-icon')
  svg.setAttribute('viewBox', '0 0 24 14')
  svg.setAttribute('aria-hidden', 'true')

  const color = ds.options?.lineColor || ds.color || '#000000'
  const cx = 12
  const cy = 7

  const line = createSVGElement('line')
  line.setAttribute('x1', '2')
  line.setAttribute('y1', String(cy))
  line.setAttribute('x2', '22')
  line.setAttribute('y2', String(cy))
  line.setAttribute('stroke', color)
  const widthMm = ds.options?.width ?? (ds.smpSeriesStylePrefix ? ds.smpSeriesStylePrefix / 100 : 0.6)
  line.setAttribute('stroke-width', String(Math.max(1, Number((widthMm * 2).toFixed(2)))))
  line.setAttribute('stroke-linecap', 'round')

  const lineType = ds.options?.lineType || 'solid'
  const dashArray = getLineDashArray(lineType)
  if (dashArray !== 'none') line.setAttribute('stroke-dasharray', dashArray)
  svg.appendChild(line)

  const plotType = ds.options?.plotType || 'no_dot'
  if (plotType !== 'no_dot' && plotType !== 'none') {
    const dotColor = ds.options?.dotColor || color
    const paintColor = ds.options?.paintColor || '#ffffff'
    const r = Math.min(5.5, Math.max(3, ds.options?.size || 3.5))
    const symbol = createSeriesSymbol(plotType, cx, cy, r, dotColor, paintColor)
    if (symbol) svg.appendChild(symbol)
  }

  return svg
}