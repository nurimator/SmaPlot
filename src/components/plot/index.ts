export { renderAxes } from './axes.ts'
export { renderAnnotations } from './annotations.ts'
export { renderPlotCrossbar, removePlotCrossbar, setPlotCrossbar } from './crossbar.ts'
export {
  datasetIdentifier,
  extractLinearParams,
  formatLinearExpr,
  getDatasetRawMinMax,
  getProcessedDataset,
  getRawDatasetCoords,
  isSeriesLegendText,
} from './dataset.ts'
export { drawPlot, updatePlotVisual } from './drawPlot.ts'
export {
  buildGroupDragItems,
  getActiveDrag,
  initPlotDragListeners,
  setActiveGroupDrag,
  startGroupDrag,
  startPlotDrag,
} from './drag.ts'
export type { GroupDragItem } from './drag.ts'
export { getSelectableObjects, hitTestAxisArea, hitTestGraph, isInsidePlotArea } from './hitTest.ts'
export { renderLegend } from './legend.ts'
export {
  addDatasetToPlot,
  clearAllPlots,
  createDefaultPlot,
  createPlot,
  loadSmpProject,
  removeDatasetFromAllPlots,
  removeDatasetFromPlot,
  setupPlotFileDrop,
  wirePlotInteractions,
} from './lifecycle.ts'
export { isReadValueMode, isTrimmingMode, setReadValueMode, setTrimmingMode } from './modes.ts'
export {
  clearMarqueeSelection,
  clearObjectSelection,
  deleteSelectedObjects,
  getExplicitSelectedPlotSvg,
  getMultiSelectedSvgs,
  getPlotSvgFromElement,
  getSelectedAnnotationIndex,
  getSelectedLegendIndex,
  getSelectedObjects,
  getSelectedPlotSvg,
  isMultiSelected,
  isObjectSelected,
  setLastSelectedPlotSvg,
  setMarqueeSelection,
  setObjectSelection,
  setSelectedAnnotationIndex,
  setSelectedLegendIndex,
  setSelectedPlotSvg,
  updateSelectionBorder,
} from './selection.ts'
export type { SelectableObject } from './selection.ts'
export { renderSeries } from './series.ts'
export {
  SMP_SCALE,
  canClearAxis,
  captureWorkspaceDigest,
  clearPlotScale,
  ensureSmpDoc,
  exportPlotToSmpDoc,
  getAllPlotSvgs,
  getPlotBaseScale,
  getPlotDatasets,
  getPlotLimits,
  getPlotSmpDoc,
  getSvgRectForSmpDoc,
  getTargetPlotSvgs,
  hasIndependentRAxis,
  hasIndependentUAxis,
  makeDefaultPlotDoc,
  setPlotBaseScale,
  setPlotSmpDoc,
  setPlotSmpMeta,
  syncDocGeometry,
} from './smpDoc.ts'
export {
  activeSvgs,
  allDatasets,
  autoScaleSvgs,
  getPlotOverlay,
  incBoxCount,
  resetBoxCount,
  svgBaseScaleMap,
  svgCrossbarMap,
  svgDataMap,
  svgOverlayMap,
  svgSmpDocMap,
  svgSmpMetaMap,
  syncPlotOverlay,
} from './state.ts'
export {
  BORDER_TOL,
  PLOT_MARGIN,
  createOverlayEl,
  createSVGElement,
  distToSeg,
  hitsRectBorder,
  snapToGridThreshold,
  starPoints,
} from './svg.ts'
export type { PlotRenderContext } from './svg.ts'
export { createSeriesIcon, createSeriesSymbol, getLineDashArray } from './symbols.ts'
export {
  applyTransDragVisual,
  clearActiveTransDrag,
  getActiveTransDrag,
  isPropertyTabMode,
  renderDatasetTransformOverlays,
  setPropertyDialogTarget,
} from './transform.ts'