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
  getPlotSvgFromElement,
  getSelectedPlotSvg,
  hitTestGraph,
  hitTestAxisArea,
  isInsidePlotArea,
  initPlotDragListeners,
  isReadValueMode,
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
  showDataManagerForLegend,
} from './components/DataManager.ts'
import { initAxisDialog, showAxisDialog } from './components/AxisDialog.ts'
import { initTitleDialog, showTitleDialog } from './components/TitleDialog.ts'
import type { TitlePreset } from './components/TitleDialog.ts'
import { initArrowDialog, showArrowDialog } from './components/ArrowDialog.ts'
import { initRectangleDialog, showRectangleDialog } from './components/RectangleDialog.ts'
import { hideReadValueDialog, initReadValueDialog, isReadValueOpen, showReadValueDialog } from './components/ReadValueDialog.ts'
import { parseDatasetContent } from './utils/dataset.ts'
import { downloadFile, serializeSmpProject } from './utils/smpExporter.ts'
import { initCanvasZoom } from './utils/canvasZoom.ts'
import { addRecentFile, getRecentFiles } from './utils/recentFiles.ts'

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
const trimBtn = toolbarEl?.querySelector<HTMLElement>('.toolbar-btn[data-action="trimming"]')

const exitTrimMode = () => {
  if (!trimmingActive) return
  trimmingActive = false
  setTrimmingMode(false)
  trimBtn?.classList.remove('active')
  graphAreaEl.classList.remove('trimming-mode')
}

const toggleTrimMode = () => {
  trimmingActive = !trimmingActive
  setTrimmingMode(trimmingActive)
  trimBtn?.classList.toggle('active', trimmingActive)
  graphAreaEl.classList.toggle('trimming-mode', trimmingActive)
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
    } else if (['save', 'save_as', 'export_smp'].includes(action)) {
      handleSaveProject()
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
      addRecentFile(recent.name, recent.content)
      updateRecentFilesMenu()
      pushUndoState()
    } else if (action === 'property' || action === 'setup' || action === 'frame') {
      showPropertyDialog(propOverlayEl)
    }
  })
}

if (toolbarEl) {
  initToolbar(toolbarEl, async (action, title) => {
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
      if (isReadValueOpen() && readValueOverlayEl) {
        hideReadValueDialog(readValueOverlayEl)
      } else {
        handleReadValue()
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
            addRecentFile(file.name, content)
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
    } else if (actionKey === 'frame') {
      showPropertyDialog(propOverlayEl)
    }
  })
}

// Click on empty area outside any plot box deselects the current plot
graphAreaEl.addEventListener('mousedown', (e) => {
  if (isReadValueMode()) return
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
  if (isReadValueMode()) return
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
      addRecentFile('FTIR.SMP', text)
    } else {
      await createPlot(graphAreaEl, 40, 40, [])
    }
  } catch (err) {
    console.error('Could not load default FTIR.SMP project:', err)
    await createPlot(graphAreaEl, 40, 40, [])
  }
  updateRecentFilesMenu()
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
          addRecentFile(file.name, content)
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
  } else if (isCtrlOrCmd && key === 's') {
    e.preventDefault()
    handleSaveProject()
  } else if (isCtrlOrCmd && key === 'o') {
    e.preventDefault()
    if (globalFileInput) globalFileInput.click()
  }
})
