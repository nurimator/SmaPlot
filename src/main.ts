import './style.css'

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
<div class="app">
  <!-- Title Bar -->
  <header class="titlebar">
    <div class="titlebar-left">
      <div class="app-icon">
        <span class="material-symbols-outlined">analytics</span>
      </div>
      <span class="app-title">Sma4Win - Untitled</span>
    </div>
    <div class="window-controls">
      <button class="window-btn" title="Minimize"><span class="material-symbols-outlined" style="font-size:16px">remove</span></button>
      <button class="window-btn" title="Maximize"><span class="material-symbols-outlined" style="font-size:14px">crop_square</span></button>
      <button class="window-btn close" title="Close"><span class="material-symbols-outlined" style="font-size:18px">close</span></button>
    </div>
  </header>

  <!-- Menu Bar -->
  <nav class="menubar">
    <div class="menu-item">File</div>
    <div class="menu-item">Data</div>
    <div class="menu-item">Edit</div>
    <div class="menu-item">Graph</div>
    <div class="menu-item">Insert</div>
    <div class="menu-item">Analyze</div>
    <div class="menu-item">Option</div>
    <div class="menu-item">Help</div>
  </nav>

  <!-- Toolbar -->
  <div class="toolbar">
    <div class="toolbar-btn" title="New" data-action="new"><span class="material-symbols-outlined">description</span></div>
    <div class="toolbar-btn" title="Open"><span class="material-symbols-outlined">folder_open</span></div>
    <div class="toolbar-btn" title="Save"><span class="material-symbols-outlined">save</span></div>
    <div class="toolbar-btn" title="Print"><span class="material-symbols-outlined">print</span></div>
    <div class="toolbar-sep"></div>
    <div class="toolbar-btn" title="Text"><span class="toolbar-icon-text">AB</span></div>
    <div class="toolbar-btn active" title="Select"><div class="toolbar-icon-select"></div></div>
    <div class="toolbar-btn" title="Line"><div class="toolbar-icon-line"></div></div>
    <div class="toolbar-btn" title="Zoom"><span class="material-symbols-outlined">search</span></div>
    <div class="toolbar-btn" title="Add Text"><span class="toolbar-icon-text-blue">A</span></div>
    <div class="toolbar-btn" title="Clear"><span class="toolbar-icon-text">C</span></div>
    <div class="toolbar-sep"></div>
    <div class="toolbar-btn" title="Copy"><span class="material-symbols-outlined">content_copy</span></div>
    <div class="toolbar-btn" title="Chart"><span class="material-symbols-outlined">show_chart</span></div>
    <div class="toolbar-sep"></div>
    <div class="toolbar-btn" title="Warning"><span class="material-symbols-outlined toolbar-icon-error">error</span></div>
    <div class="toolbar-btn" title="Help"><span class="material-symbols-outlined toolbar-icon-help">help</span></div>
  </div>

  <!-- Main Workspace -->
  <main class="workspace">
    <div class="workspace-grid">
      <div class="graph-area"></div>
      <div class="workspace-right"></div>
    </div>

    <div class="scrollbar-v">
      <div class="scroll-btn" title="Scroll up"><span class="material-symbols-outlined">arrow_drop_up</span></div>
      <div class="scroll-btn" title="Scroll down"><span class="material-symbols-outlined">arrow_drop_down</span></div>
    </div>
    <div class="scrollbar-h">
      <div class="scroll-btn" title="Scroll left"><span class="material-symbols-outlined">arrow_left</span></div>
      <div class="scroll-btn" title="Scroll right"><span class="material-symbols-outlined">arrow_right</span></div>
    </div>
  </main>

  <!-- Status Bar -->
  <footer class="statusbar">
    <div class="status-file">
      <span class="status-dot status-dot-idle"></span>
      No data
    </div>
    <div class="status-coords">(0, 0)</div>
    <div class="status-pos"></div>
  </footer>

  <!-- Shared context menu -->
  <div class="context-menu" id="ctxMenu">
    <div class="context-menu-item">Date property <span class="material-symbols-outlined">chevron_right</span></div>
    <div class="context-separator"></div>
    <div class="context-menu-item">X-Axis <span class="material-symbols-outlined">chevron_right</span></div>
    <div class="context-menu-item">Y-Axis <span class="material-symbols-outlined">chevron_right</span></div>
    <div class="context-menu-item">U-Axis <span class="material-symbols-outlined">chevron_right</span></div>
    <div class="context-menu-item">R-Axis <span class="material-symbols-outlined">chevron_right</span></div>
    <div class="context-separator"></div>
    <div class="context-menu-item">Frame <span class="material-symbols-outlined">chevron_right</span></div>
    <div class="context-separator"></div>
    <div class="context-menu-item">String</div>
    <div class="context-menu-item">Arrow</div>
    <div class="context-menu-item">Rectangle</div>
  </div>
