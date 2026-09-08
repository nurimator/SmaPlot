import { renderSmpTextToHtml } from '../../utils/smpSymbolMapper.ts'
import { isSeriesLegendText } from './dataset.ts'
import { createOverlayEl, createSVGElement } from './svg.ts'
import type { PlotRenderContext } from './svg.ts'
import { createSeriesSymbol, getLineDashArray } from './symbols.ts'
import { getPlotOverlay } from './state.ts'
import { isReadValueMode, isTrimmingMode } from './modes.ts'
import {
  isObjectSelected,
  setSelectedAnnotationIndex,
  setSelectedLegendIndex,
  setSelectedPlotSvg,
} from './selection.ts'
import { isPropertyTabMode } from './transform.ts'
import { startGroupDrag } from './drag.ts'
import { updatePlotVisual } from './drawPlot.ts'
import { showTitleDialog } from './../TitleDialog.ts'

export function renderLegend(ctx: PlotRenderContext): void {
  const { svg, smpDoc, margin, plotW, plotH, scaleX, processedDatasets } = ctx

  if (smpDoc && smpDoc.legendItems.length === 0) {
    const xLbl = smpDoc?.xLabel
    const yLbl = smpDoc?.yLabel
    if (xLbl) {
      smpDoc.legendItems.push({
        type: 'text',
        legendType: 4,
        text: xLbl,
        rawText: xLbl,
        xNorm: 2400,
        yNorm: 11400,
        rotation: 0,
        fontFamily: 'Times New Roman',
        fontSize: 12,
        fontWeight: 400,
      })
    }
    if (yLbl) {
      smpDoc.legendItems.push({
        type: 'text',
        legendType: 5,
        text: yLbl,
        rawText: yLbl,
        xNorm: -400,
        yNorm: 5000,
        rotation: -90,
        fontFamily: 'Times New Roman',
        fontSize: 12,
        fontWeight: 400,
      })
    }
  }

  const legendItems = smpDoc?.legendItems || []
  if (legendItems.length > 0) {
    legendItems.forEach((item, itemIdx) => {
      const isRotated = item.rotation !== 0
      const px = margin.l + (item.xNorm / 10000) * plotW
      const renderPx = px
      const py = margin.t + (item.yNorm / 10000) * plotH

      const isSelected = isObjectSelected({ kind: 'legend', svg, itemIdx })

      let lastClickTime = 0

      const openTitleModal = (e: MouseEvent) => {
        e.stopPropagation()
        setSelectedPlotSvg(svg)
        setSelectedLegendIndex(itemIdx)
        updatePlotVisual(svg)
        const titleOverlayEl = document.querySelector<HTMLElement>('#titleOverlay')
        if (titleOverlayEl) {
          showTitleDialog(titleOverlayEl, itemIdx, svg)
        }
      }

      const handleLegendMouseDown = (e: MouseEvent) => {
        if (e.button !== 0) return
        if (isTrimmingMode() || isReadValueMode() || isPropertyTabMode()) return
        const wasSelected = isObjectSelected({ kind: 'legend', svg, itemIdx })

        const now = Date.now()
        if (now - lastClickTime < 350 || e.detail >= 2) {
          lastClickTime = 0
          e.stopPropagation()
          setSelectedPlotSvg(svg)
          setSelectedLegendIndex(itemIdx)
          setSelectedAnnotationIndex(-1)
          updatePlotVisual(svg)
          openTitleModal(e)
          return
        }
        lastClickTime = now

        if (!wasSelected) {
          return
        }

        e.stopPropagation()
        setSelectedPlotSvg(svg)
        setSelectedLegendIndex(itemIdx)
        setSelectedAnnotationIndex(-1)
        updatePlotVisual(svg)
        startGroupDrag(e.clientX, e.clientY)
      }

      if (isSeriesLegendText(item.text)) {
        const legGroup = createSVGElement('g')
        legGroup.setAttribute('data-legend-item', String(itemIdx))
        svg.appendChild(legGroup)

        const rawLines = item.text.split('\n')
        let legY = py
        rawLines.forEach((lineStr) => {
          const head = lineStr.match(/%(\d+)E/)
          if (!head) return
          const idx = parseInt(head[1], 10) - 1
          const ds = processedDatasets[idx]

          const labelText = lineStr
            .replace(/%(\d+)N/g, (_m, n) => {
              const d = processedDatasets[parseInt(n, 10) - 1]
              return (d?.fileName || d?.name || `Series ${n}`).toUpperCase()
            })
            .replace(/%(\d+)E/g, '')
            .trim()

          if (ds) {
          const color = ds.options?.lineColor || ds.color || '#000000'

          const legLine = createSVGElement('line')
          legLine.setAttribute('x1', String(renderPx))
          legLine.setAttribute('y1', String(legY))
          legLine.setAttribute('x2', String(renderPx + 18))
          legLine.setAttribute('y2', String(legY))
          legLine.setAttribute('stroke', color)
          const legWidthMm = ds?.options?.width ?? (ds?.smpSeriesStylePrefix ? ds.smpSeriesStylePrefix / 100 : 0.6)
          const legStrokeW = Math.max(0.4, Number((legWidthMm * scaleX).toFixed(2)))
          legLine.setAttribute('stroke-width', String(legStrokeW))
          legLine.setAttribute('stroke-linecap', 'round')

          const lineType = ds?.options?.lineType || 'solid'
          const dashArray = getLineDashArray(lineType, legStrokeW)
          if (dashArray !== 'none') legLine.setAttribute('stroke-dasharray', dashArray)

          legLine.style.cursor = isSelected ? 'move' : 'pointer'
          legLine.addEventListener('mousedown', handleLegendMouseDown)
          legLine.addEventListener('dblclick', openTitleModal)
          legGroup.appendChild(legLine)

          const plotType = ds?.options?.plotType || 'no_dot'
          if (plotType !== 'no_dot' && plotType !== 'none' && plotType !== 'bar') {
            const dotColor = ds?.options?.dotColor || color
            const paintColor = ds?.options?.paintColor || '#ffffff'
            const r = Math.max(3, ds?.options?.size || 3.5)
            const cx = renderPx + 9
            const symbol = createSeriesSymbol(plotType, cx, legY, r, dotColor, paintColor, 1)
            if (symbol) {
              symbol.style.cursor = isSelected ? 'move' : 'pointer'
              symbol.addEventListener('mousedown', handleLegendMouseDown)
              symbol.addEventListener('dblclick', openTitleModal)
              legGroup.appendChild(symbol)
            }
          }
          }

          const legStr = renderSmpTextToHtml(labelText)
          const legFontSz = 10
          const legFo = createSVGElement('foreignObject')
          legFo.setAttribute('x', String(renderPx + 22))
          legFo.setAttribute('y', String(legY - 6))
          legFo.setAttribute('width', '600')
          legFo.setAttribute('height', '400')
          legFo.style.overflow = 'visible'
          legFo.style.cursor = isSelected ? 'move' : 'pointer'

          const legContainer = document.createElement('div')
          legContainer.className = 'smp-latex-item'
          legContainer.style.fontSize = `${legFontSz}px`
          legContainer.style.fontFamily = item.fontFamily || 'Times New Roman, serif'
          legContainer.style.fontWeight = String(item.fontWeight)
          legContainer.style.color = '#000000'
          legContainer.style.display = 'inline-block'
          legContainer.style.verticalAlign = 'top'
          legContainer.style.userSelect = 'none'
          legContainer.style.cursor = isSelected ? 'move' : 'pointer'
          legContainer.innerHTML = legStr
          legContainer.addEventListener('mousedown', handleLegendMouseDown)
          legContainer.addEventListener('dblclick', openTitleModal)
          legFo.appendChild(legContainer)
          legGroup.appendChild(legFo)

          legY += 11
        })
      } else {
        const rawStr = item.rawText || item.text
        const htmlStr = renderSmpTextToHtml(rawStr)
        const fontSz = Math.max(6, Math.round((item.fontSize || 12) * 0.72))

        const fo = createSVGElement('foreignObject')
        fo.setAttribute('x', String(renderPx))
        fo.setAttribute('y', String(py - fontSz - 2))
        fo.setAttribute('width', '600')
        fo.setAttribute('height', '400')
        fo.style.overflow = 'visible'
        fo.style.cursor = isSelected ? 'move' : 'pointer'

        if (isRotated) {
          fo.setAttribute('transform', `rotate(${item.rotation} ${renderPx} ${py})`)
        }

        const container = document.createElement('div')
        container.className = 'smp-latex-item'
        container.style.fontSize = `${fontSz}px`
        container.style.fontFamily = item.fontFamily || 'Times New Roman, serif'
        container.style.fontWeight = String(item.fontWeight || 400)
        if (item.fontStyle === 'italic') container.style.fontStyle = 'italic'
        container.style.color = item.color || '#000000'
        container.style.display = 'inline-block'
        container.style.verticalAlign = 'top'
        container.style.userSelect = 'none'
        container.style.cursor = isSelected ? 'move' : 'pointer'

        if (item.align === 'center') {
          container.style.textAlign = 'center'
          container.style.transform = 'translateX(-50%)'
        } else if (item.align === 'right') {
          container.style.textAlign = 'right'
          container.style.transform = 'translateX(-100%)'
        } else {
          container.style.textAlign = 'left'
        }

        container.innerHTML = htmlStr
        container.addEventListener('mousedown', handleLegendMouseDown)
        container.addEventListener('dblclick', openTitleModal)
        fo.appendChild(container)
        const legGroup = createSVGElement('g')
        legGroup.setAttribute('data-legend-item', String(itemIdx))
        legGroup.appendChild(fo)
        svg.appendChild(legGroup)

        if (isSelected) {
          const measuredW = container.offsetWidth || (rawStr.length * (fontSz * 0.5) + 10)
          const measuredH = container.offsetHeight || (fontSz + 4)

          let boxW = Math.max(30, measuredW + 6)
          let boxH = Math.max(10, measuredH + 2)
          let boxX = renderPx - 3
          let boxY = py - fontSz - 3

          const anchor = item.align === 'center' ? 'middle' : item.align === 'right' ? 'end' : 'start'
          if (anchor === 'middle') {
            boxX = renderPx - boxW / 2
          } else if (anchor === 'end') {
            boxX = renderPx - boxW + 4
          }

          const ov = getPlotOverlay(svg)
          let parentEl: HTMLElement = ov

          if (isRotated) {
            const rotWrap = createOverlayEl('ov-rot-wrap')
            rotWrap.dataset.legendItem = String(itemIdx)
            rotWrap.style.left = `${renderPx}px`
            rotWrap.style.top = `${py}px`
            rotWrap.style.transform = `rotate(${item.rotation}deg)`
            ov.appendChild(rotWrap)
            parentEl = rotWrap
          }

          const offsetX = isRotated ? boxX - renderPx : boxX
          const offsetY = isRotated ? boxY - py : boxY

          const cyanBox = createOverlayEl('ov-box')
          cyanBox.dataset.legendItem = String(itemIdx)
          cyanBox.style.left = `${offsetX}px`
          cyanBox.style.top = `${offsetY}px`
          cyanBox.style.width = `${boxW}px`
          cyanBox.style.height = `${boxH}px`
          cyanBox.addEventListener('mousedown', handleLegendMouseDown)
          cyanBox.addEventListener('dblclick', openTitleModal)
          parentEl.appendChild(cyanBox)

          const corners = [
            { x: offsetX - 1.5, y: offsetY - 1.5 },
            { x: offsetX + boxW - 1.5, y: offsetY - 1.5 },
            { x: offsetX - 1.5, y: offsetY + boxH - 1.5 },
            { x: offsetX + boxW - 1.5, y: offsetY + boxH - 1.5 },
          ]
          corners.forEach((c) => {
            const handle = createOverlayEl('ov-box-corner')
            handle.dataset.legendItem = String(itemIdx)
            handle.style.left = `${c.x}px`
            handle.style.top = `${c.y}px`
            parentEl.appendChild(handle)
          })
        }
      }

      if (isSelected && isSeriesLegendText(item.text)) {
        let boxX = renderPx - 4
        let boxY = py - 6
        let boxW = 60
        let boxH = item.text.split('\n').length * 11 + 6

        const ov = getPlotOverlay(svg)

        const cyanBox = createOverlayEl('ov-box')
        cyanBox.dataset.legendItem = String(itemIdx)
        cyanBox.style.left = `${boxX}px`
        cyanBox.style.top = `${boxY}px`
        cyanBox.style.width = `${boxW}px`
        cyanBox.style.height = `${boxH}px`
        cyanBox.addEventListener('mousedown', handleLegendMouseDown)
        cyanBox.addEventListener('dblclick', openTitleModal)
        ov.appendChild(cyanBox)

        const corners = [
          { x: boxX - 1.5, y: boxY - 1.5 },
          { x: boxX + boxW - 1.5, y: boxY - 1.5 },
          { x: boxX - 1.5, y: boxY + boxH - 1.5 },
          { x: boxX + boxW - 1.5, y: boxY + boxH - 1.5 },
        ]
        corners.forEach((c) => {
          const handle = createOverlayEl('ov-box-corner')
          handle.dataset.legendItem = String(itemIdx)
          handle.style.left = `${c.x}px`
          handle.style.top = `${c.y}px`
          ov.appendChild(handle)
        })
      }
    })
  } else {
    const xLabel = smpDoc?.xLabel
    if (xLabel) {
      const xTitle = createSVGElement('text')
      xTitle.setAttribute('x', String(margin.l + plotW / 2))
      xTitle.setAttribute('y', String(margin.t + plotH + 42))
      xTitle.setAttribute('text-anchor', 'middle')
      xTitle.setAttribute('font-size', '12')
      xTitle.setAttribute('font-family', 'Times New Roman, serif')
      xTitle.setAttribute('fill', '#000000')
      xTitle.textContent = xLabel
      svg.appendChild(xTitle)
    }
    const yLabel = smpDoc?.yLabel
    if (yLabel) {
      const yTitle = createSVGElement('text')
      const cx = margin.l - 42
      const cy = margin.t + plotH / 2
      yTitle.setAttribute('x', String(cx))
      yTitle.setAttribute('y', String(cy))
      yTitle.setAttribute('transform', `rotate(-90 ${cx} ${cy})`)
      yTitle.setAttribute('text-anchor', 'middle')
      yTitle.setAttribute('font-size', '12')
      yTitle.setAttribute('font-family', 'Times New Roman, serif')
      yTitle.setAttribute('fill', '#000000')
      yTitle.textContent = yLabel
      svg.appendChild(yTitle)
    }
  }
}