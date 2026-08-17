import { activeSvgs, ensureSmpDoc, getSelectedPlotSvg, isTrimmingMode, PLOT_MARGIN, setSelectedPlotSvg, updatePlotVisual } from './plot/index.ts'
import { getCanvasZoom } from '../utils/canvasZoom.ts'

interface PlotFrame {
  svg: SVGSVGElement
  l: number
  t: number
  w: number
  h: number
}

function makePlotFrame(svg: SVGSVGElement): PlotFrame {
  const left = parseFloat(svg.style.left) || 0
  const top = parseFloat(svg.style.top) || 0
  const width = parseFloat(svg.style.width) || 400
  const height = parseFloat(svg.style.height) || 300
  const l = left + PLOT_MARGIN.l
  const t = top + PLOT_MARGIN.t
  const w = Math.max(10, width - PLOT_MARGIN.l - PLOT_MARGIN.r)
  const h = Math.max(10, height - PLOT_MARGIN.t - PLOT_MARGIN.b)
  return { svg, l, t, w, h }
}

function findPlotFrameAt(gx: number, gy: number): PlotFrame | null {
  if (activeSvgs.length === 0) return null

  for (let i = activeSvgs.length - 1; i >= 0; i--) {
    const svg = activeSvgs[i]
    const frame = makePlotFrame(svg)
    if (gx >= frame.l && gx <= frame.l + frame.w && gy >= frame.t && gy <= frame.t + frame.h) {
      return frame
    }
  }

  for (let i = activeSvgs.length - 1; i >= 0; i--) {
    const svg = activeSvgs[i]
    const left = parseFloat(svg.style.left) || 0
    const top = parseFloat(svg.style.top) || 0
    const width = parseFloat(svg.style.width) || 400
    const height = parseFloat(svg.style.height) || 300
    if (gx >= left && gx <= left + width && gy >= top && gy <= top + height) {
      return makePlotFrame(svg)
    }
  }

  const selSvg = getSelectedPlotSvg()
  if (selSvg && activeSvgs.includes(selSvg)) {
    return makePlotFrame(selSvg)
  }

  if (activeSvgs.length === 1) {
    return makePlotFrame(activeSvgs[0])
  }

  let closest: PlotFrame | null = null
  let minDist = Infinity
  for (const svg of activeSvgs) {
    const frame = makePlotFrame(svg)
    const cx = frame.l + frame.w / 2
    const cy = frame.t + frame.h / 2
    const dist = Math.hypot(gx - cx, gy - cy)
    if (dist < minDist) {
      minDist = dist
      closest = frame
    }
  }
  return closest
}

// ── Module-level state ──

let _graphAreaEl: HTMLElement | null = null
let _onCommit: (() => void) | null = null
let _onFinish: (() => void) | null = null

let _isTrimming = false
let _hasMoved = false
let _startClientX = 0
let _startClientY = 0
let _startGraphX = 0
let _startGraphY = 0
let _lastGraphX = 0
let _lastGraphY = 0
let _frame: PlotFrame | null = null
let _trimBox: HTMLElement | null = null

const isIgnoredTarget = (target: HTMLElement): boolean =>
  target.closest('.scrollbar-v, .scrollbar-h, .workspace-right, #ctxMenu, #marqueeCtxMenu, [data-dir]') !== null ||
  target.closest('.dialog-overlay, .modal') !== null

// ── Public trim API ──

export function beginTrim(clientX: number, clientY: number): boolean {
  if (!isTrimmingMode() || !_graphAreaEl) return false

  const rect = _graphAreaEl.getBoundingClientRect()
  const zoom = getCanvasZoom()
  const gx = (clientX - rect.left) / zoom
  const gy = (clientY - rect.top) / zoom

  const hitFrame = findPlotFrameAt(gx, gy)
  if (!hitFrame) return false

  _isTrimming = true
  _hasMoved = false
  _frame = hitFrame
  _startClientX = clientX
  _startClientY = clientY
  _startGraphX = gx
  _startGraphY = gy
  _lastGraphX = gx
  _lastGraphY = gy
  document.body.style.userSelect = 'none'
  return true
}

