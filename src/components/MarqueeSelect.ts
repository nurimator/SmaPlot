import { getCanvasZoom } from '../utils/canvasZoom.ts'
import { clearObjectSelection, getSelectableObjects, hitsRectBorder, isObjectSelected, setObjectSelection } from './Plot.ts'
import type { SelectableObject } from './Plot.ts'

// Check whether the click point (in graph-area local coords) hits an already-selected object.
function hitsSelectedObject(gx: number, gy: number): boolean {
  return getSelectableObjects().some((o) => {
    if (!isObjectSelected(o.obj)) return false
    if (o.obj.kind === 'plot') return hitsRectBorder(gx, gy, o.l, o.t, o.w, o.h)
    return o.l <= gx && gx <= o.l + o.w && o.t <= gy && gy <= o.t + o.h
  })
}

// Find the topmost selectable object at a click point (point hit-test).
function hitTestPoint(gx: number, gy: number): SelectableObject | null {
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

// Left-drag marquee selection of plot elements (boxplots, labels, legends, lines/arrows).
// Distinct from the right-click marquee in MarqueeExport.ts, which is used solely for SVG export.
export function initMarqueeSelect(graphAreaEl: HTMLElement): void {
  let isSelecting = false
  let hasMoved = false
  let startClientX = 0
  let startClientY = 0
  let startGraphX = 0
  let startGraphY = 0
  let marqueeBox: HTMLElement | null = null

  const workspaceEl = graphAreaEl.closest<HTMLElement>('.workspace') || document.body

  workspaceEl.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button !== 0) return
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
    const target = e.target as HTMLElement
    // Skip only UI chrome that should never trigger marquee
    if (target.closest('.scrollbar-v, .scrollbar-h, .workspace-right, #ctxMenu, #marqueeCtxMenu')) return
    // Skip resize handles
    if (target.closest('[data-dir]')) return

    // Clear any leftover right-click export marquee box
    graphAreaEl.querySelectorAll('.marquee-selection-box').forEach((el) => el.remove())

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
    window.getSelection()?.removeAllRanges()
    const dist = Math.hypot(e.clientX - startClientX, e.clientY - startClientY)
    if (dist <= 4) return
    hasMoved = true
    e.preventDefault()

    const rect = graphAreaEl.getBoundingClientRect()
    const zoom = getCanvasZoom()
    const curGraphX = (e.clientX - rect.left) / zoom
    const curGraphY = (e.clientY - rect.top) / zoom

    const mLeft = Math.min(startGraphX, curGraphX)
    const mTop = Math.min(startGraphY, curGraphY)
    const mWidth = Math.abs(curGraphX - startGraphX)
    const mHeight = Math.abs(curGraphY - startGraphY)

    if (!marqueeBox) {
      marqueeBox = document.createElement('div')
      marqueeBox.className = 'marquee-selection-box'
      graphAreaEl.appendChild(marqueeBox)
    }
    marqueeBox.style.left = `${mLeft}px`
    marqueeBox.style.top = `${mTop}px`
    marqueeBox.style.width = `${mWidth}px`
    marqueeBox.style.height = `${mHeight}px`
    marqueeBox.style.display = 'block'

    const mRight = mLeft + mWidth
    const mBottom = mTop + mHeight
    const hits = getSelectableObjects()
      .filter((o) => o.l < mRight && o.l + o.w > mLeft && o.t < mBottom && o.t + o.h > mTop)
      .map((o) => o.obj)
      .filter((o) => o.kind !== 'plot') // Marquee never selects boxplots; use click instead
    setObjectSelection(hits)
  })

  window.addEventListener('mouseup', () => {
    if (!isSelecting) return
    isSelecting = false
    document.body.style.userSelect = ''
    window.getSelection()?.removeAllRanges()
    if (marqueeBox) {
      marqueeBox.remove()
      marqueeBox = null
    }
    if (!hasMoved) {
      // Single click without drag: select whatever object is at the click point,
      // or clear selection if clicking on empty space.
      const hit = hitTestPoint(startGraphX, startGraphY)
      if (hit) {
        setObjectSelection([hit])
      } else {
        clearObjectSelection()
      }
    }
  })

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && isSelecting) {
      isSelecting = false
      document.body.style.userSelect = ''
      window.getSelection()?.removeAllRanges()
      if (marqueeBox) {
        marqueeBox.remove()
        marqueeBox = null
      }
      clearObjectSelection()
    }
  })
}
