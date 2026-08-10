import type { ActiveDrag, Dataset, SmpMetadata, SmpPlotDoc } from '../types.ts'
import { evaluateMathExpr, parseDatasetContent } from '../utils/dataset.ts'
import { parseSmpContent } from '../utils/smpParser.ts'
import { formatTick, niceScale } from '../utils/scale.ts'
import { globalDataManager } from './DataManager.ts'
import { getCanvasZoom } from '../utils/canvasZoom.ts'

const SVG_NS = 'http://www.w3.org/2000/svg'

function createSVGElement<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K]
}

export const PLOT_MARGIN = { l: 65, r: 25, t: 25, b: 55 }

export interface PlotVisualOptions {
  show?: boolean
  lineStyle?: string
  plotType?: string
  lineType?: string
  dotColor?: string
  paintColor?: string
  lineColor?: string
  size?: number
  width?: number
  pitch?: number
  brush?: string
  xTransCheck?: boolean
  xExpr?: string
  yTransCheck?: boolean
  yExpr?: string
  xColumn?: number
  yColumn?: number
}

const svgDataMap = new WeakMap<SVGSVGElement, Dataset[]>()
const svgSmpMetaMap = new WeakMap<SVGSVGElement, SmpMetadata>()
const svgSmpDocMap = new WeakMap<SVGSVGElement, SmpPlotDoc>()
const svgBaseScaleMap = new WeakMap<
  SVGSVGElement,
  { xMin: number; xMax: number; yMin: number; yMax: number }
>()
let activeDrag: ActiveDrag | null = null
let selectedPlotSvg: SVGSVGElement | null = null
let rafId: number | null = null
let boxCount = 0
const allDatasets: Dataset[] = []
const activeSvgs: SVGSVGElement[] = []

export const SMP_SCALE = 0.02

export function getSvgRectForSmpDoc(doc: SmpPlotDoc): {
  svgLeft: number
  svgTop: number
  svgWidth: number
  svgHeight: number
} {
  const frameLeft = doc.left * SMP_SCALE
  const frameTop = doc.top * SMP_SCALE
  const frameWidth = doc.width * SMP_SCALE
  const frameHeight = doc.height * SMP_SCALE

  const svgLeft = frameLeft - PLOT_MARGIN.l
  const svgTop = frameTop - PLOT_MARGIN.t
  const svgWidth = frameWidth + PLOT_MARGIN.l + PLOT_MARGIN.r
  const svgHeight = frameHeight + PLOT_MARGIN.t + PLOT_MARGIN.b

  return { svgLeft, svgTop, svgWidth, svgHeight }
}

export function setPlotSmpMeta(svg: SVGSVGElement, meta: SmpMetadata): void {
  svgSmpMetaMap.set(svg, meta)
}

export function setPlotSmpDoc(svg: SVGSVGElement, doc: SmpPlotDoc): void {
  svgSmpDocMap.set(svg, doc)
}

export function getActiveDrag(): ActiveDrag | null {
  return activeDrag
}

export function setSelectedPlotSvg(svg: SVGSVGElement | null): void {
  selectedPlotSvg = svg
}

export function getSelectedPlotSvg(): SVGSVGElement | null {
  return selectedPlotSvg || activeSvgs[activeSvgs.length - 1] || null
}

export function updatePlotVisual(svg: SVGSVGElement): void {
  const ds = svgDataMap.get(svg) || []
  const w = parseFloat(svg.style.width) || svg.getBoundingClientRect().width
  const h = parseFloat(svg.style.height) || svg.getBoundingClientRect().height
  drawPlot(svg, ds, w, h)
}

export function recalculateBaseScale(
  svg: SVGSVGElement,
  target: 'all' | 'x' | 'y' = 'all'
): void {
  const datasets = svgDataMap.get(svg) || []

  const processedDatasets: Dataset[] = datasets.map((ds) => {
    let sourceX = ds.x
    let sourceY = ds.y
    const opts = ds.options || {}

    if (ds.rawLines && ds.rawLines.length > 0) {
      const xIdx = Math.max(0, (opts.xColumn || 1) - 1)
      const yIdx = Math.max(0, (opts.yColumn || 2) - 1)
      const px: number[] = []
      const py: number[] = []
      ds.rawLines.forEach((parts) => {
        if (parts.length > Math.max(xIdx, yIdx)) {
          const vx = parseFloat(parts[xIdx])
          const vy = parseFloat(parts[yIdx])
          if (!isNaN(vx) && !isNaN(vy)) {
            px.push(vx)
            py.push(vy)
          }
        }
      })
      if (px.length > 0 && py.length > 0) {
        sourceX = px
        sourceY = py
      }
    }

    const newX = sourceX.map((val) =>
      opts.xTransCheck && opts.xExpr
        ? evaluateMathExpr(opts.xExpr, val, 'x')
        : val
    )
    const newY = sourceY.map((val) =>
      opts.yTransCheck && opts.yExpr
        ? evaluateMathExpr(opts.yExpr, val, 'y')
        : val
    )
    return { ...ds, x: newX, y: newY, options: opts }
  })

  let xMin = Infinity,
    xMax = -Infinity
  let yMin = Infinity,
    yMax = -Infinity

  for (const ds of processedDatasets) {
    for (let i = 0; i < ds.x.length; i++) {
      if (ds.x[i] < xMin) xMin = ds.x[i]
      if (ds.x[i] > xMax) xMax = ds.x[i]
      if (ds.y[i] < yMin) yMin = ds.y[i]
      if (ds.y[i] > yMax) yMax = ds.y[i]
    }
  }

  if (xMin === Infinity || xMax === -Infinity) {
    xMin = 0
    xMax = 10
  }
  if (yMin === Infinity || yMax === -Infinity) {
    yMin = 0
    yMax = 10
  }
  if (yMin > 0) yMin = 0

  const existing = svgBaseScaleMap.get(svg) || { xMin, xMax, yMin, yMax }

  if (target === 'all') {
    svgBaseScaleMap.set(svg, { xMin, xMax, yMin, yMax })
  } else if (target === 'x') {
    svgBaseScaleMap.set(svg, { ...existing, xMin, xMax })
  } else if (target === 'y') {
    svgBaseScaleMap.set(svg, { ...existing, yMin, yMax })
  }
}

