import type { ActiveDrag } from '../../types.ts'
import { getCanvasZoom } from '../../utils/canvasZoom.ts'
import { formatLinearExpr } from './dataset.ts'
import { getPlotSmpDoc, syncDocGeometry } from './smpDoc.ts'
import { PLOT_MARGIN, snapToGridThreshold } from './svg.ts'
import { svgDataMap, syncPlotOverlay, getPlotOverlay } from './state.ts'
import { applyTransDragVisual, clearActiveTransDrag, getActiveTransDrag } from './transform.ts'
import { updatePlotVisual, drawPlot } from './drawPlot.ts'
import { showTitleDialog } from './../TitleDialog.ts'
import { showArrowDialog } from './../ArrowDialog.ts'
import type { SelectableObject } from './selection.ts'
import { getSelectedObjects } from './selection.ts'
import { svgSmpDocMap } from './state.ts'

let activeDrag: ActiveDrag | null = null
let rafId: number | null = null

export function getActiveDrag(): ActiveDrag | null {
  return activeDrag
}

export interface GroupDragItem {
  kind: 'plot' | 'legend' | 'annotation'
  svg: SVGSVGElement
  startLeft?: number
  startTop?: number
  itemIdx?: number
  startXNorm?: number
  startYNorm?: number
  annotationIdx?: number
  startX1Norm?: number
  startY1Norm?: number
  startX2Norm?: number
  startY2Norm?: number
  targetType?: 'start' | 'end' | 'line'
  geom?: Array<{ el: HTMLElement; left: number; top: number }>
}

let activeGroupDrag:
  | { items: GroupDragItem[]; startX: number; startY: number; lastDx?: number; lastDy?: number }
  | null = null

export function setActiveGroupDrag(
  drag: { items: GroupDragItem[]; startX: number; startY: number; lastDx?: number; lastDy?: number } | null
): void {
  activeGroupDrag = drag
}

// Cached overlay elements (populated lazily)
let _cachedTitleOverlay: HTMLElement | null = null
let _cachedArrowOverlay: HTMLElement | null = null
function getCachedTitleOverlay(): HTMLElement | null {
  if (!_cachedTitleOverlay) _cachedTitleOverlay = document.querySelector<HTMLElement>('#titleOverlay')
  return _cachedTitleOverlay
}
function getCachedArrowOverlay(): HTMLElement | null {
  if (!_cachedArrowOverlay) _cachedArrowOverlay = document.querySelector<HTMLElement>('#arrowOverlay')
  return _cachedArrowOverlay
}

// Start state of every selected object for a group move. Inner objects (legend /
// annotation) of a selected plot box are excluded: they ride along with their plot.
export function buildGroupDragItems(selection: SelectableObject[]): GroupDragItem[] {
  const selectedPlots = new Set<SVGSVGElement>()
  selection.forEach((o) => {
    if (o.kind === 'plot') selectedPlots.add(o.svg)
  })

  const items: GroupDragItem[] = []
  for (const o of selection) {
    if (o.kind === 'plot') {
      items.push({
        kind: 'plot',
        svg: o.svg,
        startLeft: parseFloat(o.svg.style.left) || 0,
        startTop: parseFloat(o.svg.style.top) || 0,
      })
      continue
    }
    if (selectedPlots.has(o.svg)) continue

    if (o.kind === 'legend') {
      const item = svgSmpDocMap.get(o.svg)?.legendItems[o.itemIdx!]
      if (item) {
        items.push({
          kind: 'legend',
          svg: o.svg,
          itemIdx: o.itemIdx,
          startXNorm: item.xNorm,
          startYNorm: item.yNorm,
        })
      }
    } else if (o.kind === 'annotation') {
      const aLine = svgSmpDocMap.get(o.svg)?.annotationLines?.[o.annotationIdx!]
      if (aLine) {
        items.push({
          kind: 'annotation',
          svg: o.svg,
          annotationIdx: o.annotationIdx,
          startX1Norm: aLine.x1Norm,
          startY1Norm: aLine.y1Norm,
          startX2Norm: aLine.x2Norm,
          startY2Norm: aLine.y2Norm,
        })
      }
    }
  }
  return items
}

