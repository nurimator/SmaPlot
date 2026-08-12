import './style.css'
import { initTitlebar } from './components/Titlebar.ts'
import { initMenubar } from './components/Menubar.ts'
import { initToolbar } from './components/Toolbar.ts'
import { initContextMenu, hideContextMenu, showContextMenu } from './components/ContextMenu.ts'
import { initMarqueeExport } from './components/MarqueeExport.ts'
import { initMarqueeSelect } from './components/MarqueeSelect.ts'
import {
  addDatasetToPlot,
  clearPlotScale,
  createPlot,
  exportPlotToSmpDoc,
  getActiveDrag,
  getAllPlotSvgs,
  getBoxCount,
  getSelectedPlotSvg,
  initPlotDragListeners,
  loadSmpProject,
  setObjectSelection,
  setSelectedPlotSvg,
} from './components/Plot.ts'
import { initPropertyDialog, showPropertyDialog } from './components/PropertyDialog.ts'
import {
  initDataManagerDialog,
  showDataManagerDialog,
} from './components/DataManager.ts'
import { initAxisDialog, showAxisDialog } from './components/AxisDialog.ts'
import { initTitleDialog, showTitleDialog } from './components/TitleDialog.ts'
import { initArrowDialog } from './components/ArrowDialog.ts'
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
const globalFileInput = document.querySelector<HTMLInputElement>('#globalFileInput')!

// Initialize Canvas Zoom Engine (Ctrl + Scroll / Trackpad Pinch)
if (workspaceEl && graphAreaEl) {
  initCanvasZoom(workspaceEl, graphAreaEl, statusCoordsEl)
}

// Initialize component logic & event listeners
if (titlebarEl) initTitlebar(titlebarEl)
if (titleOverlayEl) initTitleDialog(titleOverlayEl)
if (arrowOverlayEl) initArrowDialog(arrowOverlayEl)

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
}

if (menubarEl) {
  initMenubar(menubarEl, (action) => {
    if (action === 'data' || action === 'data_manager') {
      showDataManagerDialog(dmOverlayEl)
    } else if (action === 'clear_all_scale') {
      clearPlotScale('all')
    } else if (action === 'clear_scale_x') {
      clearPlotScale('x')
    } else if (action === 'clear_scale_y') {
      clearPlotScale('y')
    } else if (action === 'open') {
      if (globalFileInput) globalFileInput.click()
    } else if (['save', 'save_as', 'export_smp'].includes(action)) {
      handleSaveProject()
    } else if (action === 'text' || action === 'title') {
      showTitleDialog(titleOverlayEl)
    } else if (action === 'new') {
      const boxCount = getBoxCount()
      const offset = (boxCount % 6) * 28
      createPlot(graphAreaEl, 40 + offset, 40 + offset, [])
    } else if (['graph', 'property', 'option', 'analyze', 'edit'].includes(action)) {
      showPropertyDialog(propOverlayEl)
    }
  })
}

if (toolbarEl) {
  initToolbar(toolbarEl, async (action, title) => {
    if (action === 'new') {
      const boxCount = getBoxCount()
      const offset = (boxCount % 6) * 28
      await createPlot(graphAreaEl, 40 + offset, 40 + offset, [])
    } else if (action === 'open' || title === 'Open') {
      if (globalFileInput) globalFileInput.click()
    } else if (action === 'save' || title === 'Save') {
      handleSaveProject()
    } else if (action === 'text' || title === 'Text') {
      showTitleDialog(titleOverlayEl)
    } else if (action === 'chart' || title === 'Chart') {
      showPropertyDialog(propOverlayEl)
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
    if (actionKey === 'property' || actionKey.toLowerCase().includes('date')) {
      showDataManagerDialog(dmOverlayEl)
    } else if (actionKey === 'xaxis') {
      showAxisDialog(axisOverlayEl, 'x')
    } else if (actionKey === 'yaxis') {
      showAxisDialog(axisOverlayEl, 'y')
    } else if (actionKey === 'uaxis') {
      showAxisDialog(axisOverlayEl, 'u')
    } else if (actionKey === 'raxis') {
      showAxisDialog(axisOverlayEl, 'r')
    } else if (['frame', 'string', 'arrow', 'rectangle'].includes(actionKey)) {
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

// Double click on plot area axis or labels to open Axis dialog
graphAreaEl.addEventListener('dblclick', (e) => {
  const target = e.target as HTMLElement
  const svg = target.closest('.plot-svg') as SVGSVGElement | null
  if (svg && axisOverlayEl) {
    setSelectedPlotSvg(svg)
    const isY = e.clientY < svg.getBoundingClientRect().top + svg.getBoundingClientRect().height / 2
    showAxisDialog(axisOverlayEl, isY ? 'y' : 'x', svg)
  }
})

// Initialize Plot drag & resize listeners
initPlotDragListeners()

// Left-drag marquee selection of plot elements (select + group move)
initMarqueeSelect(graphAreaEl)

// Initialize Marquee Drag Selection & SVG Clipboard Copy
const marqueeCtxMenuEl = document.querySelector<HTMLElement>('#marqueeCtxMenu')
const statusFileTextEl = document.querySelector<HTMLElement>('#statusFileText')
if (marqueeCtxMenuEl) {
  initMarqueeExport(graphAreaEl, marqueeCtxMenuEl, statusFileTextEl)
}


// Initialize Property, Data Manager & Axis Dialogs
if (propOverlayEl) initPropertyDialog(propOverlayEl)
if (axisOverlayEl) initAxisDialog(axisOverlayEl)

// Data Manager callback: when a file is selected, transition to Property modal
if (dmOverlayEl) {
  initDataManagerDialog(dmOverlayEl, (selectedFileName) => {
    showPropertyDialog(propOverlayEl, selectedFileName)
  })
}

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
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideContextMenu(ctxMenuEl)
})


