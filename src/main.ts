import './style.css'
import { initTitlebar } from './components/Titlebar.ts'
import { initMenubar } from './components/Menubar.ts'
import { initToolbar } from './components/Toolbar.ts'
import { initContextMenu, hideContextMenu, showContextMenu } from './components/ContextMenu.ts'
import {
  addDatasetToPlot,
  clearPlotScale,
  createPlot,
  getActiveDrag,
  getBoxCount,
  getSelectedPlotSvg,
  initPlotDragListeners,
  setPlotSmpDoc,
  setPlotSmpMeta,
  setSelectedPlotSvg,
} from './components/Plot.ts'
import { initPropertyDialog, showPropertyDialog } from './components/PropertyDialog.ts'
import {
  initDataManagerDialog,
  showDataManagerDialog,
} from './components/DataManager.ts'
import { parseDatasetContent } from './utils/dataset.ts'
import { parseSmpContent } from './utils/smpParser.ts'

const titlebarEl = document.querySelector<HTMLElement>('.titlebar')!
const menubarEl = document.querySelector<HTMLElement>('.menubar')!
const toolbarEl = document.querySelector<HTMLElement>('.toolbar')!
const graphAreaEl = document.querySelector<HTMLElement>('.graph-area')!
const ctxMenuEl = document.querySelector<HTMLElement>('#ctxMenu')!
const propOverlayEl = document.querySelector<HTMLElement>('#propertyDialogOverlay')!
const dmOverlayEl = document.querySelector<HTMLElement>('#dataManagerOverlay')!
const globalFileInput = document.querySelector<HTMLInputElement>('#globalFileInput')!

// Initialize component logic & event listeners
if (titlebarEl) initTitlebar(titlebarEl)

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
    } else if (action === 'chart' || action === 'text' || title === 'Chart') {
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
      if (file.name.toLowerCase().endsWith('.smp') || file.name.toLowerCase().endsWith('.sma')) {
        const reader = new FileReader()
        reader.onload = async (evt) => {
          const content = evt.target?.result as string
          if (content) {
            const { smpMeta } = parseSmpContent(content, file.name)
            if (smpMeta.docs && smpMeta.docs.length > 0) {
              for (let d = 0; d < smpMeta.docs.length; d++) {
                const doc = smpMeta.docs[d]
                const px = Math.round((doc.left / 20000) * 600 + 40)
                const py = Math.round((doc.top / 20000) * 500 + 40)
                const pw = Math.round((doc.width / 20000) * 600)
                const ph = Math.round((doc.height / 20000) * 500)

                let targetSvg = d === 0 ? getSelectedPlotSvg() : null
                if (!targetSvg) {
                  targetSvg = await createPlot(graphAreaEl, px, py, [])
                } else if (d > 0) {
                  targetSvg.style.left = `${px}px`
                  targetSvg.style.top = `${py}px`
                  targetSvg.style.width = `${pw}px`
                  targetSvg.style.height = `${ph}px`
                }
                setPlotSmpDoc(targetSvg, doc)
                setPlotSmpMeta(targetSvg, smpMeta)
                for (const ds of doc.datasets) {
                  addDatasetToPlot(targetSvg, ds)
                }
              }
            }
          }
        }
        reader.readAsText(file)
      } else if (file.name.endsWith('.txt') || file.type.startsWith('text/')) {
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
        reader.readAsText(file)
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
    } else if (['xaxis', 'yaxis', 'uaxis', 'raxis', 'frame', 'string'].includes(actionKey)) {
      showPropertyDialog(propOverlayEl)
    }
  })
}

// Initialize Plot drag & resize listeners
initPlotDragListeners()

// Initialize Property & Data Manager Dialogs
if (propOverlayEl) initPropertyDialog(propOverlayEl)

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
      const text = await res.text()
      const { smpMeta } = parseSmpContent(text, 'FTIR.SMP')
      if (smpMeta.docs && smpMeta.docs.length > 0) {
        for (let d = 0; d < smpMeta.docs.length; d++) {
          const doc = smpMeta.docs[d]
          const px = Math.round((doc.left / 20000) * 600 + 40)
          const py = Math.round((doc.top / 20000) * 500 + 40)
          const svg = await createPlot(graphAreaEl, px, py, [])
          setPlotSmpDoc(svg, doc)
          setPlotSmpMeta(svg, smpMeta)
          for (const ds of doc.datasets) {
            addDatasetToPlot(svg, ds)
          }
        }
      }
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

const workspaceEl = document.querySelector<HTMLElement>('.workspace') || document.body

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
          const { smpMeta } = parseSmpContent(content, file.name)
          if (smpMeta.docs && smpMeta.docs.length > 0) {
            for (let d = 0; d < smpMeta.docs.length; d++) {
              const doc = smpMeta.docs[d]
              const px = Math.round((doc.left / 20000) * 600 + 40 + d * 30)
              const py = Math.round((doc.top / 20000) * 500 + 40 + d * 30)
              const pw = Math.round((doc.width / 20000) * 600)
              const ph = Math.round((doc.height / 20000) * 500)

              const svg = await createPlot(graphAreaEl, px, py, [])
              svg.style.width = `${pw}px`
              svg.style.height = `${ph}px`
              setPlotSmpDoc(svg, doc)
              setPlotSmpMeta(svg, smpMeta)
              for (const ds of doc.datasets) {
                addDatasetToPlot(svg, ds)
              }
            }
          }
        }
      }
      reader.readAsText(file)
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
      reader.readAsText(file)
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
  const svg = target.closest('.plot-svg') as SVGSVGElement | null
  if (!svg) return
  setSelectedPlotSvg(svg)
  e.preventDefault()
  showContextMenu(ctxMenuEl, e.clientX, e.clientY)
})

document.addEventListener('click', () => hideContextMenu(ctxMenuEl))
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideContextMenu(ctxMenuEl)
})


