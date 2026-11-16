import { literalSmpText, measureSmpLine, measureSmpText, SCRIPT_SIZE_RATIO, tokenizeSmpText } from '../../utils/smpSymbolMapper.ts'
import type { SmpTextLine, SmpTextOptions, SmpTextStyle } from '../../utils/smpSymbolMapper.ts'
import { getLegendTextAnchor, getLegendTextOptions, legendRenderFontSize } from './legendText.ts'
import type { LegendTextAnchor } from './legendText.ts'
import { isSeriesLegendText } from './dataset.ts'
import { createOverlayEl, createSVGElement } from './svg.ts'
import type { PlotRenderContext } from './svg.ts'
import { createSeriesSymbol, getLineDashArray } from './symbols.ts'
import { seriesPitchMm } from './series.ts'
import { getPlotOverlay, svgLegendBoxMap } from './state.ts'
import type { LegendCellBox } from './state.ts'
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

type TextAnchor = LegendTextAnchor

interface RichTextLayout {
  group: SVGGElement
  width: number
  height: number
  lineHeight: number
  ink: InkBox | null
}

interface InkBox {
  x: number
  y: number
  width: number
  height: number
}

interface SeriesTextLayout {
  x: number
  y: number
  width: number
  height: number
}

// The native "show background" draws a solid white block with no border behind each text line.
// The block must hug the real glyph ink, so the rendered <text> box is measured directly and
// the estimate is only a fallback for when the node is not laid out yet.
const SHOW_BG_FILL = '#ffffff'
const SUPERSCRIPT_RISE = 0.5
const SUBSCRIPT_DROP = 0.2
const SHOW_BG_PAD_X_RATIO = 0.08
const SHOW_BG_PAD_Y_RATIO = 0.1
const SHOW_BG_ASCENT_RATIO = 0.8
const SHOW_BG_DESCENT_RATIO = 0.25

function applySvgTextStyle(element: SVGElement, style: SmpTextStyle): void {
  element.setAttribute('font-family', style.fontFamily)
  element.setAttribute('font-size', String(style.fontSize))
  element.setAttribute('font-weight', String(style.fontWeight))
  element.setAttribute('font-style', style.fontStyle)
  element.setAttribute('fill', style.color)
}

function createShowBgPlate(
  inkLeft: number,
  inkTop: number,
  inkWidth: number,
  inkHeight: number,
  fontSize: number
): SVGRectElement {
  const padX = fontSize * SHOW_BG_PAD_X_RATIO
  const padY = fontSize * SHOW_BG_PAD_Y_RATIO
  const plate = createSVGElement('rect')
  plate.setAttribute('x', String(inkLeft - padX))
  plate.setAttribute('y', String(inkTop - padY))
  plate.setAttribute('width', String(Math.max(2, inkWidth + padX * 2)))
  plate.setAttribute('height', String(Math.max(2, inkHeight + padY * 2)))
  plate.setAttribute('fill', SHOW_BG_FILL)
  plate.setAttribute('stroke', 'none')
  plate.setAttribute('pointer-events', 'none')
  return plate
}

function appendShowBgPlates(
  group: SVGGElement,
  textNodes: SVGTextElement[],
  lines: SmpTextLine[],
  x: number,
  firstY: number,
  lineHeight: number,
  fontSize: number,
  anchor: TextAnchor
): void {
  textNodes.forEach((text, lineIndex) => {
    const line = lines[lineIndex]
    const measured = measureInkBox(text)
    if (measured) {
      // Pad against the size this line actually rendered at, not the block's base size,
      // so a small CJK run is not padded like a large Latin one.
      const rendered = parseFloat(text.getAttribute('font-size') || '')
      const lineFontSize = Number.isFinite(rendered) && rendered > 0 ? rendered : fontSize
      group.insertBefore(
        createShowBgPlate(measured.x, measured.y, measured.width, measured.height, lineFontSize),
        text
      )
      return
    }

    if (!line || line.runs.length === 0) return
    const lineMetrics = measureSmpLine(line, fontSize)
    const advance = lineMetrics.width + lineMetrics.indent
    const baseline = firstY + lineIndex * lineHeight
    const inkLeft = anchor === 'middle'
      ? x - advance / 2 + lineMetrics.indent
      : anchor === 'end'
        ? x - advance
        : x + lineMetrics.indent
    group.insertBefore(
      createShowBgPlate(
        inkLeft,
        baseline - lineMetrics.fontSize * SHOW_BG_ASCENT_RATIO,
        lineMetrics.width,
        lineMetrics.fontSize * (SHOW_BG_ASCENT_RATIO + SHOW_BG_DESCENT_RATIO),
        lineMetrics.fontSize
      ),
      text
    )
  })
}

