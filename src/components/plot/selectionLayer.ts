import { getCanvasZoom, subscribeZoom } from '../../utils/canvasZoom.ts'

const RECT_SELECTOR = '.ov-frame-border, .ov-box, .ov-box-multi, .ov-trans-box'
const HANDLE_SELECTOR = '.ov-dot, .ov-handle, .ov-box-corner, .ov-trans-handle'
const HANDLE_CSS_PX = 9
const HANDLE_TOUCH_CSS_PX = 13
const LINE_CSS_PX = 1.5
const HIT_CSS_PX = 16
const HIT_TOUCH_CSS_PX = 32
const coarsePointer = window.matchMedia('(any-pointer: coarse)')
const OUTLINE_COLOR = '#00ffff'
const HANDLE_FILL = '#00ffff'
const HANDLE_EDGE = '#00838f'
const EPS = 0.01

interface Pt {
  x: number
  y: number
}

let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
let graphArea: HTMLElement | null = null
let frameId: number | null = null
let transitionLoops = 0
let deviceSize: { w: number; h: number } | null = null
let overlayObserver: MutationObserver | null = null

// setup
export function initSelectionLayer(graphAreaEl: HTMLElement): void {
  const container = graphAreaEl.parentElement
  if (!container || canvas) return
  graphArea = graphAreaEl
  canvas = document.createElement('canvas')
  canvas.className = 'selection-layer'
  canvas.setAttribute('aria-hidden', 'true')
  graphAreaEl.after(canvas)
  ctx = canvas.getContext('2d')

  const applyHitSize = (zoom: number): void => {
    const hit = coarsePointer.matches ? HIT_TOUCH_CSS_PX : HIT_CSS_PX
    graphAreaEl.style.setProperty('--ov-hit', `${hit / (zoom || 1)}px`)
  }
  applyHitSize(getCanvasZoom())
  coarsePointer.addEventListener('change', () => {
    applyHitSize(getCanvasZoom())
    requestSelectionLayerRender()
  })
  subscribeZoom((zoom) => {
    applyHitSize(zoom)
    requestSelectionLayerRender()
  })

  overlayObserver = new MutationObserver(requestSelectionLayerRender)
  const observeOverlays = (): void => {
    graphAreaEl.querySelectorAll<HTMLElement>('.plot-overlay').forEach((ov) => {
      overlayObserver?.observe(ov, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class'] })
    })
  }
  new MutationObserver(() => {
    observeOverlays()
    requestSelectionLayerRender()
  }).observe(graphAreaEl, { childList: true, attributes: true, attributeFilter: ['style', 'class'] })
  observeOverlays()

  const resizeObserver = new ResizeObserver((entries) => {
    const entry = entries.find((en) => en.target === canvas)
    const box = entry?.devicePixelContentBoxSize?.[0]
    deviceSize = box ? { w: box.inlineSize, h: box.blockSize } : null
    requestSelectionLayerRender()
  })
  try {
    resizeObserver.observe(canvas, { box: 'device-pixel-content-box' })
  } catch {
    resizeObserver.observe(canvas)
  }
  resizeObserver.observe(container)

  graphAreaEl.addEventListener('transitionrun', () => {
    transitionLoops++
    requestSelectionLayerRender()
  })
  const endLoop = (): void => {
    transitionLoops = Math.max(0, transitionLoops - 1)
    requestSelectionLayerRender()
  }
  graphAreaEl.addEventListener('transitionend', endLoop)
  graphAreaEl.addEventListener('transitioncancel', endLoop)
  window.addEventListener('resize', requestSelectionLayerRender)

  requestSelectionLayerRender()
}

export function requestSelectionLayerRender(): void {
  if (frameId !== null) return
  frameId = requestAnimationFrame(renderSelectionLayer)
}

// geometry
function px(value: string): number {
  const v = parseFloat(value)
  return Number.isFinite(v) ? v : 0
}

function rotationOf(el: HTMLElement): number {
  const m = /rotate\(\s*(-?[\d.]+(?:e-?\d+)?)deg\s*\)/.exec(el.style.transform)
  return m ? (parseFloat(m[1]) * Math.PI) / 180 : 0
}

function toOverlayLocal(el: HTMLElement, x: number, y: number): Pt {
  const parent = el.parentElement
  if (!parent || !parent.classList.contains('ov-rot-wrap')) return { x, y }
  const a = rotationOf(parent)
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return { x: px(parent.style.left) + x * cos - y * sin, y: px(parent.style.top) + x * sin + y * cos }
}

function isShown(el: HTMLElement, stop: HTMLElement): boolean {
  for (let cur: HTMLElement | null = el; cur && cur !== stop.parentElement; cur = cur.parentElement) {
    if (cur.style.display === 'none' || cur.style.visibility === 'hidden') return false
  }
  return true
}

// draw
function drawOutline(c: CanvasRenderingContext2D, pts: Pt[], lw: number): void {
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const aligned = pts.every(
    (p) => (Math.abs(p.x - minX) < EPS || Math.abs(p.x - maxX) < EPS) && (Math.abs(p.y - minY) < EPS || Math.abs(p.y - maxY) < EPS)
  )
  c.fillStyle = OUTLINE_COLOR
  if (aligned) {
    const half = Math.floor(lw / 2)
    const x0 = Math.round(minX) - half
    const y0 = Math.round(minY) - half
    const x1 = Math.round(maxX) - half
    const y1 = Math.round(maxY) - half
    const w = Math.max(lw, x1 - x0 + lw)
    const h = Math.max(lw, y1 - y0 + lw)
    c.fillRect(x0, y0, w, lw)
    c.fillRect(x0, y1, w, lw)
    c.fillRect(x0, y0, lw, h)
    c.fillRect(x1, y0, lw, h)
    return
  }
  c.strokeStyle = OUTLINE_COLOR
  c.lineWidth = lw
  c.beginPath()
  pts.forEach((p, i) => (i === 0 ? c.moveTo(p.x, p.y) : c.lineTo(p.x, p.y)))
  c.closePath()
  c.stroke()
}

function drawHandle(c: CanvasRenderingContext2D, p: Pt, size: number, edge: number): void {
  const left = Math.round(p.x) - (size - 1) / 2
  const top = Math.round(p.y) - (size - 1) / 2
  c.fillStyle = HANDLE_EDGE
  c.fillRect(left, top, size, size)
  c.fillStyle = HANDLE_FILL
  c.fillRect(left + edge, top + edge, size - 2 * edge, size - 2 * edge)
}

function renderSelectionLayer(): void {
  frameId = null
  if (!canvas || !ctx || !graphArea) return
  if (transitionLoops > 0) requestSelectionLayerRender()

  const cssRect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const bw = deviceSize?.w ?? Math.round(cssRect.width * dpr)
  const bh = deviceSize?.h ?? Math.round(cssRect.height * dpr)
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw
    canvas.height = bh
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, bw, bh)
  if (cssRect.width <= 0 || cssRect.height <= 0) return

  const sx = bw / cssRect.width
  const sy = bh / cssRect.height
  const unit = Math.max(1, Math.round(LINE_CSS_PX * sx))
  let size = Math.round((coarsePointer.matches ? HANDLE_TOUCH_CSS_PX : HANDLE_CSS_PX) * sx)
  if (size % 2 === 0) size += 1
  const edge = Math.max(1, Math.round(sx))

  const gRect = graphArea.getBoundingClientRect()
  const zoom = graphArea.offsetWidth > 0 ? gRect.width / graphArea.offsetWidth : 1

  const handles: Pt[] = []
  graphArea.querySelectorAll<HTMLElement>('.plot-overlay').forEach((ov) => {
    if (!isShown(ov, ov)) return
    const ovRect = ov.getBoundingClientRect()
    const toDevice = (p: Pt): Pt => ({
      x: (ovRect.left + p.x * zoom - cssRect.left) * sx,
      y: (ovRect.top + p.y * zoom - cssRect.top) * sy,
    })

    ov.querySelectorAll<HTMLElement>(RECT_SELECTOR).forEach((el) => {
      if (!isShown(el, ov)) return
      const l = px(el.style.left)
      const t = px(el.style.top)
      const w = px(el.style.width)
      const h = px(el.style.height)
      const corners = [
        { x: l, y: t },
        { x: l + w, y: t },
        { x: l + w, y: t + h },
        { x: l, y: t + h },
      ].map((p) => toDevice(toOverlayLocal(el, p.x, p.y)))
      drawOutline(ctx!, corners, unit)
    })

    ov.querySelectorAll<HTMLElement>(HANDLE_SELECTOR).forEach((el) => {
      if (!isShown(el, ov)) return
      handles.push(toDevice(toOverlayLocal(el, px(el.style.left), px(el.style.top))))
    })
  })

  handles.forEach((p) => drawHandle(ctx!, p, size, edge))
}
