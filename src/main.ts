import './style.css'
import { initTitlebar } from './components/Titlebar.ts'
import { initMenubar, closeAllMenuDropdowns } from './components/Menubar.ts'
import { bindActionButtons, initToolbar } from './components/Toolbar.ts'
import { initContextMenu, hideContextMenu, showContextMenu } from './components/ContextMenu.ts'
import { initMarqueeExport } from './components/MarqueeExport.ts'
import { initMarqueeSelect } from './components/MarqueeSelect.ts'
import { initTrimMode } from './components/TrimMode.ts'
import {
  addDatasetToPlot,
  clearAllPlots,
  clearPlotScale,
  createPlot,
  deleteSelectedObjects,
  exportPlotToSmpDoc,
  getActiveDrag,
  getAllPlotSvgs,
  getPlotDatasets,
  getPlotSvgFromElement,
  getSelectedPlotSvg,
  hitTestGraph,
  hitTestAxisArea,
  isInsidePlotArea,
  initPlotDragListeners,
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
import type { Dataset } from './types.ts'
import { initArrowDialog, hideArrowDialog, showArrowDialog } from './components/ArrowDialog.ts'
import { hideConstantDialog, initConstantDialog, showConstantDialog } from './components/ConstantDialog.ts'
import { initRectangleDialog, hideRectangleDialog, showRectangleDialog } from './components/RectangleDialog.ts'
import { initCustomSelects } from './components/CustomSelect.ts'
import { initColorPickerDialog, hideColorPickerDialog } from './components/ColorPickerDialog.ts'
import { hideReadValueDialog, initReadValueDialog, isReadValueOpen, showReadValueDialog } from './components/ReadValueDialog.ts'
import { parseDatasetContent } from './utils/dataset.ts'
import { downloadFile, saveFileWithPicker, serializeSmpProject } from './utils/smpExporter.ts'
import { getCurrentProjectFileName, isProjectUntitled, setCurrentProjectFileName, setProjectUntitled } from './utils/projectState.ts'
import { ZOOM_BASE, initCanvasZoom, resetCanvasZoom, setCanvasZoom, subscribeZoom } from './utils/canvasZoom.ts'
import { addRecentFile, getRecentFiles } from './utils/recentFiles.ts'
import { initTouchGestures, wasTouchInteractionRecent } from './utils/touchGestures.ts'
import { initSheetSwipe } from './utils/sheetSwipe.ts'
import { registerSW } from 'virtual:pwa-register'

const titlebarEl = document.querySelector<HTMLElement>('.titlebar')
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
const rectOverlayEl = document.querySelector<HTMLElement>('#rectangleOverlay')!
const readValueOverlayEl = document.querySelector<HTMLElement>('#readValueOverlay')!
const colorPickerOverlayEl = document.querySelector<HTMLElement>('#colorPickerOverlay')!
const globalFileInput = document.querySelector<HTMLInputElement>('#globalFileInput')!
const saveAsOverlayEl = document.querySelector<HTMLElement>('#saveAsOverlay')

// Initialize Canvas Zoom Engine (Ctrl + Scroll / Trackpad Pinch)
if (workspaceEl && graphAreaEl) {
  initCanvasZoom(workspaceEl, graphAreaEl, statusCoordsEl)

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

// Initialize component logic & event listeners
if (titlebarEl) initTitlebar(titlebarEl)
if (titleOverlayEl) initTitleDialog(titleOverlayEl)
if (arrowOverlayEl) initArrowDialog(arrowOverlayEl)
if (constantOverlayEl) initConstantDialog(constantOverlayEl)
if (rectOverlayEl) initRectangleDialog(rectOverlayEl)
if (readValueOverlayEl) initReadValueDialog(readValueOverlayEl)
if (colorPickerOverlayEl) initColorPickerDialog(colorPickerOverlayEl)
if (saveAsOverlayEl) initSaveAsDialog(saveAsOverlayEl)

function handleSaveProject(customFileName?: string): void {
  const svgs = getAllPlotSvgs(graphAreaEl)
  if (svgs.length === 0) {
    alert('No plots available in workspace to export.')
    return
  }

  if (!customFileName && isProjectUntitled()) {
    void handleSaveAsProject()
    return
  }

  const fileName = customFileName || getCurrentProjectFileName()

  const docs = svgs.map((svg, idx) => exportPlotToSmpDoc(svg, `PLOT${idx + 1}.SMP`))
  const content = serializeSmpProject(docs)
  downloadFile(content, fileName)

  setCurrentProjectFileName(fileName)
  addRecentFile(fileName, content)
  updateRecentFilesMenu()

  const appTitleEl = document.querySelector<HTMLElement>('.app-title')
  if (appTitleEl) {
    appTitleEl.textContent = `SmaPlot - ${fileName}`
  }
  document.title = `SmaPlot - ${fileName}`

  const statusFileEl = document.querySelector<HTMLElement>('#statusFileText')
  if (statusFileEl) {
    statusFileEl.textContent = `1:${fileName}`
  }
}

async function handleSaveAsProject(): Promise<void> {
  const svgs = getAllPlotSvgs(graphAreaEl)
  if (svgs.length === 0) {
    alert('No plots available in workspace to export.')
    return
  }

  const defaultName = getCurrentProjectFileName()
  const docs = svgs.map((svg, idx) => exportPlotToSmpDoc(svg, `PLOT${idx + 1}.SMP`))
  const content = serializeSmpProject(docs)

  // Open native OS File Explorer save dialog (File System Access API)
  const pickerResult = await saveFileWithPicker(content, defaultName)

  if (pickerResult !== undefined) {
    if (pickerResult === null) {
      // User cancelled native explorer dialog
      return
    }
    const fileName = pickerResult
    setCurrentProjectFileName(fileName)
    addRecentFile(fileName, content)
    updateRecentFilesMenu()

    const appTitleEl = document.querySelector<HTMLElement>('.app-title')
    if (appTitleEl) {
      appTitleEl.textContent = `SmaPlot - ${fileName}`
    }
    document.title = `SmaPlot - ${fileName}`

    const statusFileEl = document.querySelector<HTMLElement>('#statusFileText')
    if (statusFileEl) {
      statusFileEl.textContent = `1:${fileName}`
    }
    return
  }

  // Fallback for browsers that do not support File System Access API
  const customName = await showSaveAsDialog(defaultName)
  if (!customName) return

  handleSaveProject(customName)
}

async function handleNewProject(): Promise<void> {
  const hasContent = getAllPlotSvgs(graphAreaEl).length > 0
  if (hasContent) {
    const choice = await showConfirmDialog(
      'The current project has unsaved changes. Do you want to save it before creating a new project?'
    )
    if (choice === 'cancel') return
    if (choice === 'save') handleSaveProject()
  }

  setCurrentProjectFileName('untitled.SMP')
  setProjectUntitled(true)
  clearAllPlots(graphAreaEl)
  await createPlot(graphAreaEl, 40, 40, [])

  const appTitleEl = document.querySelector<HTMLElement>('.app-title')
  if (appTitleEl) {
    appTitleEl.textContent = 'SmaPlot - Untitled'
  }
  document.title = 'SmaPlot - Untitled'

  const statusFileEl = document.querySelector<HTMLElement>('#statusFileText')
  if (statusFileEl) {
    statusFileEl.textContent = 'Untitled'
  }
  pushUndoState()
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
        const index = plotDatasets.findIndex(
          (d) => (d.filePath || d.fileName || `${d.name}.txt`) === id
        )
        return index >= 0 ? `%0${index + 1}E%0${index + 1}N` : null
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

// Insert > X/Y/U/R-axis title: identical to Insert > Strings — a plain legend
// text item. The only difference is the predetermined initial state (position,
// rotation, size, legendType). Afterwards it is a fully editable title: the
// user can move it, change its properties, and reorient it freely.
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
      const chosen =
        datasets.find((d) => (d.filePath || d.fileName || `${d.name}.txt`) === fileName || d.name === fileName) ||
        datasets[0]
      showReadValueDialog(readValueOverlayEl, svg, chosen)
    })
  } else {
    if (globalDataManager.getDatasets().length > 0) {
      showDataManagerDialog(dmOverlayEl, (fileName) => {
        const globalDs = globalDataManager
          .getDatasets()
          .find((d) => (d.filePath || d.fileName || `${d.name}.txt`) === fileName || d.name === fileName)
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
      if (globalFileInput) globalFileInput.click()
    } else if (action === 'save') {
      handleSaveProject()
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
      await createPlot(graphAreaEl, 40, 40, [])
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
    } else if (action === 'arrow') {
      showArrowDialog(arrowOverlayEl)
    } else if (action === 'constant') {
      showConstantDialog(constantOverlayEl)
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
      await loadSmpProject(graphAreaEl, recent.content, recent.name)
      updateRecentFilesMenu()
      pushUndoState()
    } else if (action === 'property') {
      showPropertyDialog(propOverlayEl)
    }
  })
}

