import type { SmpAxisSpec } from '../types.ts'
import { makeDraggable } from '../utils/draggable.ts'
import { getPlotSmpDoc, getSelectedPlotSvg, updatePlotVisual } from './Plot.ts'
import { pushUndoState } from '../utils/undoManager.ts'

type AxisTarget = 'x' | 'y' | 'u' | 'r'

let currentAxisTarget: AxisTarget = 'x'
let currentTargetSvg: SVGSVGElement | null = null

export function initAxisDialog(overlayEl: HTMLElement): void {
  const dialogEl = overlayEl.querySelector<HTMLElement>('#axisDialog')
  const headerEl = overlayEl.querySelector<HTMLElement>('.dialog-header')

  if (dialogEl && headerEl) {
    makeDraggable(dialogEl, headerEl)
  }

  const closeBtn = overlayEl.querySelector('#closeAxisDialogBtn')
  const cancelBtn = overlayEl.querySelector('#cancelAxisBtn')
  const applyBtn = overlayEl.querySelector('#applyAxisBtn')
  const helpBtn = overlayEl.querySelector('#helpAxisBtn')
  const tabs = overlayEl.querySelectorAll<HTMLButtonElement>('.tab-btn')

  // Scale Tab Elements
  const axisDraw = overlayEl.querySelector<HTMLInputElement>('#axisDraw')
  const axisAutoStep = overlayEl.querySelector<HTMLInputElement>('#axisAutoStep')
  const axisFrom = overlayEl.querySelector<HTMLInputElement>('#axisFrom')
  const axisTo = overlayEl.querySelector<HTMLInputElement>('#axisTo')
  const axisIncrement = overlayEl.querySelector<HTMLInputElement>('#axisIncrement')
  const axisDivision = overlayEl.querySelector<HTMLInputElement>('#axisDivision')

  // Label Tab Elements
  const axisDrawLabels = overlayEl.querySelector<HTMLInputElement>('#axisDrawLabels')
  const axisFontFamily = overlayEl.querySelector<HTMLSelectElement>('#axisFontFamily')
  const axisLabelColor = overlayEl.querySelector<HTMLInputElement>('#axisLabelColor')
  const axisFontSize = overlayEl.querySelector<HTMLInputElement>('#axisFontSize')

  const applyAxisOptions = () => {
    const svg = currentTargetSvg || getSelectedPlotSvg()
    if (!svg) return
    const smpDoc = getPlotSmpDoc(svg)
    if (!smpDoc) return

    let targetSpec: SmpAxisSpec = currentAxisTarget === 'y' || currentAxisTarget === 'r' ? smpDoc.axisY : smpDoc.axisX

    if (axisFrom && axisFrom.value !== '') targetSpec.min = parseFloat(axisFrom.value)
    if (axisTo && axisTo.value !== '') targetSpec.max = parseFloat(axisTo.value)
    if (axisIncrement && axisIncrement.value !== '') targetSpec.step = Math.abs(parseFloat(axisIncrement.value))
    if (axisDivision && axisDivision.value !== '') targetSpec.subDivs = parseInt(axisDivision.value, 10) || 5
    if (axisDrawLabels) targetSpec.showLabels = axisDrawLabels.checked
    if (axisFontFamily) targetSpec.fontFamily = axisFontFamily.value

    updatePlotVisual(svg)
    pushUndoState()
  }

  const hide = () => hideAxisDialog(overlayEl)

  closeBtn?.addEventListener('click', hide)
  cancelBtn?.addEventListener('click', hide)
  applyBtn?.addEventListener('click', () => {
    applyAxisOptions()
    hide()
  })

  helpBtn?.addEventListener('click', () => {
    alert(`${currentAxisTarget.toUpperCase()}-axis dialog properties for Sma4Win replica.`)
  })

  // Real-time update listeners
  axisDraw?.addEventListener('change', applyAxisOptions)
  axisAutoStep?.addEventListener('change', applyAxisOptions)
  axisFrom?.addEventListener('input', applyAxisOptions)
  axisTo?.addEventListener('input', applyAxisOptions)
  axisIncrement?.addEventListener('input', applyAxisOptions)
  axisDivision?.addEventListener('input', applyAxisOptions)
  axisDrawLabels?.addEventListener('change', applyAxisOptions)
  axisFontFamily?.addEventListener('change', applyAxisOptions)
  axisLabelColor?.addEventListener('input', applyAxisOptions)
  axisFontSize?.addEventListener('input', applyAxisOptions)

  // Tab switching
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'))
      tab.classList.add('active')

      const tabName = tab.getAttribute('data-tab')
      const tabContents = overlayEl.querySelectorAll('.tab-content')
      tabContents.forEach((tc) => tc.classList.remove('active'))

      const targetContent = overlayEl.querySelector(`#tab-${tabName}`)
      targetContent?.classList.add('active')
    })
  })
}

export function showAxisDialog(
  overlayEl: HTMLElement,
  axisType: AxisTarget = 'x',
  targetSvg?: SVGSVGElement | null
): void {
  currentAxisTarget = axisType
  currentTargetSvg = targetSvg || getSelectedPlotSvg()

  const titleEl = overlayEl.querySelector<HTMLElement>('#axisDialogTitle')
  if (titleEl) {
    titleEl.textContent = `${axisType.toUpperCase()}-axis`
  }
  const commonLabelEl = overlayEl.querySelector<HTMLElement>('#axisCommonLabel')
  if (commonLabelEl) {
    commonLabelEl.textContent = axisType === 'x' || axisType === 'u' ? 'Common with U-axis' : 'Common with R-axis'
  }

  // Populate values from active plot's SmpDoc
  const svg = currentTargetSvg
  if (svg) {
    const smpDoc = getPlotSmpDoc(svg)
    if (smpDoc) {
      const spec = axisType === 'y' || axisType === 'r' ? smpDoc.axisY : smpDoc.axisX

      const axisFrom = overlayEl.querySelector<HTMLInputElement>('#axisFrom')
      const axisTo = overlayEl.querySelector<HTMLInputElement>('#axisTo')
      const axisIncrement = overlayEl.querySelector<HTMLInputElement>('#axisIncrement')
      const axisDivision = overlayEl.querySelector<HTMLInputElement>('#axisDivision')
      const axisDrawLabels = overlayEl.querySelector<HTMLInputElement>('#axisDrawLabels')
      const axisFontFamily = overlayEl.querySelector<HTMLSelectElement>('#axisFontFamily')

      if (axisFrom) axisFrom.value = String(spec.min)
      if (axisTo) axisTo.value = String(spec.max)
      if (axisIncrement) axisIncrement.value = String(Math.abs(spec.step))
      if (axisDivision) axisDivision.value = String(spec.subDivs || 5)
      if (axisDrawLabels) axisDrawLabels.checked = spec.showLabels !== false
      if (axisFontFamily) axisFontFamily.value = spec.fontFamily || 'Times New Roman'
    }
  }

  overlayEl.style.display = 'flex'
}

export function hideAxisDialog(overlayEl: HTMLElement): void {
  overlayEl.style.display = 'none'
}