export function startGroupDrag(startX: number, startY: number): void {
  const items = buildGroupDragItems(getSelectedObjects())

  // Snapshot the selection-box overlay geometry so a live legend drag can move
  // it with the group without any redraw. Only direct children of the overlay
  // are moved — for rotated text the box/corners live inside .ov-rot-wrap, and
  // moving that wrapper moves them too.
  for (const item of items) {
    if (item.kind !== 'legend') continue
    const ov = getPlotOverlay(item.svg)
    const geom: Array<{ el: HTMLElement; left: number; top: number }> = []
    for (const child of Array.from(ov.children)) {
      const el = child as HTMLElement
      if (el.getAttribute('data-legend-item') !== String(item.itemIdx)) continue
      geom.push({ el, left: parseFloat(el.style.left) || 0, top: parseFloat(el.style.top) || 0 })
    }
    if (geom.length > 0) item.geom = geom
  }

  activeGroupDrag = {
    items,
    startX,
    startY,
  }
  document.body.style.userSelect = 'none'
}

export function startPlotDrag(svg: SVGSVGElement, dir: string, clientX: number, clientY: number): void {
  const graphArea = svg.parentElement || document.body
  const rect = svg.getBoundingClientRect()
  const parentRect = graphArea.getBoundingClientRect()

  const smpDoc = getPlotSmpDoc(svg)
  const margin = PLOT_MARGIN
  const curW = parseFloat(svg.style.width) || rect.width
  const curH = parseFloat(svg.style.height) || rect.height
  const startPlotW = Math.max(10, curW - margin.l - margin.r)
  const startPlotH = Math.max(10, curH - margin.t - margin.b)
  const initialItemPositions = smpDoc?.legendItems.map((item) => ({
    xPx: (item.xNorm / 10000) * startPlotW,
    yPx: (item.yNorm / 10000) * startPlotH,
    x2Px: item.x2Norm !== undefined ? (item.x2Norm / 10000) * startPlotW : undefined,
    y2Px: item.y2Norm !== undefined ? (item.y2Norm / 10000) * startPlotH : undefined,
  }))

  activeDrag = {
    svg,
    dir,
    startX: clientX,
    startY: clientY,
    startLeft: parseFloat(svg.style.left) || rect.left - parentRect.left,
    startTop: parseFloat(svg.style.top) || rect.top - parentRect.top,
    startWidth: curW,
    startHeight: curH,
    initialItemPositions,
  }
  document.body.style.userSelect = 'none'
}

// Coalesced per-frame visual sync for live drags (group move / transform drag).
// Rebuilding the whole plot SVG synchronously on every mousemove/touchmove event
// stutters badly on high-sampling-rate touchscreens, so all redraw + dialog-sync
// work is deferred to a single requestAnimationFrame per animation frame.
const pendingVisualRedraws = new Set<SVGSVGElement>()
let pendingVisualRaf: number | null = null
let pendingLegendSync: { svg: SVGSVGElement; itemIdx: number } | null = null
let pendingAnnotationSync: { svg: SVGSVGElement; annotationIdx: number } | null = null

