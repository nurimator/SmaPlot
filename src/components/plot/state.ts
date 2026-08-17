import type { Dataset, SmpMetadata, SmpPlotDoc } from '../../types.ts'

export const svgDataMap = new WeakMap<SVGSVGElement, Dataset[]>()
export const svgSmpMetaMap = new WeakMap<SVGSVGElement, SmpMetadata>()
export const svgSmpDocMap = new WeakMap<SVGSVGElement, SmpPlotDoc>()
export const svgBaseScaleMap = new WeakMap<
  SVGSVGElement,
  { xMin: number; xMax: number; yMin: number; yMax: number }
>()

export const autoScaleSvgs = new WeakSet<SVGSVGElement>()
export const svgOverlayMap = new WeakMap<SVGSVGElement, HTMLDivElement>()
export const svgCrossbarMap = new WeakMap<SVGSVGElement, { xVal: number; yVal: number }>()

export const allDatasets: Dataset[] = []
export const activeSvgs: SVGSVGElement[] = []

let boxCount = 0

export function incBoxCount(): number {
  return ++boxCount
}

export function resetBoxCount(): void {
  boxCount = 0
}

export function getPlotOverlay(svg: SVGSVGElement): HTMLDivElement {
  let overlay = svgOverlayMap.get(svg)
  if (!overlay || !overlay.isConnected) {
    overlay = document.createElement('div')
    overlay.className = 'plot-overlay'
    overlay.style.left = parseFloat(svg.style.left) ? `${parseFloat(svg.style.left)}px` : '0px'
    overlay.style.top = parseFloat(svg.style.top) ? `${parseFloat(svg.style.top)}px` : '0px'
    overlay.style.width = parseFloat(svg.style.width) ? `${parseFloat(svg.style.width)}px` : '400px'
    overlay.style.height = parseFloat(svg.style.height) ? `${parseFloat(svg.style.height)}px` : '300px'
    svg.parentElement?.insertBefore(overlay, svg.nextSibling)
    svgOverlayMap.set(svg, overlay)
  }
  return overlay
}

export function syncPlotOverlay(svg: SVGSVGElement): void {
  const overlay = svgOverlayMap.get(svg)
  if (!overlay) return
  overlay.style.left = parseFloat(svg.style.left) ? `${parseFloat(svg.style.left)}px` : '0px'
  overlay.style.top = parseFloat(svg.style.top) ? `${parseFloat(svg.style.top)}px` : '0px'
  overlay.style.width = parseFloat(svg.style.width) ? `${parseFloat(svg.style.width)}px` : '400px'
  overlay.style.height = parseFloat(svg.style.height) ? `${parseFloat(svg.style.height)}px` : '300px'
}