import './style.css'
import { initTitlebar } from './components/Titlebar.ts'
import { initMenubar, closeAllMenuDropdowns } from './components/Menubar.ts'
import { initAppShortcuts, registerShortcut } from './components/shortcut.ts'
import { bindActionButtons, initToolbar } from './components/Toolbar.ts'
import { initContextMenu, hideContextMenu, showContextMenu } from './components/ContextMenu.ts'
import { initMarqueeExport } from './components/MarqueeExport.ts'
import { initMarqueeSelect } from './components/MarqueeSelect.ts'
import { initTrimMode } from './components/TrimMode.ts'
import {
  addDatasetToPlot,
  clearAllPlots,
  clearPlotScale,
  createDefaultPlot,
  deleteSelectedObjects,
  exportPlotToSmpDoc,
  getActiveDrag,
  getAllPlotSvgs,
  getPlotDatasets,
  getPlotSvgFromElement,
  datasetIdentifier,
  datasetMatchesIdentifier,
  getSelectedPlotSvg,
  hitTestGraph,
  hitTestAxisArea,
  isInsidePlotArea,
  initPlotDragListeners,
  initSelectionLayer,
  isPropertyTabMode,
  isReadValueMode,
  loadSmpProject,
  removeDatasetFromPlot,
  setObjectSelection,
  setSelectedPlotSvg,
  setSelectedLegendIndex,
  setSelectedAnnotationIndex,
  getPlotSmpDoc,
  updatePlotVisual,
  setTrimmingMode,
  captureWorkspaceDigest,
  setPlotFileDropHandler,
} from './components/plot/index.ts'
import { canRedo, canUndo, pushUndoState, redo, subscribeUndoState, undo } from './utils/undoManager.ts'
import { initPropertyDialog, hidePropertyDialog, showPropertyDialog } from './components/PropertyDialog.ts'
import { initConfirmDialog, hideConfirmDialog, showConfirmDialog } from './components/ConfirmDialog.ts'
import { initSaveAsDialog, hideSaveAsDialog, showSaveAsDialog } from './components/SaveAsDialog.ts'
import {
  globalDataManager,
  hideDataManagerDialog,
  initDataManagerDialog,
  showDataManagerDialog,
  showDataManagerForLegend,
} from './components/DataManager.ts'
import { initAxisDialog, hideAxisDialog, showAxisDialog } from './components/AxisDialog.ts'
import { initTitleDialog, hideTitleDialog, showTitleDialog } from './components/TitleDialog.ts'
import type { TitlePreset } from './components/TitleDialog.ts'
import type { Dataset, SmpPlotDoc } from './types.ts'
import { initArrowDialog, hideArrowDialog, showArrowDialog } from './components/ArrowDialog.ts'
import { hideConstantDialog, initConstantDialog, showConstantDialog } from './components/ConstantDialog.ts'
import { hideAnalyzeDialog, initAnalyzeDialog, showAnalyzeDialog } from './components/AnalyzeDialog.ts'
import type { AnalyzeTab } from './components/AnalyzeDialog.ts'
import {
  copyAnalyzeResults,
  resolveAnalyzeSvg,
  runAnalyzeClear,
  runAnalyzeRepeat,
} from './components/AnalyzeOps.ts'
import { initRectangleDialog, hideRectangleDialog, showRectangleDialog } from './components/RectangleDialog.ts'
import { initCustomSelects } from './components/CustomSelect.ts'
import { initFrameDialog, showFrameDialog } from './components/FrameDialog.ts'
import { hideAboutDialog, initAboutDialog, showAboutDialog } from './components/AboutDialog.ts'
import { initColorPickerDialog, hideColorPickerDialog } from './components/ColorPickerDialog.ts'
import { hideReadValueDialog, initReadValueDialog, isReadValueOpen, showReadValueDialog } from './components/ReadValueDialog.ts'
import { parseDatasetContent } from './utils/dataset.ts'
import { downloadFile, encodeWindows1252, serializeSmpProject } from './utils/smpExporter.ts'
import {
  getCurrentProjectFileName,
  isProjectDirty,
  isProjectUntitled,
  markProjectSaved,
  setCurrentProjectFileName,
  setProjectUntitled,
} from './utils/projectState.ts'
import {
  DATA_EXTENSIONS,
  PROJECT_EXTENSIONS,
  canPickFiles,
  collectDroppedFiles,
  fileExtension,
  initLaunchQueue,
  pickFilesToOpen,
  pickSaveHandle,
  readFileText,
  writeToHandle,
} from './utils/fileAccess.ts'
import type { IncomingFile } from './utils/fileAccess.ts'
import { describeSmpFeatures } from './utils/smpFeatures.ts'
import { hideNotice, initNotice, showNotice } from './components/Notice.ts'
import { ZOOM_BASE, initCanvasZoom, resetCanvasZoom, setCanvasZoom, subscribeZoom } from './utils/canvasZoom.ts'
import { addRecentFile, getRecentFiles } from './utils/recentFiles.ts'
import { initTouchGestures, wasTouchInteractionRecent } from './utils/touchGestures.ts'
import { initSheetSwipe } from './utils/sheetSwipe.ts'
import { registerSW } from 'virtual:pwa-register'

declare const __APP_VERSION__: string

