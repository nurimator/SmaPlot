import './style.css'
import { initTitlebar } from './components/Titlebar.ts'
import { initMenubar } from './components/Menubar.ts'
import { initToolbar } from './components/Toolbar.ts'
import { initContextMenu, hideContextMenu, showContextMenu } from './components/ContextMenu.ts'
import { createPlot, getActiveDrag, getBoxCount, initPlotDragListeners } from './components/Plot.ts'
import { initPropertyDialog, showPropertyDialog } from './components/PropertyDialog.ts'
import {
  initDataManagerDialog,
  showDataManagerDialog,
  globalDataManager,
} from './components/DataManager.ts'

const titlebarEl = document.querySelector<HTMLElement>('.titlebar')!
const menubarEl = document.querySelector<HTMLElement>('.menubar')!
const toolbarEl = document.querySelector<HTMLElement>('.toolbar')!
const graphAreaEl = document.querySelector<HTMLElement>('.graph-area')!
const ctxMenuEl = document.querySelector<HTMLElement>('#ctxMenu')!
const propOverlayEl = document.querySelector<HTMLElement>('#propertyDialogOverlay')!
const dmOverlayEl = document.querySelector<HTMLElement>('#dataManagerOverlay')!

// Initialize component logik & event listeners
if (titlebarEl) initTitlebar(titlebarEl)

if (menubarEl) {
  initMenubar(menubarEl, (menuName) => {
    if (menuName === 'data') {
      showDataManagerDialog(dmOverlayEl)
    } else if (['graph', 'option', 'analyze', 'edit'].includes(menuName)) {
      showPropertyDialog(propOverlayEl)
    }
  })
}

if (toolbarEl) {
  initToolbar(toolbarEl, async (action, title) => {
    if (action === 'new') {
      const boxCount = getBoxCount()
      const offset = (boxCount % 6) * 28
      await createPlot(graphAreaEl, 40 + offset, 40 + offset)
    } else if (action === 'open' || title === 'Open') {
      showDataManagerDialog(dmOverlayEl)
    } else if (action === 'chart' || action === 'text' || title === 'Chart') {
      showPropertyDialog(propOverlayEl)
    }
  })
}

if (ctxMenuEl) {
  initContextMenu(ctxMenuEl, (actionKey) => {
    if (['property', 'xaxis', 'yaxis', 'uaxis', 'raxis', 'frame', 'string'].includes(actionKey)) {
      showPropertyDialog(propOverlayEl)
    }
  })
}

// Initialize Plot drag & resize listeners
initPlotDragListeners()

// Initialize Property & Data Manager Dialogs
if (propOverlayEl) initPropertyDialog(propOverlayEl)
if (dmOverlayEl) initDataManagerDialog(dmOverlayEl)

// Load initial datasets and spawn initial plot window on startup
globalDataManager.loadInitialDatasets().then(() => {
  createPlot(graphAreaEl, 40, 40)
})

// Right-click context menu event listener on plot graph area
graphAreaEl.addEventListener('contextmenu', (e) => {
  if (getActiveDrag()) {
    e.preventDefault()
    return
  }
  const target = e.target as HTMLElement
  if (!target.closest('.plot-svg')) return
  e.preventDefault()
  showContextMenu(ctxMenuEl, e.clientX, e.clientY)
})

document.addEventListener('click', () => hideContextMenu(ctxMenuEl))
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideContextMenu(ctxMenuEl)
})
