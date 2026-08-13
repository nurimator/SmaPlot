import './style.css'
import { initTitlebar } from './components/Titlebar.ts'
import { initMenubar } from './components/Menubar.ts'
import { initToolbar } from './components/Toolbar.ts'
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
  getSelectedPlotSvg,
  hitTestGraph,
  hitTestAxisArea,
  isInsidePlotArea,
  initPlotDragListeners,
  loadSmpProject,
  removeDatasetFromAllPlots,
  setObjectSelection,
  setSelectedPlotSvg,
  setTrimmingMode,
} from './components/Plot.ts'
import { canRedo, canUndo, pushUndoState, redo, subscribeUndoState, undo } from './utils/undoManager.ts'
import { initPropertyDialog, showPropertyDialog } from './components/PropertyDialog.ts'
import { initConfirmDialog, showConfirmDialog } from './components/ConfirmDialog.ts'
import {
  globalDataManager,
  initDataManagerDialog,
  showDataManagerDialog,
} from './components/DataManager.ts'
import { initAxisDialog, showAxisDialog } from './components/AxisDialog.ts'
import { initTitleDialog, showTitleDialog } from './components/TitleDialog.ts'
import { initArrowDialog, showArrowDialog } from './components/ArrowDialog.ts'
import { initRectangleDialog, showRectangleDialog } from './components/RectangleDialog.ts'
import { initReadValueDialog, showReadValueDialog } from './components/ReadValueDialog.ts'
import { parseDatasetContent } from './utils/dataset.ts'
import { downloadFile, serializeSmpProject } from './utils/smpExporter.ts'
import { initCanvasZoom } from './utils/canvasZoom.ts'

const titlebarEl = document.querySelector<HTMLElement>('.titlebar')!
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
const rectOverlayEl = document.querySelector<HTMLElement>('#rectangleOverlay')!
const readValueOverlayEl = document.querySelector<HTMLElement>('#readValueOverlay')!
const globalFileInput = document.querySelector<HTMLInputElement>('#globalFileInput')!

// Initialize Canvas Zoom Engine (Ctrl + Scroll / Trackpad Pinch)
if (workspaceEl && graphAreaEl) {
  initCanvasZoom(workspaceEl, graphAreaEl, statusCoordsEl)
}

// Initialize component logic & event listeners
if (titlebarEl) initTitlebar(titlebarEl)
if (titleOverlayEl) initTitleDialog(titleOverlayEl)
if (arrowOverlayEl) initArrowDialog(arrowOverlayEl)
if (rectOverlayEl) initRectangleDialog(rectOverlayEl)
if (readValueOverlayEl) initReadValueDialog(readValueOverlayEl)

function handleSaveProject(): void {
  const svgs = getAllPlotSvgs(graphAreaEl)
  if (svgs.length === 0) {
    alert('No plots available in workspace to export.')
    return
  }

  const docs = svgs.map((svg, idx) => exportPlotToSmpDoc(svg, `PLOT${idx + 1}.SMP`))
  const content = serializeSmpProject(docs)
  const firstDocName = docs[0]?.name
  const fileName = firstDocName && firstDocName.toLowerCase().endsWith('.smp') ? firstDocName : 'Project.SMP'
  downloadFile(content, fileName)

  const appTitleEl = document.querySelector<HTMLElement>('.app-title')
  if (appTitleEl) {
    appTitleEl.textContent = `SmaPlot - ${fileName}`
  }
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

  clearAllPlots(graphAreaEl)
  await createPlot(graphAreaEl, 40, 40, [])

  const appTitleEl = document.querySelector<HTMLElement>('.app-title')
  if (appTitleEl) {
    appTitleEl.textContent = 'SmaPlot - Untitled'
  }

  const statusFileEl = document.querySelector<HTMLElement>('#statusFileText')
  if (statusFileEl) {
    statusFileEl.textContent = 'Untitled'
  }
  pushUndoState()
}