const titlebarEl = document.querySelector<HTMLElement>('.titlebar')
const APP_VERSION = __APP_VERSION__
const menubarEl = document.querySelector<HTMLElement>('.menubar')!
const toolbarEl = document.querySelector<HTMLElement>('.toolbar')!
const graphAreaEl = document.querySelector<HTMLElement>('.graph-area')!
const workspaceEl = document.querySelector<HTMLElement>('.workspace') || document.body
const statusCoordsEl = document.querySelector<HTMLElement>('#statusCoordsText')!
const ctxMenuEl = document.querySelector<HTMLElement>('#ctxMenu')!
const propOverlayEl = document.querySelector<HTMLElement>('#propertyDialogOverlay')!
const dmOverlayEl = document.querySelector<HTMLElement>('#dataManagerOverlay')!
const axisOverlayEl = document.querySelector<HTMLElement>('#axisDialogOverlay')!
const titleOverlayEl = document.querySelector<HTMLElement>('#titleOverlay')!
const arrowOverlayEl = document.querySelector<HTMLElement>('#arrowOverlay')!
const constantOverlayEl = document.querySelector<HTMLElement>('#constantOverlay')!
const analyzeOverlayEl = document.querySelector<HTMLElement>('#analyzeOverlay')!
const rectOverlayEl = document.querySelector<HTMLElement>('#rectangleOverlay')!
const readValueOverlayEl = document.querySelector<HTMLElement>('#readValueOverlay')!
const colorPickerOverlayEl = document.querySelector<HTMLElement>('#colorPickerOverlay')!
const frameOverlayEl = document.querySelector<HTMLElement>('#frameOverlay')
const globalFileInput = document.querySelector<HTMLInputElement>('#globalFileInput')!
const saveAsOverlayEl = document.querySelector<HTMLElement>('#saveAsOverlay')
const aboutOverlayEl = document.querySelector<HTMLElement>('#aboutOverlay')

if (workspaceEl && graphAreaEl) {
  initCanvasZoom(workspaceEl, graphAreaEl, statusCoordsEl)
  initSelectionLayer(graphAreaEl)

  const zoomSliderEl = document.querySelector<HTMLInputElement>('.zoom-slider')
  const zoomValueEl = document.querySelector<HTMLElement>('.zoom-value')
  const zoomOutBtn = document.querySelector<HTMLButtonElement>('.zoom-btn-out')
  const zoomInBtn = document.querySelector<HTMLButtonElement>('.zoom-btn-in')
  if (zoomSliderEl && zoomValueEl) {
    const updateZoomUI = (zoom: number): void => {
      const pct = Math.round((zoom / ZOOM_BASE) * 100)
      zoomSliderEl.value = String(pct)
      zoomValueEl.textContent = `${pct}%`
    }
    subscribeZoom(updateZoomUI)
    zoomSliderEl.addEventListener('input', () => {
      setCanvasZoom((Number(zoomSliderEl.value) / 100) * ZOOM_BASE, workspaceEl, graphAreaEl, statusCoordsEl)
    })
    zoomOutBtn?.addEventListener('click', () => {
      const currentPct = Number(zoomSliderEl.value)
      const nextPct = Math.max(50, Math.min(500, Math.round((currentPct - 10) / 10) * 10))
      setCanvasZoom((nextPct / 100) * ZOOM_BASE, workspaceEl, graphAreaEl, statusCoordsEl)
    })
    zoomInBtn?.addEventListener('click', () => {
      const currentPct = Number(zoomSliderEl.value)
      const nextPct = Math.max(50, Math.min(500, Math.round((currentPct + 10) / 10) * 10))
      setCanvasZoom((nextPct / 100) * ZOOM_BASE, workspaceEl, graphAreaEl, statusCoordsEl)
    })
    zoomValueEl.addEventListener('click', () => {
      resetCanvasZoom(workspaceEl, graphAreaEl, statusCoordsEl)
    })
  }
}

if (titlebarEl) initTitlebar(titlebarEl)

const initialAppTitleEl = document.querySelector<HTMLElement>('.app-title')
if (initialAppTitleEl) initialAppTitleEl.textContent = `SmaPlot v${APP_VERSION} - Untitled`
document.title = `SmaPlot v${APP_VERSION} - Untitled`
if (titleOverlayEl) initTitleDialog(titleOverlayEl)
if (arrowOverlayEl) initArrowDialog(arrowOverlayEl)
if (constantOverlayEl) initConstantDialog(constantOverlayEl)
if (analyzeOverlayEl) initAnalyzeDialog(analyzeOverlayEl)
if (rectOverlayEl) initRectangleDialog(rectOverlayEl)
if (readValueOverlayEl) initReadValueDialog(readValueOverlayEl)
if (colorPickerOverlayEl) initColorPickerDialog(colorPickerOverlayEl)
if (frameOverlayEl) initFrameDialog(frameOverlayEl)
if (saveAsOverlayEl) initSaveAsDialog(saveAsOverlayEl)
if (aboutOverlayEl) initAboutDialog(aboutOverlayEl)

// project state
function projectIsDirty(): boolean {
  return isProjectDirty(captureWorkspaceDigest())
}

function updateProjectTitle(): void {
  const name = isProjectUntitled() ? 'Untitled' : getCurrentProjectFileName()
  const title = `SmaPlot v${APP_VERSION} - ${name}${projectIsDirty() ? ' *' : ''}`
  if (initialAppTitleEl) initialAppTitleEl.textContent = title
  document.title = title
}

function markProjectClean(): void {
  markProjectSaved(captureWorkspaceDigest())
  const statusFileEl = document.querySelector<HTMLElement>('#statusFileText')
  if (statusFileEl) statusFileEl.textContent = isProjectUntitled() ? 'Untitled' : `1:${getCurrentProjectFileName()}`
  updateProjectTitle()
}

async function confirmDiscardChanges(message: string): Promise<boolean> {
  if (!projectIsDirty()) return true
  const choice = await showConfirmDialog(message)
  if (choice === 'cancel') return false
  if (choice === 'save') return handleSaveProject()
  return true
}

// save
function buildProjectContent(): string | null {
  const svgs = getAllPlotSvgs(graphAreaEl)
  if (svgs.length === 0) {
    alert('No plots available in workspace to export.')
    return null
  }
  const docs = svgs.map((svg, idx) => exportPlotToSmpDoc(svg, `PLOT${idx + 1}.SMP`))
  return serializeSmpProject(docs)
}