function schedulePlotVisualSync(
  svg: SVGSVGElement,
  legendSync?: { svg: SVGSVGElement; itemIdx: number } | null,
  annotationSync?: { svg: SVGSVGElement; annotationIdx: number } | null
): void {
  pendingVisualRedraws.add(svg)
  if (legendSync) pendingLegendSync = legendSync
  if (annotationSync) pendingAnnotationSync = annotationSync
  if (pendingVisualRaf !== null) return
  pendingVisualRaf = requestAnimationFrame(() => {
    pendingVisualRaf = null
    pendingVisualRedraws.forEach((s) => updatePlotVisual(s))
    pendingVisualRedraws.clear()
    if (pendingLegendSync) {
      const { svg: ls, itemIdx } = pendingLegendSync
      pendingLegendSync = null
      const titleOverlayEl = getCachedTitleOverlay()
      if (titleOverlayEl && titleOverlayEl.style.display !== 'none') {
        showTitleDialog(titleOverlayEl, itemIdx, ls)
      }
    }
    if (pendingAnnotationSync) {
      const { svg: as, annotationIdx } = pendingAnnotationSync
      pendingAnnotationSync = null
      const arrowOverlayEl = getCachedArrowOverlay()
      if (arrowOverlayEl && arrowOverlayEl.style.display !== 'none') {
        showArrowDialog(arrowOverlayEl, annotationIdx, as)
      }
    }
  })
}

