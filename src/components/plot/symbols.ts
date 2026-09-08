import type { Dataset } from '../../types.ts'
import { DIAMOND_FAMILY, TRIANGLE_FAMILY } from '../../utils/smpMarkerCodes.ts'
import {
  createSVGElement,
  diamondPoints,
  hexagonPoints,
  pentagonPoints,
  starPoints,
  triangleDownPoints,
  triangleUpPoints,
} from './svg.ts'

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

const f2 = (n: number): string => n.toFixed(2)

function shapeEl(
  tag: 'circle' | 'rect' | 'polygon' | 'path',
  dotColor: string,
  fill: string,
  sw: number
): SVGElement {
  const el = createSVGElement(tag)
  el.setAttribute('stroke', dotColor)
  el.setAttribute('stroke-width', String(sw))
  el.setAttribute('fill', fill)
  return el
}

function lineEl(x1: number, y1: number, x2: number, y2: number, color: string, sw: number): SVGLineElement {
  const line = createSVGElement('line')
  line.setAttribute('x1', f2(x1))
  line.setAttribute('y1', f2(y1))
  line.setAttribute('x2', f2(x2))
  line.setAttribute('y2', f2(y2))
  line.setAttribute('stroke', color)
  line.setAttribute('stroke-width', String(sw))
  return line
}

function group(children: SVGElement[]): SVGElement {
  const g = createSVGElement('g')
  for (const c of children) g.appendChild(c)
  return g
}

