import { PLOT_MARGIN, getPlotSmpDoc, updatePlotVisual } from './plot/index.ts'
import { pushUndoState } from '../utils/undoManager.ts'
import type { SmpLineAnnotation } from '../types.ts'
import { getLineDashArray } from './plot/symbols.ts'

const SVG_NS = 'http://www.w3.org/2000/svg'

interface ShapeDrawState {
  shape: 'rectangle' | 'arrow'
  svg: SVGSVGElement
  overlayEl: HTMLElement
  annotationIndex: number
  baseAnnotation?: SmpLineAnnotation
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
  return group
}

function getPreviewScaleX(svg: SVGSVGElement): number {
  const doc = getPlotSmpDoc(svg)
  const w = svg.clientWidth || parseFloat(svg.style.width) || 400
  const docWidthMm = (doc?.width || 14000) / 100
  const plotW = Math.max(10, w - PLOT_MARGIN.l - PLOT_MARGIN.r)
  return plotW / (docWidthMm || 140)
}

function drawArrowPreview(group: SVGGElement, sx: number, sy: number, ex: number, ey: number): void {
  const base = state?.baseAnnotation
  const shape = base?.shape || 'arrow_end'
  const style = base?.style || 'solid'
  const color = base?.color || '#000000'
  const arrowMode = base?.arrowMode !== undefined
    ? base.arrowMode
    : shape === 'arrow_start' ? 2 : shape === 'arrow_both' ? 3 : shape === 'line' || shape === 'measure_line' ? 0 : 1
  const scaleX = state?.svg ? getPreviewScaleX(state.svg) : 1
  const strokeW = Math.max(0.4, Number(((base?.width ?? 0.4) * scaleX).toFixed(2)))

  group.innerHTML = ''
  const line = document.createElementNS(SVG_NS, 'line')
  line.setAttribute('x1', String(sx))
  line.setAttribute('y1', String(sy))
  line.setAttribute('x2', String(ex))
  line.setAttribute('y2', String(ey))
  line.setAttribute('stroke', color)
  line.setAttribute('stroke-width', String(strokeW))
  const dash = getLineDashArray(style, strokeW)
  if (dash !== 'none') line.setAttribute('stroke-dasharray', dash)
  group.appendChild(line)

  if (shape === 'measure_line') {
    const ang = Math.atan2(ey - sy, ex - sx)
    const px = -Math.sin(ang)
    const py = Math.cos(ang)
    const t = 6
    const ends: Array<[number, number]> = [[sx, sy], [ex, ey]]
    for (const [bx, by] of ends) {
      const tick = document.createElementNS(SVG_NS, 'line')
      tick.setAttribute('x1', String(bx - px * t))
      tick.setAttribute('y1', String(by - py * t))
      tick.setAttribute('x2', String(bx + px * t))
      tick.setAttribute('y2', String(by + py * t))
      tick.setAttribute('stroke', color)
      tick.setAttribute('stroke-width', String(strokeW))
      group.appendChild(tick)
    }
    return
  }

  const headAngle = Math.PI / 6
  const headLen = Math.max(6, strokeW * 3)
  const drawHead = (hx: number, hy: number, ang: number): void => {
    const p1x = hx - headLen * Math.cos(ang - headAngle)
    const p1y = hy - headLen * Math.sin(ang - headAngle)
    const p2x = hx - headLen * Math.cos(ang + headAngle)
    const p2y = hy - headLen * Math.sin(ang + headAngle)
    const head = document.createElementNS(SVG_NS, 'polygon')
    head.setAttribute('points', `${hx},${hy} ${p1x.toFixed(1)},${p1y.toFixed(1)} ${p2x.toFixed(1)},${p2y.toFixed(1)}`)
    head.setAttribute('fill', color)
    group.appendChild(head)
  }

  if (arrowMode === 1 || arrowMode === 3) drawHead(ex, ey, Math.atan2(ey - sy, ex - sx))
  if (arrowMode === 2 || arrowMode === 3) drawHead(sx, sy, Math.atan2(sy - ey, sx - ex))
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
    drawArrowPreview(group, sx, sy, curX, curY)
  }
}

function onMouseDownCapture(e: MouseEvent): void {
  if (!state) return
  if (e.button !== 0) return
  const target = e.target as HTMLElement
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
    const base = state.baseAnnotation
    const annotation: SmpLineAnnotation =
      state.shape === 'rectangle'
        ? {
            x1Norm: x1,
            y1Norm: y1,
            x2Norm: x2,
            y2Norm: y2,
            style: base?.style || 'solid',
            width: base?.width ?? 0.4,
            thickness: base?.thickness ?? 0.4,
            color: base?.color || '#000000',
            faceColor: base?.faceColor || '#ffffff',
            shadeDepth: base?.shadeDepth ?? 0,
            shadeColor: base?.shadeColor || '#000000',
            roundX: base?.roundX ?? 0,
            roundY: base?.roundY ?? 0,
            shape: 'rectangle',
          }
        : {
            x1Norm: x1,
            y1Norm: y1,
            x2Norm: x2,
            y2Norm: y2,
            style: base?.style || 'solid',
            width: base?.width ?? 0.4,
            arrowhead: base?.arrowhead ?? 5.0,
            pitch: base?.pitch ?? 3,
            shape: base?.shape ?? 'arrow_end',
            arrowMode: base?.arrowMode ?? 1,
            spread: base?.spread ?? 30,
            shut: base?.shut ?? 100,
            unitX: base?.unitX ?? 'mm',
            unitY: base?.unitY ?? 'mm',
            color: base?.color || '#000000',
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
  baseAnnotation?: SmpLineAnnotation
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
    baseAnnotation: opts.baseAnnotation,
    onComplete: opts.onComplete,
    previewEl: null,
    startX: 0,
    startY: 0,
  }
  window.addEventListener('mousedown', onMouseDownCapture, true)
  window.addEventListener('keydown', onKeyDown, true)
}