async function handleToolbarAction(action: string, title: string): Promise<void> {
  if (action === 'trimming') {
    toggleTrimMode()
    return
  }

  // Any other toolbar action exits trimming mode (restoring marquee selection).
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
    await createPlot(graphAreaEl, 40, 40, [])
    pushUndoState()
  } else if (action === 'open' || title === 'Open') {
    if (globalFileInput) globalFileInput.click()
  } else if (action === 'save' || title === 'Save') {
    handleSaveProject()
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

// Global File Input Change Handler
if (globalFileInput) {
  globalFileInput.addEventListener('change', async (e: Event) => {
    const input = e.target as HTMLInputElement
    const files = input.files
    if (!files || files.length === 0) return

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const ext = file.name.toLowerCase().split('.').pop()
      if (ext === 'smp' || ext === 'sma') {
        const reader = new FileReader()
        reader.onload = async (evt) => {
          const content = evt.target?.result as string
          if (content) {
            await loadSmpProject(graphAreaEl, content, file.name)
            updateRecentFilesMenu()
            pushUndoState()
          }
        }
        reader.readAsText(file, 'windows-1252')
      } else if (ext === 'txt' || file.type.startsWith('text/')) {
        let svg = getSelectedPlotSvg()
        if (!svg) {
          svg = await createPlot(graphAreaEl, 40, 40, [])
        }
        const reader = new FileReader()
        reader.onload = (evt) => {
          const content = evt.target?.result as string
          if (content && svg) {
            const ds = parseDatasetContent(content, file.name)
            addDatasetToPlot(svg, ds)
            pushUndoState()
          }
        }
        reader.readAsText(file, 'windows-1252')
      }
    }
    input.value = ''
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
    } else if (actionKey === 'string') {
      showTitleDialog(titleOverlayEl)
    } else if (actionKey === 'arrow') {
      showArrowDialog(arrowOverlayEl)
    } else if (actionKey === 'rectangle') {
      showRectangleDialog(rectOverlayEl)
    }
  })
}