function finishSave(fileName: string, content: string): void {
  setCurrentProjectFileName(fileName)
  addRecentFile(fileName, content)
  updateRecentFilesMenu()
  markProjectClean()
}

async function handleSaveProject(customFileName?: string): Promise<boolean> {
  if (!customFileName && isProjectUntitled()) return handleSaveAsProject()
  const content = buildProjectContent()
  if (content === null) return false

  const fileName = customFileName || getCurrentProjectFileName()
  downloadFile(content, fileName)
  finishSave(fileName, content)
  return true
}

async function handleSaveAsProject(): Promise<boolean> {
  const content = buildProjectContent()
  if (content === null) return false
  const suggestedName = getCurrentProjectFileName()

  const handle = await pickSaveHandle(suggestedName)
  if (handle === null) return false
  if (handle) {
    if (await writeToHandle(handle, encodeWindows1252(content))) {
      finishSave(handle.name, content)
      return true
    }
    showNotice(`Could not write to ${handle.name}`, 'Enter a file name to download a copy instead.')
  }

  const customName = await showSaveAsDialog(suggestedName)
  if (!customName) return false
  return handleSaveProject(customName)
}

async function handleNewProject(): Promise<void> {
  const proceed = await confirmDiscardChanges(
    'The current project has unsaved changes. Do you want to save it before creating a new project?'
  )
  if (!proceed) return

  hideNotice()
  setCurrentProjectFileName('untitled.SMP')
  setProjectUntitled(true)
  clearAllPlots(graphAreaEl)
  await createDefaultPlot(graphAreaEl)
  pushUndoState()
  markProjectClean()
}

// open
function reportProjectFeatures(fileName: string): void {
  const docs = getAllPlotSvgs(graphAreaEl)
    .map((svg) => getPlotSmpDoc(svg))
    .filter((doc): doc is SmpPlotDoc => !!doc)
  const { preserved, unreadable } = describeSmpFeatures(docs)
  if (preserved.length === 0 && unreadable.length === 0) return
  const parts: string[] = []
  if (preserved.length > 0) parts.push(`Not displayed yet but kept when saving: ${preserved.join(', ')}.`)
  if (unreadable.length > 0) parts.push(`Not supported and may be misread or lost: ${unreadable.join(', ')}.`)
  showNotice(`${fileName} uses features SmaPlot cannot show yet`, parts.join(' '), 15000)
}

async function openProjectContent(content: string, fileName: string): Promise<void> {
  const proceed = await confirmDiscardChanges(
    `The current project has unsaved changes. Do you want to save it before opening ${fileName}?`
  )
  if (!proceed) return
  hideNotice()
  const loaded = await loadSmpProject(graphAreaEl, content, fileName)
  if (!loaded) {
    showNotice(`Could not open ${fileName}`, 'The file does not look like an SMP project.')
    return
  }
  updateRecentFilesMenu()
  pushUndoState()
  markProjectClean()
  reportProjectFeatures(fileName)
}

async function openDataFile(entry: IncomingFile, target?: SVGSVGElement): Promise<void> {
  const svg = target || getSelectedPlotSvg() || (await createDefaultPlot(graphAreaEl))
  const content = await readFileText(entry.file)
  addDatasetToPlot(svg, parseDatasetContent(content, entry.file.name))
  pushUndoState()
}

async function handleIncomingFiles(entries: IncomingFile[], target?: SVGSVGElement): Promise<void> {
  const isProject = (entry: IncomingFile): boolean => PROJECT_EXTENSIONS.includes(fileExtension(entry.file.name))
  const isData = (entry: IncomingFile): boolean =>
    DATA_EXTENSIONS.includes(fileExtension(entry.file.name)) || entry.file.type.startsWith('text/')
  const projects = entries.filter(isProject)
  const data = entries.filter((entry) => !isProject(entry) && isData(entry))
  const skipped = entries.filter((entry) => !isProject(entry) && !isData(entry))

  if (projects.length > 0) {
    const [first] = projects
    await openProjectContent(await readFileText(first.file), first.file.name)
    if (projects.length > 1) {
      showNotice(`Opened ${first.file.name} only`, 'A project replaces the workspace, so the other project files were skipped.')
    }
  }
  for (const entry of data) await openDataFile(entry, target)
  if (skipped.length > 0) {
    showNotice('Unsupported file type', skipped.map((entry) => entry.file.name).join(', '))
  }
}

async function openFiles(): Promise<void> {
  if (canPickFiles()) {
    const picked = await pickFilesToOpen()
    if (picked !== null) {
      if (picked.length > 0) await handleIncomingFiles(picked)
      return
    }
  }
  globalFileInput?.click()
}

async function handleInsertLegend(): Promise<void> {
  const svg = getSelectedPlotSvg() || getAllPlotSvgs(graphAreaEl)[0]
  if (!svg) {
    alert('No plot available in workspace.')
    return
  }

  showDataManagerForLegend(dmOverlayEl, (identifiers) => {
    const plotDatasets = getPlotDatasets(svg)
    const codes = identifiers
      .map((id) => {
        const index = plotDatasets.findIndex((d) => datasetMatchesIdentifier(d, id))
        const code = String(index + 1).padStart(2, '0')
        return index >= 0 ? `%${code}E%${code}N` : null
      })
      .filter((c): c is string => c !== null)

    if (codes.length === 0) {
      alert('The selected data is not part of the active plot.')
      return
    }

    const legendCode = codes.join('\n')
    showTitleDialog(titleOverlayEl, -1, svg, legendCode)
  })
}

