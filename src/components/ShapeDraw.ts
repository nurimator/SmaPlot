import { PLOT_MARGIN, getPlotSmpDoc, updatePlotVisual } from './Plot.ts'
import { pushUndoState } from '../utils/undoManager.ts'
import type { SmpLineAnnotation } from '../types.ts'

// Shared mouse-draw interaction for the Rectangle and Arrow dialogs.
//
// When the dialog's "Draw" button is pressed we enter a create mode that
// temporarily disables the left-drag marquee (see MarqueeSelect). The next
// left-click-drag on the canvas draws the shape from the press point to the
// release point; the annotation is committed and the marquee is restored.

const SVG_NS = 'http://www.w3.org/2000/svg'

interface ShapeDrawState {
  shape: 'rectangle' | 'arrow'
  svg: SVGSVGElement
  overlayEl: HTMLElement
  annotationIndex: number
  onComplete?: (newIndex: number) => void
  previewEl: SVGElement | null
  startX: number
  startY: number
}

let state: ShapeDrawState | null = null

export function isShapeDrawing(): boolean {
  return state !== null
}

function clientToSvgLocal(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
  const w = svg.clientWidth || parseFloat(svg.style.width) || 400
  const h = svg.clientHeight || parseFloat(svg.style.height) || 300
  const rect = svg.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 }
  return {
    x: ((clientX - rect.left) / rect.width) * w,
    y: ((clientY - rect.top) / rect.height) * h,
  }
}

function svgLocalToMm(svg: SVGSVGElement, localX: number, localY: number): { x: number; y: number } | null {
  const doc = getPlotSmpDoc(svg)
  if (!doc) return null
  const w = svg.clientWidth || parseFloat(svg.style.width) || 400
  const h = svg.clientHeight || parseFloat(svg.style.height) || 300
  const docWidthMm = (doc.width || 14000) / 100
  const docHeightMm = (doc.height || 10000) / 100
  const plotW = Math.max(10, w - PLOT_MARGIN.l - PLOT_MARGIN.r)
  const plotH = Math.max(10, h - PLOT_MARGIN.t - PLOT_MARGIN.b)
  const scaleX = plotW / (docWidthMm || 140)
  const scaleY = plotH / (docHeightMm || 100)
  return {
    x: (localX - PLOT_MARGIN.l) / scaleX,
    y: (localY - PLOT_MARGIN.t) / scaleY,
  }
}

function clearPreview(): void {
  if (state?.previewEl) {
    state.previewEl.remove()
    state.previewEl = null
  }
}

function cancelDraw(): void {
  clearPreview()
  document.body.style.cursor = ''
  document.body.classList.remove('shape-drawing')
  window.removeEventListener('mousedown', onMouseDownCapture, true)
  window.removeEventListener('mousemove', onMouseMove, true)
  window.removeEventListener('mouseup', onMouseUp, true)
  window.removeEventListener('keydown', onKeyDown, true)
  if (state) {
    state.overlayEl.style.display = 'flex'
    const dlg = state.overlayEl.querySelector<HTMLElement>('.dialog-window')
    if (dlg) dlg.style.display = ''
  }
  state = null
}

function makePreviewEl(): SVGElement {
  if (!state) return document.createElementNS(SVG_NS, 'rect')
  if (state.shape === 'rectangle') {
    const rect = document.createElementNS(SVG_NS, 'rect')
    rect.setAttribute('fill', 'rgba(59, 130, 246, 0.18)')
    rect.setAttribute('stroke', '#1d4ed8')
    rect.setAttribute('stroke-width', '1.5')
    rect.setAttribute('stroke-dasharray', '4 2')
    rect.setAttribute('pointer-events', 'none')
    return rect
  }
  const group = document.createElementNS(SVG_NS, 'g')
  group.setAttribute('pointer-events', 'none')

  const line = document.createElementNS(SVG_NS, 'line')
  line.setAttribute('stroke', '#1d4ed8')
  line.setAttribute('stroke-width', '2')
  line.setAttribute('stroke-dasharray', '4 2')

  const head = document.createElementNS(SVG_NS, 'polygon')
  head.setAttribute('fill', '#1d4ed8')

  group.appendChild(line)
  group.appendChild(head)
  return group
}

function updatePreview(curX: number, curY: number): void {
  if (!state) return
  if (!state.previewEl) {
    state.previewEl = makePreviewEl()
    state.svg.appendChild(state.previewEl)
  }
  const sx = state.startX
  const sy = state.startY
  if (state.shape === 'rectangle') {
    const rect = state.previewEl as SVGRectElement
    rect.setAttribute('x', String(Math.min(sx, curX)))
    rect.setAttribute('y', String(Math.min(sy, curY)))
    rect.setAttribute('width', String(Math.abs(curX - sx)))
    rect.setAttribute('height', String(Math.abs(curY - sy)))
  } else {
    const group = state.previewEl as SVGGElement
    const line = group.querySelector('line')
    const head = group.querySelector('polygon')
    if (line) {
      line.setAttribute('x1', String(sx))
      line.setAttribute('y1', String(sy))
      line.setAttribute('x2', String(curX))
      line.setAttribute('y2', String(curY))
    }
    if (head) {
      const angle = Math.atan2(curY - sy, curX - sx)
      const headLen = 8
      const headAngle = Math.PI / 6
      const p1x = curX - headLen * Math.cos(angle - headAngle)
      const p1y = curY - headLen * Math.sin(angle - headAngle)
      const p2x = curX - headLen * Math.cos(angle + headAngle)
      const p2y = curY - headLen * Math.sin(angle + headAngle)
      head.setAttribute('points', `${curX},${curY} ${p1x},${p1y} ${p2x},${p2y}`)
    }
  }
}