// Click on empty area outside any plot box deselects the current plot
graphAreaEl.addEventListener('mousedown', (e) => {
  if (isReadValueMode() || isPropertyTabMode()) return
  const target = e.target as HTMLElement
  if (target.closest('.plot-svg, .plot-overlay')) return
  setObjectSelection([])
})

// Double-click on a plot. Detected via timing on `mousedown` (not native `dblclick`)
// because selecting the plot re-renders the SVG (`replaceChildren`), detaching the
// element under the cursor so the browser never fires a `dblclick` for it.
//  - on the graph (data points / lines, detected geometrically via `hitTestGraph`) → open the Property panel for that graph
//  - on empty area inside the box plot (not series, ticks, axis, title, legend) → open the Data Manager
// Legend / annotation / title elements carry their own mousedown handlers, so they are unaffected here.
let lastPlotClickTime = 0
let lastPlotClickSvg: SVGSVGElement | null = null
graphAreaEl.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return
  // Touch input synthesizes mousedown/click events; the touch double-tap path in
  // touchGestures.ts already opens the correct panel, so skip this mouse-based
  // double-click detection right after a touch gesture (prevents e.g. Data Manager
  // opening instead of a legend/annotation panel).
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

    // Check axis zones first (border, ticks, labels) using geometry — works even after SVG re-render
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

// Left-drag marquee selection of plot elements (select + group move)
initMarqueeSelect(graphAreaEl)

// Trimming mode: left-drag on a plot's graph area re-scopes its X/Y axis range.
// Mode auto-exits after one successful trim (onFinish restores toolbar + marquee).
initTrimMode(graphAreaEl, () => pushUndoState(), exitTrimMode)

// Initialize Marquee Drag Selection & SVG Clipboard Copy
const marqueeCtxMenuEl = document.querySelector<HTMLElement>('#marqueeCtxMenu')
const statusFileTextEl = document.querySelector<HTMLElement>('#statusFileText')
if (marqueeCtxMenuEl) {
  initMarqueeExport(graphAreaEl, marqueeCtxMenuEl, statusFileTextEl)
}

// Initialize Touch Gestures (500ms Long Press, Haptic, Context Menu, Touch Marquee Export & Select)
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

