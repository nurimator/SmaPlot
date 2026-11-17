import type { Dataset } from '../../types.ts'
import { getCanvasZoom } from '../../utils/canvasZoom.ts'
import { isSeriesLegendText, getProcessedDataset } from './dataset.ts'
import { PLOT_MARGIN, distToSeg } from './svg.ts'
import { getLegendTextAnchor, legendRenderFontSize, measureLegendItemText } from './legendText.ts'
import { activeSvgs, svgDataMap, svgLegendBoxMap, svgSmpDocMap } from './state.ts'
import type { LegendCellBox } from './state.ts'
import type { SelectableObject } from './selection.ts'
import { getPlotValueScales } from './smpDoc.ts'

function rotatedCellBounds(box: LegendCellBox, px: number, py: number): { l: number; t: number; w: number; h: number } {
  const rad = (box.rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const xs: number[] = []
  const ys: number[] = []
  for (const [cx, cy] of [[box.dx, box.dy], [box.dx + box.w, box.dy], [box.dx, box.dy + box.h], [box.dx + box.w, box.dy + box.h]]) {
    xs.push(px + cx * cos - cy * sin)
    ys.push(py + cx * sin + cy * cos)
  }
  const l = Math.min(...xs)
  const t = Math.min(...ys)
  return { l, t, w: Math.max(...xs) - l, h: Math.max(...ys) - t }
}

export function hitTestGraph(svg: SVGSVGElement, clientX: number, clientY: number): Dataset | null {
  const rawDatasets = svgDataMap.get(svg) || []
  if (rawDatasets.length === 0) return null
  const datasets = rawDatasets.map(ds => getProcessedDataset(ds))
  const w = svg.clientWidth || parseFloat(svg.style.width) || svg.getBoundingClientRect().width || 400
  const h = svg.clientHeight || parseFloat(svg.style.height) || svg.getBoundingClientRect().height || 300
  const margin = PLOT_MARGIN
  const plotW = Math.max(10, w - margin.l - margin.r)
  const plotH = Math.max(10, h - margin.t - margin.b)
  const scales = getPlotValueScales(svg, plotW, plotH)
  const sx = scales.x.valueToPixel
  const sy = scales.y.valueToPixel
  const su = scales.u.valueToPixel
  const sr = scales.r.valueToPixel

  const rect = svg.getBoundingClientRect()
  const zoom = getCanvasZoom()
  const gx = (clientX - rect.left) / zoom
  const gy = (clientY - rect.top) / zoom
  const threshold = 6 / zoom

  for (let idx = 0; idx < datasets.length; idx++) {
    const ds = datasets[idx]
    const opts = ds.options || {}
    if (opts.show === false) continue
    const dsSx = opts.axisX === 'u' ? su : sx
    const dsSy = opts.axisY === 'r' ? sr : sy
    const px = ds.x
    const py = ds.y
    for (let i = 1; i < px.length; i++) {
      if (distToSeg(gx, gy, dsSx(px[i - 1]), dsSy(py[i - 1]), dsSx(px[i]), dsSy(py[i])) <= threshold) return rawDatasets[idx]
    }
    const ptR = (opts.size || 3) / zoom + threshold
    for (let i = 0; i < px.length; i++) {
      if (Math.hypot(gx - dsSx(px[i]), gy - dsSy(py[i])) <= ptR) return rawDatasets[idx]
    }
  }
  return null
}

export function isInsidePlotArea(svg: SVGSVGElement, clientX: number, clientY: number): boolean {
  const w = svg.clientWidth || parseFloat(svg.style.width) || svg.getBoundingClientRect().width || 400
  const h = svg.clientHeight || parseFloat(svg.style.height) || svg.getBoundingClientRect().height || 300
  const margin = PLOT_MARGIN
  const plotW = Math.max(10, w - margin.l - margin.r)
  const plotH = Math.max(10, h - margin.t - margin.b)

  const rect = svg.getBoundingClientRect()
  const zoom = getCanvasZoom()
  const gx = (clientX - rect.left) / zoom
  const gy = (clientY - rect.top) / zoom

  return gx >= margin.l && gx <= margin.l + plotW && gy >= margin.t && gy <= margin.t + plotH
}

export function hitTestAxisArea(svg: SVGSVGElement, clientX: number, clientY: number): 'x' | 'y' | 'u' | 'r' | null {
  const w = svg.clientWidth || parseFloat(svg.style.width) || svg.getBoundingClientRect().width || 400
  const h = svg.clientHeight || parseFloat(svg.style.height) || svg.getBoundingClientRect().height || 300
  const margin = PLOT_MARGIN
  const plotW = Math.max(10, w - margin.l - margin.r)
  const plotH = Math.max(10, h - margin.t - margin.b)

  const rect = svg.getBoundingClientRect()
  const zoom = getCanvasZoom()
  const gx = (clientX - rect.left) / zoom
  const gy = (clientY - rect.top) / zoom

  const frameL = margin.l
  const frameR = margin.l + plotW
  const frameT = margin.t
  const frameB = margin.t + plotH
  const tol = 6
  const valueScales = getPlotValueScales(svg, plotW, plotH)
  const smpDoc = svgSmpDocMap.get(svg)
  const isAxisOnly = smpDoc?.frameType === 3
  const xLo = Math.min(valueScales.x.min, valueScales.x.max)
  const xHi = Math.max(valueScales.x.min, valueScales.x.max)
  const yLo = Math.min(valueScales.y.min, valueScales.y.max)
  const yHi = Math.max(valueScales.y.min, valueScales.y.max)
  const axisYPos = yLo <= 0 && yHi >= 0
    ? valueScales.y.valueToPixel(0)
    : yLo > 0
      ? frameB
      : frameT
  const axisXPos = xLo <= 0 && xHi >= 0
    ? valueScales.x.valueToPixel(0)
    : xLo > 0
      ? frameL
      : frameR

  if (gy > frameB + tol && gy <= h && gx >= 0 && gx <= w) return 'x'
  if (gy < frameT - tol && gy >= 0 && gx >= 0 && gx <= w) return 'u'
  if (gx < frameL - tol && gx >= 0 && gy >= 0 && gy <= h) return 'y'
  if (gx > frameR + tol && gx <= w && gy >= 0 && gy <= h) return 'r'

  const horizontalAxisY = isAxisOnly ? axisYPos : frameB
  const horizontalAxisTopY = isAxisOnly ? frameB : frameT
  const verticalAxisX = isAxisOnly ? axisXPos : frameL
  const verticalAxisRightX = isAxisOnly ? frameL : frameR
  const nearBottom = Math.abs(gy - horizontalAxisY) <= tol && gx >= frameL - tol && gx <= frameR + tol
  const nearTop = Math.abs(gy - horizontalAxisTopY) <= tol && gx >= frameL - tol && gx <= frameR + tol
  const nearLeft = Math.abs(gx - verticalAxisX) <= tol && gy >= frameT - tol && gy <= frameB + tol
  const nearRight = Math.abs(gx - verticalAxisRightX) <= tol && gy >= frameT - tol && gy <= frameB + tol

  if (nearBottom) return 'x'
  if (nearTop) return 'u'
  if (nearLeft) return 'y'
  if (nearRight) return 'r'

  return null
}

export function getSelectableObjects(): { obj: SelectableObject; l: number; t: number; w: number; h: number }[] {
  const result: { obj: SelectableObject; l: number; t: number; w: number; h: number }[] = []
  for (const svg of activeSvgs) {
    const left = parseFloat(svg.style.left) || 0
    const top = parseFloat(svg.style.top) || 0
    const width = parseFloat(svg.style.width) || 400
    const height = parseFloat(svg.style.height) || 300
    result.push({
      obj: { kind: 'plot', svg },
      l: left + PLOT_MARGIN.l,
      t: top + PLOT_MARGIN.t,
      w: Math.max(10, width - PLOT_MARGIN.l - PLOT_MARGIN.r),
      h: Math.max(10, height - PLOT_MARGIN.t - PLOT_MARGIN.b),
    })

    const smpDoc = svgSmpDocMap.get(svg)
    if (!smpDoc) continue
    const plotW = Math.max(10, width - PLOT_MARGIN.l - PLOT_MARGIN.r)
    const plotH = Math.max(10, height - PLOT_MARGIN.t - PLOT_MARGIN.b)
    const valueScales = getPlotValueScales(svg, plotW, plotH)

    const cellBoxes = svgLegendBoxMap.get(svg)
    smpDoc.legendItems.forEach((item, itemIdx) => {
      const px = left + PLOT_MARGIN.l + (item.xNorm / 10000) * plotW
      const py = top + PLOT_MARGIN.t + (item.yNorm / 10000) * plotH
      let objW: number
      let objH: number
      if (isSeriesLegendText(item.text)) {
        const lines = item.text.replace(/\\n/g, '\n').split('\n')
        const em = legendRenderFontSize(item)
        const longest = Math.max(...lines.map((line) => line.replace(/%\d+[EN]/g, 'XXXX').length))
        objW = em * 2 + longest * em * 0.55
        objH = lines.length * em + em * 0.3
        result.push({ obj: { kind: 'legend', svg, itemIdx }, l: px - 2, t: py - em - 2, w: objW + 4, h: objH + 4 })
      } else if (cellBoxes?.has(itemIdx)) {
        result.push({ obj: { kind: 'legend', svg, itemIdx }, ...rotatedCellBounds(cellBoxes.get(itemIdx)!, px, py) })
      } else {
        const isRot = item.rotation !== 0
        const renderFontSz = legendRenderFontSize(item)
        // Same tokenizer and metrics the renderer uses, so this rectangle matches the visible
        // selection box instead of over-claiming a uniform 0.5em per raw character (which
        // counted %X/%I/%G control codes and floored every short title at 40px).
        const measured = measureLegendItemText(item)
        const textLen = Math.max(measured.width, 8)
        const fontH = Math.max(measured.height, 8)
        const anchor = getLegendTextAnchor(item)

        if (isRot) {
          const topY = anchor === 'end' ? py - textLen : anchor === 'middle' ? py - textLen / 2 : py - textLen
          result.push({
            obj: { kind: 'legend', svg, itemIdx },
            l: px - fontH - 2,
            t: topY - 2,
            w: fontH + 4,
            h: textLen + 4,
          })
        } else {
          const leftX = anchor === 'end' ? px - textLen : anchor === 'middle' ? px - textLen / 2 : px
          result.push({
            obj: { kind: 'legend', svg, itemIdx },
            l: leftX - 2,
            t: py - renderFontSz - 2,
            w: textLen + 4,
            h: fontH + 4,
          })        }
      }
    })

    smpDoc.annotationLines?.forEach((aLine, annotationIdx) => {
      const docWidthMm = (smpDoc?.width || 10000) / 100
      const docHeightMm = (smpDoc?.height || 10000) / 100
      const scaleX = plotW / (docWidthMm || 100)
      const scaleY = plotH / (docHeightMm || 100)

      const x1 = aLine.unitX === 'xa'
        ? valueScales.x.valueToPixel(aLine.x1Norm)
        : aLine.unitX === 'ua'
          ? valueScales.u.valueToPixel(aLine.x1Norm)
          : left + PLOT_MARGIN.l + aLine.x1Norm * scaleX
      const x2 = aLine.unitX === 'xa'
        ? valueScales.x.valueToPixel(aLine.x2Norm)
        : aLine.unitX === 'ua'
          ? valueScales.u.valueToPixel(aLine.x2Norm)
          : left + PLOT_MARGIN.l + aLine.x2Norm * scaleX
      const y1 = aLine.unitY === 'ya'
        ? valueScales.y.valueToPixel(aLine.y1Norm)
        : aLine.unitY === 'ra'
          ? valueScales.r.valueToPixel(aLine.y1Norm)
          : top + PLOT_MARGIN.t + aLine.y1Norm * scaleY
      const y2 = aLine.unitY === 'ya'
        ? valueScales.y.valueToPixel(aLine.y2Norm)
        : aLine.unitY === 'ra'
          ? valueScales.r.valueToPixel(aLine.y2Norm)
          : top + PLOT_MARGIN.t + aLine.y2Norm * scaleY
      const minX = Math.min(x1, x2) - 4
      const minY = Math.min(y1, y2) - 4
      result.push({
        obj: { kind: 'annotation', svg, annotationIdx },
        l: minX,
        t: minY,
        w: Math.abs(x2 - x1) + 8,
        h: Math.abs(y2 - y1) + 8,
      })
    })
  }
  return result
}