export function createSeriesSymbol(
  plotType: string,
  cx: number,
  cy: number,
  r: number,
  dotColor: string,
  paintColor: string,
  strokeWidth = 1
): SVGElement | null {
  if (plotType === 'no_dot' || plotType === 'none' || plotType === 'bar') return null
  const sw = strokeWidth > 0 ? strokeWidth : 1
  const filled = (v: string) => v.startsWith('filled_')

  if (plotType === 'circle' || plotType === 'filled_circle') {
    const circle = shapeEl('circle', dotColor, filled(plotType) ? paintColor : dotColor, sw)
    circle.setAttribute('cx', f2(cx))
    circle.setAttribute('cy', f2(cy))
    circle.setAttribute('r', f2(r))
    return circle
  }

  if (plotType === 'square' || plotType === 'filled_square' || plotType === 'box_error') {
    const rect = shapeEl('rect', dotColor, filled(plotType) ? paintColor : dotColor, sw)
    rect.setAttribute('x', f2(cx - r))
    rect.setAttribute('y', f2(cy - r))
    rect.setAttribute('width', f2(r * 2))
    rect.setAttribute('height', f2(r * 2))
    return rect
  }

  if (plotType === 'triangle' || plotType === 'filled_triangle') {
    const poly = shapeEl('polygon', dotColor, filled(plotType) ? paintColor : dotColor, sw)
    poly.setAttribute('points', triangleUpPoints(cx, cy, r))
    return poly
  }

  if (plotType === 'triangle_down' || plotType === 'filled_triangle_down') {
    const poly = shapeEl('polygon', dotColor, filled(plotType) ? paintColor : dotColor, sw)
    poly.setAttribute('points', triangleDownPoints(cx, cy, r))
    return poly
  }

  if (plotType === 'diamond' || plotType === 'filled_diamond') {
    const poly = shapeEl('polygon', dotColor, filled(plotType) ? paintColor : dotColor, sw)
    poly.setAttribute('points', diamondPoints(cx, cy, r))
    return poly
  }

  if (plotType === 'star') {
    const poly = shapeEl('polygon', dotColor, paintColor, sw)
    poly.setAttribute('points', starPoints(cx, cy, r))
    return poly
  }

  if (plotType === 'hexagon') {
    const poly = shapeEl('polygon', dotColor, paintColor, sw)
    poly.setAttribute('points', hexagonPoints(cx, cy, r))
    return poly
  }

  if (plotType === 'pentagon_up' || plotType === 'pentagon_down') {
    const poly = shapeEl('polygon', dotColor, paintColor, sw)
    poly.setAttribute('points', pentagonPoints(cx, cy, r, plotType === 'pentagon_up'))
    return poly
  }

  if (plotType === 'plus') {
    return group([lineEl(cx - r, cy, cx + r + 1, cy, dotColor, sw), lineEl(cx, cy - r, cx, cy + r + 1, dotColor, sw)])
  }

  if (plotType === 'cross') {
    return group([lineEl(cx - r, cy + r, cx + r, cy - r, dotColor, sw), lineEl(cx - r, cy - r, cx + r, cy + r, dotColor, sw)])
  }

  if (plotType === 'diag_a' || plotType === 'diag_error') {
    return lineEl(cx - r, cy + r, cx + r, cy - r, dotColor, sw)
  }

  if (plotType === 'diag_b') {
    return lineEl(cx - r, cy - r, cx + r, cy + r, dotColor, sw)
  }

  if (plotType === 'vbar') {
    const rect = shapeEl('rect', dotColor, dotColor, sw)
    rect.setAttribute('x', f2(cx - r / 3))
    rect.setAttribute('y', f2(cy - r))
    rect.setAttribute('width', f2((r * 2) / 3))
    rect.setAttribute('height', f2(r * 2))
    return rect
  }

  if (plotType === 'hbar') {
    const rect = shapeEl('rect', dotColor, dotColor, sw)
    rect.setAttribute('x', f2(cx - r))
    rect.setAttribute('y', f2(cy - r / 3))
    rect.setAttribute('width', f2(r * 2))
    rect.setAttribute('height', f2((r * 2) / 3))
    return rect
  }

  if (plotType === 'circle_inner') {
    const outer = shapeEl('circle', dotColor, paintColor, sw)
    outer.setAttribute('cx', f2(cx))
    outer.setAttribute('cy', f2(cy))
    outer.setAttribute('r', f2(r))
    const inner = shapeEl('circle', dotColor, dotColor, sw)
    inner.setAttribute('cx', f2(cx))
    inner.setAttribute('cy', f2(cy))
    inner.setAttribute('r', f2(r / 2))
    return group([outer, inner])
  }

  if (plotType === 'square_inner') {
    const outer = shapeEl('rect', dotColor, paintColor, sw)
    outer.setAttribute('x', f2(cx - r))
    outer.setAttribute('y', f2(cy - r))
    outer.setAttribute('width', f2(r * 2))
    outer.setAttribute('height', f2(r * 2))
    const inner = shapeEl('rect', dotColor, dotColor, sw)
    inner.setAttribute('x', f2(cx - r / 2))
    inner.setAttribute('y', f2(cy - r / 2))
    inner.setAttribute('width', f2(r))
    inner.setAttribute('height', f2(r))
    return group([outer, inner])
  }

  if (plotType === 'triangle_inner') {
    const outer = shapeEl('polygon', dotColor, paintColor, sw)
    outer.setAttribute('points', triangleUpPoints(cx, cy, r))
    const inner = shapeEl('polygon', dotColor, dotColor, sw)
    inner.setAttribute('points', triangleUpPoints(cx, cy, r / 2))
    return group([outer, inner])
  }

  if (plotType === 'triangle_down_inner') {
    const outer = shapeEl('polygon', dotColor, paintColor, sw)
    outer.setAttribute('points', triangleDownPoints(cx, cy, r))
    const inner = shapeEl('polygon', dotColor, dotColor, sw)
    inner.setAttribute('points', triangleDownPoints(cx, cy, r / 2))
    return group([outer, inner])
  }

  if (plotType === 'diamond_inner') {
    const outer = shapeEl('polygon', dotColor, paintColor, sw)
    outer.setAttribute('points', diamondPoints(cx, cy, r))
    const inner = shapeEl('polygon', dotColor, dotColor, sw)
    inner.setAttribute('points', diamondPoints(cx, cy, r / 2))
    return group([outer, inner])
  }

  if (plotType === 'half_circle') {
    const half = shapeEl('path', dotColor, paintColor, sw)
    half.setAttribute('d', `M ${f2(cx)} ${f2(cy - r)} A ${f2(r)} ${f2(r)} 0 0 0 ${f2(cx)} ${f2(cy + r)} Z`)
    return half
  }

  if (plotType === 'half_circle_fill') {
    const outer = shapeEl('circle', dotColor, paintColor, sw)
    outer.setAttribute('cx', f2(cx))
    outer.setAttribute('cy', f2(cy))
    outer.setAttribute('r', f2(r))
    const half = shapeEl('path', dotColor, dotColor, sw)
    half.setAttribute('d', `M ${f2(cx)} ${f2(cy - r)} A ${f2(r)} ${f2(r)} 0 0 1 ${f2(cx)} ${f2(cy + r)} Z`)
    return group([outer, half])
  }

  if (plotType === 'half_triangle') {
    const d = r * 1.24
    const hw = r * 1.08
    const by = r * 0.62
    const half = shapeEl('polygon', dotColor, paintColor, sw)
    half.setAttribute('points', `${f2(cx)},${f2(cy - d)} ${f2(cx - hw)},${f2(cy + by)} ${f2(cx)},${f2(cy + by)}`)
    return half
  }

  if (plotType === 'triangle_half_fill') {
    const d = r * 1.24
    const hw = r * 1.08
    const by = r * 0.62
    const outer = shapeEl('polygon', dotColor, paintColor, sw)
    outer.setAttribute('points', triangleUpPoints(cx, cy, r))
    const half = createSVGElement('polygon')
    half.setAttribute('points', `${f2(cx)},${f2(cy - d)} ${f2(cx + hw)},${f2(cy + by)} ${f2(cx)},${f2(cy + by)}`)
    half.setAttribute('fill', dotColor)
    half.setAttribute('stroke', 'none')
    return group([outer, half])
  }

  if (plotType === 'half_square') {
    const half = shapeEl('rect', dotColor, paintColor, sw)
    half.setAttribute('x', f2(cx - r))
    half.setAttribute('y', f2(cy - r))
    half.setAttribute('width', f2(r))
    half.setAttribute('height', f2(r * 2))
    return half
  }

  if (plotType === 'square_half_fill') {
    const outer = shapeEl('rect', dotColor, paintColor, sw)
    outer.setAttribute('x', f2(cx - r))
    outer.setAttribute('y', f2(cy - r))
    outer.setAttribute('width', f2(r * 2))
    outer.setAttribute('height', f2(r * 2))
    const half = createSVGElement('rect')
    half.setAttribute('x', f2(cx))
    half.setAttribute('y', f2(cy - r))
    half.setAttribute('width', f2(r))
    half.setAttribute('height', f2(r * 2))
    half.setAttribute('fill', dotColor)
    half.setAttribute('stroke', 'none')
    return group([outer, half])
  }

  if (plotType === 'half_triangle_down') {
    const d = r * 1.24
    const hw = r * 1.08
    const by = r * 0.62
    const half = shapeEl('polygon', dotColor, paintColor, sw)
    half.setAttribute('points', `${f2(cx)},${f2(cy + d)} ${f2(cx - hw)},${f2(cy - by)} ${f2(cx)},${f2(cy - by)}`)
    return half
  }

  if (plotType === 'triangle_down_half_fill') {
    const d = r * 1.24
    const hw = r * 1.08
    const by = r * 0.62
    const outer = shapeEl('polygon', dotColor, paintColor, sw)
    outer.setAttribute('points', triangleDownPoints(cx, cy, r))
    const half = createSVGElement('polygon')
    half.setAttribute('points', `${f2(cx)},${f2(cy + d)} ${f2(cx + hw)},${f2(cy - by)} ${f2(cx)},${f2(cy - by)}`)
    half.setAttribute('fill', dotColor)
    half.setAttribute('stroke', 'none')
    return group([outer, half])
  }

  if (plotType === 'half_diamond') {
    const d = r * 1.428571
    const half = shapeEl('polygon', dotColor, paintColor, sw)
    half.setAttribute('points', `${f2(cx)},${f2(cy - d)} ${f2(cx - d)},${f2(cy)} ${f2(cx)},${f2(cy + d)}`)
    return half
  }

  if (plotType === 'diamond_half_fill') {
    const d = r * 1.428571
    const outer = shapeEl('polygon', dotColor, paintColor, sw)
    outer.setAttribute('points', diamondPoints(cx, cy, r))
    const half = createSVGElement('polygon')
    half.setAttribute('points', `${f2(cx)},${f2(cy - d)} ${f2(cx + d)},${f2(cy)} ${f2(cx)},${f2(cy + d)}`)
    half.setAttribute('fill', dotColor)
    half.setAttribute('stroke', 'none')
    return group([outer, half])
  }

  if (plotType === 'step_h') {
    const path = shapeEl('path', dotColor, 'none', sw)
    path.setAttribute(
      'd',
      `M ${f2(cx - r * 2)} ${f2(cy - r)} L ${f2(cx)} ${f2(cy - r)} L ${f2(cx)} ${f2(cy + r)} L ${f2(cx + r * 2)} ${f2(cy + r)}`
    )
    return path
  }

  if (plotType === 'step_v') {
    const path = shapeEl('path', dotColor, 'none', sw)
    path.setAttribute(
      'd',
      `M ${f2(cx - r)} ${f2(cy + r * 2)} L ${f2(cx - r)} ${f2(cy)} L ${f2(cx + r)} ${f2(cy)} L ${f2(cx + r)} ${f2(cy - r * 2)}`
    )
    return path
  }

  if (plotType === 'circle_plus') {
    const outer = shapeEl('circle', dotColor, paintColor, sw)
    outer.setAttribute('cx', f2(cx))
    outer.setAttribute('cy', f2(cy))
    outer.setAttribute('r', f2(r))
    return group([outer, lineEl(cx - r, cy, cx + r, cy, dotColor, sw), lineEl(cx, cy - r, cx, cy + r, dotColor, sw)])
  }

  if (plotType === 'circle_cross') {
    const outer = shapeEl('circle', dotColor, paintColor, sw)
    outer.setAttribute('cx', f2(cx))
    outer.setAttribute('cy', f2(cy))
    outer.setAttribute('r', f2(r))
    return group([
      outer,
      lineEl(cx - r, cy - r, cx + r, cy + r, dotColor, sw),
      lineEl(cx - r, cy + r, cx + r, cy - r, dotColor, sw),
    ])
  }

  if (plotType === 'circle_whisker_r') {
    const outer = shapeEl('circle', dotColor, paintColor, sw)
    outer.setAttribute('cx', f2(cx))
    outer.setAttribute('cy', f2(cy))
    outer.setAttribute('r', f2(r))
    return group([outer, lineEl(cx + r * 2, cy, cx + r - 1, cy, dotColor, sw)])
  }

  if (plotType === 'circle_whisker_l') {
    const outer = shapeEl('circle', dotColor, paintColor, sw)
    outer.setAttribute('cx', f2(cx))
    outer.setAttribute('cy', f2(cy))
    outer.setAttribute('r', f2(r))
    return group([outer, lineEl(cx - r * 2, cy, cx - r + 1, cy, dotColor, sw)])
  }

  if (plotType === 'circle_whisker_d') {
    const outer = shapeEl('circle', dotColor, paintColor, sw)
    outer.setAttribute('cx', f2(cx))
    outer.setAttribute('cy', f2(cy))
    outer.setAttribute('r', f2(r))
    return group([outer, lineEl(cx, cy + r * 2, cx, cy + r - 1, dotColor, sw)])
  }

  if (plotType === 'circle_whisker_u') {
    const outer = shapeEl('circle', dotColor, paintColor, sw)
    outer.setAttribute('cx', f2(cx))
    outer.setAttribute('cy', f2(cy))
    outer.setAttribute('r', f2(r))
    return group([outer, lineEl(cx, cy - r * 2, cx, cy - r + 1, dotColor, sw)])
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

  if (opts.plotType !== 'no_dot' && opts.plotType !== 'none' && opts.plotType !== 'bar') {
    let r = Math.min(5.5, Math.max(3, opts.size))
    if (DIAMOND_FAMILY.has(opts.plotType)) {
      r = Math.min(r, 4.5)
    }
    if (TRIANGLE_FAMILY.has(opts.plotType)) {
      r = Math.min(r, 5.2)
    }
    if (
      opts.plotType === 'circle_whisker_d' ||
      opts.plotType === 'circle_whisker_u' ||
      opts.plotType === 'step_v'
    ) {
      r = Math.min(r, 3.2)
    }
    for (let i = 0; i < count; i++) {
      const cx = (viewBoxWidth * (i + 1)) / (count + 1)
      const symbol = createSeriesSymbol(opts.plotType, cx, cy, r, opts.dotColor, opts.paintColor, 1)
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
