import { getCanvasZoom } from '../utils/canvasZoom.ts'
import { clearObjectSelection, getPlotSmpDoc, getSelectableObjects, hitsRectBorder, isObjectSelected, isPropertyTabMode, isReadValueMode, isTrimmingMode, setObjectSelection } from './plot/index.ts'
import type { SelectableObject } from './plot/index.ts'
import { showRectangleDialog } from './RectangleDialog.ts'
import { showArrowDialog } from './ArrowDialog.ts'
import { isShapeDrawing } from './ShapeDraw.ts'

let globalMarqueeSelectBox: HTMLElement | null = null
let lastClickTime = 0
let lastHitObj: SelectableObject | null = null

// Check whether the click point (in graph-area local coords) hits an already-selected object.
export function hitsSelectedObject(gx: number, gy: number): boolean {
  return getSelectableObjects().some((o) => {
    if (!isObjectSelected(o.obj)) return false
    if (o.obj.kind === 'plot') return hitsRectBorder(gx, gy, o.l, o.t, o.w, o.h)
    return o.l <= gx && gx <= o.l + o.w && o.t <= gy && gy <= o.t + o.h
  })
}

// Find the topmost selectable object at a click point (point hit-test).
export function hitTestPoint(gx: number, gy: number): SelectableObject | null {
  // Check inner objects (legend, annotation) first — they are "on top" of plots.
  const all = getSelectableObjects()
  for (let i = all.length - 1; i >= 0; i--) {
    const o = all[i]
    if (o.obj.kind !== 'plot' && o.l <= gx && gx <= o.l + o.w && o.t <= gy && gy <= o.t + o.h) {
      return o.obj
    }
  }
  // Then check plot boxes — border-only hit test.
  for (let i = all.length - 1; i >= 0; i--) {
    const o = all[i]
    if (o.obj.kind === 'plot' && hitsRectBorder(gx, gy, o.l, o.t, o.w, o.h)) {
      return o.obj
    }
  }
  return null
}

export function getOrCreateMarqueeSelectBox(graphAreaEl: HTMLElement): HTMLElement {
  if (!globalMarqueeSelectBox) {
    globalMarqueeSelectBox = document.createElement('div')
    globalMarqueeSelectBox.className = 'marquee-selection-box'
    graphAreaEl.appendChild(globalMarqueeSelectBox)
  }
  return globalMarqueeSelectBox
}

export function clearMarqueeSelectBox(): void {
  if (globalMarqueeSelectBox) {
    globalMarqueeSelectBox.remove()
    globalMarqueeSelectBox = null
  }
}

export function updateMarqueeSelectBox(
  graphAreaEl: HTMLElement,
  startGraphX: number,
  startGraphY: number,
  currentGraphX: number,
  currentGraphY: number
): void {
  const mLeft = Math.min(startGraphX, currentGraphX)
  const mTop = Math.min(startGraphY, currentGraphY)
  const mWidth = Math.abs(currentGraphX - startGraphX)
  const mHeight = Math.abs(currentGraphY - startGraphY)

  const box = getOrCreateMarqueeSelectBox(graphAreaEl)
  box.style.left = `${mLeft}px`
  box.style.top = `${mTop}px`
  box.style.width = `${mWidth}px`
  box.style.height = `${mHeight}px`
  box.style.display = 'block'

  const mRight = mLeft + mWidth
  const mBottom = mTop + mHeight
  const hits = getSelectableObjects()
    .filter((o) => o.l < mRight && o.l + o.w > mLeft && o.t < mBottom && o.t + o.h > mTop)
    .map((o) => o.obj)
    .filter((o) => o.kind !== 'plot') // Marquee never selects boxplots; use click instead
  setObjectSelection(hits)
}

