import { getCanvasZoom } from './canvasZoom.ts'
import {
  clearMarqueeSelectBox,
  handleSelectClickOrTap,
  hitsSelectedObject,
  updateMarqueeSelectBox,
} from '../components/MarqueeSelect.ts'
import {
  finishMarqueeExportBox,
  hideMarqueeExport,
  updateMarqueeExportBox,
} from '../components/MarqueeExport.ts'
import { showContextMenu } from '../components/ContextMenu.ts'
import { isShapeDrawing } from '../components/ShapeDraw.ts'
import {
  getPlotSvgFromElement,
  isPropertyTabMode,
  isReadValueMode,
  isTrimmingMode,
  setObjectSelection,
  setSelectedPlotSvg,
  startGroupDrag,
  hitTestAxisArea,
  hitTestGraph,
  isInsidePlotArea,
} from '../components/plot/index.ts'
import {
  beginTrim,
  cancelTrim,
  finishTrim,
  isTrimDragging,
  updateTrim,
} from '../components/TrimMode.ts'

export interface TouchGesturesOptions {
  workspaceEl: HTMLElement
  graphAreaEl: HTMLElement
  ctxMenuEl: HTMLElement
  marqueeCtxMenuEl: HTMLElement
  onDoubleTapAxis?: (axis: 'x' | 'y' | 'u' | 'r', svg: SVGSVGElement) => void
  onDoubleTapGraph?: (dataset: unknown, svg: SVGSVGElement) => void
  onDoubleTapPlot?: (svg: SVGSVGElement) => void
}

let holdIndicatorEl: HTMLElement | null = null

function showHoldIndicator(clientX: number, clientY: number): void {
  removeHoldIndicator()
  holdIndicatorEl = document.createElement('div')
  holdIndicatorEl.className = 'touch-hold-indicator'
  holdIndicatorEl.style.left = `${clientX}px`
  holdIndicatorEl.style.top = `${clientY}px`
  document.body.appendChild(holdIndicatorEl)
}

function removeHoldIndicator(): void {
  if (holdIndicatorEl) {
    holdIndicatorEl.remove()
    holdIndicatorEl = null
  }
}

function triggerHaptic(duration = 45): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(duration)
    } catch (_) {
      // Ignore vibration error on restricted contexts
    }
  }
}

