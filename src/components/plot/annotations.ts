import { createOverlayEl, createSVGElement } from './svg.ts'
import type { PlotRenderContext } from './svg.ts'
import { getPlotOverlay } from './state.ts'
import { isReadValueMode, isTrimmingMode } from './modes.ts'
import {
  getSelectedObjects,
  isObjectSelected,
  setSelectedAnnotationIndex,
  setSelectedLegendIndex,
  setSelectedPlotSvg,
} from './selection.ts'
import { isPropertyTabMode } from './transform.ts'
import { buildGroupDragItems, setActiveGroupDrag } from './drag.ts'
import { updatePlotVisual } from './drawPlot.ts'
import { showArrowDialog } from './../ArrowDialog.ts'
import { showRectangleDialog } from './../RectangleDialog.ts'
import { getLineDashArray } from './symbols.ts'

let lastAnnotationClickTime = 0
let lastAnnotationClickKey = ''

export function renderAnnotations(ctx: PlotRenderContext): void {
  const { svg, smpDoc, margin, scaleX, scaleY, sx, sy, su, sr } = ctx

  const annotationLines = smpDoc?.annotationLines || []
  annotationLines.forEach((aLine, aIdx) => {
    let x1: number, y1: number, x2: number, y2: number

    if (aLine.unitX === 'xa') {
      x1 = sx(aLine.x1Norm)
      x2 = sx(aLine.x2Norm)
    } else if (aLine.unitX === 'ua') {
      x1 = su(aLine.x1Norm)
      x2 = su(aLine.x2Norm)
    } else {
      x1 = margin.l + aLine.x1Norm * scaleX
      x2 = margin.l + aLine.x2Norm * scaleX
    }

    if (aLine.unitY === 'ya') {
      y1 = sy(aLine.y1Norm)
      y2 = sy(aLine.y2Norm)
    } else if (aLine.unitY === 'ra') {
      y1 = sr(aLine.y1Norm)
      y2 = sr(aLine.y2Norm)
    } else {
      y1 = margin.t + aLine.y1Norm * scaleY
      y2 = margin.t + aLine.y2Norm * scaleY
    }

    const isSelected = isObjectSelected({ kind: 'annotation', svg, annotationIdx: aIdx })

    const handleMouseDown = (targetType: 'start' | 'end' | 'line') => (e: MouseEvent) => {
      if (e.button !== 0) return
      if (isTrimmingMode() || isReadValueMode() || isPropertyTabMode()) return
      const wasSelected = isObjectSelected({ kind: 'annotation', svg, annotationIdx: aIdx })

      if (!wasSelected) {
        // Not yet selected — don't stopPropagation, let MarqueeSelect handle.
        return
      }

      const now = Date.now()
      const clickKey = `annot-${aIdx}`
      if (lastAnnotationClickKey === clickKey && now - lastAnnotationClickTime < 450) {
        lastAnnotationClickTime = 0
        lastAnnotationClickKey = ''
        e.stopPropagation()
        e.preventDefault()
        setSelectedPlotSvg(svg)
        setSelectedAnnotationIndex(aIdx)
        setSelectedLegendIndex(-1)
        updatePlotVisual(svg)
        if (isRect) {
          const rectOverlayEl = document.querySelector<HTMLElement>('#rectangleOverlay')
          if (rectOverlayEl) showRectangleDialog(rectOverlayEl, aIdx, svg)
        } else {
          const arrowOverlayEl = document.querySelector<HTMLElement>('#arrowOverlay')
          if (arrowOverlayEl) showArrowDialog(arrowOverlayEl, aIdx, svg)
        }
        return
      }
      lastAnnotationClickTime = now
      lastAnnotationClickKey = clickKey

      // Object was already selected — stopPropagation and start group drag
      e.stopPropagation()
      setSelectedPlotSvg(svg)
      setSelectedAnnotationIndex(aIdx)
      setSelectedLegendIndex(-1)
      updatePlotVisual(svg)

      const selection = getSelectedObjects()
      if (selection.length > 1) {
        setActiveGroupDrag({
          items: buildGroupDragItems(selection).map((it) =>
            it.kind === 'annotation' && it.svg === svg && it.annotationIdx === aIdx ? { ...it, targetType } : it
          ),
          startX: e.clientX,
          startY: e.clientY,
        })
        document.body.style.userSelect = 'none'
        return
      }

      // Single annotation: keep endpoint editing behavior
      setActiveGroupDrag({
        items: [
          {
            kind: 'annotation',
            svg,
            annotationIdx: aIdx,
            targetType,
            startX1Norm: aLine.x1Norm,
            startY1Norm: aLine.y1Norm,
            startX2Norm: aLine.x2Norm,
            startY2Norm: aLine.y2Norm,
          },
        ],
        startX: e.clientX,
        startY: e.clientY,
      })
      document.body.style.userSelect = 'none'
    }

    const isRect = aLine.shape === 'rectangle' || aLine.shape === 'rect' || aLine.rawType === '3'

    if (isRect) {
      const rx1 = Math.min(x1, x2)
      const ry1 = Math.min(y1, y2)
      const rw = Math.max(1, Math.abs(x2 - x1))
      const rh = Math.max(1, Math.abs(y2 - y1))

      const shadeDepth = aLine.shadeDepth ?? 0
      if (shadeDepth > 0) {
        const shadePx = shadeDepth * scaleX
        const shadowElem = createSVGElement('rect')
        shadowElem.setAttribute('x', String(rx1 + shadePx))
        shadowElem.setAttribute('y', String(ry1 + shadePx))
        shadowElem.setAttribute('width', String(rw))
        shadowElem.setAttribute('height', String(rh))
        if (aLine.roundX) {
          const rxPx = aLine.roundX * scaleX
          shadowElem.setAttribute('rx', String(rxPx))
        }
        if (aLine.roundY) {
          const ryPx = aLine.roundY * scaleY
          shadowElem.setAttribute('ry', String(ryPx))
        }
        shadowElem.setAttribute('fill', aLine.shadeColor || '#000000')
        shadowElem.setAttribute('stroke', 'none')
        shadowElem.setAttribute('pointer-events', 'all')
        shadowElem.style.cursor = 'pointer'
        shadowElem.addEventListener('mousedown', handleMouseDown('line'))
        shadowElem.addEventListener('dblclick', (e: MouseEvent) => {
          e.stopPropagation()
          e.preventDefault()
          setSelectedPlotSvg(svg)
          setSelectedAnnotationIndex(aIdx)
          setSelectedLegendIndex(-1)
          updatePlotVisual(svg)
          const rectOverlayEl = document.querySelector<HTMLElement>('#rectangleOverlay')
          if (rectOverlayEl) {
            showRectangleDialog(rectOverlayEl, aIdx, svg)
          }
        })
        svg.appendChild(shadowElem)
      }

      const rectElem = createSVGElement('rect')
      rectElem.setAttribute('x', String(rx1))
      rectElem.setAttribute('y', String(ry1))
      rectElem.setAttribute('width', String(rw))
      rectElem.setAttribute('height', String(rh))
      if (aLine.roundX) {
        const rxPx = aLine.roundX * scaleX
        rectElem.setAttribute('rx', String(rxPx))
      }
      if (aLine.roundY) {
        const ryPx = aLine.roundY * scaleY
        rectElem.setAttribute('ry', String(ryPx))
      }
      rectElem.setAttribute('fill', aLine.faceColor && aLine.faceColor !== 'none' ? aLine.faceColor : 'transparent')
      rectElem.setAttribute('stroke', aLine.shadeColor || aLine.color || '#000000')
      const aWidthMm = aLine.thickness || aLine.width || 0.4
      rectElem.setAttribute('stroke-width', String(Math.max(0.4, Number((aWidthMm * scaleX).toFixed(2)))))
      rectElem.setAttribute('pointer-events', 'all')
      const rectDash = getLineDashArray(aLine.style, Math.max(0.4, Number((aWidthMm * scaleX).toFixed(2))))
      if (rectDash !== 'none') rectElem.setAttribute('stroke-dasharray', rectDash)
      rectElem.style.cursor = 'pointer'
      rectElem.addEventListener('mousedown', handleMouseDown('line'))
      rectElem.addEventListener('dblclick', (e: MouseEvent) => {
        e.stopPropagation()
        e.preventDefault()
        setSelectedPlotSvg(svg)
        setSelectedAnnotationIndex(aIdx)
        setSelectedLegendIndex(-1)
        updatePlotVisual(svg)
        const rectOverlayEl = document.querySelector<HTMLElement>('#rectangleOverlay')
        if (rectOverlayEl) {
          showRectangleDialog(rectOverlayEl, aIdx, svg)
        }
      })
      svg.appendChild(rectElem)
    } else {
      const dx = x2 - x1
      const dy = y2 - y1
      const len = Math.hypot(dx, dy)
      const aColor = aLine.color || '#000000'
      const aWidthMm = aLine.width ?? 0.4
      const aStrokeW = Math.max(0.4, Number((aWidthMm * scaleX).toFixed(2)))
      const aLineStyle = aLine.style || 'solid'

      // Reuse the shared series dash pattern so the arrow line matches the
      // plot line type exactly. getLineDashArray already compensates for the
      // round stroke caps so dash lengths and gaps stay constant with width.
      const dashArray = getLineDashArray(aLineStyle, aStrokeW)

      const isMeasureLine = aLine.shape === 'measure_line' || aLine.rawType === '2'
      const mode = aLine.arrowMode !== undefined ? aLine.arrowMode : (
        aLine.shape === 'arrow_start' ? 2 :
        aLine.shape === 'arrow_both' ? 3 :
        aLine.shape === 'line' || isMeasureLine ? 0 :
        (aLine.shape === 'arrow' || aLine.arrowhead ? 1 : 0)
      )

      const handleArrowDblClick = (e: MouseEvent) => {
        e.stopPropagation()
        setSelectedPlotSvg(svg)
        setSelectedAnnotationIndex(aIdx)
        setSelectedLegendIndex(-1)
        updatePlotVisual(svg)
        const arrowOverlayEl = document.querySelector<HTMLElement>('#arrowOverlay')
        if (arrowOverlayEl) {
          showArrowDialog(arrowOverlayEl, aIdx, svg)
        }
      }

      if (isMeasureLine && len > 1e-4) {
        const ux = dx / len
        const uy = dy / len
        const px = -uy
        const py = ux
        const capLen = ((aLine.arrowhead ?? 5.0) * scaleX)

        const cap1_x1 = x1 - (capLen / 2) * px
        const cap1_y1 = y1 - (capLen / 2) * py
        const cap1_x2 = x1 + (capLen / 2) * px
        const cap1_y2 = y1 + (capLen / 2) * py

        const cap2_x1 = x2 - (capLen / 2) * px
        const cap2_y1 = y2 - (capLen / 2) * py
        const cap2_x2 = x2 + (capLen / 2) * px
        const cap2_y2 = y2 + (capLen / 2) * py

        // The two end boundary (extension) lines stay solid regardless of the
        // chosen line type; only the main dimension line follows the dash style.
        const capPathD = `M${cap1_x1.toFixed(1)},${cap1_y1.toFixed(1)}L${cap1_x2.toFixed(1)},${cap1_y2.toFixed(1)}M${cap2_x1.toFixed(1)},${cap2_y1.toFixed(1)}L${cap2_x2.toFixed(1)},${cap2_y2.toFixed(1)}`
        const dimCaps = createSVGElement('path')
        dimCaps.setAttribute('d', capPathD)
        dimCaps.setAttribute('stroke', aColor)
        dimCaps.setAttribute('stroke-width', String(aStrokeW))
        dimCaps.setAttribute('fill', 'none')
        dimCaps.setAttribute('stroke-linecap', 'round')
        dimCaps.setAttribute('stroke-linejoin', 'round')
        dimCaps.style.cursor = 'pointer'
        dimCaps.addEventListener('mousedown', handleMouseDown('line'))
        dimCaps.addEventListener('dblclick', handleArrowDblClick)
        svg.appendChild(dimCaps)

        const linePathD = `M${x1.toFixed(1)},${y1.toFixed(1)}L${x2.toFixed(1)},${y2.toFixed(1)}`
        const dimLine = createSVGElement('path')
        dimLine.setAttribute('d', linePathD)
        dimLine.setAttribute('stroke', aColor)
        dimLine.setAttribute('stroke-width', String(aStrokeW))
        dimLine.setAttribute('fill', 'none')
        dimLine.setAttribute('stroke-linecap', 'round')
        dimLine.setAttribute('stroke-linejoin', 'round')
        if (dashArray !== 'none') dimLine.setAttribute('stroke-dasharray', dashArray)
        dimLine.style.cursor = 'pointer'
        dimLine.addEventListener('mousedown', handleMouseDown('line'))
        dimLine.addEventListener('dblclick', handleArrowDblClick)
        svg.appendChild(dimLine)
      } else if (len > 1e-4) {
        const ux = dx / len
        const uy = dy / len
        const px = -uy
        const py = ux

        const rawHeadLen = (aLine.arrowhead ?? 5.0) * scaleX
        const headLenPx = Math.min(rawHeadLen, len * 0.45)
        const spreadVal = aLine.spread ?? 30
        const halfWidthPx = headLenPx * (spreadVal / 150)
        const shutPct = (aLine.shut !== undefined ? aLine.shut : 100) / 100
        const notchDist = headLenPx * shutPct

        let startX = x1
        let startY = y1
        let endX = x2
        let endY = y2

        // Arrowhead at End (x2, y2)
        if (mode === 1 || mode === 3) {
          const tipX = x2
          const tipY = y2
          const baseX = tipX - headLenPx * ux
          const baseY = tipY - headLenPx * uy
          const notchX = tipX - notchDist * ux
          const notchY = tipY - notchDist * uy
          const c1X = baseX + halfWidthPx * px
          const c1Y = baseY + halfWidthPx * py
          const c2X = baseX - halfWidthPx * px
          const c2Y = baseY - halfWidthPx * py

          const headElem = createSVGElement('path')
          headElem.setAttribute('d', `M${c1X.toFixed(1)},${c1Y.toFixed(1)}L${tipX.toFixed(1)},${tipY.toFixed(1)}L${c2X.toFixed(1)},${c2Y.toFixed(1)}L${notchX.toFixed(1)},${notchY.toFixed(1)}Z`)
          headElem.setAttribute('fill', aColor)
          headElem.setAttribute('stroke', aColor)
          headElem.setAttribute('stroke-width', '1')
          headElem.setAttribute('stroke-linejoin', 'miter')
          headElem.setAttribute('stroke-miterlimit', '10')
          headElem.setAttribute('stroke-linecap', 'butt')
          headElem.style.cursor = 'pointer'
          headElem.addEventListener('mousedown', handleMouseDown('end'))
          headElem.addEventListener('dblclick', handleArrowDblClick)
          svg.appendChild(headElem)

          endX = notchX
          endY = notchY
        }

        // Arrowhead at Start (x1, y1)
        if (mode === 2 || mode === 3) {
          const tipX = x1
          const tipY = y1
          const baseX = tipX + headLenPx * ux
          const baseY = tipY + headLenPx * uy
          const notchX = tipX + notchDist * ux
          const notchY = tipY + notchDist * uy
          const c1X = baseX + halfWidthPx * px
          const c1Y = baseY + halfWidthPx * py
          const c2X = baseX - halfWidthPx * px
          const c2Y = baseY - halfWidthPx * py

          const headElem = createSVGElement('path')
          headElem.setAttribute('d', `M${c1X.toFixed(1)},${c1Y.toFixed(1)}L${tipX.toFixed(1)},${tipY.toFixed(1)}L${c2X.toFixed(1)},${c2Y.toFixed(1)}L${notchX.toFixed(1)},${notchY.toFixed(1)}Z`)
          headElem.setAttribute('fill', aColor)
          headElem.setAttribute('stroke', aColor)
          headElem.setAttribute('stroke-width', '1')
          headElem.setAttribute('stroke-linejoin', 'miter')
          headElem.setAttribute('stroke-miterlimit', '10')
          headElem.setAttribute('stroke-linecap', 'butt')
          headElem.style.cursor = 'pointer'
          headElem.addEventListener('mousedown', handleMouseDown('start'))
          headElem.addEventListener('dblclick', handleArrowDblClick)
          svg.appendChild(headElem)

          startX = notchX
          startY = notchY
        }

        // Body line
        const lineElem = createSVGElement('path')
        lineElem.setAttribute('d', `M${startX.toFixed(1)},${startY.toFixed(1)}L${endX.toFixed(1)},${endY.toFixed(1)}`)
        lineElem.setAttribute('stroke', aColor)
        lineElem.setAttribute('stroke-width', String(aStrokeW))
        lineElem.setAttribute('stroke-linecap', 'round')
        lineElem.setAttribute('stroke-linejoin', 'round')
        lineElem.setAttribute('fill', 'none')
        if (dashArray !== 'none') lineElem.setAttribute('stroke-dasharray', dashArray)
        lineElem.style.cursor = 'pointer'
        lineElem.addEventListener('mousedown', handleMouseDown('line'))
        lineElem.addEventListener('dblclick', handleArrowDblClick)
        svg.appendChild(lineElem)
      } else {
        const l = createSVGElement('line')
        l.setAttribute('x1', String(x1))
        l.setAttribute('y1', String(y1))
        l.setAttribute('x2', String(x2))
        l.setAttribute('y2', String(y2))
        l.setAttribute('stroke', aColor)
        l.setAttribute('stroke-width', String(aStrokeW))
        l.setAttribute('stroke-linecap', 'round')
        if (dashArray !== 'none') l.setAttribute('stroke-dasharray', dashArray)
        l.style.cursor = 'pointer'
        l.addEventListener('mousedown', handleMouseDown('line'))
        l.addEventListener('dblclick', handleArrowDblClick)
        svg.appendChild(l)
      }
    }

    if (isSelected) {
      if (isRect) {
        const rx1 = Math.min(x1, x2)
        const ry1 = Math.min(y1, y2)
        const rw = Math.max(1, Math.abs(x2 - x1))
        const rh = Math.max(1, Math.abs(y2 - y1))
        const ov = getPlotOverlay(svg)

        const highlightEl = createOverlayEl('ov-box-multi')
        highlightEl.style.left = `${rx1 - 0.5}px`
        highlightEl.style.top = `${ry1 - 0.5}px`
        highlightEl.style.width = `${rw + 1}px`
        highlightEl.style.height = `${rh + 1}px`
        highlightEl.addEventListener('mousedown', handleMouseDown('line'))
        highlightEl.addEventListener('dblclick', (e: MouseEvent) => {
          e.stopPropagation()
          const rectOverlayEl = document.querySelector<HTMLElement>('#rectangleOverlay')
          if (rectOverlayEl) showRectangleDialog(rectOverlayEl, aIdx, svg)
        })
        ov.appendChild(highlightEl)

        const handleTL = createOverlayEl('ov-handle')
        handleTL.style.left = `${rx1 - 2}px`
        handleTL.style.top = `${ry1 - 2}px`
        handleTL.addEventListener('mousedown', handleMouseDown('start'))
        ov.appendChild(handleTL)

        const handleTR = createOverlayEl('ov-handle')
        handleTR.style.left = `${rx1 + rw - 2}px`
        handleTR.style.top = `${ry1 - 2}px`
        handleTR.addEventListener('mousedown', handleMouseDown('start'))
        ov.appendChild(handleTR)

        const handleBL = createOverlayEl('ov-handle')
        handleBL.style.left = `${rx1 - 2}px`
        handleBL.style.top = `${ry1 + rh - 2}px`
        handleBL.addEventListener('mousedown', handleMouseDown('end'))
        ov.appendChild(handleBL)

        const handleBR = createOverlayEl('ov-handle')
        handleBR.style.left = `${rx1 + rw - 2}px`
        handleBR.style.top = `${ry1 + rh - 2}px`
        handleBR.addEventListener('mousedown', handleMouseDown('end'))
        ov.appendChild(handleBR)
      } else {
        const len = Math.hypot(x2 - x1, y2 - y1) || 1
        const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI
        const ov = getPlotOverlay(svg)

        const cyanLineEl = createOverlayEl('ov-line')
        cyanLineEl.style.left = `${x1}px`
        cyanLineEl.style.top = `${y1}px`
        cyanLineEl.style.width = `${len}px`
        cyanLineEl.style.transformOrigin = '0 50%'
        cyanLineEl.style.transform = `rotate(${angle}deg)`
        cyanLineEl.addEventListener('mousedown', handleMouseDown('line'))
        cyanLineEl.addEventListener('dblclick', (e: MouseEvent) => {
          e.stopPropagation()
          const arrowOverlayEl = document.querySelector<HTMLElement>('#arrowOverlay')
          if (arrowOverlayEl) showArrowDialog(arrowOverlayEl, aIdx, svg)
        })
        ov.appendChild(cyanLineEl)

        const handle1 = createOverlayEl('ov-handle')
        handle1.style.left = `${x1 - 2}px`
        handle1.style.top = `${y1 - 2}px`
        handle1.addEventListener('mousedown', handleMouseDown('start'))
        ov.appendChild(handle1)

        const handle2 = createOverlayEl('ov-handle')
        handle2.style.left = `${x2 - 2}px`
        handle2.style.top = `${y2 - 2}px`
        handle2.addEventListener('mousedown', handleMouseDown('end'))
        ov.appendChild(handle2)
      }
    }
  })
}