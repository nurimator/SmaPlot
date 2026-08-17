import { getPlotLimits } from './smpDoc.ts'
import { PLOT_MARGIN, createSVGElement } from './svg.ts'
import { svgCrossbarMap } from './state.ts'

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

export function renderPlotCrossbar(svg: SVGSVGElement, xVal: number, yVal: number): void {
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

  const vLine = createSVGElement('line')
  vLine.setAttribute('x1', String(px))
  vLine.setAttribute('y1', String(margin.t))
  vLine.setAttribute('x2', String(px))
  vLine.setAttribute('y2', String(margin.t + plotH))
  vLine.setAttribute('stroke', '#ff0000')
  vLine.setAttribute('stroke-width', '0.5')
  group.appendChild(vLine)

  const hLine = createSVGElement('line')
  hLine.setAttribute('x1', String(margin.l))
  hLine.setAttribute('y1', String(py))
  hLine.setAttribute('x2', String(margin.l + plotW))
  hLine.setAttribute('y2', String(py))
  hLine.setAttribute('stroke', '#ff0000')
  hLine.setAttribute('stroke-width', '0.5')
  group.appendChild(hLine)
}