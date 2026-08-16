import {
  activeSvgs,
  captureWorkspaceDigest,
  drawPlot,
  exportPlotToSmpDoc,
  getPlotBaseScale,
  getPlotDatasets,
  getSelectedObjects,
  setObjectSelection,
  setPlotBaseScale,
  svgDataMap,
  svgSmpDocMap,
  svgSmpMetaMap,
  wirePlotInteractions,
} from '../components/plot/index.ts'
import type { SelectableObject } from '../components/plot/index.ts'
import { globalDataManager } from '../components/DataManager.ts'
import type { Dataset, SmpMetadata, SmpPlotDoc } from '../types.ts'

export interface PlotSnapshot {
  left: number
  top: number
  width: number
  height: number
  smpDoc: SmpPlotDoc
  smpMeta: SmpMetadata
  baseScale: { xMin: number; xMax: number; yMin: number; yMax: number } | null
  datasets: Dataset[]
}

export interface WorkspaceSnapshot {
  plots: PlotSnapshot[]
  globalDatasets: Dataset[]
  selection: Array<{
    kind: 'plot' | 'legend' | 'annotation'
    plotIdx: number
    itemIdx?: number
    annotationIdx?: number
  }>
}

interface UndoEntry {
  snapshot: WorkspaceSnapshot
  digest: string
}

const undoStack: UndoEntry[] = []
const redoStack: UndoEntry[] = []
const MAX_STACK = 50

const undoStateListeners = new Set<() => void>()

export function subscribeUndoState(cb: () => void): () => void {
  undoStateListeners.add(cb)
  return () => {
    undoStateListeners.delete(cb)
  }
}

function notifyUndoState(): void {
  undoStateListeners.forEach((cb) => cb())
}

let isApplyingState = false

const clone = <T>(v: T): T => structuredClone(v)

export function captureWorkspaceSnapshot(): WorkspaceSnapshot {
  const plots: PlotSnapshot[] = activeSvgs.map((svg: SVGSVGElement) => {
    const left = parseFloat(svg.style.left) || 0
    const top = parseFloat(svg.style.top) || 0
    const width = parseFloat(svg.style.width) || 400
    const height = parseFloat(svg.style.height) || 300
    const smpDoc = exportPlotToSmpDoc(svg, svgSmpDocMap.get(svg)?.name || 'PLOT.SMP')
    const smpMeta: SmpMetadata = svgSmpMetaMap.get(svg) || { docs: [] }
    const baseScale = getPlotBaseScale(svg)
    const datasets = getPlotDatasets(svg) || []

    return {
      left,
      top,
      width,
      height,
      smpDoc: clone(smpDoc),
      smpMeta: clone(smpMeta),
      baseScale: baseScale ? { ...baseScale } : null,
      datasets: clone(datasets),
    }
  })

  const globalDatasets = clone(globalDataManager.getDatasets())
  const rawSel = getSelectedObjects()
  const selection = rawSel.map((o) => {
    const plotIdx = activeSvgs.indexOf(o.svg)
    return {
      kind: o.kind,
      plotIdx,
      itemIdx: o.itemIdx,
      annotationIdx: o.annotationIdx,
    }
  })

  return { plots, globalDatasets, selection }
}

// Snapshot is only pushed when the digest differs from the top of the stack, so
// no-op interactions (e.g. a handle click without movement) don't create phantom
// undo steps. Keep captureWorkspaceDigest in plot/smpDoc.ts in sync when adding mutators.
export function pushUndoState(): void {
  if (isApplyingState) return
  const digest = captureWorkspaceDigest()
  if (undoStack.length > 0 && undoStack[undoStack.length - 1].digest === digest) return
  undoStack.push({ snapshot: captureWorkspaceSnapshot(), digest })
  if (undoStack.length > MAX_STACK) undoStack.shift()
  redoStack.length = 0
  notifyUndoState()
}

export function applyWorkspaceSnapshot(graphArea: HTMLElement, snapshot: WorkspaceSnapshot): void {
  isApplyingState = true
  try {
    // Remove extra SVG elements if snapshot has fewer plots
    while (activeSvgs.length > snapshot.plots.length) {
      const svg = activeSvgs.pop()
      if (svg) {
        svg.remove()
        svgSmpDocMap.delete(svg)
        svgSmpMetaMap.delete(svg)
        svgDataMap.delete(svg)
      }
    }

    // Clear existing HTML overlays
    graphArea.querySelectorAll('.plot-overlay').forEach((el) => el.remove())

    // Update or create plot SVGs
    snapshot.plots.forEach((pSnap, idx) => {
      let svg = activeSvgs[idx]
      if (!svg) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.setAttribute('class', 'plot-svg')
        graphArea.appendChild(svg)
        activeSvgs[idx] = svg
        wirePlotInteractions(svg)
      }
      svg.style.left = `${pSnap.left}px`
      svg.style.top = `${pSnap.top}px`
      svg.style.width = `${pSnap.width}px`
      svg.style.height = `${pSnap.height}px`

      const clonedDoc: SmpPlotDoc = clone(pSnap.smpDoc)
      const clonedMeta: SmpMetadata = clone(pSnap.smpMeta)
      const clonedDatasets: Dataset[] = clone(pSnap.datasets)

      svgSmpDocMap.set(svg, clonedDoc)
      svgSmpMetaMap.set(svg, clonedMeta)
      svgDataMap.set(svg, clonedDatasets)
      setPlotBaseScale(svg, pSnap.baseScale ? { ...pSnap.baseScale } : null)

      drawPlot(svg, clonedDatasets, pSnap.width, pSnap.height)
    })

    // Sync global datasets
    globalDataManager.clearDatasets()
    snapshot.globalDatasets.forEach((d) => globalDataManager.addDataset(clone(d)))

    // Restore object selection
    const restoredSel: SelectableObject[] = []
    snapshot.selection.forEach((s) => {
      const svg = activeSvgs[s.plotIdx]
      if (svg) {
        restoredSel.push({
          kind: s.kind,
          svg,
          itemIdx: s.itemIdx,
          annotationIdx: s.annotationIdx,
        })
      }
    })
    setObjectSelection(restoredSel)
  } finally {
    isApplyingState = false
  }
}

export function undo(graphArea: HTMLElement): boolean {
  if (undoStack.length <= 1) return false
  const current = undoStack.pop()!
  redoStack.push(current)
  const previous = undoStack[undoStack.length - 1]
  applyWorkspaceSnapshot(graphArea, previous.snapshot)
  notifyUndoState()
  return true
}

export function redo(graphArea: HTMLElement): boolean {
  if (redoStack.length === 0) return false
  const next = redoStack.pop()!
  undoStack.push(next)
  applyWorkspaceSnapshot(graphArea, next.snapshot)
  notifyUndoState()
  return true
}

export function canUndo(): boolean {
  return undoStack.length > 1
}

export function canRedo(): boolean {
  return redoStack.length > 0
}
