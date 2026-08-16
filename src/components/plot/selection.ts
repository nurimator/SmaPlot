import { PLOT_MARGIN } from './svg.ts'
import {
  activeSvgs,
  svgDataMap,
  svgOverlayMap,
  svgSmpDocMap,
  svgSmpMetaMap,
} from './state.ts'
import { updatePlotVisual } from './drawPlot.ts'

export interface SelectableObject {
  kind: 'plot' | 'legend' | 'annotation'
  svg: SVGSVGElement
  itemIdx?: number
  annotationIdx?: number
}

const selectedObjects: SelectableObject[] = []

let selectedPlotSvg: SVGSVGElement | null = null
let lastSelectedPlotSvg: SVGSVGElement | null = null

let selectedLegendIndex: number = -1
let selectedAnnotationIndex: number = -1

export function setSelectedPlotSvg(svg: SVGSVGElement | null): void {
  if (svg) {
    lastSelectedPlotSvg = svg
  }
  if (svg === selectedPlotSvg) return
  const prev = selectedPlotSvg
  selectedPlotSvg = svg
  if (prev) {
    updatePlotVisual(prev)
    updateSelectionBorder(prev)
  }
  if (svg) {
    updatePlotVisual(svg)
    updateSelectionBorder(svg)
  }
}

export function getExplicitSelectedPlotSvg(): SVGSVGElement | null {
  return selectedPlotSvg
}

export function setLastSelectedPlotSvg(svg: SVGSVGElement | null): void {
  lastSelectedPlotSvg = svg
}

export function getLastSelectedPlotSvg(): SVGSVGElement | null {
  if (lastSelectedPlotSvg && document.body.contains(lastSelectedPlotSvg)) {
    return lastSelectedPlotSvg
  }
  return null
}

export function getSelectedPlotSvg(): SVGSVGElement | null {
  if (selectedPlotSvg && document.body.contains(selectedPlotSvg)) {
    return selectedPlotSvg
  }
  if (lastSelectedPlotSvg && document.body.contains(lastSelectedPlotSvg)) {
    return lastSelectedPlotSvg
  }
  return activeSvgs[activeSvgs.length - 1] || activeSvgs[0] || null
}

export function getPlotSvgFromElement(el: Element | null): SVGSVGElement | null {
  if (!el) return null
  const plotSvg = el.closest('.plot-svg') as SVGSVGElement | null
  if (plotSvg) return plotSvg
  const overlay = el.closest('.plot-overlay') as HTMLDivElement | null
  if (overlay) {
    for (const svg of activeSvgs) {
      if (svgOverlayMap.get(svg) === overlay) return svg
    }
    if (overlay.previousElementSibling?.classList.contains('plot-svg')) {
      return overlay.previousElementSibling as SVGSVGElement
    }
  }
  return null
}

export function getMultiSelectedSvgs(): SVGSVGElement[] {
  const seen = new Set<SVGSVGElement>()
  selectedObjects.forEach((o) => {
    if (o.kind === 'plot') seen.add(o.svg)
  })
  return [...seen]
}

export function isMultiSelected(svg: SVGSVGElement): boolean {
  return selectedObjects.some((o) => o.kind === 'plot' && o.svg === svg)
}

export function getSelectedObjects(): SelectableObject[] {
  return [...selectedObjects]
}

export function updateSelectionBorder(svg: SVGSVGElement): void {
  const ov = svgOverlayMap.get(svg)
  if (!ov) return
  const isSel = isMultiSelected(svg)

  // Remove existing frame border element
  const existing = ov.querySelector('.ov-frame-border')
  if (existing) existing.remove()

  if (isSel) {
    // Add a border element positioned exactly on the inner plot frame
    const border = document.createElement('div')
    border.className = 'ov-frame-border'
    border.style.position = 'absolute'
    border.style.left = `${PLOT_MARGIN.l}px`
    border.style.top = `${PLOT_MARGIN.t}px`
    const w = parseFloat(svg.style.width) || 400
    const h = parseFloat(svg.style.height) || 300
    border.style.width = `${Math.max(10, w - PLOT_MARGIN.l - PLOT_MARGIN.r)}px`
    border.style.height = `${Math.max(10, h - PLOT_MARGIN.t - PLOT_MARGIN.b)}px`
    border.style.border = '1px solid #00ffff'
    border.style.boxSizing = 'border-box'
    border.style.pointerEvents = 'none'
    ov.appendChild(border)
  }
}

