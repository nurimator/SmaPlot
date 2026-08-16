import type { Dataset } from '../../types.ts'
import { parseDatasetContent } from '../../utils/dataset.ts'
import { getCanvasZoom } from '../../utils/canvasZoom.ts'
import { addRecentFile } from '../../utils/recentFiles.ts'
import { setCurrentProjectFileName } from '../../utils/projectState.ts'
import { parseSmpContent } from '../../utils/smpParser.ts'
import { globalDataManager } from './../DataManager.ts'
import { drawPlot, updatePlotVisual } from './drawPlot.ts'
import { isPropertyTabMode } from './transform.ts'
import { startGroupDrag } from './drag.ts'
import {
  isMultiSelected,
  setLastSelectedPlotSvg,
  setObjectSelection,
  setSelectedAnnotationIndex,
  setSelectedLegendIndex,
  setSelectedPlotSvg,
  getSelectedAnnotationIndex,
  getSelectedLegendIndex,
} from './selection.ts'
import { isReadValueMode, isTrimmingMode } from './modes.ts'
import { makeDefaultPlotDoc, getSvgRectForSmpDoc, setPlotSmpDoc, setPlotSmpMeta } from './smpDoc.ts'
import { createSVGElement, hitsRectBorder, PLOT_MARGIN } from './svg.ts'
import { datasetIdentifier } from './dataset.ts'
import {
  activeSvgs,
  allDatasets,
  autoScaleSvgs,
  incBoxCount,
  resetBoxCount,
  svgBaseScaleMap,
  svgDataMap,
  svgOverlayMap,
  svgSmpDocMap,
} from './state.ts'

export function addDatasetToPlot(svg: SVGSVGElement, dataset: Dataset): void {
  const currentDatasets = svgDataMap.get(svg) || []
  currentDatasets.push(dataset)
  svgDataMap.set(svg, currentDatasets)

  if (!allDatasets.some((d) => d.name === dataset.name && d.filePath === dataset.filePath)) {
    allDatasets.push(dataset)
  }
  globalDataManager.addDataset(dataset)

  const w = parseFloat(svg.style.width) || svg.getBoundingClientRect().width
  const h = parseFloat(svg.style.height) || svg.getBoundingClientRect().height
  drawPlot(svg, currentDatasets, w, h)

  // Fresh "New" plots auto-fit their axis to the first dataset loaded. Once a
  // real SmpPlotDoc replaces the default (e.g. an .SMP project load), this flag
  // is already cleared, so loaded scales are never overwritten here.
  if (autoScaleSvgs.has(svg)) {
    const baseScale = svgBaseScaleMap.get(svg)
    const doc = svgSmpDocMap.get(svg)
    if (baseScale && doc) {
      doc.axisX.min = baseScale.xMin
      doc.axisX.max = baseScale.xMax
      doc.axisY.min = baseScale.yMin
      doc.axisY.max = baseScale.yMax
      updatePlotVisual(svg)
    }
    autoScaleSvgs.delete(svg)
  }
}

export function removeDatasetFromPlot(svg: SVGSVGElement, identifier: string): void {
  const ds = svgDataMap.get(svg) || []
  const filtered = ds.filter((d) => datasetIdentifier(d) !== identifier)
  if (filtered.length !== ds.length) {
    svgDataMap.set(svg, filtered)
    updatePlotVisual(svg)
  }
}

export function removeDatasetFromAllPlots(identifier: string): void {
  const gds = globalDataManager.getDatasets()
  const idx = gds.findIndex((d) => datasetIdentifier(d) === identifier)
  if (idx >= 0) {
    globalDataManager.removeDataset(idx)
  }

  for (let i = allDatasets.length - 1; i >= 0; i--) {
    if (datasetIdentifier(allDatasets[i]) === identifier) {
      allDatasets.splice(i, 1)
    }
  }

  for (const svg of activeSvgs) {
    const ds = svgDataMap.get(svg) || []
    const filtered = ds.filter((d) => datasetIdentifier(d) !== identifier)
    if (filtered.length !== ds.length) {
      svgDataMap.set(svg, filtered)
      updatePlotVisual(svg)
    }
  }
}

export function clearAllPlots(graphArea: HTMLElement): void {
  for (const svg of activeSvgs) {
    const overlay = svgOverlayMap.get(svg)
    if (overlay && overlay.parentElement) {
      overlay.parentElement.removeChild(overlay)
    }
    if (svg.parentElement) {
      svg.parentElement.removeChild(svg)
    }
  }

  const remaining = graphArea.querySelectorAll('.plot-svg, .plot-overlay')
  remaining.forEach((el) => el.remove())

  activeSvgs.length = 0
  allDatasets.length = 0
  globalDataManager.clearDatasets()
  setObjectSelection([])
  setSelectedPlotSvg(null)
  setLastSelectedPlotSvg(null)
  setSelectedLegendIndex(-1)
  setSelectedAnnotationIndex(-1)
  resetBoxCount()
}