// Global mousemove, mouseup, touchmove, and touchend listeners for resize with snap to grid.
// onDragCommit is invoked after a resize/group-move finishes, letting the caller
// (e.g. undo manager) record the mutation without Plot importing it.
export function initPlotDragListeners(onDragCommit?: () => void): void {
  const handleDragMove = (clientX: number, clientY: number, shiftKey: boolean) => {
    if (getActiveTransDrag()) {
      const activeTransDrag = getActiveTransDrag()!
      const zoom = getCanvasZoom()
      const dxPx = (clientX - activeTransDrag.startX) / zoom
      const dyPx = (clientY - activeTransDrag.startY) / zoom

      const {
        svg,
        dataset,
        dir,
        xTransActive,
        yTransActive,
        startXLinear,
        startYLinear,
        rawXMin,
        rawXMax,
        rawYMin,
        rawYMax,
        startXTransMin,
        startXTransMax,
        startYTransMin,
        startYTransMax,
        xMin,
        xMax,
        yMin,
        yMax,
        plotW,
        plotH,
      } = activeTransDrag

      const deltaVx = (dxPx / plotW) * (xMax - xMin)
      const deltaVy = -(dyPx / plotH) * (yMax - yMin)

      if (!dataset.options) dataset.options = {}

      let curAx = startXLinear.a
      let curBx = startXLinear.b
      let curAy = startYLinear.a
      let curBy = startYLinear.b

      // Handle Y transformation
      if (yTransActive) {
        let newAy = startYLinear.a
        let newBy = startYLinear.b
        const isYInverted = startYLinear.a < 0

        if (dir === 'box') {
          newBy = startYLinear.b + deltaVy
        } else if (dir === 'top' || dir === 'top-left' || dir === 'top-right') {
          const rawYAnchor = isYInverted ? rawYMax : rawYMin
          const rawYMoving = isYInverted ? rawYMin : rawYMax
          const yBottom = startYTransMin
          const minSpanY = Math.max(1e-8, Math.abs(yMax - yMin) * 0.0001)
          let yMovingNew = startYTransMax + deltaVy
          if (yMovingNew < yBottom + minSpanY) yMovingNew = yBottom + minSpanY

          const rawSpan = rawYMoving - rawYAnchor
          if (Math.abs(rawSpan) > 1e-12) {
            newAy = (yMovingNew - yBottom) / rawSpan
            newBy = yBottom - newAy * rawYAnchor
          }
        } else if (dir === 'bottom' || dir === 'bottom-left' || dir === 'bottom-right') {
          const rawYAnchor = isYInverted ? rawYMin : rawYMax
          const rawYMoving = isYInverted ? rawYMax : rawYMin
          const yTop = startYTransMax
          const minSpanY = Math.max(1e-8, Math.abs(yMax - yMin) * 0.0001)
          let yMovingNew = startYTransMin + deltaVy
          if (yMovingNew > yTop - minSpanY) yMovingNew = yTop - minSpanY

          const rawSpan = rawYMoving - rawYAnchor
          if (Math.abs(rawSpan) > 1e-12) {
            newAy = (yMovingNew - yTop) / rawSpan
            newBy = yTop - newAy * rawYAnchor
          }
        }

        const formattedY = formatLinearExpr(newAy, newBy, 'y')
        dataset.options.yExpr = formattedY

        const propYInput = document.querySelector<HTMLInputElement>('#propYTransExpr')
        if (propYInput) propYInput.value = formattedY

        curAy = newAy
        curBy = newBy
      }

      // Handle X transformation
      if (xTransActive) {
        let newAx = startXLinear.a
        let newBx = startXLinear.b
        const isXInverted = startXLinear.a < 0

        if (dir === 'box') {
          newBx = startXLinear.b + deltaVx
        } else if (dir === 'right' || dir === 'top-right' || dir === 'bottom-right') {
          const rawXAnchor = isXInverted ? rawXMax : rawXMin
          const rawXMoving = isXInverted ? rawXMin : rawXMax
          const xLeft = startXTransMin
          const minSpanX = Math.max(1e-8, Math.abs(xMax - xMin) * 0.0001)
          let xMovingNew = startXTransMax + deltaVx
          if (xMovingNew < xLeft + minSpanX) xMovingNew = xLeft + minSpanX

          const rawSpan = rawXMoving - rawXAnchor
          if (Math.abs(rawSpan) > 1e-12) {
            newAx = (xMovingNew - xLeft) / rawSpan
            newBx = xLeft - newAx * rawXAnchor
          }
        } else if (dir === 'left' || dir === 'top-left' || dir === 'bottom-left') {
          const rawXAnchor = isXInverted ? rawXMax : rawXMin
          const rawXMoving = isXInverted ? rawXMax : rawXMin
          const xRight = startXTransMax
          const minSpanX = Math.max(1e-8, Math.abs(xMax - xMin) * 0.0001)
          let xMovingNew = startXTransMin + deltaVx
          if (xMovingNew > xRight - minSpanX) xMovingNew = xRight - minSpanX

          const rawSpan = rawXMoving - rawXAnchor
          if (Math.abs(rawSpan) > 1e-12) {
            newAx = (xMovingNew - xRight) / rawSpan
            newBx = xRight - newAx * rawXAnchor
          }
        }

        const formattedX = formatLinearExpr(newAx, newBx, 'x')
        dataset.options.xExpr = formattedX

        const propXInput = document.querySelector<HTMLInputElement>('#propXTransExpr')
        if (propXInput) propXInput.value = formattedX

        curAx = newAx
        curBx = newBx
      }

      if (!applyTransDragVisual(activeTransDrag, curAx, curBx, curAy, curBy)) {
        schedulePlotVisualSync(svg)
      }
      return
    }

    if (activeGroupDrag) {
      const dragRef = activeGroupDrag
      const zoom = getCanvasZoom()
      const dx = (clientX - dragRef.startX) / zoom
      const dy = (clientY - dragRef.startY) / zoom
      const touchedSvgs = new Set<SVGSVGElement>()

      // When only legend/text and plot objects are dragged, move the legend DOM
      // directly (one translate attribute) instead of rebuilding the whole plot
      // SVG per frame — full redraws stutter badly on touchscreens.
      const liveLegendDrag = dragRef.items.every((it) => it.kind === 'legend' || it.kind === 'plot')

      for (const item of dragRef.items) {
        if (item.kind === 'plot') {
          const snappedLeft = snapToGridThreshold(item.startLeft! + PLOT_MARGIN.l + dx, 100, 6) - PLOT_MARGIN.l
          const snappedTop = snapToGridThreshold(item.startTop! + PLOT_MARGIN.t + dy, 100, 6) - PLOT_MARGIN.t
          item.svg.style.left = `${snappedLeft}px`
          item.svg.style.top = `${snappedTop}px`
          syncPlotOverlay(item.svg)
        } else if (item.kind === 'legend') {
          if (liveLegendDrag) {
            const legGroup = item.svg.querySelector<SVGGElement>(`g[data-legend-item="${item.itemIdx}"]`)
            if (legGroup) legGroup.setAttribute('transform', `translate(${dx}, ${dy})`)
            if (item.geom) {
              for (const g of item.geom) {
                g.el.style.left = `${g.left + dx}px`
                g.el.style.top = `${g.top + dy}px`
              }
            }
            dragRef.lastDx = dx
            dragRef.lastDy = dy
          } else {
            const smpDoc = getPlotSmpDoc(item.svg)
            const legendItem = smpDoc?.legendItems[item.itemIdx!]
            if (!smpDoc || !legendItem) continue
            const widthPx = parseFloat(item.svg.style.width) || 500
            const heightPx = parseFloat(item.svg.style.height) || 350
            const plotW = Math.max(50, widthPx - PLOT_MARGIN.l - PLOT_MARGIN.r)
            const plotH = Math.max(50, heightPx - PLOT_MARGIN.t - PLOT_MARGIN.b)
            legendItem.xNorm = Math.round(item.startXNorm! + (dx / plotW) * 10000)
            legendItem.yNorm = Math.round(item.startYNorm! + (dy / plotH) * 10000)
            touchedSvgs.add(item.svg)
          }
        } else if (item.kind === 'annotation') {
          const smpDoc = getPlotSmpDoc(item.svg)
          const aLine = smpDoc?.annotationLines?.[item.annotationIdx!]
          if (!smpDoc || !aLine) continue
          const widthPx = parseFloat(item.svg.style.width) || 500
          const heightPx = parseFloat(item.svg.style.height) || 350
          const plotW = Math.max(50, widthPx - PLOT_MARGIN.l - PLOT_MARGIN.r)
          const plotH = Math.max(50, heightPx - PLOT_MARGIN.t - PLOT_MARGIN.b)
          const docWidthMm = (smpDoc.width || 14000) / 100
          const docHeightMm = (smpDoc.height || 10000) / 100
          const scaleX = plotW / (docWidthMm || 140)
          const scaleY = plotH / (docHeightMm || 100)

          let dxNorm: number
          if (aLine.unitX === 'xa') {
            const xRange = (smpDoc.axisX?.max ?? 100) - (smpDoc.axisX?.min ?? 0) || 100
            dxNorm = (dx / plotW) * xRange
          } else if (aLine.unitX === 'ua') {
            const uRange = (smpDoc.axisTop?.max ?? 100) - (smpDoc.axisTop?.min ?? 0) || 100
            dxNorm = (dx / plotW) * uRange
          } else {
            dxNorm = dx / scaleX
          }

          let dyNorm: number
          if (aLine.unitY === 'ya') {
            const yRange = (smpDoc.axisY?.max ?? 100) - (smpDoc.axisY?.min ?? 0) || 100
            dyNorm = -(dy / plotH) * yRange
          } else if (aLine.unitY === 'ra') {
            const rRange = (smpDoc.axisRight?.max ?? 100) - (smpDoc.axisRight?.min ?? 0) || 100
            dyNorm = -(dy / plotH) * rRange
          } else {
            dyNorm = dy / scaleY
          }

          if (item.targetType === 'start') {
            const rawX1 = item.startX1Norm! + dxNorm
            const rawY1 = item.startY1Norm! + dyNorm
            if (shiftKey) {
              const dxPx = (rawX1 - item.startX2Norm!) * scaleX
              const dyPx = (rawY1 - item.startY2Norm!) * scaleY
              const angle = Math.atan2(dyPx, dxPx) * (180 / Math.PI)
              const snappedAngle = Math.round(angle / 90) * 90
              if (snappedAngle % 180 === 0) {
                aLine.y1Norm = item.startY2Norm!
                aLine.x1Norm = rawX1
              } else {
                aLine.x1Norm = item.startX2Norm!
                aLine.y1Norm = rawY1
              }
            } else {
              aLine.x1Norm = rawX1
              aLine.y1Norm = rawY1
            }
          } else if (item.targetType === 'end') {
            const rawX2 = item.startX2Norm! + dxNorm
            const rawY2 = item.startY2Norm! + dyNorm
            if (shiftKey) {
              const dxPx = (rawX2 - item.startX1Norm!) * scaleX
              const dyPx = (rawY2 - item.startY1Norm!) * scaleY
              const angle = Math.atan2(dyPx, dxPx) * (180 / Math.PI)
              const snappedAngle = Math.round(angle / 90) * 90
              if (snappedAngle % 180 === 0) {
                aLine.y1Norm = item.startY1Norm!
                aLine.x2Norm = rawX2
              } else {
                aLine.x2Norm = item.startX1Norm!
                aLine.y2Norm = rawY2
              }
            } else {
              aLine.x2Norm = rawX2
              aLine.y2Norm = rawY2
            }
          } else {
            aLine.x1Norm = item.startX1Norm! + dxNorm
            aLine.y1Norm = item.startY1Norm! + dyNorm
            aLine.x2Norm = item.startX2Norm! + dxNorm
            aLine.y2Norm = item.startY2Norm! + dyNorm
          }
          touchedSvgs.add(item.svg)
        }
      }

      // Keep the Title / Arrow dialogs in sync with the dragged object
      if (liveLegendDrag) {
        // Cheap live sync of the position fields; the full dialog rebuild and
        // the single commit redraw happen on drag end.
        const titleOverlayEl = getCachedTitleOverlay()
        if (titleOverlayEl && titleOverlayEl.style.display !== 'none') {
          const legendItem = dragRef.items.find((it) => it.kind === 'legend')
          if (legendItem) {
            const widthPx = parseFloat(legendItem.svg.style.width) || 500
            const heightPx = parseFloat(legendItem.svg.style.height) || 350
            const plotW = Math.max(50, widthPx - PLOT_MARGIN.l - PLOT_MARGIN.r)
            const plotH = Math.max(50, heightPx - PLOT_MARGIN.t - PLOT_MARGIN.b)
            const smpDoc = getPlotSmpDoc(legendItem.svg)
            const docWidthMm = ((smpDoc?.width || 10000) / 100) || 100
            const docHeightMm = ((smpDoc?.height || 10000) / 100) || 100
            const posXEl = titleOverlayEl.querySelector<HTMLInputElement>('#titlePosX')
            const posYEl = titleOverlayEl.querySelector<HTMLInputElement>('#titlePosY')
            if (posXEl) {
              posXEl.value = String(Math.round((((legendItem.startXNorm! + (dx / plotW) * 10000) / 10000) * docWidthMm)))
            }
            if (posYEl) {
              posYEl.value = String(Math.round((((legendItem.startYNorm! + (dy / plotH) * 10000) / 10000) * docHeightMm)))
            }
          }
        }
      } else {
        const firstLegend = dragRef.items.find((it) => it.kind === 'legend')
        const firstAnnotation = dragRef.items.find((it) => it.kind === 'annotation')
        const legendSync = firstLegend ? { svg: firstLegend.svg, itemIdx: firstLegend.itemIdx! } : null
        const annotationSync = firstAnnotation
          ? { svg: firstAnnotation.svg, annotationIdx: firstAnnotation.annotationIdx! }
          : null

        for (const svg of touchedSvgs) {
          schedulePlotVisualSync(svg, legendSync, annotationSync)
        }
      }
      return
    }

    if (!activeDrag) return
    const { svg, dir, startX, startY, startLeft, startTop, startWidth, startHeight } = activeDrag
    const zoom = getCanvasZoom()
    const dx = (clientX - startX) / zoom
    const dy = (clientY - startY) / zoom
    let newLeft = startLeft
    let newTop = startTop
    let newWidth = startWidth
    let newHeight = startHeight

    const GRID_SIZE = 100 // Major grid step (100px per major grid square = 50 statusbar units)
    const SNAP_THRESHOLD = 6 // Magnetic snap threshold (only snaps within 6px of major grid lines)
    const margin = PLOT_MARGIN
    const minPlotW = GRID_SIZE / 2 // Minimum frame width = 0.5 major grid (50px)
    const minPlotH = GRID_SIZE / 2 // Minimum frame height = 0.5 major grid (50px)

    const startPlotW = startWidth - margin.l - margin.r
    const startPlotH = startHeight - margin.t - margin.b

    if (dir === 'left' || dir === 'top' || dir === 'top-left') {
      // MOVE: Both X and Y axes move freely with magnetic grid snap on axis lines
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
        const currentLeftFrame = startLeft + margin.l
        const newPlotW = Math.max(minPlotW, snappedRight - currentLeftFrame)
        newWidth = newPlotW + margin.l + margin.r
      }

      if (dir.includes('left')) {
        const rawLeftFrame = startLeft + margin.l + dx
        const snappedLeftFrame = snapToGridThreshold(rawLeftFrame, GRID_SIZE, SNAP_THRESHOLD)
        const currentRightFrame = startLeft + margin.l + startPlotW
        newLeft = snappedLeftFrame - margin.l
        const newPlotW = Math.max(minPlotW, currentRightFrame - snappedLeftFrame)
        newWidth = newPlotW + margin.l + margin.r
      }

      if (dir.includes('bottom')) {
        const rawBottom = startTop + margin.t + startPlotH + dy
        const snappedBottom = snapToGridThreshold(rawBottom, GRID_SIZE, SNAP_THRESHOLD)
        const currentTopFrame = startTop + margin.t
        const newPlotH = Math.max(minPlotH, snappedBottom - currentTopFrame)
        newHeight = newPlotH + margin.t + margin.b
      }

      if (dir.includes('top')) {
        const rawTopFrame = startTop + margin.t + dy
        const snappedTopFrame = snapToGridThreshold(rawTopFrame, GRID_SIZE, SNAP_THRESHOLD)
        const currentBottomFrame = startTop + margin.t + startPlotH
        newTop = snappedTopFrame - margin.t
        const newPlotH = Math.max(minPlotH, currentBottomFrame - snappedTopFrame)
        newHeight = newPlotH + margin.t + margin.b
      }
    }

    svg.style.left = `${newLeft}px`
    svg.style.top = `${newTop}px`
    svg.style.width = `${newWidth}px`
    svg.style.height = `${newHeight}px`
    syncPlotOverlay(svg)

    if (rafId) cancelAnimationFrame(rafId)
    const currentDrag = activeDrag
    rafId = requestAnimationFrame(() => {
      if (!currentDrag) return
      const ds = svgDataMap.get(currentDrag.svg)
      const smpDoc = getPlotSmpDoc(currentDrag.svg)

      const newPlotW = Math.max(10, newWidth - margin.l - margin.r)
      const newPlotH = Math.max(10, newHeight - margin.t - margin.b)

      if (smpDoc && currentDrag.initialItemPositions && smpDoc.legendItems) {
        smpDoc.legendItems.forEach((item, idx) => {
          const initPos = currentDrag.initialItemPositions?.[idx]
          if (initPos) {
            item.xNorm = Math.round((initPos.xPx / newPlotW) * 10000)
            item.yNorm = Math.round((initPos.yPx / newPlotH) * 10000)
            if (item.x2Norm !== undefined && initPos.x2Px !== undefined) {
              item.x2Norm = Math.round((initPos.x2Px / newPlotW) * 10000)
            }
            if (item.y2Norm !== undefined && initPos.y2Px !== undefined) {
              item.y2Norm = Math.round((initPos.y2Px / newPlotH) * 10000)
            }
          }
        })
      }

      // Annotations are frame-relative mm; resizing the plot leaves them
      // untouched (they scale with the frame).
      syncDocGeometry(currentDrag.svg)

      if (ds) drawPlot(currentDrag.svg, ds, newWidth, newHeight)
      rafId = null
    })
  }

  const handleDragEnd = () => {
    let wasDragging = false
    if (getActiveTransDrag()) {
      const { svg } = getActiveTransDrag()!
      clearActiveTransDrag()
      document.body.style.userSelect = ''
      if (svgDataMap.get(svg)) {
        updatePlotVisual(svg)
      }
      wasDragging = true
    }

    if (activeGroupDrag) {
      const dragRef = activeGroupDrag

      // Commit live legend/text drags: write the final xNorm/yNorm, then one
      // redraw resets the temporary group transform and selection overlays.
      const liveLegendDrag =
        dragRef.items.some((it) => it.kind === 'legend') &&
        dragRef.items.every((it) => it.kind === 'legend' || it.kind === 'plot')
      if (liveLegendDrag) {
        const committedSvgs = new Set<SVGSVGElement>()
        for (const item of dragRef.items) {
          if (item.kind !== 'legend') continue
          const smpDoc = getPlotSmpDoc(item.svg)
          const legendItem = smpDoc?.legendItems[item.itemIdx!]
          if (!smpDoc || !legendItem) continue
          const widthPx = parseFloat(item.svg.style.width) || 500
          const heightPx = parseFloat(item.svg.style.height) || 350
          const plotW = Math.max(50, widthPx - PLOT_MARGIN.l - PLOT_MARGIN.r)
          const plotH = Math.max(50, heightPx - PLOT_MARGIN.t - PLOT_MARGIN.b)
          legendItem.xNorm = Math.round(item.startXNorm! + ((dragRef.lastDx ?? 0) / plotW) * 10000)
          legendItem.yNorm = Math.round(item.startYNorm! + ((dragRef.lastDy ?? 0) / plotH) * 10000)
          committedSvgs.add(item.svg)
        }
        const firstLegend = dragRef.items.find((it) => it.kind === 'legend')
        for (const svg of committedSvgs) {
          updatePlotVisual(svg)
          const titleOverlayEl = getCachedTitleOverlay()
          if (titleOverlayEl && titleOverlayEl.style.display !== 'none' && firstLegend) {
            showTitleDialog(titleOverlayEl, firstLegend.itemIdx!, svg)
          }
        }
      }

      activeGroupDrag = null
      document.body.style.userSelect = ''
      wasDragging = true
    }

    if (activeDrag) {
      const { svg } = activeDrag
      activeDrag = null
      document.body.style.userSelect = ''
      const ds = svgDataMap.get(svg)
      if (ds) {
        const w = parseFloat(svg.style.width) || svg.getBoundingClientRect().width
        const h = parseFloat(svg.style.height) || svg.getBoundingClientRect().height
        drawPlot(svg, ds, w, h)
      }
      wasDragging = true
    }

    if (wasDragging) {
      onDragCommit?.()
    }
  }

  document.addEventListener('mousemove', (e: MouseEvent) => {
    handleDragMove(e.clientX, e.clientY, e.shiftKey)
  })

  document.addEventListener(
    'touchmove',
    (e: TouchEvent) => {
      if (e.touches.length === 1 && (getActiveTransDrag() || activeGroupDrag || activeDrag)) {
        e.preventDefault()
        const touch = e.touches[0]
        handleDragMove(touch.clientX, touch.clientY, e.shiftKey)
      }
    },
    { passive: false }
  )

  document.addEventListener('mouseup', () => {
    handleDragEnd()
  })

  document.addEventListener('touchend', () => {
    handleDragEnd()
  })

  document.addEventListener('touchcancel', () => {
    handleDragEnd()
  })
}