export function updateTrim(clientX: number, clientY: number): void {
  if (!_isTrimming || !_frame || !_graphAreaEl) return
  const dx = clientX - _startClientX
  const dy = clientY - _startClientY
  if (!_hasMoved && Math.hypot(dx, dy) < 4) return

  const rect = _graphAreaEl.getBoundingClientRect()
  const zoom = getCanvasZoom()
  _lastGraphX = (clientX - rect.left) / zoom
  _lastGraphY = (clientY - rect.top) / zoom

  if (!_hasMoved) {
    _hasMoved = true
    _trimBox = document.createElement('div')
    _trimBox.className = 'trim-selection-box'
    _graphAreaEl.appendChild(_trimBox)
  }

  const left = Math.min(_startGraphX, _lastGraphX)
  const top = Math.min(_startGraphY, _lastGraphY)
  const width = Math.abs(_lastGraphX - _startGraphX)
  const height = Math.abs(_lastGraphY - _startGraphY)

  if (_trimBox) {
    _trimBox.style.left = `${left}px`
    _trimBox.style.top = `${top}px`
    _trimBox.style.width = `${width}px`
    _trimBox.style.height = `${height}px`
    _trimBox.style.display = 'block'
  }
}

export function finishTrim(): void {
  if (!_isTrimming || !_frame) return
  _isTrimming = false
  document.body.style.userSelect = ''
  if (_trimBox) {
    _trimBox.remove()
    _trimBox = null
  }

  const f = _frame
  _frame = null

  if (!_hasMoved) return

  const cl = Math.max(f.l, Math.min(_startGraphX, _lastGraphX))
  const cr = Math.min(f.l + f.w, Math.max(_startGraphX, _lastGraphX))
  const ct = Math.max(f.t, Math.min(_startGraphY, _lastGraphY))
  const cb = Math.min(f.t + f.h, Math.max(_startGraphY, _lastGraphY))

  if (cr - cl < 2 || cb - ct < 2) return

  const doc = ensureSmpDoc(f.svg)
  const ax = doc.axisX
  const ay = doc.axisY
  const xMin = ax.min
  const xMax = ax.max
  const yMin = ay.min
  const yMax = ay.max

  const xAt = (gx: number) => xMin + ((gx - f.l) / f.w) * (xMax - xMin)
  const yAt = (gy: number) => yMax - ((gy - f.t) / f.h) * (yMax - yMin)

  const newXMin = xAt(cl)
  const newXMax = xAt(cr)
  const newYMin = yAt(cb)
  const newYMax = yAt(ct)

  ax.min = newXMin
  ax.max = newXMax
  ay.min = newYMin
  ay.max = newYMax

  if (doc.syncWithU !== false && doc.axisTop) {
    doc.axisTop.min = newXMin
    doc.axisTop.max = newXMax
  }
  if (doc.syncWithR !== false && doc.axisRight) {
    doc.axisRight.min = newYMin
    doc.axisRight.max = newYMax
  }

  setSelectedPlotSvg(f.svg)
  updatePlotVisual(f.svg)
  _onCommit?.()
  _onFinish?.()
}

export function cancelTrim(): void {
  if (!_isTrimming) return
  _isTrimming = false
  document.body.style.userSelect = ''
  if (_trimBox) {
    _trimBox.remove()
    _trimBox = null
  }
  _frame = null
}

export function isTrimDragging(): boolean {
  return _isTrimming
}

// ── Initialiser ──

export function initTrimMode(graphAreaEl: HTMLElement, onCommit: () => void, onFinish: () => void): void {
  _graphAreaEl = graphAreaEl
  _onCommit = onCommit
  _onFinish = onFinish

  const workspaceEl = graphAreaEl.closest<HTMLElement>('.workspace') || document.body

  workspaceEl.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button !== 0) return
    if (isIgnoredTarget(e.target as HTMLElement)) return
    if (!beginTrim(e.clientX, e.clientY)) return
    e.preventDefault()
    e.stopPropagation()
  })

  window.addEventListener('mousemove', (e: MouseEvent) => {
    updateTrim(e.clientX, e.clientY)
  })

  window.addEventListener('mouseup', () => {
    finishTrim()
  })

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && _isTrimming) {
      cancelTrim()
    }
  })
}