export function handleSelectClickOrTap(startGraphX: number, startGraphY: number): void {
  const hit = hitTestPoint(startGraphX, startGraphY)
  const now = Date.now()

  if (
    hit &&
    lastHitObj &&
    hit.kind === 'annotation' &&
    lastHitObj.kind === 'annotation' &&
    hit.svg === lastHitObj.svg &&
    hit.annotationIdx !== undefined &&
    hit.annotationIdx === lastHitObj.annotationIdx &&
    now - lastClickTime < 450
  ) {
    const aIdx = hit.annotationIdx
    lastClickTime = 0
    lastHitObj = null
    const smpDoc = getPlotSmpDoc(hit.svg)
    const aLine = smpDoc?.annotationLines?.[aIdx]
    if (aLine && (aLine.shape === 'rectangle' || aLine.shape === 'rect')) {
      const rectOverlayEl = document.querySelector<HTMLElement>('#rectangleOverlay')
      if (rectOverlayEl) {
        showRectangleDialog(rectOverlayEl, aIdx, hit.svg)
        return
      }
    } else if (aLine) {
      const arrowOverlayEl = document.querySelector<HTMLElement>('#arrowOverlay')
      if (arrowOverlayEl) {
        showArrowDialog(arrowOverlayEl, aIdx, hit.svg)
        return
      }
    }
  }

  if (hit) {
    lastClickTime = now
    lastHitObj = hit
    setObjectSelection([hit])
  } else {
    lastClickTime = 0
    lastHitObj = null
    clearObjectSelection()
  }
}

// Left-drag marquee selection of plot elements (boxplots, labels, legends, lines/arrows).
// Distinct from the right-click marquee in MarqueeExport.ts, which is used solely for SVG export.
export function initMarqueeSelect(graphAreaEl: HTMLElement): void {
  let isSelecting = false
  let hasMoved = false
  let startClientX = 0
  let startClientY = 0
  let startGraphX = 0
  let startGraphY = 0

  const workspaceEl = graphAreaEl.closest<HTMLElement>('.workspace') || document.body

  workspaceEl.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button !== 0) return
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
    const target = e.target as HTMLElement
    // Trimming mode takes over left-drag; suspend marquee selection.
    if (isTrimmingMode()) return
    // Read Value mode takes over clicking and dragging on plot; suspend marquee selection.
    if (isReadValueMode()) return
    // Property tab mode (transform manipulation active); suspend marquee and click selection.
    if (isPropertyTabMode()) return
    // While a Rectangle/Arrow mouse-draw is in progress the next left-drag draws
    // the shape instead of a marquee selection.
    if (isShapeDrawing()) return
    // Skip only UI chrome that should never trigger marquee
    if (target.closest('.scrollbar-v, .scrollbar-h, .workspace-right, #ctxMenu, #marqueeCtxMenu')) return
    // Skip resize handles
    if (target.closest('[data-dir]')) return

    // Clear any leftover right-click export marquee box
    graphAreaEl.querySelectorAll('.marquee-selection-box, .marquee-export-box').forEach((el) => el.remove())

    const rect = graphAreaEl.getBoundingClientRect()
    const zoom = getCanvasZoom()
    startClientX = e.clientX
    startClientY = e.clientY
    startGraphX = (e.clientX - rect.left) / zoom
    startGraphY = (e.clientY - rect.top) / zoom

    // If clicking on an already-selected object, let its own handler do group drag
    if (hitsSelectedObject(startGraphX, startGraphY)) return

    isSelecting = true
    hasMoved = false
    document.body.style.userSelect = 'none'
    window.getSelection()?.removeAllRanges()
  })

  window.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isSelecting) return
    const dx = e.clientX - startClientX
    const dy = e.clientY - startClientY
    if (!hasMoved && Math.hypot(dx, dy) < 4) return

    hasMoved = true
    const rect = graphAreaEl.getBoundingClientRect()
    const zoom = getCanvasZoom()
    const currentGraphX = (e.clientX - rect.left) / zoom
    const currentGraphY = (e.clientY - rect.top) / zoom

    updateMarqueeSelectBox(graphAreaEl, startGraphX, startGraphY, currentGraphX, currentGraphY)
  })

  window.addEventListener('mouseup', () => {
    if (!isSelecting) return
    isSelecting = false
    document.body.style.userSelect = ''
    window.getSelection()?.removeAllRanges()
    clearMarqueeSelectBox()
    if (!hasMoved) {
      handleSelectClickOrTap(startGraphX, startGraphY)
    }
  })

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && isSelecting) {
      isSelecting = false
      document.body.style.userSelect = ''
      window.getSelection()?.removeAllRanges()
      clearMarqueeSelectBox()
      clearObjectSelection()
    }
  })
}
