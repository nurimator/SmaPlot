import type { ActiveDrag, Dataset } from '../types.ts'
import { loadDataset } from '../utils/dataset.ts'
import { formatTick, niceScale } from '../utils/scale.ts'

const SVG_NS = 'http://www.w3.org/2000/svg'

function createSVGElement<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K]
}

const svgDataMap = new WeakMap<SVGSVGElement, Dataset[]>()
let activeDrag: ActiveDrag | null = null
let rafId: number | null = null
let boxCount = 0
const allDatasets: Dataset[] = []

export function getActiveDrag(): ActiveDrag | null {
  return activeDrag
}

export function drawPlot(
  svg: SVGSVGElement,
  datasets: Dataset[],
  explicitW?: number,
  explicitH?: number
): void {
  const w = explicitW || svg.clientWidth || parseFloat(svg.style.width) || 400
  const h = explicitH || svg.clientHeight || parseFloat(svg.style.height) || 300
  if (w <= 0 || h <= 0) return

  svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
  svg.innerHTML = ''

  const margin = { l: 60, r: 20, t: 20, b: 50 }
  const plotW = Math.max(10, w - margin.l - margin.r)
  const plotH = Math.max(10, h - margin.t - margin.b)

  let xMin = Infinity,
    xMax = -Infinity
  let yMin = 0,
    yMax = -Infinity
  for (const ds of datasets) {
    for (let i = 0; i < ds.x.length; i++) {
      if (ds.x[i] < xMin) xMin = ds.x[i]
      if (ds.x[i] > xMax) xMax = ds.x[i]
      if (ds.y[i] > yMax) yMax = ds.y[i]
    }
  }

  const xScale = niceScale(xMin, xMax, 6)
  const yScale = niceScale(yMin, yMax, 5)

  const sx = (v: number) => margin.l + ((v - xScale.min) / (xScale.max - xScale.min)) * plotW
  const sy = (v: number) => margin.t + plotH - ((v - yScale.min) / (yScale.max - yScale.min)) * plotH

  // Frame
  const frame = createSVGElement('rect')
  frame.setAttribute('x', String(margin.l))
  frame.setAttribute('y', String(margin.t))
  frame.setAttribute('width', String(plotW))
  frame.setAttribute('height', String(plotH))
  frame.setAttribute('fill', 'none')
  frame.setAttribute('stroke', '#000')
  frame.setAttribute('stroke-width', '1')
  svg.appendChild(frame)

  // X ticks & labels
  for (let v = xScale.min; v <= xScale.max + xScale.step * 0.5; v += xScale.step) {
    const px = sx(v)
    if (px < margin.l || px > margin.l + plotW) continue
    const tick = createSVGElement('line')
    tick.setAttribute('x1', String(px))
    tick.setAttribute('y1', String(margin.t + plotH))
    tick.setAttribute('x2', String(px))
    tick.setAttribute('y2', String(margin.t + plotH + 5))
    tick.setAttribute('stroke', '#475569')
    tick.setAttribute('stroke-width', '1')
    svg.appendChild(tick)

    const label = createSVGElement('text')
    label.setAttribute('x', String(px))
    label.setAttribute('y', String(margin.t + plotH + 18))
    label.setAttribute('text-anchor', 'middle')
    label.setAttribute('font-size', '11')
    label.setAttribute('font-family', 'Inter, system-ui, sans-serif')
    label.setAttribute('fill', '#475569')
    label.textContent = formatTick(v)
    svg.appendChild(label)
  }

  // Y ticks & labels
  for (let v = yScale.min; v <= yScale.max + yScale.step * 0.5; v += yScale.step) {
    const py = sy(v)
    if (py < margin.t || py > margin.t + plotH) continue
    const tick = createSVGElement('line')
    tick.setAttribute('x1', String(margin.l - 5))
    tick.setAttribute('y1', String(py))
    tick.setAttribute('x2', String(margin.l))
    tick.setAttribute('y2', String(py))
    tick.setAttribute('stroke', '#475569')
    tick.setAttribute('stroke-width', '1')
    svg.appendChild(tick)

    const label = createSVGElement('text')
    label.setAttribute('x', String(margin.l - 8))
    label.setAttribute('y', String(py + 4))
    label.setAttribute('text-anchor', 'end')
    label.setAttribute('font-size', '11')
    label.setAttribute('font-family', 'Inter, system-ui, sans-serif')
    label.setAttribute('fill', '#475569')
    label.textContent = formatTick(v)
    svg.appendChild(label)
  }

  // Data paths
  for (const ds of datasets) {
    const points: string[] = []
    for (let i = 0; i < ds.x.length; i++) {
      points.push(`${sx(ds.x[i]).toFixed(1)},${sy(ds.y[i]).toFixed(1)}`)
    }
    const path = createSVGElement('path')
    path.setAttribute('d', `M ${points.join(' ')}`)
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke', ds.color)
    path.setAttribute('stroke-width', '1')
    path.setAttribute('stroke-linejoin', 'round')
    path.setAttribute('stroke-linecap', 'round')
    path.setAttribute('shape-rendering', 'optimizeSpeed')
    svg.appendChild(path)
  }

  // Legend
  const legendX = Math.max(margin.l, margin.l + plotW - 110)
  const legendY = margin.t + 10
  for (let i = 0; i < datasets.length; i++) {
    const ds = datasets[i]
    const ly = legendY + i * 18
    const line = createSVGElement('line')
    line.setAttribute('x1', String(legendX))
    line.setAttribute('y1', String(ly))
    line.setAttribute('x2', String(legendX + 16))
    line.setAttribute('y2', String(ly))
    line.setAttribute('stroke', ds.color)
    line.setAttribute('stroke-width', '1')
    svg.appendChild(line)

    const text = createSVGElement('text')
    text.setAttribute('x', String(legendX + 22))
    text.setAttribute('y', String(ly + 4))
    text.setAttribute('font-size', '11')
    text.setAttribute('font-family', 'Inter, system-ui, sans-serif')
    text.setAttribute('fill', '#334155')
    text.textContent = ds.name
    svg.appendChild(text)
  }

  // Edge and Corner drag handles aligned with plot frame box
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
  const addVisualHandle = (cx: number, cy: number) => {
    const dot = createSVGElement('rect')
    dot.setAttribute('x', String(cx - 3))
    dot.setAttribute('y', String(cy - 3))
    dot.setAttribute('width', '6')
    dot.setAttribute('height', '6')
    dot.setAttribute('fill', '#2563eb')
    dot.setAttribute('stroke', '#ffffff')
    dot.setAttribute('stroke-width', '1')
    dot.setAttribute('style', 'pointer-events: none;')
    svg.appendChild(dot)
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

export async function createPlot(
  graphArea: HTMLElement,
  x: number,
  y: number
): Promise<SVGSVGElement> {
  boxCount++

  const svg = createSVGElement('svg')
  svg.setAttribute('class', 'plot-svg')
  svg.style.left = `${x}px`
  svg.style.top = `${y}px`
  svg.style.width = '400px'
  svg.style.height = '300px'

  graphArea.appendChild(svg)

  const [cobalt, bivo] = await Promise.all([
    loadDataset('/dummy-data/Cobalt0.txt'),
    loadDataset('/dummy-data/BiVO4TiO2 PKM.txt'),
  ])

  const datasets = [cobalt, bivo]

  for (const ds of datasets) {
    if (!allDatasets.some(d => d.name === ds.name)) {
      allDatasets.push(ds)
    }
  }

  svgDataMap.set(svg, datasets)
  drawPlot(svg, datasets, 400, 300)

  svg.addEventListener('mousedown', (e: MouseEvent) => {
    const target = e.target as SVGElement
    const dir = target.getAttribute('data-dir')
    if (!dir) return
    e.preventDefault()
    e.stopPropagation()

    const rect = svg.getBoundingClientRect()
    const parentRect = graphArea.getBoundingClientRect()

    activeDrag = {
      svg,
      dir,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: parseFloat(svg.style.left) || rect.left - parentRect.left,
      startTop: parseFloat(svg.style.top) || rect.top - parentRect.top,
      startWidth: parseFloat(svg.style.width) || rect.width,
      startHeight: parseFloat(svg.style.height) || rect.height,
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

function snapToGridThreshold(val: number, step: number = 200, threshold: number = 10): number {
  const nearest = Math.round(val / step) * step
  if (Math.abs(val - nearest) <= threshold) {
    return nearest
  }
  return val
}

// Global mousemove & mouseup listeners for resize with snap to grid
export function initPlotDragListeners(): void {
  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (!activeDrag) return
    const { svg, dir, startX, startY, startLeft, startTop, startWidth, startHeight } = activeDrag
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    let newLeft = startLeft
    let newTop = startTop
    let newWidth = startWidth
    let newHeight = startHeight

    const GRID_SIZE = 200 // Major grid lines (every 200px)
    const SNAP_THRESHOLD = 10 // Snap only when cursor is within 10px of a major grid line
    const margin = { l: 60, r: 20, t: 20, b: 50 }
    const minPlotW = 120
    const minPlotH = 80

    const startPlotW = startWidth - margin.l - margin.r
    const startPlotH = startHeight - margin.t - margin.b

    if (dir === 'left' || dir === 'top' || dir === 'top-left') {
      // MOVE: Both X and Y axes move freely simultaneously with magnetic grid snap
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
        const newPlotW = Math.max(minPlotW, snappedRight - (startLeft + margin.l))
        newWidth = newPlotW + margin.l + margin.r
      }

      if (dir.includes('left')) {
        const rawLeftFrame = startLeft + margin.l + dx
        const snappedLeftFrame = snapToGridThreshold(rawLeftFrame, GRID_SIZE, SNAP_THRESHOLD)
        newLeft = snappedLeftFrame - margin.l
      }

      if (dir.includes('bottom')) {
        const rawBottom = startTop + margin.t + startPlotH + dy
        const snappedBottom = snapToGridThreshold(rawBottom, GRID_SIZE, SNAP_THRESHOLD)
        const newPlotH = Math.max(minPlotH, snappedBottom - (startTop + margin.t))
        newHeight = newPlotH + margin.t + margin.b
      }

      if (dir.includes('top')) {
        const rawTopFrame = startTop + margin.t + dy
        const snappedTopFrame = snapToGridThreshold(rawTopFrame, GRID_SIZE, SNAP_THRESHOLD)
        newTop = snappedTopFrame - margin.t
      }
    }

    svg.style.left = `${newLeft}px`
    svg.style.top = `${newTop}px`
    svg.style.width = `${newWidth}px`
    svg.style.height = `${newHeight}px`

    if (rafId) cancelAnimationFrame(rafId)
    const currentDrag = activeDrag
    rafId = requestAnimationFrame(() => {
      if (!currentDrag) return
      const ds = svgDataMap.get(currentDrag.svg)
      if (ds) drawPlot(currentDrag.svg, ds, newWidth, newHeight)
      rafId = null
    })
  })

  document.addEventListener('mouseup', () => {
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
