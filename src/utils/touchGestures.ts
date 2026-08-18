import { getCanvasZoom } from './canvasZoom.ts'
import {
  clearMarqueeSelectBox,
  handleSelectClickOrTap,
  hitTestPoint,
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
  onDoubleTapLegend?: (svg: SVGSVGElement, itemIdx: number) => void
  onDoubleTapAnnotation?: (svg: SVGSVGElement, annotationIdx: number) => void
}

let holdIndicatorEl: HTMLElement | null = null

let lastTouchEndTime = 0

export function wasTouchInteractionRecent(graceMs = 800): boolean {
  return Date.now() - lastTouchEndTime < graceMs
}

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
    onDoubleTapLegend,
    onDoubleTapAnnotation,
  } = options

  let isTouchActive = false
  let isHoldActive = false
  let hasMoved = false
  let hasHoldDragged = false
  let isMarqueeSelecting = false
  let isMarqueeExporting = false
  let isGroupDragging = false
  let isTrimTouchActive = false
  let holdTimer: number | null = null

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
      if (e.touches.length > 1) {
        cancelTouchGestures()
        return
      }

      const touch = e.touches[0]
      const target = e.target as HTMLElement

      if (
        target.closest(
          '.modal-overlay, .context-menu, .scrollbar-v, .scrollbar-h, .toolbar, .menubar, .titlebar, #ctxMenu, #marqueeCtxMenu'
        )
      ) {
        return
      }

      if (isTrimmingMode()) {
        e.preventDefault()
        isTrimTouchActive = true
        beginTrim(touch.clientX, touch.clientY)
        return
      }

      if (target.closest('.ov-trans-box, [data-trans-dir], [data-dir]')) {
        return
      }

      if (isReadValueMode() || isPropertyTabMode() || isShapeDrawing()) {
        return
      }

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

      clearHoldTimer()
      holdTimer = window.setTimeout(() => {
        if (!isTouchActive || hasMoved) return
        isHoldActive = true
        triggerHaptic(45)
        showHoldIndicator(startClientX, startClientY)
      }, 500)
    },
    { passive: false }
  )

  window.addEventListener(
    'touchmove',
    (e: TouchEvent) => {
      if (isTrimTouchActive) {
        if (e.touches.length === 1) {
          if (e.cancelable) e.preventDefault()
          if (isTrimDragging()) {
            updateTrim(e.touches[0].clientX, e.touches[0].clientY)
          }
        } else {
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
        if (dist >= 5) {
          clearHoldTimer()
          removeHoldIndicator()

          if (!hasMoved) {
            hasMoved = true
            if (hitsSelectedObject(startGraphX, startGraphY)) {
              isGroupDragging = true
              startGroupDrag(touch.clientX, touch.clientY)
            } else if (!initialTarget?.closest('[data-dir], [data-trans-dir]')) {
              isMarqueeSelecting = true
            }
          }

          if (isMarqueeSelecting) {
            if (e.cancelable) e.preventDefault()
            updateMarqueeSelectBox(graphAreaEl, startGraphX, startGraphY, currentGraphX, currentGraphY)
          }
        }
      } else {
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
            if (e.cancelable) e.preventDefault()
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
          const targetSvg =
            initialTarget?.closest<SVGSVGElement>('.plot-svg') ||
            (initialTarget ? getPlotSvgFromElement(initialTarget) : null)

          if (targetSvg) {
            setObjectSelection([{ kind: 'plot', svg: targetSvg }])
          }
          showContextMenu(ctxMenuEl, startClientX, startClientY)
        } else if (isMarqueeExporting) {
          finishMarqueeExportBox(marqueeCtxMenuEl, lastClientX, lastClientY)
          isMarqueeExporting = false
        }
        return
      }

      if (isMarqueeSelecting) {
        clearMarqueeSelectBox()
        isMarqueeSelecting = false
        return
      }

      if (isGroupDragging) {
        isGroupDragging = false
        return
      }

      if (!hasMoved) {
        const now = Date.now()
        const targetSvg = getPlotSvgFromElement(initialTarget as Element | null)

        if (targetSvg && now - lastTapTime < 350 && lastTapSvg === targetSvg) {
          lastTapTime = 0
          lastTapSvg = null
          setSelectedPlotSvg(targetSvg)

          const hit = hitTestPoint(startGraphX, startGraphY)
          if (hit && hit.kind === 'legend' && onDoubleTapLegend) {
            onDoubleTapLegend(hit.svg, hit.itemIdx ?? -1)
            return
          }
          if (hit && hit.kind === 'annotation' && onDoubleTapAnnotation) {
            onDoubleTapAnnotation(hit.svg, hit.annotationIdx ?? -1)
            return
          }

          const axisDir = hitTestAxisArea(targetSvg, startClientX, startClientY)
          if (axisDir && onDoubleTapAxis) {
            onDoubleTapAxis(axisDir, targetSvg)
            return
          }

          const hitDataset = hitTestGraph(targetSvg, startClientX, startClientY)
          if (hitDataset && onDoubleTapGraph) {
            onDoubleTapGraph(hitDataset, targetSvg)
            return
          }

          if (isInsidePlotArea(targetSvg, startClientX, startClientY) && onDoubleTapPlot) {
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

        handleSelectClickOrTap(startGraphX, startGraphY, startClientX, startClientY)
      }
    },
    { passive: true }
  )

  window.addEventListener('touchcancel', () => {
    lastTouchEndTime = Date.now()
    cancelTouchGestures()
  })
}