export function clearPlotScale(target: 'all' | 'x' | 'y' = 'all'): void {
  for (const svg of activeSvgs) {
    recalculateBaseScale(svg, target)
    const ds = svgDataMap.get(svg) || []
    const w = parseFloat(svg.style.width) || svg.getBoundingClientRect().width
    const h = parseFloat(svg.style.height) || svg.getBoundingClientRect().height
    drawPlot(svg, ds, w, h)
  }
}

export function drawPlot(
  svg: SVGSVGElement,
  datasets: Dataset[] = [],
  explicitW?: number,
  explicitH?: number
): void {
  const w = explicitW || svg.clientWidth || parseFloat(svg.style.width) || 400
  const h = explicitH || svg.clientHeight || parseFloat(svg.style.height) || 300
  if (w <= 0 || h <= 0) return

  // Apply column mapping and math expression transformations to X and Y coordinates
  const processedDatasets: Dataset[] = datasets.map((ds) => {
    let sourceX = ds.x
    let sourceY = ds.y
    const opts = ds.options || {}

    if (ds.rawLines && ds.rawLines.length > 0) {
      const xIdx = Math.max(0, (opts.xColumn || 1) - 1)
      const yIdx = Math.max(0, (opts.yColumn || 2) - 1)
      const px: number[] = []
      const py: number[] = []
      ds.rawLines.forEach((parts) => {
        if (parts.length > Math.max(xIdx, yIdx)) {
          const vx = parseFloat(parts[xIdx])
          const vy = parseFloat(parts[yIdx])
          if (!isNaN(vx) && !isNaN(vy)) {
            px.push(vx)
            py.push(vy)
          }
        }
      })
      if (px.length > 0 && py.length > 0) {
        sourceX = px
        sourceY = py
      }
    }

    const newX = sourceX.map((val) =>
      opts.xTransCheck && opts.xExpr
        ? evaluateMathExpr(opts.xExpr, val, 'x')
        : val
    )
    const newY = sourceY.map((val) =>
      opts.yTransCheck && opts.yExpr
        ? evaluateMathExpr(opts.yExpr, val, 'y')
        : val
    )
    return { ...ds, x: newX, y: newY, options: opts }
  })

  // Lock base scale bounds on initial dataset load
  if (!svgBaseScaleMap.has(svg) && datasets.length > 0) {
    let origXMin = Infinity,
      origXMax = -Infinity
    let origYMin = Infinity,
      origYMax = -Infinity

    for (const ds of datasets) {
      for (let i = 0; i < ds.x.length; i++) {
        if (ds.x[i] < origXMin) origXMin = ds.x[i]
        if (ds.x[i] > origXMax) origXMax = ds.x[i]
        if (ds.y[i] < origYMin) origYMin = ds.y[i]
        if (ds.y[i] > origYMax) origYMax = ds.y[i]
      }
    }
    if (origXMin === Infinity || origXMax === -Infinity) {
      origXMin = 0
      origXMax = 10
    }
    if (origYMin === Infinity || origYMax === -Infinity) {
      origYMin = 0
      origYMax = 10
    }
    if (origYMin > 0) origYMin = 0

    svgBaseScaleMap.set(svg, {
      xMin: origXMin,
      xMax: origXMax,
      yMin: origYMin,
      yMax: origYMax,
    })
  }

  svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
  svg.innerHTML = ''

  const smpDoc = svgSmpDocMap.get(svg)
  const smpMeta = svgSmpMetaMap.get(svg)

  const margin = PLOT_MARGIN
  const plotW = Math.max(10, w - margin.l - margin.r)
  const plotH = Math.max(10, h - margin.t - margin.b)

  const baseScale = svgBaseScaleMap.get(svg)
  let xMin = smpDoc?.axisX.min ?? smpMeta?.xMin ?? (baseScale ? baseScale.xMin : 0)
  let xMax = smpDoc?.axisX.max ?? smpMeta?.xMax ?? (baseScale ? baseScale.xMax : 10)
  let yMin = smpDoc?.axisY.min ?? smpMeta?.yMin ?? (baseScale ? baseScale.yMin : 0)
  let yMax = smpDoc?.axisY.max ?? smpMeta?.yMax ?? (baseScale ? baseScale.yMax : 10)

  if (!smpDoc && !smpMeta && !baseScale && processedDatasets.length > 0) {
    xMin = Infinity
    xMax = -Infinity
    yMin = Infinity
    yMax = -Infinity
    for (const ds of processedDatasets) {
      for (let i = 0; i < ds.x.length; i++) {
        if (ds.x[i] < xMin) xMin = ds.x[i]
        if (ds.x[i] > xMax) xMax = ds.x[i]
        if (ds.y[i] < yMin) yMin = ds.y[i]
        if (ds.y[i] > yMax) yMax = ds.y[i]
      }
    }
    if (xMin === Infinity) xMin = 0
    if (xMax === -Infinity) xMax = 10
    if (yMin === Infinity) yMin = 0
    if (yMax === -Infinity) yMax = 10
    if (yMin > 0) yMin = 0
  }

  const isReversedX = xMin > xMax
  const xScale = isReversedX ? { min: xMin, max: xMax, step: smpDoc?.axisX.step || smpMeta?.xStep || -1000 } : niceScale(xMin, xMax, 6)
  const yScale = niceScale(yMin, yMax, 5)

  const sx = (v: number) => margin.l + ((v - xScale.min) / (xScale.max - xScale.min)) * plotW
  const sy = (v: number) => margin.t + plotH - ((v - yScale.min) / (yScale.max - yScale.min)) * plotH

  // Outer plot frame
  const frame = createSVGElement('rect')
  frame.setAttribute('x', String(margin.l))
  frame.setAttribute('y', String(margin.t))
  frame.setAttribute('width', String(plotW))
  frame.setAttribute('height', String(plotH))
  frame.setAttribute('fill', 'none')
  frame.setAttribute('stroke', '#000000')
  frame.setAttribute('stroke-width', '1')
  svg.appendChild(frame)

  // ----------------------------------------------------
  // 4-AXIS INSIDE TICKS & MINOR SUB-TICKS ENGINE
  // ----------------------------------------------------
  const subDivsX = smpDoc?.axisX.subDivs || 5
  const subDivsY = smpDoc?.axisY.subDivs || 5

  // X ticks (Bottom AXIS-0 & Top AXIS-2)
  const xMajorTicks: number[] = []
  const xStep = Math.abs(xScale.step)
  if (isReversedX) {
    const startTick = Math.floor(xMin / xStep) * xStep
    const endTick = Math.ceil(xMax / xStep) * xStep
    for (let v = startTick; v >= endTick; v -= xStep) {
      xMajorTicks.push(v)
    }
  } else {
    for (let v = xScale.min; v <= xScale.max + xStep * 0.5; v += xStep) {
      xMajorTicks.push(v)
    }
  }

  // Draw X Major & Minor ticks
  for (let i = 0; i < xMajorTicks.length; i++) {
    const v = xMajorTicks[i]
    const px = sx(v)

    if (px >= margin.l - 2 && px <= margin.l + plotW + 2) {
      // Bottom Major Tick (AXIS-0)
      const bTick = createSVGElement('line')
      bTick.setAttribute('x1', String(px))
      bTick.setAttribute('y1', String(margin.t + plotH))
      bTick.setAttribute('x2', String(px))
      bTick.setAttribute('y2', String(margin.t + plotH - 6))
      bTick.setAttribute('stroke', '#000000')
      bTick.setAttribute('stroke-width', '1')
      svg.appendChild(bTick)

      // Top Major Tick (AXIS-2)
      const tTick = createSVGElement('line')
      tTick.setAttribute('x1', String(px))
      tTick.setAttribute('y1', String(margin.t))
      tTick.setAttribute('x2', String(px))
      tTick.setAttribute('y2', String(margin.t + 6))
      tTick.setAttribute('stroke', '#000000')
      tTick.setAttribute('stroke-width', '1')
      svg.appendChild(tTick)

      // X Label
      if (smpDoc?.axisX.showLabels !== false) {
        const label = createSVGElement('text')
        label.setAttribute('x', String(px))
        label.setAttribute('y', String(margin.t + plotH + 18))
        label.setAttribute('text-anchor', 'middle')
        label.setAttribute('font-size', '11')
        label.setAttribute('font-family', smpDoc?.axisX.fontFamily || 'Inter, system-ui, sans-serif')
        label.setAttribute('fill', '#1e293b')
        label.textContent = formatTick(v)
        svg.appendChild(label)
      }
    }

    // Minor Sub-ticks between v and next v
    if (i < xMajorTicks.length - 1) {
      const vNext = xMajorTicks[i + 1]
      const subStep = (vNext - v) / subDivsX
      for (let s = 1; s < subDivsX; s++) {
        const subV = v + subStep * s
        const subPx = sx(subV)
        if (subPx >= margin.l && subPx <= margin.l + plotW) {
          const bSub = createSVGElement('line')
          bSub.setAttribute('x1', String(subPx))
          bSub.setAttribute('y1', String(margin.t + plotH))
          bSub.setAttribute('x2', String(subPx))
          bSub.setAttribute('y2', String(margin.t + plotH - 3))
          bSub.setAttribute('stroke', '#000000')
          bSub.setAttribute('stroke-width', '1')
          svg.appendChild(bSub)

          const tSub = createSVGElement('line')
          tSub.setAttribute('x1', String(subPx))
          tSub.setAttribute('y1', String(margin.t))
          tSub.setAttribute('x2', String(subPx))
          tSub.setAttribute('y2', String(margin.t + 3))
          tSub.setAttribute('stroke', '#000000')
          tSub.setAttribute('stroke-width', '1')
          svg.appendChild(tSub)
        }
      }
    }
  }

  // Y ticks (Left AXIS-1 & Right AXIS-3)
  const yMajorTicks: number[] = []
  const yStep = Math.abs(yScale.step)
  for (let v = yScale.min; v <= yScale.max + yStep * 0.5; v += yStep) {
    yMajorTicks.push(v)
  }

  for (let i = 0; i < yMajorTicks.length; i++) {
    const v = yMajorTicks[i]
    const py = sy(v)

    if (py >= margin.t - 2 && py <= margin.t + plotH + 2) {
      // Left Major Tick (AXIS-1)
      const lTick = createSVGElement('line')
      lTick.setAttribute('x1', String(margin.l))
      lTick.setAttribute('y1', String(py))
      lTick.setAttribute('x2', String(margin.l + 6))
      lTick.setAttribute('y2', String(py))
      lTick.setAttribute('stroke', '#000000')
      lTick.setAttribute('stroke-width', '1')
      svg.appendChild(lTick)

      // Right Major Tick (AXIS-3)
      const rTick = createSVGElement('line')
      rTick.setAttribute('x1', String(margin.l + plotW))
      rTick.setAttribute('y1', String(py))
      rTick.setAttribute('x2', String(margin.l + plotW - 6))
      rTick.setAttribute('y2', String(py))
      rTick.setAttribute('stroke', '#000000')
      rTick.setAttribute('stroke-width', '1')
      svg.appendChild(rTick)

      // Y Label
      if (smpDoc?.axisY.showLabels !== false) {
        const label = createSVGElement('text')
        label.setAttribute('x', String(margin.l - 8))
        label.setAttribute('y', String(py + 4))
        label.setAttribute('text-anchor', 'end')
        label.setAttribute('font-size', '11')
        label.setAttribute('font-family', smpDoc?.axisY.fontFamily || 'Inter, system-ui, sans-serif')
        label.setAttribute('fill', '#1e293b')
        label.textContent = formatTick(v)
        svg.appendChild(label)
      }
    }

    // Minor Sub-ticks between v and next v
    if (i < yMajorTicks.length - 1) {
      const vNext = yMajorTicks[i + 1]
      const subStep = (vNext - v) / subDivsY
      for (let s = 1; s < subDivsY; s++) {
        const subV = v + subStep * s
        const subPy = sy(subV)
        if (subPy >= margin.t && subPy <= margin.t + plotH) {
          const lSub = createSVGElement('line')
          lSub.setAttribute('x1', String(margin.l))
          lSub.setAttribute('y1', String(subPy))
          lSub.setAttribute('x2', String(margin.l + 3))
          lSub.setAttribute('y2', String(subPy))
          lSub.setAttribute('stroke', '#000000')
          lSub.setAttribute('stroke-width', '1')
          svg.appendChild(lSub)

          const rSub = createSVGElement('line')
          rSub.setAttribute('x1', String(margin.l + plotW))
          rSub.setAttribute('y1', String(subPy))
          rSub.setAttribute('x2', String(margin.l + plotW - 3))
          rSub.setAttribute('y2', String(subPy))
          rSub.setAttribute('stroke', '#000000')
          rSub.setAttribute('stroke-width', '1')
          svg.appendChild(rSub)
        }
      }
    }
  }

  // ----------------------------------------------------
  // ANNOTATION LINES (Normalized Coordinates)
  // ----------------------------------------------------
  const annotationLines = smpDoc?.annotationLines || []
  annotationLines.forEach((aLine) => {
    const x1 = margin.l + (aLine.x1Norm / 100) * plotW
    const y1 = margin.t + (1 - aLine.y1Norm / 100) * plotH
    const x2 = margin.l + (aLine.x2Norm / 100) * plotW
    const y2 = margin.t + (1 - aLine.y2Norm / 100) * plotH

    const l = createSVGElement('line')
    l.setAttribute('x1', String(x1))
    l.setAttribute('y1', String(y1))
    l.setAttribute('x2', String(x2))
    l.setAttribute('y2', String(y2))
    l.setAttribute('stroke', '#000000')
    l.setAttribute('stroke-width', String(aLine.width || 1))
    if (aLine.style === 'dashed') {
      l.setAttribute('stroke-dasharray', '4 4')
    }
    svg.appendChild(l)
  })

  // ----------------------------------------------------
  // LEGEND ITEMS & ANNOTATIONS (10000ths Normalized Coordinates)
  // ----------------------------------------------------
  const legendItems = smpDoc?.legendItems || []
  if (legendItems.length > 0) {
    legendItems.forEach((item) => {
      const px = margin.l + (item.xNorm / 10000) * plotW
      const py = margin.t + (item.yNorm / 10000) * plotH

      if (item.text.startsWith('%01E')) {
        // Series Legend Box e.g. %01ESG\n%02EKP\n%03EGS
        const rawLines = item.text.split('\n')
        let legY = py
        rawLines.forEach((lineStr) => {
          const match = lineStr.match(/^%(\d+)E\s*(.*)/)
          if (match) {
            const idx = parseInt(match[1], 10) - 1
            const labelText = match[2].trim()
            const ds = processedDatasets[idx]
            const color = ds?.options?.lineColor || ds?.color || '#000000'

            const legLine = createSVGElement('line')
            legLine.setAttribute('x1', String(px))
            legLine.setAttribute('y1', String(legY))
            legLine.setAttribute('x2', String(px + 24))
            legLine.setAttribute('y2', String(legY))
            legLine.setAttribute('stroke', color)
            legLine.setAttribute('stroke-width', '2')
            svg.appendChild(legLine)

            const legTxt = createSVGElement('text')
            legTxt.setAttribute('x', String(px + 30))
            legTxt.setAttribute('y', String(legY + 4))
            legTxt.setAttribute('font-size', String(item.fontSize || 11))
            legTxt.setAttribute('font-family', item.fontFamily)
            legTxt.setAttribute('font-weight', String(item.fontWeight))
            legTxt.setAttribute('fill', '#000000')
            legTxt.textContent = labelText
            svg.appendChild(legTxt)

            legY += 16
          }
        })
      } else {
        const textEl = createSVGElement('text')
        textEl.setAttribute('x', String(px))
        textEl.setAttribute('y', String(py))
        textEl.setAttribute('font-size', String(item.fontSize || 12))
        textEl.setAttribute('font-family', item.fontFamily)
        textEl.setAttribute('font-weight', String(item.fontWeight))
        textEl.setAttribute('fill', '#000000')

        if (item.rotation !== 0) {
          textEl.setAttribute('transform', `rotate(${item.rotation} ${px} ${py})`)
          textEl.setAttribute('text-anchor', 'middle')
        } else {
          textEl.setAttribute('text-anchor', px < margin.l + plotW / 2 ? 'start' : 'middle')
        }
        textEl.textContent = item.text
        svg.appendChild(textEl)
      }
    })
  } else {
    // Fallback axis labels if not in legendItems
    const xLabel = smpMeta?.xLabel || smpDoc?.xLabel
    if (xLabel) {
      const xTitle = createSVGElement('text')
      xTitle.setAttribute('x', String(margin.l + plotW / 2))
      xTitle.setAttribute('y', String(margin.t + plotH + 42))
      xTitle.setAttribute('text-anchor', 'middle')
      xTitle.setAttribute('font-size', '12')
      xTitle.setAttribute('font-family', 'Cambria, Times New Roman, serif')
      xTitle.setAttribute('fill', '#000000')
      xTitle.textContent = xLabel
      svg.appendChild(xTitle)
    }
    const yLabel = smpMeta?.yLabel || smpDoc?.yLabel
    if (yLabel) {
      const yTitle = createSVGElement('text')
      const cx = margin.l - 42
      const cy = margin.t + plotH / 2
      yTitle.setAttribute('x', String(cx))
      yTitle.setAttribute('y', String(cy))
      yTitle.setAttribute('transform', `rotate(-90 ${cx} ${cy})`)
      yTitle.setAttribute('text-anchor', 'middle')
      yTitle.setAttribute('font-size', '12')
      yTitle.setAttribute('font-family', 'Cambria, Times New Roman, serif')
      yTitle.setAttribute('fill', '#000000')
      yTitle.textContent = yLabel
      svg.appendChild(yTitle)
    }
  }



  // Render Data Series according to Property Visual Options
  for (const ds of processedDatasets) {
    const opts = ds.options || {}
    const isShow = opts.show !== false
    if (!isShow) continue

    const strokeColor = opts.lineColor || ds.color
    const strokeWidth = String(opts.width || 1)
    const dotColor = opts.dotColor || '#000000'
    const paintColor = opts.paintColor || '#ffffff'
    const dotSize = opts.size || 3
    const plotType = opts.plotType || 'no_dot'
    const lineType = opts.lineType || 'solid'
    const brush = opts.brush || opts.lineStyle || 'solid'

      // Line style dash array handling for exact Sma4Win line types
      let dashArray = 'none'
      if (lineType === 'dotted' || brush === 'dot' || brush === 'dotted') {
        dashArray = '2 2'
      } else if (lineType === 'dash_dot') {
        dashArray = '6 3 2 3'
      } else if (lineType === 'dash_dot_dot') {
        dashArray = '6 3 2 3 2 3'
      } else if (brush === 'dash' || brush === 'dashed') {
        dashArray = '6 3'
      }

      if (plotType === 'bar') {
        const barW = Math.max(2, Math.floor(plotW / (ds.x.length || 1) - 2))
        const zeroY = sy(0)
        for (let i = 0; i < ds.x.length; i++) {
          const px = sx(ds.x[i])
          const py = sy(ds.y[i])
          const bar = createSVGElement('rect')
          bar.setAttribute('x', String(px - barW / 2))
          bar.setAttribute('y', String(Math.min(py, zeroY)))
          bar.setAttribute('width', String(barW))
          bar.setAttribute('height', String(Math.abs(py - zeroY)))
          bar.setAttribute('fill', paintColor)
          bar.setAttribute('stroke', strokeColor)
          bar.setAttribute('stroke-width', strokeWidth)
          svg.appendChild(bar)
        }
      } else {
        // Draw Line Path / Face Area Fill
        if (lineType !== 'no_line' && ds.x.length > 0) {
          const points: string[] = []
          for (let i = 0; i < ds.x.length; i++) {
            points.push(`${sx(ds.x[i]).toFixed(1)},${sy(ds.y[i]).toFixed(1)}`)
          }

          if (lineType === 'face') {
            // Fill area below line down to Y = 0 baseline
            const zeroY = sy(0).toFixed(1)
            const firstX = sx(ds.x[0]).toFixed(1)
            const lastX = sx(ds.x[ds.x.length - 1]).toFixed(1)

            const areaPathD = `M ${firstX},${zeroY} L ${points.join(' L ')} L ${lastX},${zeroY} Z`
            const areaPath = createSVGElement('path')
            areaPath.setAttribute('d', areaPathD)
            areaPath.setAttribute('fill', strokeColor)
            areaPath.setAttribute('fill-opacity', '0.35')
            areaPath.setAttribute('stroke', 'none')
            svg.appendChild(areaPath)
          }

          // Top boundary curve line
          const path = createSVGElement('path')
          path.setAttribute('d', `M ${points.join(' ')}`)
          path.setAttribute('fill', 'none')
          path.setAttribute('stroke', strokeColor)
          path.setAttribute('stroke-width', strokeWidth)
          if (dashArray !== 'none') path.setAttribute('stroke-dasharray', dashArray)
          path.setAttribute('stroke-linejoin', 'round')
          path.setAttribute('stroke-linecap', 'round')
          svg.appendChild(path)
        }

        // Draw Dot / Symbol Markers based on exact Plot type shape with pitch interval
        if (plotType !== 'no_dot') {
          const step = Math.max(1, opts.pitch || 1)
          for (let i = 0; i < ds.x.length; i += step) {
            const px = sx(ds.x[i])
            const py = sy(ds.y[i])

            if (plotType === 'circle' || plotType === 'filled_circle') {
              const circle = createSVGElement('circle')
              circle.setAttribute('cx', String(px))
              circle.setAttribute('cy', String(py))
              circle.setAttribute('r', String(dotSize))
              circle.setAttribute('fill', plotType === 'filled_circle' ? dotColor : 'none')
              circle.setAttribute('stroke', plotType === 'filled_circle' ? paintColor : dotColor)
              circle.setAttribute('stroke-width', '1')
              svg.appendChild(circle)
            } else if (plotType === 'square' || plotType === 'filled_square') {
              const rect = createSVGElement('rect')
              rect.setAttribute('x', String(px - dotSize))
              rect.setAttribute('y', String(py - dotSize))
              rect.setAttribute('width', String(dotSize * 2))
              rect.setAttribute('height', String(dotSize * 2))
              rect.setAttribute('fill', plotType === 'filled_square' ? dotColor : 'none')
              rect.setAttribute('stroke', plotType === 'filled_square' ? paintColor : dotColor)
              rect.setAttribute('stroke-width', '1')
              svg.appendChild(rect)
            } else if (plotType === 'triangle' || plotType === 'filled_triangle') {
              const poly = createSVGElement('polygon')
              const p1 = `${px},${py - dotSize}`
              const p2 = `${px - dotSize},${py + dotSize}`
              const p3 = `${px + dotSize},${py + dotSize}`
              poly.setAttribute('points', `${p1} ${p2} ${p3}`)
              poly.setAttribute('fill', plotType === 'filled_triangle' ? dotColor : 'none')
              poly.setAttribute('stroke', plotType === 'filled_triangle' ? paintColor : dotColor)
              poly.setAttribute('stroke-width', '1')
              svg.appendChild(poly)
            }
          }
        }
      }
    }

  // Legend
  if (processedDatasets.length > 0) {
    const legendX = Math.max(margin.l, margin.l + plotW - 110)
    const legendY = margin.t + 10
    let drawnLegends = 0
    for (let i = 0; i < processedDatasets.length; i++) {
      const ds = processedDatasets[i]
      const dsOpts = ds.options || {}
      if (dsOpts.show === false) continue

      const ly = legendY + drawnLegends * 18
      const line = createSVGElement('line')
      line.setAttribute('x1', String(legendX))
      line.setAttribute('y1', String(ly))
      line.setAttribute('x2', String(legendX + 16))
      line.setAttribute('y2', String(ly))
      line.setAttribute('stroke', dsOpts.lineColor || ds.color)
      line.setAttribute('stroke-width', String(dsOpts.width || 1))
      svg.appendChild(line)

      const text = createSVGElement('text')
      text.setAttribute('x', String(legendX + 22))
      text.setAttribute('y', String(ly + 4))
      text.setAttribute('font-size', '11')
      text.setAttribute('font-family', 'Inter, system-ui, sans-serif')
      text.setAttribute('fill', '#334155')
      text.textContent = ds.name
      svg.appendChild(text)

      drawnLegends++
    }
  }

  // Edge and Corner drag handles aligned with plot frame box
  const hs = 10
  const addHandle = (x: number, y: number, width: number, height: number, dir: string) => {
    const r = createSVGElement('rect')
    r.setAttribute('x', String(x))
    r.setAttribute('y', String(y))
    r.setAttribute('width', String(Math.max(1, width)))
    r.setAttribute('height', String(Math.max(1, height)))
    r.setAttribute('fill', 'transparent')
    r.setAttribute('data-dir', dir)
    r.setAttribute('class', `handle handle-${dir}`)
    svg.appendChild(r)
  }

  const fx = margin.l
  const fy = margin.t
  const fw = plotW
  const fh = plotH

  // Edges on plot frame
  addHandle(fx + hs, fy - hs / 2, fw - 2 * hs, hs, 'top')
  addHandle(fx + hs, fy + fh - hs / 2, fw - 2 * hs, hs, 'bottom')
  addHandle(fx - hs / 2, fy + hs, hs, fh - 2 * hs, 'left')
  addHandle(fx + fw - hs / 2, fy + hs, hs, fh - 2 * hs, 'right')

  // Corners on plot frame
  addHandle(fx - hs / 2, fy - hs / 2, hs, hs, 'top-left')
  addHandle(fx + fw - hs / 2, fy - hs / 2, hs, hs, 'top-right')
  addHandle(fx - hs / 2, fy + fh - hs / 2, hs, hs, 'bottom-left')
  addHandle(fx + fw - hs / 2, fy + fh - hs / 2, hs, hs, 'bottom-right')

  // Visual control dots
  const addVisualHandle = (cx: number, cy: number) => {
    const dot = createSVGElement('rect')
    dot.setAttribute('x', String(cx - 3))
    dot.setAttribute('y', String(cy - 3))
    dot.setAttribute('width', '6')
    dot.setAttribute('height', '6')
    dot.setAttribute('fill', '#2563eb')
    dot.setAttribute('stroke', '#ffffff')
    dot.setAttribute('stroke-width', '1')
    dot.setAttribute('style', 'pointer-events: none;')
    svg.appendChild(dot)
  }

  // 4 corners of plot frame
  addVisualHandle(fx, fy)
  addVisualHandle(fx + fw, fy)
  addVisualHandle(fx, fy + fh)
  addVisualHandle(fx + fw, fy + fh)

  // 4 edge midpoints of plot frame
  addVisualHandle(fx + fw / 2, fy)
  addVisualHandle(fx + fw / 2, fy + fh)
  addVisualHandle(fx, fy + fh / 2)
  addVisualHandle(fx + fw, fy + fh / 2)
}