// Initialize Property, Data Manager, Axis & Confirm Dialogs
if (propOverlayEl) initPropertyDialog(propOverlayEl)
if (axisOverlayEl) initAxisDialog(axisOverlayEl)
const confirmOverlayEl = document.querySelector<HTMLElement>('#confirmOverlay')
if (confirmOverlayEl) initConfirmDialog(confirmOverlayEl)

// Uniform custom dropdowns for all form selects
initCustomSelects()

// Data Manager callback: when a file is selected, transition to Property modal.
// The dialog only lists the datasets of the currently selected (or last
// selected) boxplot, so datasets of different plots never mix. The global pool
// is used only when the active plot has no datasets of its own (e.g. when
// picking data to add to a fresh plot).
if (dmOverlayEl) {
  const getDataManagerDatasets = (): Dataset[] => {
    const svg = getSelectedPlotSvg()
    if (svg) {
      const plotDatasets = getPlotDatasets(svg)
      if (plotDatasets.length > 0) return plotDatasets
    }
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

// Reflect canUndo()/canRedo() on the Undo/Redo menu items and toolbar buttons
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
updateUndoRedoButtons()

// Spawn a fresh, untitled project on first launch
async function initApp() {
  await handleNewProject()
  updateRecentFilesMenu()
  pushUndoState()
}

initApp()

// Register the PWA service worker and surface update availability.
// `prompt` mode: never force-reload the user (unsaved plots would be lost).
const pwaToast = document.querySelector<HTMLElement>('#pwaUpdateToast')
const pwaUpdateBtn = document.querySelector<HTMLElement>('#pwaUpdateBtn')
const pwaDismissBtn = document.querySelector<HTMLElement>('#pwaDismissBtn')

const hidePwaToast = () => {
  if (pwaToast) pwaToast.style.display = 'none'
}

registerSW({
  immediate: true,
  onNeedRefresh() {
    if (pwaToast) pwaToast.style.display = 'flex'
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
})

pwaUpdateBtn?.addEventListener('click', () => {
  hidePwaToast()
  location.reload()
})
pwaDismissBtn?.addEventListener('click', hidePwaToast)

// Global Window & Workspace Drag-and-Drop Handler for .SMP, .SMA, and .TXT files
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', (e) => e.preventDefault())

workspaceEl.addEventListener('dragover', (e: DragEvent) => {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
})

workspaceEl.addEventListener('drop', async (e: DragEvent) => {
  e.preventDefault()
  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const ext = file.name.toLowerCase().split('.').pop()
    if (ext === 'smp' || ext === 'sma') {
      const reader = new FileReader()
      reader.onload = async (evt) => {
        const content = evt.target?.result as string
        if (content) {
          await loadSmpProject(graphAreaEl, content, file.name)
          updateRecentFilesMenu()
          pushUndoState()
        }
      }
      reader.readAsText(file, 'windows-1252')
    } else if (ext === 'txt' || file.type.startsWith('text/')) {
      let svg = getSelectedPlotSvg()
      if (!svg) {
        svg = await createPlot(graphAreaEl, 40, 40, [])
      }
      const reader = new FileReader()
      reader.onload = (evt) => {
        const content = evt.target?.result as string
        if (content && svg) {
          const ds = parseDatasetContent(content, file.name)
          addDatasetToPlot(svg, ds)
          pushUndoState()
        }
      }
      reader.readAsText(file, 'windows-1252')
    }
  }
})

// Right-click context menu event listener on plot graph area
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

document.addEventListener('click', (e: MouseEvent) => {
  const target = e.target as HTMLElement
  if (target.closest('#ctxMenu')) return
  hideContextMenu(ctxMenuEl)
})
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape') hideContextMenu(ctxMenuEl)

  const activeEl = document.activeElement
  const isEditable =
    activeEl &&
    (activeEl.tagName === 'INPUT' ||
      activeEl.tagName === 'TEXTAREA' ||
      (activeEl as HTMLElement).isContentEditable)

  if (isEditable) return

  const key = e.key.toLowerCase()
  const isCtrlOrCmd = e.ctrlKey || e.metaKey

  if (key === 'delete' || key === 'backspace' || (isCtrlOrCmd && key === 'd')) {
    e.preventDefault()
    if (deleteSelectedObjects()) {
      pushUndoState()
    }
  } else if (isCtrlOrCmd && key === 'z') {
    e.preventDefault()
    if (e.shiftKey) {
      redo(graphAreaEl)
    } else {
      undo(graphAreaEl)
    }
  } else if (isCtrlOrCmd && key === 'y') {
    e.preventDefault()
    redo(graphAreaEl)
  } else if (isCtrlOrCmd && key === 's') {
    e.preventDefault()
    if (e.shiftKey) {
      handleSaveAsProject()
    } else {
      handleSaveProject()
    }
  } else if (isCtrlOrCmd && key === 'o') {
    e.preventDefault()
    if (globalFileInput) globalFileInput.click()
  } else if (isCtrlOrCmd && (e.key === '=' || e.key === '+')) {
    e.preventDefault()
    const zoomSliderEl = document.querySelector<HTMLInputElement>('.zoom-slider')
    const currentPct = zoomSliderEl ? Number(zoomSliderEl.value) : 100
    const nextPct = Math.max(50, Math.min(500, Math.round((currentPct + 10) / 10) * 10))
    if (workspaceEl && graphAreaEl) {
      setCanvasZoom((nextPct / 100) * ZOOM_BASE, workspaceEl, graphAreaEl, statusCoordsEl)
    }
  } else if (isCtrlOrCmd && (e.key === '-' || e.key === '_')) {
    e.preventDefault()
    const zoomSliderEl = document.querySelector<HTMLInputElement>('.zoom-slider')
    const currentPct = zoomSliderEl ? Number(zoomSliderEl.value) : 100
    const nextPct = Math.max(50, Math.min(500, Math.round((currentPct - 10) / 10) * 10))
    if (workspaceEl && graphAreaEl) {
      setCanvasZoom((nextPct / 100) * ZOOM_BASE, workspaceEl, graphAreaEl, statusCoordsEl)
    }
  } else if (isCtrlOrCmd && e.key === '0') {
    e.preventDefault()
    if (workspaceEl && graphAreaEl) {
      resetCanvasZoom(workspaceEl, graphAreaEl, statusCoordsEl)
    }
  }
})