function openAxisTitleDialog(axis: 'x' | 'y' | 'u' | 'r'): void {
  const svg = getSelectedPlotSvg() || getAllPlotSvgs(graphAreaEl)[0]
  if (!svg) {
    alert('No plot available in workspace.')
    return
  }
  const presets: Record<'x' | 'y' | 'u' | 'r', TitlePreset> = {
    x: { legendType: 4, rotation: 0, posX: 0, posY: 115, fontSize: 24 },
    y: { legendType: 5, rotation: -90, posX: -12, posY: 100, fontSize: 24 },
    u: { legendType: 6, rotation: 0, posX: 0, posY: -15, fontSize: 24 },
    r: { legendType: 7, rotation: -90, posX: 115, posY: 100, fontSize: 24 },
  }
  showTitleDialog(titleOverlayEl, -1, svg, '', presets[axis])
}

let trimmingActive = false

const AUTO_UPDATE_KEY = 'smaplot:auto-update'

const loadAutoUpdatePref = (): boolean => {
  try {
    return localStorage.getItem(AUTO_UPDATE_KEY) !== 'false'
  } catch {
    return true
  }
}

let autoUpdateEnabled = loadAutoUpdatePref()

const saveAutoUpdatePref = (on: boolean): void => {
  try {
    localStorage.setItem(AUTO_UPDATE_KEY, on ? 'true' : 'false')
  } catch {}
}

const updateAutoUpdateUI = (): void => {
  document.querySelectorAll<HTMLElement>('[data-action="auto_update"]').forEach((el) => {
    el.textContent = `Auto Update: ${autoUpdateEnabled ? 'ON' : 'OFF'}`
  })
}

updateAutoUpdateUI()

const updateTrimUI = (active: boolean) => {
  document.querySelectorAll<HTMLElement>('[data-action="trimming"]').forEach((el) => {
    el.classList.toggle('active', active)
  })
  graphAreaEl.classList.toggle('trimming-mode', active)
}

const exitTrimMode = () => {
  if (!trimmingActive) return
  trimmingActive = false
  setTrimmingMode(false)
  updateTrimUI(false)
}

const toggleTrimMode = () => {
  trimmingActive = !trimmingActive
  setTrimmingMode(trimmingActive)
  updateTrimUI(trimmingActive)
}

function updateRecentFilesMenu(): void {
  const section = document.querySelector<HTMLElement>('#recentFilesSection')
  const list = document.querySelector<HTMLElement>('#recentFilesList')
  if (!section || !list) return
  list.replaceChildren()
  const recents = getRecentFiles()
  if (recents.length === 0) {
    section.style.display = 'none'
    return
  }
  section.style.display = ''
  recents.slice(0, 5).forEach((recent, i) => {
    const item = document.createElement('div')
    item.className = 'dropdown-item'
    item.dataset.action = `recent_${i}`
    item.textContent = `${i + 1}:${recent.name}`
    list.appendChild(item)
  })
}

function handleReadValue(): void {
  const svg = getSelectedPlotSvg() || getAllPlotSvgs(graphAreaEl)[0]
  if (!svg) {
    alert('No plot available in workspace.')
    return
  }
  const datasets = getPlotDatasets(svg)
  if (datasets.length === 1) {
    showReadValueDialog(readValueOverlayEl, svg, datasets[0])
  } else if (datasets.length > 1) {
    showDataManagerDialog(dmOverlayEl, (fileName) => {
      const chosen = datasets.find((d) => datasetMatchesIdentifier(d, fileName)) || datasets[0]
      showReadValueDialog(readValueOverlayEl, svg, chosen)
    })
  } else {
    if (globalDataManager.getDatasets().length > 0) {
      showDataManagerDialog(dmOverlayEl, (fileName) => {
        const globalDs = globalDataManager
          .getDatasets()
          .find((d) => datasetMatchesIdentifier(d, fileName))
        if (globalDs) {
          addDatasetToPlot(svg, globalDs)
          showReadValueDialog(readValueOverlayEl, svg, globalDs)
        }
      })
    } else {
      alert('No data loaded in selected plot.')
    }
  }
}