</div>
`

const graphArea = app.querySelector<HTMLDivElement>('.graph-area')!
const newBtn = app.querySelector<HTMLDivElement>('[data-action="new"]')!
const ctxMenu = app.querySelector<HTMLDivElement>('#ctxMenu')!

let boxCount = 0

const svgDataMap = new WeakMap<SVGSVGElement, Dataset[]>()
let activeDrag: {
  svg: SVGSVGElement
  dir: string
  startX: number
  startY: number
  startLeft: number
  startTop: number
  startWidth: number
  startHeight: number
} | null = null
let rafId: number | null = null

// ===== Data loading =====
interface Dataset {
  name: string
  color: string
  x: number[]
  y: number[]
}

async function loadDataset(path: string): Promise<Dataset> {
  const res = await fetch(path)
  const text = await res.text()
  const x: number[] = []
  const y: number[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    const parts = line.split(/\s+/)
    if (parts.length >= 2) {
      x.push(parseFloat(parts[0]))
      y.push(parseFloat(parts[1]))
    }
  }
  const fileName = path.split('/').pop()?.replace('.txt', '') || 'Dataset'
  let name = fileName
  let color = '#000'
  if (fileName.includes('Cobalt') || fileName.includes('CoFe')) {
    name = 'CoFeO'
    color = '#ef4444'
  }
  if (fileName.includes('BiVO') || fileName.includes('BiVOTiO')) {
    name = 'BiVOTiO'
    color = '#10b981'
  }
  return { name, color, x, y }
}

// ===== Nice axis scaling =====
function niceScale(min: number, max: number, maxTicks: number): { min: number; max: number; step: number } {
  if (min === max) { min -= 1; max += 1 }
  const range = max - min
  const roughStep = range / (maxTicks - 1)
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)))
  const residual = roughStep / magnitude
  const niceStep = residual <= 1.5 ? 1 * magnitude : residual <= 3.5 ? 2 * magnitude : residual <= 7.5 ? 5 * magnitude : 10 * magnitude
  const niceMin = Math.floor(min / niceStep) * niceStep
  const niceMax = Math.ceil(max / niceStep) * niceStep
  return { min: niceMin, max: niceMax, step: niceStep }
}

function formatTick(value: number): string {
  if (Math.abs(value) >= 10000) return value.toExponential(1)
  if (Number.isInteger(value)) return value.toString()
  const fixed = value.toFixed(1)
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed
}

const SVG_NS = 'http://www.w3.org/2000/svg'

function createSVGElement<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K]
}

function drawPlot(svg: SVGSVGElement, datasets: Dataset[], explicitW?: number, explicitH?: number): void {
  const w = explicitW || svg.clientWidth || parseFloat(svg.style.width) || 400
  const h = explicitH || svg.clientHeight || parseFloat(svg.style.height) || 300
  if (w <= 0 || h <= 0) return

  svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
  svg.innerHTML = ''

  const margin = { l: 60, r: 20, t: 20, b: 50 }
  const plotW = Math.max(10, w - margin.l - margin.r)
  const plotH = Math.max(10, h - margin.t - margin.b)

  let xMin = Infinity, xMax = -Infinity
  let yMin = 0, yMax = -Infinity
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

  // X ticks
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

  // Y ticks
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

  // Edge and Corner drag handles aligned with the plot frame box
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

  // Edges on the plot frame
  addHandle(fx + hs, fy - hs / 2, fw - 2 * hs, hs, 'top')
  addHandle(fx + hs, fy + fh - hs / 2, fw - 2 * hs, hs, 'bottom')
  addHandle(fx - hs / 2, fy + hs, hs, fh - 2 * hs, 'left')
  addHandle(fx + fw - hs / 2, fy + hs, hs, fh - 2 * hs, 'right')

  // Corners on the plot frame
  addHandle(fx - hs / 2, fy - hs / 2, hs, hs, 'top-left')
  addHandle(fx + fw - hs / 2, fy - hs / 2, hs, hs, 'top-right')
  addHandle(fx - hs / 2, fy + fh - hs / 2, hs, hs, 'bottom-left')
  addHandle(fx + fw - hs / 2, fy + fh - hs / 2, hs, hs, 'bottom-right')

  // Visual handles (control points) placed at the corners and centers of the frame box
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

// ===== Create plot =====
async function createPlot(x: number, y: number): Promise<void> {
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
}

// ===== Context menu =====
function hideMenu(): void {
  ctxMenu.classList.remove('open')
}

function showMenu(px: number, py: number): void {
  ctxMenu.classList.add('open')
  const rect = ctxMenu.getBoundingClientRect()
  let left = px
  let top = py
  if (left + rect.width > window.innerWidth) left = window.innerWidth - rect.width - 8
  if (top + rect.height > window.innerHeight) top = window.innerHeight - rect.height - 8
  ctxMenu.style.left = `${left}px`
  ctxMenu.style.top = `${top}px`
}

newBtn.addEventListener('click', async () => {
  const offset = (boxCount % 6) * 28
  await createPlot(40 + offset, 40 + offset)
})

graphArea.addEventListener('contextmenu', (e) => {
  if (activeDrag) {
    e.preventDefault()
    return
  }
  const target = e.target as HTMLElement
  if (!target.closest('.plot-svg')) return
  e.preventDefault()
  showMenu(e.clientX, e.clientY)
})

document.addEventListener('mousemove', (e: MouseEvent) => {
  if (!activeDrag) return
  const { svg, dir, startX, startY, startLeft, startTop, startWidth, startHeight } = activeDrag
  const dx = e.clientX - startX
  const dy = e.clientY - startY
  let newLeft = startLeft
  let newTop = startTop
  let newWidth = startWidth
  let newHeight = startHeight

  const GRID_SIZE = 20
  const margin = { l: 60, r: 20, t: 20, b: 50 }
  const minPlotW = 120
  const minPlotH = 80

  const startPlotW = startWidth - margin.l - margin.r
  const startPlotH = startHeight - margin.t - margin.b

  if (dir.includes('right')) {
    const rawRight = startLeft + margin.l + startPlotW + dx
    const snappedRight = Math.round(rawRight / GRID_SIZE) * GRID_SIZE
    const newPlotW = Math.max(minPlotW, snappedRight - (startLeft + margin.l))
    newWidth = newPlotW + margin.l + margin.r
  }

  if (dir.includes('left')) {
    const rawLeft = startLeft + margin.l + dx
    const snappedLeft = Math.round(rawLeft / GRID_SIZE) * GRID_SIZE
    const maxLeft = startLeft + margin.l + startPlotW - minPlotW
    const finalLeftFrame = Math.min(maxLeft, snappedLeft)
    newLeft = finalLeftFrame - margin.l
    newWidth = startLeft + startWidth - newLeft
  }

  if (dir.includes('bottom')) {
    const rawBottom = startTop + margin.t + startPlotH + dy
    const snappedBottom = Math.round(rawBottom / GRID_SIZE) * GRID_SIZE
    const newPlotH = Math.max(minPlotH, snappedBottom - (startTop + margin.t))
    newHeight = newPlotH + margin.t + margin.b
  }

  if (dir.includes('top')) {
    const rawTop = startTop + margin.t + dy
    const snappedTop = Math.round(rawTop / GRID_SIZE) * GRID_SIZE
    const maxTop = startTop + margin.t + startPlotH - minPlotH
    const finalTopFrame = Math.min(maxTop, snappedTop)
    newTop = finalTopFrame - margin.t
    newHeight = startTop + startHeight - newTop
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

document.addEventListener('click', hideMenu)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideMenu()
})