export function addDatasetToPlot(svg: SVGSVGElement, dataset: Dataset): void {
  const currentDatasets = svgDataMap.get(svg) || []
  currentDatasets.push(dataset)
  svgDataMap.set(svg, currentDatasets)

  if (!allDatasets.some((d) => d.name === dataset.name)) {
    allDatasets.push(dataset)
  }
  globalDataManager.addDataset(dataset)

  const w = parseFloat(svg.style.width) || svg.getBoundingClientRect().width
  const h = parseFloat(svg.style.height) || svg.getBoundingClientRect().height
  drawPlot(svg, currentDatasets, w, h)
}

export function setupPlotFileDrop(svg: SVGSVGElement): void {
  svg.addEventListener('dragover', (e: DragEvent) => {
    e.preventDefault()
    e.dataTransfer!.dropEffect = 'copy'
  })

  svg.addEventListener('drop', (e: DragEvent) => {
    e.preventDefault()
    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return

    const graphArea = svg.parentElement || document.querySelector<HTMLElement>('.graph-area')

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.name.toLowerCase().endsWith('.smp')) {
        const reader = new FileReader()
        reader.onload = async (evt) => {
          const content = evt.target?.result as string
          if (content) {
            const { smpMeta } = parseSmpContent(content, file.name)
            if (smpMeta.docs && smpMeta.docs.length > 0) {
              for (let d = 0; d < smpMeta.docs.length; d++) {
                const doc = smpMeta.docs[d]
                const { svgLeft, svgTop, svgWidth, svgHeight } = getSvgRectForSmpDoc(doc)

                let targetSvg = d === 0 ? svg : (graphArea ? await createPlot(graphArea, svgLeft, svgTop, [], svgWidth, svgHeight) : svg)
                if (targetSvg) {
                  targetSvg.style.left = `${svgLeft}px`
                  targetSvg.style.top = `${svgTop}px`
                  targetSvg.style.width = `${svgWidth}px`
                  targetSvg.style.height = `${svgHeight}px`
                  setPlotSmpDoc(targetSvg, doc)
                  setPlotSmpMeta(targetSvg, smpMeta)
                  for (const ds of doc.datasets) {
                    addDatasetToPlot(targetSvg, ds)
                  }
                }
              }
            }
          }
        }
        reader.readAsText(file)
      } else if (file.name.endsWith('.txt') || file.type.startsWith('text/')) {
        const reader = new FileReader()
        reader.onload = (evt) => {
          const content = evt.target?.result as string
          if (content) {
            const ds = parseDatasetContent(content, file.name)
            addDatasetToPlot(svg, ds)
          }
        }
        reader.readAsText(file)
      }
    }
  })
}