if (menubarEl) {
  initMenubar(menubarEl, async (action) => {
    if (action === 'undo') {
      undo(graphAreaEl)
    } else if (action === 'redo') {
      redo(graphAreaEl)
    } else if (action === 'delete') {
      if (deleteSelectedObjects()) pushUndoState()
    } else if (action === 'delete_all') {
      clearAllPlots(graphAreaEl)
      pushUndoState()
    } else if (action === 'data' || action === 'data_manager') {
      showDataManagerDialog(dmOverlayEl)
    } else if (action === 'clear_all_scale' || action === 'clear_scale_all') {
      clearPlotScale('all')
      pushUndoState()
    } else if (action === 'clear_scale_x') {
      clearPlotScale('x')
      pushUndoState()
    } else if (action === 'clear_scale_y') {
      clearPlotScale('y')
      pushUndoState()
    } else if (action === 'clear_scale_u') {
      clearPlotScale('u')
      pushUndoState()
    } else if (action === 'clear_scale_r') {
      clearPlotScale('r')
      pushUndoState()
    } else if (action === 'open' || action === 'load' || action === 'open_data_file') {
      await openFiles()
    } else if (action === 'save') {
      await handleSaveProject()
    } else if (action === 'save_as' || action === 'export_smp') {
      await handleSaveAsProject()
    } else if (action === 'x_axis_title') {
      openAxisTitleDialog('x')
    } else if (action === 'y_axis_title') {
      openAxisTitleDialog('y')
    } else if (action === 'u_axis_title') {
      openAxisTitleDialog('u')
    } else if (action === 'r_axis_title') {
      openAxisTitleDialog('r')
    } else if (action === 'strings') {
      showTitleDialog(titleOverlayEl)
    } else if (action === 'new') {
      await handleNewProject()
    } else if (action === 'new_plot') {
      await createDefaultPlot(graphAreaEl)
      pushUndoState()
    } else if (action === 'insert_legend') {
      await handleInsertLegend()
    } else if (action === 'x_axis') {
      showAxisDialog(axisOverlayEl, 'x')
    } else if (action === 'y_axis') {
      showAxisDialog(axisOverlayEl, 'y')
    } else if (action === 'u_axis') {
      showAxisDialog(axisOverlayEl, 'u')
    } else if (action === 'r_axis') {
      showAxisDialog(axisOverlayEl, 'r')
    } else if (action === 'trimming') {
      toggleTrimMode()
    } else if (action === 'frame') {
      if (frameOverlayEl) showFrameDialog(frameOverlayEl)
    } else if (action === 'arrow') {
      showArrowDialog(arrowOverlayEl)
    } else if (action === 'constant') {
      showConstantDialog(constantOverlayEl)
    } else if (
      action === 'ls_poly' || action === 'ls_exp' || action === 'ls_log' ||
      action === 'ls_power' || action === 'ls' || action === 'least_square_fit'
    ) {
      const tab: AnalyzeTab = action === 'least_square_fit' ? 'general' : 'fit'
      showAnalyzeDialog(analyzeOverlayEl, tab)
      if (action === 'ls_exp' || action === 'ls_log' || action === 'ls_power' || action === 'ls_poly') {
        const modelSel = document.querySelector<HTMLSelectElement>('#analyzeFitModel')
        if (modelSel) {
          if (action === 'ls_exp') modelSel.value = 'exp'
          else if (action === 'ls_log') modelSel.value = 'log'
          else if (action === 'ls_power') modelSel.value = 'power'
          else modelSel.value = 'poly'
        }
      }
    } else if (action === 'ls_general') {
      showAnalyzeDialog(analyzeOverlayEl, 'general')
    } else if (action === 'ls_eval') {
      if (isReadValueOpen() && readValueOverlayEl) {
        hideReadValueDialog(readValueOverlayEl)
      } else {
        handleReadValue()
      }
    } else if (
      action === 'spline_cubic' || action === 'spline_param' ||
      action === 'spline_closed' || action === 'spline'
    ) {
      showAnalyzeDialog(analyzeOverlayEl, 'spline')
      const modeSel = document.querySelector<HTMLSelectElement>('#analyzeSplineMode')
      if (modeSel) {
        if (action === 'spline_param') modeSel.value = 'parametric'
        else if (action === 'spline_closed') modeSel.value = 'parametric_closed'
        else modeSel.value = 'cubic'
      }
    } else if (
      action === 'ext_gauss' || action === 'ext_lorentz' || action === 'ext_peak' ||
      action === 'ext_fft' || action === 'ext_ifft' || action === 'extension'
    ) {
      if (action === 'ext_ifft') {
        alert('IFFT reconstructs the signal from its spectrum; use FFT result with Copy, then Draw Function to re-import.')
      }
      showAnalyzeDialog(analyzeOverlayEl, 'special')
      const kindSel = document.querySelector<HTMLSelectElement>('#analyzeSpecialKind')
      if (kindSel) {
        if (action === 'ext_gauss') kindSel.value = 'gauss'
        else if (action === 'ext_lorentz') kindSel.value = 'lorentz'
        else if (action === 'ext_peak') kindSel.value = 'peak'
        else if (action === 'ext_fft' || action === 'ext_ifft') kindSel.value = 'fft'
      }
    } else if (action === 'analyze_repeat' || action === 'one_more') {
      const svg = resolveAnalyzeSvg()
      if (!svg) {
        alert('No plot available.')
      } else {
        const res = runAnalyzeRepeat(svg)
        if (res === null) showAnalyzeDialog(analyzeOverlayEl, 'fit')
      }
    } else if (action === 'analyze_clear') {
      const svg = resolveAnalyzeSvg()
      if (svg) {
        const n = runAnalyzeClear(svg)
        if (n === 0) alert('No analyze results to clear.')
      } else {
        alert('No plot available.')
      }
    } else if (action === 'function_a') {
      showAnalyzeDialog(analyzeOverlayEl, 'function')
    } else if (action === 'setup_constants') {
      showConstantDialog(constantOverlayEl)
    } else if (action === 'copy_clipboard') {
      const svg = resolveAnalyzeSvg()
      if (svg) {
        void copyAnalyzeResults(svg).then((text) => {
          alert(`Copied ${text.split('\n').length} line(s) to clipboard.`)
        })
      } else {
        alert('No plot available.')
      }
    } else if (action === 'analyze_result') {
      showAnalyzeDialog(analyzeOverlayEl, 'result')
    } else if (action === 'rectangle') {
      showRectangleDialog(rectOverlayEl)
    } else if (action === 'read_value' || action === 'read-value') {
      if (isReadValueOpen() && readValueOverlayEl) {
        hideReadValueDialog(readValueOverlayEl)
      } else {
        handleReadValue()
      }
    } else if (action.startsWith('recent_')) {
      const index = Number(action.slice('recent_'.length))
      const recent = getRecentFiles()[index]
      if (!recent) return
      if (!recent.content) {
        alert(`The local copy of "${recent.name}" is not available.`)
        return
      }
      await openProjectContent(recent.content, recent.name)
    } else if (action === 'property') {
      showPropertyDialog(propOverlayEl)
    } else if (action === 'about') {
      showAboutDialog()
    } else if (action === 'auto_update') {
      autoUpdateEnabled = !autoUpdateEnabled
      updateAutoUpdateUI()
      saveAutoUpdatePref(autoUpdateEnabled)
      if (autoUpdateEnabled) {
        if (refreshPending) showPwaToast()
        if (swRegistration) void swRegistration.update().catch(() => {})
      } else {
        hidePwaToast()
      }
    } else if (action === 'install') {
      void triggerInstall()
    }
  })
}