function measureInkBox(text: SVGTextElement): { x: number; y: number; width: number; height: number } | null {
  if (!text.isConnected) return null
  let box: DOMRect
  try {
    box = text.getBBox()
  } catch {
    return null
  }
  if (!box || !(box.width > 0) || !(box.height > 0)) return null
  if (!Number.isFinite(box.x) || !Number.isFinite(box.y)) return null
  return { x: box.x, y: box.y, width: box.width, height: box.height }
}

function measureGroupInk(group: SVGGElement, textNodes: SVGTextElement[]): InkBox | null {
  if (!group.isConnected) return null
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const text of textNodes) {
    const box = measureInkBox(text)
    if (!box) continue
    x0 = Math.min(x0, box.x)
    y0 = Math.min(y0, box.y)
    x1 = Math.max(x1, box.x + box.width)
    y1 = Math.max(y1, box.y + box.height)
  }
  if (!Number.isFinite(x0) || !Number.isFinite(y0)) return null
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

function renderSvgText(
  parent: SVGGElement,
  rawText: string,
  x: number,
  y: number,
  options: SmpTextOptions,
  anchor: TextAnchor,
  rotation: number,
  cursor: string,
  showBg: boolean = false
): RichTextLayout {
  const lines: SmpTextLine[] = tokenizeSmpText(rawText || '', options)
  const fontSize = options.fontSize && options.fontSize > 0 ? options.fontSize : 16
  const metrics = measureSmpText(lines, fontSize)
  const group = createSVGElement('g')
  group.style.cursor = cursor
  if (rotation !== 0) group.setAttribute('transform', `rotate(${rotation} ${x} ${y})`)

  const left = anchor === 'middle' ? x - metrics.width / 2 : anchor === 'end' ? x - metrics.width : x
  const top = y - metrics.lineHeight * 0.85
  const firstY = y

  const hitArea = createSVGElement('rect')
  hitArea.setAttribute('x', String(left - 2))
  hitArea.setAttribute('y', String(top - 2))
  hitArea.setAttribute('width', String(Math.max(4, metrics.width + 4)))
  hitArea.setAttribute('height', String(Math.max(4, metrics.height + 4)))
  hitArea.setAttribute('fill', 'transparent')
  hitArea.setAttribute('pointer-events', 'all')
  group.appendChild(hitArea)

  const textNodes: SVGTextElement[] = []

  lines.forEach((line, lineIndex) => {
    const text = createSVGElement('text')
    text.setAttribute('x', String(x))
    text.setAttribute('y', String(firstY + lineIndex * metrics.lineHeight))
    text.setAttribute('text-anchor', anchor)
    text.setAttribute('dominant-baseline', 'auto')
    text.setAttribute('alignment-baseline', 'baseline')
    text.setAttribute('xml:space', 'preserve')
    text.setAttribute('pointer-events', 'all')
    const firstRun = line.runs[0]
    if (firstRun) applySvgTextStyle(text, firstRun.style)

    let previousXOffset = 0
    let previousYOffset = 0
    line.runs.forEach((run) => {
      const tspan = createSVGElement('tspan')
      tspan.textContent = run.text
      applySvgTextStyle(tspan, run.style)
      if (run.style.script !== 'normal') {
        const baseSize = run.style.fontSize / SCRIPT_SIZE_RATIO
        const shift = run.style.script === 'sup' ? baseSize * SUPERSCRIPT_RISE : -baseSize * SUBSCRIPT_DROP
        tspan.setAttribute('baseline-shift', shift.toFixed(2))
      }
      const dx = (run.style.xOffset - previousXOffset) * run.style.fontSize * 0.01
      const dy = -(run.style.yOffset - previousYOffset) * run.style.fontSize * 0.01
      if (dx !== 0) tspan.setAttribute('dx', String(dx))
      if (dy !== 0) tspan.setAttribute('dy', String(dy))
      previousXOffset = run.style.xOffset
      previousYOffset = run.style.yOffset
      text.appendChild(tspan)
    })
    group.appendChild(text)
    textNodes.push(text)
  })

  parent.appendChild(group)

  // Measured after attaching so getBBox() reports the real laid-out ink box.
  if (showBg) {
    appendShowBgPlates(group, textNodes, lines, x, firstY, metrics.lineHeight, fontSize, anchor)
  }

  const ink = measureGroupInk(group, textNodes)
  if (ink) {
    hitArea.setAttribute('x', String(ink.x))
    hitArea.setAttribute('y', String(ink.y))
    hitArea.setAttribute('width', String(ink.width))
    hitArea.setAttribute('height', String(ink.height))
  }

  return { group, width: metrics.width, height: metrics.height, lineHeight: metrics.lineHeight, ink }
}