// ── Mobile: header + footer bars reuse the shared toolbar action dispatch ──
// Hidden on desktop via CSS; the listeners are harmless there.
const mobileHeaderEl = document.querySelector<HTMLElement>('#mobileHeader')
const mobileNavEl = document.querySelector<HTMLElement>('#mobileNav')

if (mobileHeaderEl) {
  initToolbar(mobileHeaderEl, handleToolbarAction)
}
if (mobileNavEl) {
  bindActionButtons(mobileNavEl, handleToolbarAction)
}

// Burger menu: slides the menubar down as a drawer (mobile CSS) and reuses its
// existing dropdown handling. The drawer closes after choosing an action or
// when tapping anywhere outside it.
const mobileMenuBtn = document.querySelector<HTMLButtonElement>('#mobileMenuBtn')
if (mobileMenuBtn && menubarEl) {
  const closeDrawer = () => {
    menubarEl.classList.remove('menu-drawer-open')
    // Reset any open accordions so the next open starts clean.
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
    // Items inside an open submenu collapse the accordion but must NOT close
    // the whole drawer (Menubar.ts already handles the action + collapse).
    if (item.closest('.menu-submenu')) return
    // The has-submenu row itself toggles the accordion — don't close drawer.
    if (item.classList.contains('has-submenu')) return
    closeDrawer()
  })

  document.addEventListener('click', (e) => {
    if (!menubarEl.contains(e.target as Node) && !mobileMenuBtn.contains(e.target as Node)) {
      closeDrawer()
    }
  })
}

// ── Mobile: sheet swipe-down / header-resize interactions ───────────────────
// The mobile backdrop passes pointer events through (CSS: .modal-overlay has
// pointer-events:none), so the workspace stays interactive while a sheet is
// open — pan, pinch-zoom, read-value picking, and transform-box drags all keep
// working behind the sheet. Sheets are dismissed via their close button, a
// swipe-down on the sheet body, or dragging the header down until the sheet is
// <=10% of the screen height. Closing goes through the same hide* helpers the
// dialog buttons use, so dialog state (multi-select mode, read-value mode,
// promises, etc.) is cleaned up — not just display.
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
registerDialogCloser(rectOverlayEl, hideRectangleDialog)
registerDialogCloser(readValueOverlayEl, hideReadValueDialog)
registerDialogCloser(colorPickerOverlayEl, hideColorPickerDialog)
registerDialogCloser(saveAsOverlayEl, hideSaveAsDialog)
registerDialogCloser(confirmOverlayEl, hideConfirmDialog)

dialogClosers.forEach(({ overlay, close }) => {
  const sheet = overlay.firstElementChild as HTMLElement | null
  if (sheet) initSheetSwipe(sheet, close)
})