export function initTouchGestures(options: TouchGesturesOptions): void {
  const {
    workspaceEl,
    graphAreaEl,
    ctxMenuEl,
    marqueeCtxMenuEl,
    onDoubleTapAxis,
    onDoubleTapGraph,
    onDoubleTapPlot,
  } = options

  let isTouchActive = false
  let isHoldActive = false
  let hasMoved = false
  let hasHoldDragged = false
  let isMarqueeSelecting = false
  let isMarqueeExporting = false
  let isGroupDragging = false
  let isTrimTouchActive = false   // true for the lifetime of a trim touch gesture
  let holdTimer: number | null = null
  let lastTouchEndTime = 0

  let startClientX = 0
  let startClientY = 0
  let startGraphX = 0
  let startGraphY = 0
  let lastClientX = 0
  let lastClientY = 0
  let initialTarget: HTMLElement | SVGElement | null = null

  let lastTapTime = 0
  let lastTapSvg: SVGSVGElement | null = null

  const clearHoldTimer = (): void => {
    if (holdTimer !== null) {
      window.clearTimeout(holdTimer)
      holdTimer = null
    }
  }

  const cancelTouchGestures = (): void => {
    clearHoldTimer()
    removeHoldIndicator()
    isTouchActive = false
    isHoldActive = false
    hasMoved = false
    hasHoldDragged = false
    isGroupDragging = false
    // Cancel any in-progress trim drag as well
    if (isTrimTouchActive) {
      isTrimTouchActive = false
      cancelTrim()
    }
    if (isMarqueeSelecting) {
      clearMarqueeSelectBox()
      isMarqueeSelecting = false
    }
    if (isMarqueeExporting) {
      hideMarqueeExport(marqueeCtxMenuEl)
      isMarqueeExporting = false
    }
  }

  // Intercept and prevent the browser's premature native long-press contextmenu
  // while a touch is actively held down or right after touch release.
  window.addEventListener(
    'contextmenu',
    (e: MouseEvent) => {
      if (isTouchActive || Date.now() - lastTouchEndTime < 500) {
        e.preventDefault()
        e.stopPropagation()
      }
    },
    true
  )

  workspaceEl.addEventListener(
    'touchstart',
    (e: TouchEvent) => {
      // Two or more fingers: cancel 1-finger gestures (let 2-finger zoom/pan take over)
      if (e.touches.length > 1) {
        cancelTouchGestures()
        return
      }

      const touch = e.touches[0]
      const target = e.target as HTMLElement

      // Ignore touches on modal overlays, context menus, scrollbars, or toolbar buttons
      if (
        target.closest(
          '.modal-overlay, .context-menu, .scrollbar-v, .scrollbar-h, .toolbar, .menubar, .titlebar, #ctxMenu, #marqueeCtxMenu'
        )
      ) {
        return
      }

      // ── Trim mode: delegate touch entirely here so there is only ONE
      //   non-passive touchstart listener on workspaceEl.  Mixing passive +
      //   non-passive listeners on the same element causes iOS Safari to silently
      //   ignore preventDefault() from the non-passive one.
      if (isTrimmingMode()) {
        e.preventDefault()          // block native pan/scroll during trim drag
        isTrimTouchActive = true
        beginTrim(touch.clientX, touch.clientY)
        return
      }

      // Transform box / handles (Property tab mode): those overlay elements carry
      // their own touchstart handlers, so don't start hold / select gestures on
      // top of them.
      if (target.closest('.ov-trans-box, [data-trans-dir], [data-dir]')) {
        return
      }

      // Other special modes — just bail out without interfering
      if (isReadValueMode() || isPropertyTabMode() || isShapeDrawing()) {
        return
      }

      // Clear leftover marquee boxes
      clearMarqueeSelectBox()
      hideMarqueeExport(marqueeCtxMenuEl)

      const rect = graphAreaEl.getBoundingClientRect()
      const zoom = getCanvasZoom()

      startClientX = touch.clientX
      startClientY = touch.clientY
      lastClientX = touch.clientX
      lastClientY = touch.clientY
      startGraphX = (touch.clientX - rect.left) / zoom
      startGraphY = (touch.clientY - rect.top) / zoom
      initialTarget = target

      isTouchActive = true
      isHoldActive = false
      hasMoved = false
      hasHoldDragged = false
      isMarqueeSelecting = false
      isMarqueeExporting = false
      isGroupDragging = false

      // Start 500ms Long-Press Timer for Context Menu / Marquee Export
      clearHoldTimer()
      holdTimer = window.setTimeout(() => {
        if (!isTouchActive || hasMoved) return
        isHoldActive = true
        triggerHaptic(45)
        showHoldIndicator(startClientX, startClientY)
      }, 500)
    },
    { passive: false }   // must be non-passive so e.preventDefault() works for trim
  )

  window.addEventListener(
    'touchmove',
    (e: TouchEvent) => {
      // ── Trim drag in progress — must be checked before isTouchActive guard ──
      if (isTrimTouchActive) {
        if (e.touches.length === 1) {
          e.preventDefault()   // prevent page scroll during trim drag
          if (isTrimDragging()) {
            updateTrim(e.touches[0].clientX, e.touches[0].clientY)
          }
        } else {
          // Multi-finger while trimming → cancel
          isTrimTouchActive = false
          cancelTrim()
        }
        return
      }

      if (!isTouchActive || e.touches.length !== 1) {
        if (e.touches.length > 1) cancelTouchGestures()
        return
      }

      const touch = e.touches[0]
      lastClientX = touch.clientX
      lastClientY = touch.clientY
      const dist = Math.hypot(touch.clientX - startClientX, touch.clientY - startClientY)

      const rect = graphAreaEl.getBoundingClientRect()
      const zoom = getCanvasZoom()
      const currentGraphX = (touch.clientX - rect.left) / zoom
      const currentGraphY = (touch.clientY - rect.top) / zoom

      if (!isHoldActive) {
        // User moves finger before 500ms hold -> Marquee Selection (or object drag)
        if (dist >= 5) {
          clearHoldTimer()
          removeHoldIndicator()

          if (!hasMoved) {
            hasMoved = true
            // If touching an already-selected object, do group moving
            if (hitsSelectedObject(startGraphX, startGraphY)) {
              isGroupDragging = true
              startGroupDrag(touch.clientX, touch.clientY)
            } else if (!initialTarget?.closest('[data-dir], [data-trans-dir]')) {
              // Otherwise, start Marquee Selection (works across workspace and plot area)
              isMarqueeSelecting = true
            }
          }

          if (isMarqueeSelecting) {
            e.preventDefault()
            updateMarqueeSelectBox(graphAreaEl, startGraphX, startGraphY, currentGraphX, currentGraphY)
          }
        }
      } else {
        // User held for 500ms (received haptic vibration) and is now dragging finger.
        // If the press started on an already-selected object, treat it as a group
        // drag (same as an immediate drag) instead of a marquee export.
        if (dist >= 5) {
          hasHoldDragged = true
          removeHoldIndicator()

          if (!isGroupDragging && !isMarqueeExporting && hitsSelectedObject(startGraphX, startGraphY)) {
            hasMoved = true
            isGroupDragging = true
            startGroupDrag(touch.clientX, touch.clientY)
            return
          }

          if (!isGroupDragging) {
            isMarqueeExporting = true
            e.preventDefault()
            updateMarqueeExportBox(graphAreaEl, startGraphX, startGraphY, currentGraphX, currentGraphY)
          }
        }
      }
    },
    { passive: false }
  )

  window.addEventListener(
    'touchend',
    () => {
      // ── Trim drag ended — commit (or discard) and exit trim touch session ──
      if (isTrimTouchActive) {
        isTrimTouchActive = false
        finishTrim()
        lastTouchEndTime = Date.now()
        return
      }

      if (!isTouchActive) return
      clearHoldTimer()
      removeHoldIndicator()
      isTouchActive = false
      lastTouchEndTime = Date.now()

      if (isHoldActive) {
        if (!hasHoldDragged) {
          // Rule 1: Held for 500ms and released in place near starting point -> Show Context Menu!
          const targetSvg =
            initialTarget?.closest<SVGSVGElement>('.plot-svg') ||
            (initialTarget ? getPlotSvgFromElement(initialTarget) : null)

          if (targetSvg) {
            setObjectSelection([{ kind: 'plot', svg: targetSvg }])
          }
          showContextMenu(ctxMenuEl, startClientX, startClientY)
        } else if (isMarqueeExporting) {
          // Rule 2: Dragged after 500ms hold -> Finish Marquee Export (Show Copy SVG menu)
          finishMarqueeExportBox(marqueeCtxMenuEl, lastClientX, lastClientY)
          isMarqueeExporting = false
        }
        return
      }

      // Rule 3: Dragged without 500ms hold -> Finish Marquee Selection
      if (isMarqueeSelecting) {
        clearMarqueeSelectBox()
        isMarqueeSelecting = false
        return
      }

      if (isGroupDragging) {
        isGroupDragging = false
        return
      }

      // Rule 4: Tapped quickly without drag and without hold
      if (!hasMoved) {
        const now = Date.now()
        const targetSvg = initialTarget?.closest<SVGSVGElement>('.plot-svg')

        if (targetSvg && now - lastTapTime < 350 && lastTapSvg === targetSvg) {
          // Double Tap on Plot
          lastTapTime = 0
          lastTapSvg = null
          setSelectedPlotSvg(targetSvg)

          // Check Axis area
          const axisDir = hitTestAxisArea(targetSvg, startClientX, startClientY)
          if (axisDir && onDoubleTapAxis) {
            onDoubleTapAxis(axisDir, targetSvg)
            return
          }

          // Check Graph dataset
          const hitDataset = hitTestGraph(targetSvg, startClientX, startClientY)
          if (hitDataset && onDoubleTapGraph) {
            onDoubleTapGraph(hitDataset, targetSvg)
            return
          } else if (isInsidePlotArea(targetSvg, startClientX, startClientY) && onDoubleTapPlot) {
            onDoubleTapPlot(targetSvg)
            return
          }
          return
        }

        if (targetSvg) {
          lastTapTime = now
          lastTapSvg = targetSvg
        } else {
          lastTapTime = 0
          lastTapSvg = null
        }

        // Single tap selection
        handleSelectClickOrTap(startGraphX, startGraphY)
      }
    },
    { passive: true }
  )

  window.addEventListener('touchcancel', () => {
    lastTouchEndTime = Date.now()
    cancelTouchGestures()
  })
}