export async function loadSmpProject(
  graphArea: HTMLElement,
  content: string,
  fileName: string
): Promise<boolean> {
  const { smpMeta } = parseSmpContent(content, fileName)
  if (!smpMeta.docs || smpMeta.docs.length === 0) return false

  setCurrentProjectFileName(fileName)
  addRecentFile(fileName, content)

  clearAllPlots(graphArea)

  for (let d = 0; d < smpMeta.docs.length; d++) {
    const doc = smpMeta.docs[d]
    const { svgLeft, svgTop, svgWidth, svgHeight } = getSvgRectForSmpDoc(doc)
    const svg = await createPlot(graphArea, svgLeft, svgTop, [], svgWidth, svgHeight)
    setPlotSmpDoc(svg, doc)
    setPlotSmpMeta(svg, smpMeta)
    for (const ds of doc.datasets) {
      addDatasetToPlot(svg, ds)
    }
    updatePlotVisual(svg)
  }

  const statusFileEl = document.querySelector<HTMLElement>('#statusFileText')
  if (statusFileEl) {
    statusFileEl.textContent = `1:${fileName}`
  }
  const statusDotEl = document.querySelector<HTMLElement>('.status-dot')
  if (statusDotEl) {
    statusDotEl.classList.remove('status-dot-idle')
  }

  const appTitleEl = document.querySelector<HTMLElement>('.app-title')
  if (appTitleEl) {
    appTitleEl.textContent = `SmaPlot - ${fileName}`
  }
  document.title = `SmaPlot - ${fileName}`

  return true
}

export function setupPlotFileDrop(svg: SVGSVGElement): void {
  svg.addEventListener('dragover', (e: DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  })

  svg.addEventListener('drop', (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return

    const graphArea = svg.parentElement || document.querySelector<HTMLElement>('.graph-area')

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const ext = file.name.toLowerCase().split('.').pop()
      if (ext === 'smp' || ext === 'sma') {
        const reader = new FileReader()
        reader.onload = async (evt) => {
          const content = evt.target?.result as string
          if (content && graphArea) {
            await loadSmpProject(graphArea, content, file.name)
            addRecentFile(file.name, content)
          }
        }
        reader.readAsText(file, 'windows-1252')
      } else if (ext === 'txt' || file.type.startsWith('text/')) {
        const reader = new FileReader()
        reader.onload = (evt) => {
          const content = evt.target?.result as string
          if (content) {
            const ds = parseDatasetContent(content, file.name)
            addDatasetToPlot(svg, ds)
          }
        }
        reader.readAsText(file, 'windows-1252')
      }
    }
  })
}

export function wirePlotInteractions(svg: SVGSVGElement): void {
  setupPlotFileDrop(svg)

  svg.addEventListener('click', (e: MouseEvent) => {
    if (isReadValueMode() || isPropertyTabMode()) return
    setLastSelectedPlotSvg(svg)
    if (e.target === svg || ((e.target as SVGElement).tagName === 'rect' && !(e.target as SVGElement).getAttribute('data-dir'))) {
      if (getSelectedLegendIndex() !== -1 || getSelectedAnnotationIndex() !== -1) {
        setSelectedLegendIndex(-1)
        setSelectedAnnotationIndex(-1)
        updatePlotVisual(svg)
      }
    }
  })

  svg.addEventListener('mousedown', (e: MouseEvent) => {
    if (isTrimmingMode() || isReadValueMode() || isPropertyTabMode()) return
    setLastSelectedPlotSvg(svg)
    const target = e.target as SVGElement
    const dir = target.getAttribute('data-dir')
    const graphArea = svg.parentElement || document.body
    if (!dir) {
      // Left-drag on the plot body: if the plot is already marquee-selected AND click is on frame border line,
      // start a group-move. Otherwise, let MarqueeSelect handle it.
      if (e.button !== 0) return
      const rect = graphArea.getBoundingClientRect()
      const zoom = getCanvasZoom()
      const gx = (e.clientX - rect.left) / zoom
      const gy = (e.clientY - rect.top) / zoom

      const left = parseFloat(svg.style.left) || 0
      const top = parseFloat(svg.style.top) || 0
      const width = parseFloat(svg.style.width) || 400
      const height = parseFloat(svg.style.height) || 300
      const l = left + PLOT_MARGIN.l
      const t = top + PLOT_MARGIN.t
      const w = Math.max(10, width - PLOT_MARGIN.l - PLOT_MARGIN.r)
      const h = Math.max(10, height - PLOT_MARGIN.t - PLOT_MARGIN.b)

      const hitBorder = hitsRectBorder(gx, gy, l, t, w, h)

      if (isMultiSelected(svg) && hitBorder) {
        e.stopPropagation()
        startGroupDrag(e.clientX, e.clientY)
      }
      // Don't stopPropagation — MarqueeSelect will start marquee selection or point hit-test
      return
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
  incBoxCount()

  const svg = createSVGElement('svg')
  svg.setAttribute('class', 'plot-svg')
  svg.style.left = `${x}px`
  svg.style.top = `${y}px`
  svg.style.width = `${width}px`
  svg.style.height = `${height}px`

  graphArea.appendChild(svg)
  activeSvgs.push(svg)
  setObjectSelection([{ kind: 'plot', svg }])

  svgDataMap.set(svg, initialDatasets)
  setPlotSmpDoc(svg, makeDefaultPlotDoc(svg))
  autoScaleSvgs.add(svg)
  wirePlotInteractions(svg)
  drawPlot(svg, initialDatasets, width, height)

  return svg
}