export function setObjectSelection(objs: SelectableObject[]): void {
  const objKey = (o: SelectableObject): string =>
    o.kind === 'plot' ? '' : `${o.kind}:${o.itemIdx ?? ''}:${o.annotationIdx ?? ''}`
  const collectInner = (map: Map<SVGSVGElement, Set<string>>, o: SelectableObject): void => {
    if (o.kind === 'plot') return
    if (!map.has(o.svg)) map.set(o.svg, new Set())
    map.get(o.svg)!.add(objKey(o))
  }
  const prevInner = new Map<SVGSVGElement, Set<string>>()
  selectedObjects.forEach((o) => collectInner(prevInner, o))
  const nextInner = new Map<SVGSVGElement, Set<string>>()
  objs.forEach((o) => collectInner(nextInner, o))

  const changed = new Set<SVGSVGElement>()
  new Set([...prevInner.keys(), ...nextInner.keys()]).forEach((s) => {
    const a = prevInner.get(s) ?? new Set<string>()
    const b = nextInner.get(s) ?? new Set<string>()
    if (a.size !== b.size || [...a].some((k) => !b.has(k))) changed.add(s)
  })

  const affectedBorderSvgs = new Set<SVGSVGElement>()
  selectedObjects.forEach((o) => affectedBorderSvgs.add(o.svg))

  selectedObjects.length = 0
  objs.forEach((o) => {
    selectedObjects.push(o)
    affectedBorderSvgs.add(o.svg)
  })

  const last = objs[objs.length - 1]
  if (last) {
    setSelectedPlotSvg(last.svg)
  } else {
    setSelectedPlotSvg(null)
  }

  affectedBorderSvgs.forEach((svg) => updateSelectionBorder(svg))
  changed.forEach((s) => updatePlotVisual(s))
}

export function clearObjectSelection(): void {
  setObjectSelection([])
}

export function deleteSelectedObjects(): boolean {
  const selected = getSelectedObjects()
  let deletedAny = false

  if (selected.length > 0) {
    const plotSvgsToDelete = new Set<SVGSVGElement>()
    const legendDeletions = new Map<SVGSVGElement, number[]>()
    const annotationDeletions = new Map<SVGSVGElement, number[]>()

    selected.forEach((o) => {
      if (o.kind === 'plot') {
        plotSvgsToDelete.add(o.svg)
      } else if (o.kind === 'legend' && o.itemIdx !== undefined) {
        if (!legendDeletions.has(o.svg)) legendDeletions.set(o.svg, [])
        legendDeletions.get(o.svg)!.push(o.itemIdx)
      } else if (o.kind === 'annotation' && o.annotationIdx !== undefined) {
        if (!annotationDeletions.has(o.svg)) annotationDeletions.set(o.svg, [])
        annotationDeletions.get(o.svg)!.push(o.annotationIdx)
      }
    })

    plotSvgsToDelete.forEach((svg) => {
      const idx = activeSvgs.indexOf(svg)
      if (idx !== -1) {
        activeSvgs.splice(idx, 1)
        svg.remove()
        const ov = svgOverlayMap.get(svg)
        if (ov) ov.remove()
        svgSmpDocMap.delete(svg)
        svgSmpMetaMap.delete(svg)
        svgDataMap.delete(svg)
        deletedAny = true
      }
    })

    legendDeletions.forEach((indices, svg) => {
      const smpDoc = svgSmpDocMap.get(svg)
      if (smpDoc && smpDoc.legendItems) {
        indices.sort((a, b) => b - a).forEach((i) => {
          if (i >= 0 && i < smpDoc.legendItems.length) {
            smpDoc.legendItems.splice(i, 1)
            deletedAny = true
          }
        })
        updatePlotVisual(svg)
      }
    })

    annotationDeletions.forEach((indices, svg) => {
      const smpDoc = svgSmpDocMap.get(svg)
      if (smpDoc && smpDoc.annotationLines) {
        const lines = smpDoc.annotationLines
        indices.sort((a, b) => b - a).forEach((i) => {
          if (i >= 0 && i < lines.length) {
            lines.splice(i, 1)
            deletedAny = true
          }
        })
        updatePlotVisual(svg)
      }
    })

    clearObjectSelection()
  } else {
    const selPlot = getSelectedPlotSvg()
    if (selPlot) {
      const idx = activeSvgs.indexOf(selPlot)
      if (idx !== -1) {
        activeSvgs.splice(idx, 1)
        selPlot.remove()
        const ov = svgOverlayMap.get(selPlot)
        if (ov) ov.remove()
        svgSmpDocMap.delete(selPlot)
        svgSmpMetaMap.delete(selPlot)
        svgDataMap.delete(selPlot)
        setSelectedPlotSvg(null)
        clearObjectSelection()
        deletedAny = true
      }
    }
  }

  if (lastSelectedPlotSvg && !document.body.contains(lastSelectedPlotSvg)) {
    lastSelectedPlotSvg = activeSvgs[activeSvgs.length - 1] || null
  }

  return deletedAny
}

export function setMarqueeSelection(svgs: SVGSVGElement[]): void {
  setObjectSelection(svgs.map((svg) => ({ kind: 'plot' as const, svg })))
}

export function clearMarqueeSelection(): void {
  setObjectSelection([])
}

export function isObjectSelected(obj: SelectableObject): boolean {
  return selectedObjects.some(
    (o) => o.kind === obj.kind && o.svg === obj.svg && o.itemIdx === obj.itemIdx && o.annotationIdx === obj.annotationIdx
  )
}

export function getSelectedLegendIndex(): number {
  return selectedLegendIndex
}

export function getSelectedAnnotationIndex(): number {
  return selectedAnnotationIndex
}

export function setSelectedLegendIndex(idx: number): void {
  selectedLegendIndex = idx
}

export function setSelectedAnnotationIndex(idx: number): void {
  selectedAnnotationIndex = idx
}