import { makeDraggable } from '../utils/draggable.ts'
import { updateAllPlotsTransform } from './Plot.ts'

export function initPropertyDialog(overlayEl: HTMLElement): void {
  const dialogEl = overlayEl.querySelector<HTMLElement>('#propertyDialog')
  const headerEl = overlayEl.querySelector<HTMLElement>('.dialog-header')

  if (dialogEl && headerEl) {
    makeDraggable(dialogEl, headerEl)
  }

  const closeBtn = overlayEl.querySelector('#closePropDialogBtn')
  const cancelBtn = overlayEl.querySelector('#cancelPropBtn')
  const applyBtn = overlayEl.querySelector('#applyPropBtn')
  const helpBtn = overlayEl.querySelector('#helpPropBtn')
  const tabs = overlayEl.querySelectorAll<HTMLButtonElement>('.tab-btn')

  const xTransCheck = overlayEl.querySelector<HTMLInputElement>('#propXTransCheck')
  const xTransExpr = overlayEl.querySelector<HTMLInputElement>('#propXTransExpr')
  const yTransCheck = overlayEl.querySelector<HTMLInputElement>('#propYTransCheck')
  const yTransExpr = overlayEl.querySelector<HTMLInputElement>('#propYTransExpr')

  const applyMathTransformations = () => {
    updateAllPlotsTransform({
      xTransCheck: xTransCheck?.checked,
      xExpr: xTransExpr?.value,
      yTransCheck: yTransCheck?.checked,
      yExpr: yTransExpr?.value,
    })
  }

  const hide = () => hidePropertyDialog(overlayEl)

  closeBtn?.addEventListener('click', hide)
  cancelBtn?.addEventListener('click', hide)
  applyBtn?.addEventListener('click', () => {
    applyMathTransformations()
    hide()
  })

  // Real-time update on change/input in math transformation fields
  xTransCheck?.addEventListener('change', applyMathTransformations)
  xTransExpr?.addEventListener('input', applyMathTransformations)
  yTransCheck?.addEventListener('change', applyMathTransformations)
  yTransExpr?.addEventListener('input', applyMathTransformations)

  helpBtn?.addEventListener('click', () => {
    alert('Property Help: Enter math expressions for X and Y (e.g. y/2+1000, x/2+10) to transform graph scale and offset.')
  })

  // Tab switching logic (file, plot, more...)
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'))
      tab.classList.add('active')
      const targetTab = tab.getAttribute('data-tab')
      const contents = overlayEl.querySelectorAll('.tab-content')
      contents.forEach((c) => c.classList.remove('active'))
      const targetContent = overlayEl.querySelector(`#tab-${targetTab}`)
      targetContent?.classList.add('active')
    })
  })

  // Real-time line sample preview update in Plot tab
  const lineColorInput = overlayEl.querySelector<HTMLInputElement>('#propLineColor')
  const widthInput = overlayEl.querySelector<HTMLInputElement>('#propWidthInput')
  const brushSelect = overlayEl.querySelector<HTMLSelectElement>('#propBrushSelect')
  const sampleLine = overlayEl.querySelector<HTMLElement>('#sampleLineElement')

  const updateSampleLine = () => {
    if (!sampleLine) return
    const color = lineColorInput?.value || '#10b981'
    const width = widthInput?.value || '1'
    const brush = brushSelect?.value || 'solid'

    sampleLine.style.backgroundColor = color
    sampleLine.style.height = `${Math.max(1, parseInt(width, 10))}px`

    if (brush === 'dash') {
      sampleLine.style.borderStyle = 'dashed'
    } else if (brush === 'dot') {
      sampleLine.style.borderStyle = 'dotted'
    } else {
      sampleLine.style.borderStyle = 'none'
    }
  }

  lineColorInput?.addEventListener('input', updateSampleLine)
  widthInput?.addEventListener('input', updateSampleLine)
  brushSelect?.addEventListener('change', updateSampleLine)
}

export function showPropertyDialog(overlayEl: HTMLElement, fileName?: string): void {
  if (fileName) {
    const fileBanner1 = overlayEl.querySelector('#propFilePathText')
    const fileBanner2 = overlayEl.querySelector('#propPlotFilePathText')
    const fullPath = `C:\\Repository\\sma4win-replica\\dummy-data\\${fileName}`
    if (fileBanner1) fileBanner1.textContent = fullPath
    if (fileBanner2) fileBanner2.textContent = fullPath
  }
  overlayEl.style.display = 'flex'
}

export function hidePropertyDialog(overlayEl: HTMLElement): void {
  overlayEl.style.display = 'none'
}
