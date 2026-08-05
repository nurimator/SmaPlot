import './style.css'
import { renderTitlebar } from './components/Titlebar.ts'
import { renderMenubar } from './components/Menubar.ts'
import { renderToolbar } from './components/Toolbar.ts'
import { renderStatusbar } from './components/Statusbar.ts'
import { renderContextMenu, hideContextMenu, showContextMenu } from './components/ContextMenu.ts'
import { createPlot, getActiveDrag, getBoxCount, initPlotDragListeners } from './components/Plot.ts'

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
<div class="app">
  ${renderTitlebar()}
  ${renderMenubar()}
  ${renderToolbar()}

  <!-- Main Workspace -->
  <main class="workspace">
    <div class="workspace-grid">
      <div class="graph-area"></div>
      <div class="workspace-right"></div>
    </div>

    <div class="scrollbar-v">
      <div class="scroll-btn" title="Scroll up"><span class="material-symbols-outlined">arrow_drop_up</span></div>
      <div class="scroll-btn" title="Scroll down"><span class="material-symbols-outlined">arrow_drop_down</span></div>
    </div>
    <div class="scrollbar-h">
      <div class="scroll-btn" title="Scroll left"><span class="material-symbols-outlined">arrow_left</span></div>
      <div class="scroll-btn" title="Scroll right"><span class="material-symbols-outlined">arrow_right</span></div>
    </div>
  </main>

  ${renderStatusbar()}
  ${renderContextMenu()}
</div>
`

const graphArea = app.querySelector<HTMLDivElement>('.graph-area')!
const newBtn = app.querySelector<HTMLDivElement>('[data-action="new"]')!
const ctxMenu = app.querySelector<HTMLDivElement>('#ctxMenu')!

// Initialize plot drag & resize listeners
initPlotDragListeners()

newBtn.addEventListener('click', async () => {
  const boxCount = getBoxCount()
  const offset = (boxCount % 6) * 28
  await createPlot(graphArea, 40 + offset, 40 + offset)
})

graphArea.addEventListener('contextmenu', (e) => {
  if (getActiveDrag()) {
    e.preventDefault()
    return
  }
  const target = e.target as HTMLElement
  if (!target.closest('.plot-svg')) return
  e.preventDefault()
  showContextMenu(ctxMenu, e.clientX, e.clientY)
})

document.addEventListener('click', () => hideContextMenu(ctxMenu))
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideContextMenu(ctxMenu)
})