if (menubarEl) {
  initMenubar(menubarEl, async (action) => {
    if (action === 'undo') {
      undo(graphAreaEl)
    } else if (action === 'redo') {
      redo(graphAreaEl)
    } else if (action === 'delete') {
      if (deleteSelectedObjects()) pushUndoState()
    } else if (action === 'data' || action === 'data_manager') {
      showDataManagerDialog(dmOverlayEl)
    } else if (action === 'clear_all_scale') {
      clearPlotScale('all')
      pushUndoState()
    } else if (action === 'clear_scale_x') {
      clearPlotScale('x')
      pushUndoState()
    } else if (action === 'clear_scale_y') {
      clearPlotScale('y')
      pushUndoState()
    } else if (action === 'open') {
      if (globalFileInput) globalFileInput.click()
    } else if (['save', 'save_as', 'export_smp'].includes(action)) {
      handleSaveProject()
    } else if (action === 'text' || action === 'title') {
      showTitleDialog(titleOverlayEl)
    } else if (action === 'new') {
      await handleNewProject()
    } else if (['graph', 'property', 'option', 'analyze', 'edit'].includes(action)) {
      showPropertyDialog(propOverlayEl)
    }
  })
}

let trimmingActive = false
const trimBtn = toolbarEl?.querySelector<HTMLElement>('.toolbar-btn[data-action="trimming"]')

const exitTrimMode = () => {
  if (!trimmingActive) return
  trimmingActive = false
  setTrimmingMode(false)
  trimBtn?.classList.remove('active')
  graphAreaEl.classList.remove('trimming-mode')
}

if (toolbarEl) {
  initToolbar(toolbarEl, async (action, title) => {
    if (action === 'trimming') {
      trimmingActive = !trimmingActive
      setTrimmingMode(trimmingActive)
      trimBtn?.classList.toggle('active', trimmingActive)
      graphAreaEl.classList.toggle('trimming-mode', trimmingActive)
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
    } else if (action === 'chart' || title === 'Chart') {
      showPropertyDialog(propOverlayEl)
    } else if (action === 'read-value' || action === 'read_value' || title === 'Read Value') {
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
  })
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
    } else if (actionKey === 'frame') {
      showPropertyDialog(propOverlayEl)
    }
  })
}

// Click on empty area outside any plot box deselects the current plot
graphAreaEl.addEventListener('mousedown', (e) => {
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

// Initialize Property, Data Manager, Axis & Confirm Dialogs
if (propOverlayEl) initPropertyDialog(propOverlayEl)
if (axisOverlayEl) initAxisDialog(axisOverlayEl)
const confirmOverlayEl = document.querySelector<HTMLElement>('#confirmOverlay')
if (confirmOverlayEl) initConfirmDialog(confirmOverlayEl)

// Data Manager callback: when a file is selected, transition to Property modal
if (dmOverlayEl) {
  initDataManagerDialog(
    dmOverlayEl,
    (selectedFileName) => {
      showPropertyDialog(propOverlayEl, selectedFileName)
    },
    (identifier) => {
      removeDatasetFromAllPlots(identifier)
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

// Spawn initial plot window and load FTIR.SMP sample project
async function initApp() {
  try {
    const res = await fetch('/dummy-data/project-file/FTIR.SMP')
    if (res.ok) {
      const buffer = await res.arrayBuffer()
      const text = new TextDecoder('windows-1252').decode(buffer)
      await loadSmpProject(graphAreaEl, text, 'FTIR.SMP')
    } else {
      await createPlot(graphAreaEl, 40, 40, [])
    }
  } catch (err) {
    console.error('Could not load default FTIR.SMP project:', err)
    await createPlot(graphAreaEl, 40, 40, [])
  }
  pushUndoState()
}

initApp()

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
  const svg = target.closest('.plot-svg, .plot-overlay') as SVGSVGElement | null
  if (!svg) return
  setObjectSelection([{ kind: 'plot', svg }])
  e.preventDefault()
  showContextMenu(ctxMenuEl, e.clientX, e.clientY)
})

document.addEventListener('click', () => hideContextMenu(ctxMenuEl))
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
  }
})