export async function createPlot(
  graphArea: HTMLElement,
  x: number,
  y: number,
  initialDatasets: Dataset[] = [],
  width: number = 400,
  height: number = 300
): Promise<SVGSVGElement> {
  boxCount++

  const svg = createSVGElement('svg')
  svg.setAttribute('class', 'plot-svg')
  svg.style.left = `${x}px`
  svg.style.top = `${y}px`
  svg.style.width = `${width}px`
  svg.style.height = `${height}px`

  graphArea.appendChild(svg)
  activeSvgs.push(svg)
  setSelectedPlotSvg(svg)

  svgDataMap.set(svg, initialDatasets)
  setupPlotFileDrop(svg)
  drawPlot(svg, initialDatasets, width, height)

  svg.addEventListener('click', () => setSelectedPlotSvg(svg))

  svg.addEventListener('mousedown', (e: MouseEvent) => {
    setSelectedPlotSvg(svg)
    const target = e.target as SVGElement
    const dir = target.getAttribute('data-dir')
    if (!dir) return
    e.preventDefault()
    e.stopPropagation()

    const rect = svg.getBoundingClientRect()
    const parentRect = graphArea.getBoundingClientRect()

    activeDrag = {
      svg,
      dir,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: parseFloat(svg.style.left) || rect.left - parentRect.left,
      startTop: parseFloat(svg.style.top) || rect.top - parentRect.top,
      startWidth: parseFloat(svg.style.width) || rect.width,
      startHeight: parseFloat(svg.style.height) || rect.height,
    }
    document.body.style.userSelect = 'none'
  })

  return svg
}