async function handleToolbarAction(action: string, title: string): Promise<void> {
  if (action === 'trimming') {
    toggleTrimMode()
    return
  }

  exitTrimMode()

  if (action === 'undo') {
    undo(graphAreaEl)
  } else if (action === 'redo') {
    redo(graphAreaEl)
  } else if (action === 'delete') {
    if (deleteSelectedObjects()) pushUndoState()
  } else if (action === 'new') {
    await handleNewProject()
    } else if (action === 'new_plot' || title === 'New Plot') {
      await createDefaultPlot(graphAreaEl)
      pushUndoState()
  } else if (action === 'open' || title === 'Open') {
    await openFiles()
  } else if (action === 'save' || title === 'Save') {
    await handleSaveProject()
  } else if (action === 'text' || title === 'Text') {
    showTitleDialog(titleOverlayEl)
  } else if (action === 'rectangle' || title === 'Rectangle') {
    showRectangleDialog(rectOverlayEl)
  } else if (action === 'arrow' || title === 'Arrow') {
    showArrowDialog(arrowOverlayEl)
  } else if (action === 'constant' || title === 'Constant') {
    showConstantDialog(constantOverlayEl)
  } else if (action === 'chart' || title === 'Chart') {
    showPropertyDialog(propOverlayEl)
  } else if (action === 'read-value' || action === 'read_value' || title === 'Read Value') {
    if (isReadValueOpen() && readValueOverlayEl) {
      hideReadValueDialog(readValueOverlayEl)
    } else {
      handleReadValue()
    }
  }
}

if (toolbarEl) {
  initToolbar(toolbarEl, handleToolbarAction)
}

if (globalFileInput) {
  globalFileInput.addEventListener('change', () => {
    const files = Array.from(globalFileInput.files || [])
    globalFileInput.value = ''
    if (files.length > 0) void handleIncomingFiles(files.map((file) => ({ file })))
  })
}

// Right-click context menu actions:
if (ctxMenuEl) {
  initContextMenu(ctxMenuEl, (actionKey) => {
    if (actionKey === 'delete') {
      if (deleteSelectedObjects()) pushUndoState()
    } else if (actionKey === 'property' || actionKey.toLowerCase().includes('date')) {
      showDataManagerDialog(dmOverlayEl)
    } else if (actionKey === 'xaxis') {
      showAxisDialog(axisOverlayEl, 'x')
    } else if (actionKey === 'yaxis') {
      showAxisDialog(axisOverlayEl, 'y')
    } else if (actionKey === 'uaxis') {
      showAxisDialog(axisOverlayEl, 'u')
    } else if (actionKey === 'raxis') {
      showAxisDialog(axisOverlayEl, 'r')
    } else if (actionKey === 'frame') {
      if (frameOverlayEl) showFrameDialog(frameOverlayEl)
    } else if (actionKey === 'string') {
      showTitleDialog(titleOverlayEl)
    } else if (actionKey === 'arrow') {
      showArrowDialog(arrowOverlayEl)
    } else if (actionKey === 'rectangle') {
      showRectangleDialog(rectOverlayEl)
    }
  })
}

graphAreaEl.addEventListener('mousedown', (e) => {
  if (isReadValueMode() || isPropertyTabMode()) return
  const target = e.target as HTMLElement
  if (target.closest('.plot-svg, .plot-overlay')) return
  setObjectSelection([])
})

let lastPlotClickTime = 0
let lastPlotClickSvg: SVGSVGElement | null = null
graphAreaEl.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return
  if (wasTouchInteractionRecent()) return
  if (isReadValueMode() || isPropertyTabMode()) return
  const target = e.target as HTMLElement
  if (target.closest('[data-dir]')) return
  const svg = target.closest('.plot-svg') as SVGSVGElement | null
  if (!svg) return
  const now = Date.now()
  if (now - lastPlotClickTime < 350 && lastPlotClickSvg === svg) {
    lastPlotClickTime = 0
    lastPlotClickSvg = null
    e.stopPropagation()
    e.preventDefault()
    setSelectedPlotSvg(svg)

    const axisDir = hitTestAxisArea(svg, e.clientX, e.clientY)
    if (axisDir) {
      showAxisDialog(axisOverlayEl, axisDir, svg)
      return
    }

    const hitDataset = hitTestGraph(svg, e.clientX, e.clientY)
    if (hitDataset) {
      showPropertyDialog(propOverlayEl, hitDataset, svg)
    } else if (isInsidePlotArea(svg, e.clientX, e.clientY)) {
      showDataManagerDialog(dmOverlayEl)
    }
    return
  }
  lastPlotClickTime = now
  lastPlotClickSvg = svg
})

// Initialize Plot drag & resize listeners
initPlotDragListeners(pushUndoState)

initMarqueeSelect(graphAreaEl)

initTrimMode(graphAreaEl, () => pushUndoState(), exitTrimMode)

const marqueeCtxMenuEl = document.querySelector<HTMLElement>('#marqueeCtxMenu')
const statusFileTextEl = document.querySelector<HTMLElement>('#statusFileText')
if (marqueeCtxMenuEl) {
  initMarqueeExport(graphAreaEl, marqueeCtxMenuEl, statusFileTextEl)
}

if (marqueeCtxMenuEl) {
  initTouchGestures({
    workspaceEl,
    graphAreaEl,
    ctxMenuEl,
    marqueeCtxMenuEl,
    onDoubleTapAxis: (axis, svg) => showAxisDialog(axisOverlayEl, axis, svg),
    onDoubleTapGraph: (dataset, svg) => showPropertyDialog(propOverlayEl, dataset as string | Dataset, svg),
    onDoubleTapPlot: () => showDataManagerDialog(dmOverlayEl),
    onDoubleTapLegend: (svg, itemIdx) => {
      setSelectedPlotSvg(svg)
      setSelectedLegendIndex(itemIdx)
      setSelectedAnnotationIndex(-1)
      updatePlotVisual(svg)
      showTitleDialog(titleOverlayEl, itemIdx, svg)
    },
    onDoubleTapAnnotation: (svg, annotationIdx) => {
      setSelectedPlotSvg(svg)
      setSelectedAnnotationIndex(annotationIdx)
      setSelectedLegendIndex(-1)
      updatePlotVisual(svg)
      const smpDoc = getPlotSmpDoc(svg)
      const aLine = smpDoc?.annotationLines?.[annotationIdx]
      if (aLine && (aLine.shape === 'rectangle' || aLine.shape === 'rect')) {
        showRectangleDialog(rectOverlayEl, annotationIdx, svg)
      } else if (aLine) {
        showArrowDialog(arrowOverlayEl, annotationIdx, svg)
      }
    },
  })
}