function addLegendSelectionOverlay(
  svg: SVGSVGElement,
  itemIdx: number,
  x: number,
  y: number,
  width: number,
  height: number,
  anchor: TextAnchor,
  rotation: number,
  handleLegendMouseDown: (event: MouseEvent) => void,
  openTitleModal: (event: MouseEvent) => void,
  ink: InkBox | null = null
): void {
  const boxW = ink ? ink.width : Math.max(30, width + 6)
  const boxH = ink ? ink.height : Math.max(10, height + 4)
  const boxX = ink ? ink.x : anchor === 'middle' ? x - boxW / 2 : anchor === 'end' ? x - boxW + 3 : x - 3
  const boxY = ink ? ink.y : y - boxH / 2
  const overlay = getPlotOverlay(svg)
  let parentEl: HTMLElement = overlay

  if (rotation !== 0) {
    const rotWrap = createOverlayEl('ov-rot-wrap')
    rotWrap.dataset.legendItem = String(itemIdx)
    rotWrap.style.left = `${x}px`
    rotWrap.style.top = `${y}px`
    rotWrap.style.transform = `rotate(${rotation}deg)`
    overlay.appendChild(rotWrap)
    parentEl = rotWrap
  }

  const offsetX = rotation !== 0 ? boxX - x : boxX
  const offsetY = rotation !== 0 ? boxY - y : boxY
  const cyanBox = createOverlayEl('ov-box')
  cyanBox.dataset.legendItem = String(itemIdx)
  cyanBox.style.left = `${offsetX}px`
  cyanBox.style.top = `${offsetY}px`
  cyanBox.style.width = `${boxW}px`
  cyanBox.style.height = `${boxH}px`
  cyanBox.addEventListener('mousedown', handleLegendMouseDown)
  cyanBox.addEventListener('dblclick', openTitleModal)
  parentEl.appendChild(cyanBox)

  const edgeL = offsetX
  const edgeT = offsetY
  const edgeR = offsetX + boxW
  const edgeB = offsetY + boxH
  const corners = [
    { x: edgeL, y: edgeT },
    { x: edgeR, y: edgeT },
    { x: edgeL, y: edgeB },
    { x: edgeR, y: edgeB },
  ]
  corners.forEach((corner) => {
    const handle = createOverlayEl('ov-box-corner')
    handle.dataset.legendItem = String(itemIdx)
    handle.style.left = `${corner.x}px`
    handle.style.top = `${corner.y}px`
    handle.addEventListener('mousedown', handleLegendMouseDown)
    handle.addEventListener('dblclick', openTitleModal)
    parentEl.appendChild(handle)
  })
}

