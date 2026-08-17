import type { Dataset } from '../../types.ts'
import { getCanvasZoom } from '../../utils/canvasZoom.ts'
import { isSeriesLegendText, getProcessedDataset } from './dataset.ts'
import { PLOT_MARGIN, distToSeg } from './svg.ts'
import {
  activeSvgs,
  svgBaseScaleMap,
  svgDataMap,
  svgSmpDocMap,
  svgSmpMetaMap,
} from './state.ts'
import type { SelectableObject } from './selection.ts'

export function hitTestGraph(svg: SVGSVGElement, clientX: number, clientY: number): Dataset | null {
  const rawDatasets = svgDataMap.get(svg) || []
  if (rawDatasets.length === 0) return null
  const datasets = rawDatasets.map(ds => getProcessedDataset(ds))
  const w = svg.clientWidth || parseFloat(svg.style.width) || svg.getBoundingClientRect().width || 400
  const h = svg.clientHeight || parseFloat(svg.style.height) || svg.getBoundingClientRect().height || 300
  const margin = PLOT_MARGIN
  const plotW = Math.max(10, w - margin.l - margin.r)
  const plotH = Math.max(10, h - margin.t - margin.b)
  const smpDoc = svgSmpDocMap.get(svg)
  const smpMeta = svgSmpMetaMap.get(svg)
  const baseScale = svgBaseScaleMap.get(svg)
  
  let xMin = smpDoc?.axisX.min ?? smpMeta?.xMin ?? (baseScale ? baseScale.xMin : 0)
  let xMax = smpDoc?.axisX.max ?? smpMeta?.xMax ?? (baseScale ? baseScale.xMax : 10)
  let yMin = smpDoc?.axisY.min ?? smpMeta?.yMin ?? (baseScale ? baseScale.yMin : 0)
  let yMax = smpDoc?.axisY.max ?? smpMeta?.yMax ?? (baseScale ? baseScale.yMax : 10)
  
  if (!smpDoc && !smpMeta && !baseScale && datasets.length > 0) {
    xMin = Infinity
    xMax = -Infinity
    yMin = Infinity
    yMax = -Infinity
    for (const ds of datasets) {
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
  
  const sx = (v: number) => margin.l + ((v - xMin) / (xMax - xMin || 1)) * plotW
  const sy = (v: number) => margin.t + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH
  const uMin = smpDoc?.axisTop?.min ?? xMin
  const uMax = smpDoc?.axisTop?.max ?? xMax
  const rMin = smpDoc?.axisRight?.min ?? yMin
  const rMax = smpDoc?.axisRight?.max ?? yMax
  const su = (v: number) => margin.l + ((v - uMin) / (uMax - uMin || 1)) * plotW
  const sr = (v: number) => margin.t + plotH - ((v - rMin) / (rMax - rMin || 1)) * plotH

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

  if (gy > frameB + tol && gy <= h && gx >= 0 && gx <= w) return 'x'
  if (gy < frameT - tol && gy >= 0 && gx >= 0 && gx <= w) return 'u'
  if (gx < frameL - tol && gx >= 0 && gy >= 0 && gy <= h) return 'y'
  if (gx > frameR + tol && gx <= w && gy >= 0 && gy <= h) return 'r'

  const nearBottom = Math.abs(gy - frameB) <= tol && gx >= frameL - tol && gx <= frameR + tol
  const nearTop = Math.abs(gy - frameT) <= tol && gx >= frameL - tol && gx <= frameR + tol
  const nearLeft = Math.abs(gx - frameL) <= tol && gy >= frameT - tol && gy <= frameB + tol
  const nearRight = Math.abs(gx - frameR) <= tol && gy >= frameT - tol && gy <= frameB + tol

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

    smpDoc.legendItems.forEach((item, itemIdx) => {
      const px = left + PLOT_MARGIN.l + (item.xNorm / 10000) * plotW
      const py = top + PLOT_MARGIN.t + (item.yNorm / 10000) * plotH
      let objW: number
      let objH: number
      if (isSeriesLegendText(item.text)) {
        const lines = item.text.split('\n').length
        objW = 90
        objH = lines * 11 + 6
        result.push({ obj: { kind: 'legend', svg, itemIdx }, l: px - 4, t: py - objH / 2, w: objW + 8, h: objH + 4 })
      } else {
        const isRot = item.rotation !== 0
        const textLines = (item.rawText || item.text).split(/\r?\n|\\n/)
        const maxLineLen = Math.max(...textLines.map((l: string) => l.length))
        const renderFontSz = Math.max(6, Math.round((item.fontSize || 12) * 0.72))
        const textLen = Math.max(40, maxLineLen * (renderFontSz * 0.5) + 8)
        const fontH = renderFontSz * textLines.length + 4
        const anchor = item.align === 'center' ? 'middle' : item.align === 'right' ? 'end' : 'start'

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
          })
        }
      }
    })

    smpDoc.annotationLines?.forEach((aLine, annotationIdx) => {
      const docWidthMm = (smpDoc?.width || 10000) / 100
      const docHeightMm = (smpDoc?.height || 10000) / 100
      const scaleX = plotW / (docWidthMm || 100)
      const scaleY = plotH / (docHeightMm || 100)

      const x1 = left + PLOT_MARGIN.l + aLine.x1Norm * scaleX
      const x2 = left + PLOT_MARGIN.l + aLine.x2Norm * scaleX
      const y1 = top + PLOT_MARGIN.t + aLine.y1Norm * scaleY
      const y2 = top + PLOT_MARGIN.t + aLine.y2Norm * scaleY
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