if (propOverlayEl) initPropertyDialog(propOverlayEl)
if (axisOverlayEl) initAxisDialog(axisOverlayEl)
const confirmOverlayEl = document.querySelector<HTMLElement>('#confirmOverlay')
if (confirmOverlayEl) initConfirmDialog(confirmOverlayEl)

initCustomSelects()

if (dmOverlayEl) {
  const getDataManagerDatasets = (): Dataset[] => {
    // A multi-frame .SMP is one project, so list the data of every frame, the selected frame
    // first. Scoping to the selected frame alone showed just that frame's single series.
    const selected = getSelectedPlotSvg()
    const all = getAllPlotSvgs(graphAreaEl)
    const ordered = selected ? [selected, ...all.filter((s) => s !== selected)] : all

    const seen = new Set<string>()
    const rows: Dataset[] = []
    for (const svg of ordered) {
      for (const ds of getPlotDatasets(svg)) {
        const key = datasetIdentifier(ds)
        if (seen.has(key)) continue
        seen.add(key)
        rows.push(ds)
      }
    }
    if (rows.length > 0) return rows
    return globalDataManager.getDatasets()
  }

  initDataManagerDialog(
    dmOverlayEl,
    getDataManagerDatasets,
    (selectedFileName) => {
      showPropertyDialog(propOverlayEl, selectedFileName)
    },
    (identifier) => {
      const svg = getSelectedPlotSvg()
      if (svg) removeDatasetFromPlot(svg, identifier)
    }
  )
}

function updateUndoRedoButtons(): void {
  const undoDisabled = !canUndo()
  const redoDisabled = !canRedo()
  document
    .querySelectorAll<HTMLElement>('.menu-dropdown .dropdown-item[data-action="undo"], .toolbar-btn[data-action="undo"]')
    .forEach((el) => {
      el.classList.toggle('disabled', undoDisabled)
      if (undoDisabled) el.setAttribute('aria-disabled', 'true')
      else el.removeAttribute('aria-disabled')
    })
  document
    .querySelectorAll<HTMLElement>('.menu-dropdown .dropdown-item[data-action="redo"], .toolbar-btn[data-action="redo"]')
    .forEach((el) => {
      el.classList.toggle('disabled', redoDisabled)
      if (redoDisabled) el.setAttribute('aria-disabled', 'true')
      else el.removeAttribute('aria-disabled')
    })
}

subscribeUndoState(updateUndoRedoButtons)
subscribeUndoState(updateProjectTitle)
updateUndoRedoButtons()

const noticeEl = document.querySelector<HTMLElement>('#appNotice')
if (noticeEl) initNotice(noticeEl)

async function initApp() {
  await handleNewProject()
  updateRecentFilesMenu()
  pushUndoState()
}

const appReady = initApp()

initLaunchQueue((entries) => {
  void appReady.then(() => handleIncomingFiles(entries))
})

const pwaToast = document.querySelector<HTMLElement>('#pwaUpdateToast')
const pwaUpdateBtn = document.querySelector<HTMLElement>('#pwaUpdateBtn')
const pwaDismissBtn = document.querySelector<HTMLElement>('#pwaDismissBtn')

const showPwaToast = (): void => {
  if (pwaToast) pwaToast.style.display = 'flex'
}

const hidePwaToast = (): void => {
  if (pwaToast) pwaToast.style.display = 'none'
}

let swRegistration: ServiceWorkerRegistration | null = null
let refreshPending = false

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    refreshPending = true
    if (autoUpdateEnabled) showPwaToast()
  },
  onOfflineReady() {
    const statusFileEl = document.querySelector<HTMLElement>('#statusFileText')
    if (statusFileEl && statusFileEl.textContent === 'No data') {
      statusFileEl.textContent = 'Ready for offline use'
      setTimeout(() => {
        statusFileEl.textContent = 'No data'
      }, 4000)
    }
  },
  onRegisteredSW(_swUrl, registration) {
    if (registration) swRegistration = registration
  },
})

pwaUpdateBtn?.addEventListener('click', () => {
  hidePwaToast()
  updateSW()
})
pwaDismissBtn?.addEventListener('click', hidePwaToast)

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredInstallPrompt: InstallPromptEvent | null = null
const installMenuItem = document.querySelector<HTMLElement>('.install-item')

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferredInstallPrompt = e as InstallPromptEvent
  installMenuItem?.classList.add('is-visible')
})

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null
  installMenuItem?.classList.remove('is-visible')
})

const triggerInstall = async (): Promise<void> => {
  const promptEvent = deferredInstallPrompt
  if (!promptEvent) return
  promptEvent.prompt()
  await promptEvent.userChoice
  deferredInstallPrompt = null
  installMenuItem?.classList.remove('is-visible')
}

window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', (e) => e.preventDefault())

workspaceEl.addEventListener('dragover', (e: DragEvent) => {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
})

workspaceEl.addEventListener('drop', (e: DragEvent) => {
  e.preventDefault()
  void collectDroppedFiles(e.dataTransfer).then((entries) => {
    if (entries.length > 0) return handleIncomingFiles(entries)
  })
})

setPlotFileDropHandler((e, svg) => {
  void collectDroppedFiles(e.dataTransfer).then((entries) => {
    if (entries.length > 0) return handleIncomingFiles(entries, svg)
  })
})