export function renderLegend(ctx: PlotRenderContext): void {
  const { svg, smpDoc, margin, plotW, plotH, scaleX, processedDatasets } = ctx
  svg.setAttribute('overflow', 'visible')

  if (smpDoc && smpDoc.legendItems.length === 0) {
    const xLbl = smpDoc.xLabel
    const yLbl = smpDoc.yLabel
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
        align: 'center',
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
        align: 'center',
      })
    }
  }

  const legendItems = smpDoc?.legendItems || []
  const legendBoxes = new Map<number, LegendCellBox>()
  svgLegendBoxMap.set(svg, legendBoxes)
  legendItems.forEach((item, itemIdx) => {
    const px = margin.l + (item.xNorm / 10000) * plotW
    const py = margin.t + (item.yNorm / 10000) * plotH
    const rotation = Number(item.rotation) || 0
    const isSelected = isObjectSelected({ kind: 'legend', svg, itemIdx })
    const cursor = isSelected ? 'move' : 'pointer'
    let lastClickTime = 0

    const openTitleModal = (event: MouseEvent) => {
      event.stopPropagation()
      setSelectedPlotSvg(svg)
      setSelectedLegendIndex(itemIdx)
      updatePlotVisual(svg)
      const titleOverlayEl = document.querySelector<HTMLElement>('#titleOverlay')
      if (titleOverlayEl) showTitleDialog(titleOverlayEl, itemIdx, svg)
    }

    const handleLegendMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return
      if (isTrimmingMode() || isReadValueMode() || isPropertyTabMode()) return
      const wasSelected = isObjectSelected({ kind: 'legend', svg, itemIdx })
      const now = Date.now()
      if (now - lastClickTime < 350 || event.detail >= 2) {
        lastClickTime = 0
        event.stopPropagation()
        setSelectedPlotSvg(svg)
        setSelectedLegendIndex(itemIdx)
        setSelectedAnnotationIndex(-1)
        updatePlotVisual(svg)
        openTitleModal(event)
        return
      }
      lastClickTime = now
      if (!wasSelected) return
      event.stopPropagation()
      setSelectedPlotSvg(svg)
      setSelectedLegendIndex(itemIdx)
      setSelectedAnnotationIndex(-1)
      updatePlotVisual(svg)
      startGroupDrag(event.clientX, event.clientY)
    }

    if (isSeriesLegendText(item.text)) {
      const legGroup = createSVGElement('g')
      legGroup.setAttribute('data-legend-item', String(itemIdx))
      legGroup.style.cursor = cursor
      svg.appendChild(legGroup)
      const rawLines = (item.text || '').replace(/\\n/g, '\n').split(/\r?\n/)
      const seriesLayouts: SeriesTextLayout[] = []
      const legFontSize = legendRenderFontSize(item)
      const sampleLength = legFontSize * 2
      const textOptions = getLegendTextOptions(item, legFontSize, '#000000')
      let lineIndex = 0

      rawLines.forEach((lineStr) => {
        const head = lineStr.match(/%(\d+)E/)
        if (!head) return
        const idx = parseInt(head[1], 10) - 1
        const ds = processedDatasets[idx]
        const labelText = lineStr
          .replace(/%(\d+)N/g, (_match, n) => {
            const dataset = processedDatasets[parseInt(n, 10) - 1]
            const label = dataset?.smpSeriesName || dataset?.fileName || dataset?.name || `Series ${n}`
            return literalSmpText(label.replace(/^.*[\\/]/, '').toUpperCase())
          })
          .replace(/%(\d+)E/g, '')
          .trim()

        const baselineY = py + lineIndex * legFontSize
        lineIndex++
        const labelLayout = renderSvgText(legGroup, labelText, px + sampleLength, baselineY, textOptions, 'start', 0, cursor)
        labelLayout.group.addEventListener('mousedown', handleLegendMouseDown)
        labelLayout.group.addEventListener('dblclick', openTitleModal)
        const midY = labelLayout.ink ? labelLayout.ink.y + labelLayout.ink.height / 2 : baselineY - legFontSize * 0.35

        if (ds) {
          const color = ds.options?.lineColor || ds.color || '#000000'
          const legWidthMm = ds.options?.width ?? (ds.smpSeriesStylePrefix ? ds.smpSeriesStylePrefix / 100 : 0.6)
          const legStrokeW = Math.max(0.4, Number((legWidthMm * scaleX).toFixed(2)))
          const lineType = ds.options?.lineType || 'solid'
          if (lineType !== 'no_line') {
            const legLine = createSVGElement('line')
            legLine.setAttribute('x1', String(px))
            legLine.setAttribute('y1', String(midY))
            legLine.setAttribute('x2', String(px + sampleLength))
            legLine.setAttribute('y2', String(midY))
            legLine.setAttribute('stroke', color)
            legLine.setAttribute('stroke-width', String(legStrokeW))
            legLine.setAttribute('stroke-linecap', 'round')
            const dashArray = getLineDashArray(lineType, legStrokeW, seriesPitchMm(ds) * scaleX)
            if (dashArray !== 'none') legLine.setAttribute('stroke-dasharray', dashArray)
            legLine.style.cursor = cursor
            legLine.addEventListener('mousedown', handleLegendMouseDown)
            legLine.addEventListener('dblclick', openTitleModal)
            legGroup.insertBefore(legLine, labelLayout.group)
          }

          const plotType = ds.options?.plotType || 'no_dot'
          if (plotType !== 'no_dot' && plotType !== 'none' && plotType !== 'bar') {
            const dotColor = ds.options?.dotColor || color
            const paintColor = ds.options?.paintColor || '#ffffff'
            const radius = ds.options?.size || 3
            const symbol = createSeriesSymbol(plotType, px + sampleLength / 2, midY, radius, dotColor, paintColor, legStrokeW)
            if (symbol) {
              symbol.style.cursor = cursor
              symbol.addEventListener('mousedown', handleLegendMouseDown)
              symbol.addEventListener('dblclick', openTitleModal)
              legGroup.insertBefore(symbol, labelLayout.group)
            }
          }
        }

        seriesLayouts.push({
          x: px,
          y: midY,
          width: sampleLength + labelLayout.width,
          height: labelLayout.height,
        })
      })

      if (isSelected && seriesLayouts.length > 0) {
        const left = Math.min(...seriesLayouts.map((layout) => layout.x))
        const top = Math.min(...seriesLayouts.map((layout) => layout.y - layout.height / 2))
        const right = Math.max(...seriesLayouts.map((layout) => layout.x + layout.width))
        const bottom = Math.max(...seriesLayouts.map((layout) => layout.y + layout.height / 2))
        addLegendSelectionOverlay(
          svg,
          itemIdx,
          left,
          top + (bottom - top) / 2,
          right - left,
          bottom - top,
          'start',
          0,
          handleLegendMouseDown,
          openTitleModal
        )
      }
    } else {
      const legGroup = createSVGElement('g')
      legGroup.setAttribute('data-legend-item', String(itemIdx))
      legGroup.style.cursor = cursor
      const rawStr = item.rawText || item.text || ''
      const fontSize = legendRenderFontSize(item)
      const textOptions = getLegendTextOptions(item, fontSize, item.color || '#000000')
      const anchor: TextAnchor = item.align ? getLegendTextAnchor(item) : 'start'
      svg.appendChild(legGroup)
      const layout = renderSvgText(legGroup, rawStr, px, py, textOptions, anchor, rotation, cursor, item.showBg === true)
      layout.group.addEventListener('mousedown', handleLegendMouseDown)
      layout.group.addEventListener('dblclick', openTitleModal)
      if (layout.ink) {
        legendBoxes.set(itemIdx, {
          dx: layout.ink.x - px,
          dy: layout.ink.y - py,
          w: layout.ink.width,
          h: layout.ink.height,
          rotation,
        })
      }

      if (isSelected) {
        addLegendSelectionOverlay(
          svg,
          itemIdx,
          px,
          py,
          layout.width,
          layout.height,
          anchor,
          rotation,
          handleLegendMouseDown,
          openTitleModal,
          layout.ink
        )
      }
    }
  })

  if (legendItems.length === 0) {
    const xLabel = smpDoc?.xLabel
    if (xLabel) {
      const group = createSVGElement('g')
      renderSvgText(
        group,
        xLabel,
        margin.l + plotW / 2,
        margin.t + plotH + 42,
        { fontSize: 12, fontFamily: 'Times New Roman, serif', color: '#000000', fontWeight: 400 },
        'middle',
        0,
        'default'
      )
      svg.appendChild(group)
    }
    const yLabel = smpDoc?.yLabel
    if (yLabel) {
      const group = createSVGElement('g')
      const cx = margin.l - 42
      const cy = margin.t + plotH / 2
      renderSvgText(
        group,
        yLabel,
        cx,
        cy,
        { fontSize: 12, fontFamily: 'Times New Roman, serif', color: '#000000', fontWeight: 400 },
        'middle',
        -90,
        'default'
      )
      svg.appendChild(group)
    }
  }
}