export function getBoxCount(): number {
  return boxCount
}

export function getDatasets(): Dataset[] {
  return allDatasets
}

function snapToGridThreshold(val: number, step: number = 100, threshold: number = 6): number {
  const nearest = Math.round(val / step) * step
  if (Math.abs(val - nearest) <= threshold) {
    return nearest
  }
  return val
}

// Global mousemove & mouseup listeners for resize with snap to grid
export function initPlotDragListeners(): void {
  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (!activeDrag) return
    const { svg, dir, startX, startY, startLeft, startTop, startWidth, startHeight } = activeDrag
    const zoom = getCanvasZoom()
    const dx = (e.clientX - startX) / zoom
    const dy = (e.clientY - startY) / zoom
    let newLeft = startLeft
    let newTop = startTop
    let newWidth = startWidth
    let newHeight = startHeight

    const GRID_SIZE = 100 // Major grid step (100px per major grid square = 50 statusbar units)
    const SNAP_THRESHOLD = 6 // Magnetic snap threshold (only snaps when within 6px of major grid lines)
    const margin = PLOT_MARGIN
    const minPlotW = 120
    const minPlotH = 80

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

    if (rafId) cancelAnimationFrame(rafId)
    const currentDrag = activeDrag
    rafId = requestAnimationFrame(() => {
      if (!currentDrag) return
      const ds = svgDataMap.get(currentDrag.svg)
      if (ds) drawPlot(currentDrag.svg, ds, newWidth, newHeight)
      rafId = null
    })
  })

  document.addEventListener('mouseup', () => {
    if (!activeDrag) return
    const { svg } = activeDrag
    activeDrag = null
    document.body.style.userSelect = ''
    const ds = svgDataMap.get(svg)
    if (ds) {
      const w = parseFloat(svg.style.width) || svg.getBoundingClientRect().width
      const h = parseFloat(svg.style.height) || svg.getBoundingClientRect().height
      drawPlot(svg, ds, w, h)
    }
  })
}