function onMouseDownCapture(e: MouseEvent): void {
  if (!state) return
  if (e.button !== 0) return
  const target = e.target as HTMLElement
  // Ignore clicks that land on other UI chrome (e.g. a re-opened dialog).
  if (target.closest('.dialog-window, #ctxMenu, #marqueeCtxMenu, .toolbar, .menubar, .workspace-right')) return
  e.preventDefault()
  e.stopPropagation()
  window.removeEventListener('mousedown', onMouseDownCapture, true)

  const clickedSvg = target.closest<SVGSVGElement>('.plot-svg')
  if (clickedSvg) {
    state.svg = clickedSvg
  }

  const local = clientToSvgLocal(state.svg, e.clientX, e.clientY)
  state.startX = local.x
  state.startY = local.y
  updatePreview(local.x, local.y)
  window.addEventListener('mousemove', onMouseMove, true)
  window.addEventListener('mouseup', onMouseUp, true)
}

function onMouseMove(e: MouseEvent): void {
  if (!state) return
  const local = clientToSvgLocal(state.svg, e.clientX, e.clientY)
  updatePreview(local.x, local.y)
}

function onMouseUp(e: MouseEvent): void {
  if (!state) return
  e.preventDefault()
  e.stopPropagation()
  window.removeEventListener('mousemove', onMouseMove, true)
  window.removeEventListener('mouseup', onMouseUp, true)
  window.removeEventListener('keydown', onKeyDown, true)

  const svg = state.svg
  const endLocal = clientToSvgLocal(svg, e.clientX, e.clientY)
  const moved = Math.hypot(endLocal.x - state.startX, endLocal.y - state.startY) >= 4

  const aMm = svgLocalToMm(svg, state.startX, state.startY)
  const bMm = svgLocalToMm(svg, endLocal.x, endLocal.y)

  let x1: number
  let y1: number
  let x2: number
  let y2: number

  if (state.shape === 'rectangle') {
    if (aMm && bMm) {
      x1 = Math.min(aMm.x, bMm.x)
      y1 = Math.min(aMm.y, bMm.y)
      x2 = Math.max(aMm.x, bMm.x)
      y2 = Math.max(aMm.y, bMm.y)
    } else {
      x1 = Math.min(state.startX, endLocal.x)
      y1 = Math.min(state.startY, endLocal.y)
      x2 = Math.max(state.startX, endLocal.x)
      y2 = Math.max(state.startY, endLocal.y)
    }
    if (!moved) {
      x2 = x1 + 20
      y2 = y1 + 20
    }
  } else {
    if (aMm && bMm) {
      x1 = aMm.x
      y1 = aMm.y
      x2 = bMm.x
      y2 = bMm.y
    } else {
      x1 = state.startX
      y1 = state.startY
      x2 = endLocal.x
      y2 = endLocal.y
    }
    if (!moved) {
      x2 = x1 + 25
      y2 = y1
    }
  }

  const doc = getPlotSmpDoc(svg)
  if (!doc) {
    cancelDraw()
    return
  }
  if (!doc.annotationLines) doc.annotationLines = []

  let newIndex = state.annotationIndex
  if (newIndex >= 0 && newIndex < doc.annotationLines.length) {
    doc.annotationLines[newIndex] = {
      ...doc.annotationLines[newIndex],
      x1Norm: x1,
      y1Norm: y1,
      x2Norm: x2,
      y2Norm: y2,
    }
  } else {
    const annotation: SmpLineAnnotation =
      state.shape === 'rectangle'
        ? {
            x1Norm: x1,
            y1Norm: y1,
            x2Norm: x2,
            y2Norm: y2,
            style: 'solid',
            width: 0.4,
            thickness: 0.4,
            color: '#000000',
            faceColor: '#ffffff',
            shadeDepth: 0,
            shadeColor: '#000000',
            roundX: 0,
            roundY: 0,
            shape: 'rectangle',
          }
        : {
            x1Norm: x1,
            y1Norm: y1,
            x2Norm: x2,
            y2Norm: y2,
            style: 'dashed',
            width: 0.4,
            arrowhead: 0.5,
            pitch: 3,
            shape: 'arrow',
            spread: 0.3,
            shut: 1,
            unitX: 'mm',
            unitY: 'mm',
            color: '#000000',
          }
    doc.annotationLines.push(annotation)
    newIndex = doc.annotationLines.length - 1
  }

  clearPreview()
  document.body.style.cursor = ''
  document.body.classList.remove('shape-drawing')
  updatePlotVisual(svg)
  pushUndoState()

  const onComplete = state.onComplete
  state = null
  if (onComplete) onComplete(newIndex)
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    cancelDraw()
  }
}

export function beginShapeDraw(opts: {
  shape: 'rectangle' | 'arrow'
  svg: SVGSVGElement
  overlayEl: HTMLElement
  annotationIndex: number
  onComplete?: (newIndex: number) => void
}): void {
  if (state) cancelDraw()
  opts.overlayEl.style.display = 'none'
  document.body.classList.add('shape-drawing')
  document.body.style.cursor = 'crosshair'
  state = {
    shape: opts.shape,
    svg: opts.svg,
    overlayEl: opts.overlayEl,
    annotationIndex: opts.annotationIndex,
    onComplete: opts.onComplete,
    previewEl: null,
    startX: 0,
    startY: 0,
  }
  window.addEventListener('mousedown', onMouseDownCapture, true)
  window.addEventListener('keydown', onKeyDown, true)
}