window.addEventListener('beforeunload', (e) => {
  if (!projectIsDirty()) return
  e.preventDefault()
  e.returnValue = ''
})

graphAreaEl.addEventListener('contextmenu', (e) => {
  if (getActiveDrag()) {
    e.preventDefault()
    return
  }
  const target = e.target as HTMLElement
  const svg = getPlotSvgFromElement(target)
  if (!svg) return
  setObjectSelection([{ kind: 'plot', svg }])
  e.preventDefault()
  showContextMenu(ctxMenuEl, e.clientX, e.clientY)
})

const appRootEl = document.getElementById('app')
document.addEventListener('contextmenu', (e) => {
  if (appRootEl?.contains(e.target as Node)) e.preventDefault()
})

document.addEventListener('click', (e: MouseEvent) => {
  const target = e.target as HTMLElement
  if (target.closest('#ctxMenu')) return
  hideContextMenu(ctxMenuEl)
})
// ── Keyboard shortcuts ──
const doZoomStep = (delta: number): void => {
  const zoomSliderEl = document.querySelector<HTMLInputElement>('.zoom-slider')
  const currentPct = zoomSliderEl ? Number(zoomSliderEl.value) : 100
  const nextPct = Math.max(50, Math.min(500, Math.round((currentPct + delta) / 10) * 10))
  if (workspaceEl && graphAreaEl) {
    setCanvasZoom((nextPct / 100) * ZOOM_BASE, workspaceEl, graphAreaEl, statusCoordsEl)
  }
}

initAppShortcuts({
  deleteSelectedObjects,
  pushUndoState,
  undo: () => undo(graphAreaEl),
  redo: () => redo(graphAreaEl),
  handleSaveProject,
  handleSaveAsProject,
  openFileDialog: () => {
    void openFiles()
  },
  hideContextMenu: () => hideContextMenu(ctxMenuEl),
  zoomStep: doZoomStep,
  resetZoom: () => {
    if (workspaceEl && graphAreaEl) resetCanvasZoom(workspaceEl, graphAreaEl, statusCoordsEl)
  },
  openXAxis: () => showAxisDialog(axisOverlayEl, 'x'),
  openYAxis: () => showAxisDialog(axisOverlayEl, 'y'),
})

registerShortcut({ key: 'b', ctrlOrCmd: true }, (e) => {
  e.preventDefault()
  showAnalyzeDialog(analyzeOverlayEl, 'fit')
})
registerShortcut({ key: 'g', ctrlOrCmd: true }, (e) => {
  e.preventDefault()
  showConstantDialog(constantOverlayEl)
})
registerShortcut({ key: 'a', ctrlOrCmd: true }, (e) => {
  e.preventDefault()
  const svg = resolveAnalyzeSvg()
  if (svg && runAnalyzeRepeat(svg) === null) showAnalyzeDialog(analyzeOverlayEl, 'fit')
})

// ── Mobile: header + footer bars ──
const mobileHeaderEl = document.querySelector<HTMLElement>('#mobileHeader')
const mobileNavEl = document.querySelector<HTMLElement>('#mobileNav')

if (mobileHeaderEl) {
  initToolbar(mobileHeaderEl, handleToolbarAction)
}
if (mobileNavEl) {
  bindActionButtons(mobileNavEl, handleToolbarAction)
}

const mobileMenuBtn = document.querySelector<HTMLButtonElement>('#mobileMenuBtn')
if (mobileMenuBtn && menubarEl) {
  const closeDrawer = () => {
    menubarEl.classList.remove('menu-drawer-open')
    closeAllMenuDropdowns()
  }

  mobileMenuBtn.addEventListener('click', () => {
    const isOpen = menubarEl.classList.contains('menu-drawer-open')
    if (isOpen) {
      closeDrawer()
    } else {
      menubarEl.classList.add('menu-drawer-open')
    }
  })

  menubarEl.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const item = target.closest('.dropdown-item')
    if (!item) return
    if (item.closest('.menu-submenu')) return
    if (item.classList.contains('has-submenu')) return
    if (item.hasAttribute('data-keep-open')) return
    closeDrawer()
  })

  document.addEventListener('click', (e) => {
    if (!menubarEl.contains(e.target as Node) && !mobileMenuBtn.contains(e.target as Node)) {
      closeDrawer()
    }
  })
}

// ── Mobile: sheet swipe-down / header-resize ──
const dialogClosers: Array<{ overlay: HTMLElement; close: () => void }> = []
const registerDialogCloser = (overlay: HTMLElement | null, close: (overlayEl: HTMLElement) => void): void => {
  if (!overlay) return
  dialogClosers.push({ overlay, close: () => close(overlay) })
}
registerDialogCloser(propOverlayEl, hidePropertyDialog)
registerDialogCloser(dmOverlayEl, hideDataManagerDialog)
registerDialogCloser(axisOverlayEl, hideAxisDialog)
registerDialogCloser(titleOverlayEl, hideTitleDialog)
registerDialogCloser(arrowOverlayEl, hideArrowDialog)
registerDialogCloser(constantOverlayEl, hideConstantDialog)
registerDialogCloser(analyzeOverlayEl, hideAnalyzeDialog)
registerDialogCloser(rectOverlayEl, hideRectangleDialog)
registerDialogCloser(readValueOverlayEl, hideReadValueDialog)
registerDialogCloser(colorPickerOverlayEl, hideColorPickerDialog)
registerDialogCloser(saveAsOverlayEl, hideSaveAsDialog)
registerDialogCloser(confirmOverlayEl, hideConfirmDialog)
registerDialogCloser(aboutOverlayEl, hideAboutDialog)

dialogClosers.forEach(({ overlay, close }) => {
  const sheet = overlay.firstElementChild as HTMLElement | null
  if (sheet) initSheetSwipe(sheet, close)
})
