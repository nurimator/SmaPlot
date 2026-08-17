import type { SmpAxisSpec } from '../types.ts'
import { makeDraggable } from '../utils/draggable.ts'
import { computeAutoStep } from '../utils/scale.ts'
import { getPlotSmpDoc, getSelectedPlotSvg, updatePlotVisual } from './plot/index.ts'
import { pushUndoState } from '../utils/undoManager.ts'

type AxisTarget = 'x' | 'y' | 'u' | 'r'

let currentAxisTarget: AxisTarget = 'x'
let currentTargetSvg: SVGSVGElement | null = null

// In synced/linked mode a pair (X<->U, Y<->R) behaves as a single axis: scale AND
// tick appearance (Draw included) are shared, so whichever side the user edits is
// mirrored onto its partner. Labels are deliberately excluded — the secondary axis
// keeps them hidden while synced (handled by the caller).
function syncAxisPair(source: SmpAxisSpec, target: SmpAxisSpec): void {
  target.min = source.min
  target.max = source.max
  target.step = source.step
  target.subDivs = source.subDivs
  target.autoStep = source.autoStep

  target.showTicks = source.showTicks
  target.showSubTicks = source.showSubTicks
  target.insideTicks = source.insideTicks

  target.majorIn = source.majorIn
  target.majorOut = source.majorOut
  target.majorLength = source.majorLength
  target.majorWidth = source.majorWidth
  target.majorColor = source.majorColor
  target.majorStyle = source.majorStyle

  target.minorIn = source.minorIn
  target.minorOut = source.minorOut
  target.minorLength = source.minorLength
  target.minorWidth = source.minorWidth
  target.minorColor = source.minorColor
  target.minorStyle = source.minorStyle
}

export function initAxisDialog(overlayEl: HTMLElement): void {
  const dialogEl = overlayEl.querySelector<HTMLElement>('#axisDialog')
  const headerEl = overlayEl.querySelector<HTMLElement>('.dialog-header')

  if (dialogEl && headerEl) {
    makeDraggable(dialogEl, headerEl)
  }

  const closeBtn = overlayEl.querySelector('#closeAxisDialogBtn')
  const cancelBtn = overlayEl.querySelector('#cancelAxisBtn')
  const applyBtn = overlayEl.querySelector('#applyAxisBtn')
  const tabs = overlayEl.querySelectorAll<HTMLButtonElement>('.tab-btn')

  // Scale Tab Elements
  const axisDraw = overlayEl.querySelector<HTMLInputElement>('#axisDraw')
  const axisAutoStep = overlayEl.querySelector<HTMLInputElement>('#axisAutoStep')
  const axisFrom = overlayEl.querySelector<HTMLInputElement>('#axisFrom')
  const axisTo = overlayEl.querySelector<HTMLInputElement>('#axisTo')
  const axisIncrement = overlayEl.querySelector<HTMLInputElement>('#axisIncrement')
  const axisDivision = overlayEl.querySelector<HTMLInputElement>('#axisDivision')
  const axisSync = overlayEl.querySelector<HTMLInputElement>('#axisSync')

  // Tick Tab Elements
  const axisMajorIn = overlayEl.querySelector<HTMLInputElement>('#axisMajorIn')
  const axisMajorOut = overlayEl.querySelector<HTMLInputElement>('#axisMajorOut')
  const axisMajorColor = overlayEl.querySelector<HTMLInputElement>('#axisMajorColor')
  const axisMajorWidth = overlayEl.querySelector<HTMLInputElement>('#axisMajorWidth')
  const axisMajorStyle = overlayEl.querySelector<HTMLSelectElement>('#axisMajorStyle')
  const axisMajorLength = overlayEl.querySelector<HTMLInputElement>('#axisMajorLength')

  const axisMinorIn = overlayEl.querySelector<HTMLInputElement>('#axisMinorIn')
  const axisMinorOut = overlayEl.querySelector<HTMLInputElement>('#axisMinorOut')
  const axisMinorColor = overlayEl.querySelector<HTMLInputElement>('#axisMinorColor')
  const axisMinorWidth = overlayEl.querySelector<HTMLInputElement>('#axisMinorWidth')
  const axisMinorStyle = overlayEl.querySelector<HTMLSelectElement>('#axisMinorStyle')
  const axisMinorLength = overlayEl.querySelector<HTMLInputElement>('#axisMinorLength')

  // Label Tab Elements
  const axisDrawLabels = overlayEl.querySelector<HTMLInputElement>('#axisDrawLabels')
  const axisFontFamily = overlayEl.querySelector<HTMLSelectElement>('#axisFontFamily')
  const axisLabelColor = overlayEl.querySelector<HTMLInputElement>('#axisLabelColor')
  const axisFontStyle = overlayEl.querySelector<HTMLSelectElement>('#axisFontStyle')
  const axisFontSize = overlayEl.querySelector<HTMLInputElement>('#axisFontSize')
  const axisShiftRight = overlayEl.querySelector<HTMLInputElement>('#axisShiftRight')
  const axisShiftDown = overlayEl.querySelector<HTMLInputElement>('#axisShiftDown')

  const applyAxisOptions = () => {
    const svg = currentTargetSvg || getSelectedPlotSvg()
    if (!svg) return
    const smpDoc = getPlotSmpDoc(svg)
    if (!smpDoc) return

    let targetSpec: SmpAxisSpec
    if (currentAxisTarget === 'x') {
      targetSpec = smpDoc.axisX
    } else if (currentAxisTarget === 'y') {
      targetSpec = smpDoc.axisY
    } else if (currentAxisTarget === 'u') {
      if (!smpDoc.axisTop) {
        smpDoc.axisTop = { ...smpDoc.axisX, showLabels: false, isSynced: smpDoc.syncWithU !== false }
      }
      targetSpec = smpDoc.axisTop
    } else {
      if (!smpDoc.axisRight) {
        smpDoc.axisRight = { ...smpDoc.axisY, showLabels: false, isSynced: smpDoc.syncWithR !== false }
      }
      targetSpec = smpDoc.axisRight
    }

    if (axisDraw) targetSpec.showTicks = axisDraw.checked
    if (axisFrom && axisFrom.value !== '') targetSpec.min = parseFloat(axisFrom.value)
    if (axisTo && axisTo.value !== '') targetSpec.max = parseFloat(axisTo.value)

    if (axisAutoStep) {
      targetSpec.autoStep = axisAutoStep.checked
      if (axisIncrement) axisIncrement.disabled = axisAutoStep.checked
    }

    if (targetSpec.autoStep) {
      const auto = computeAutoStep(targetSpec.min, targetSpec.max)
      targetSpec.step = auto.increment
      targetSpec.subDivs = auto.division
      if (axisIncrement) axisIncrement.value = String(auto.increment)
      if (axisDivision) axisDivision.value = String(auto.division)
    } else if (axisIncrement && axisIncrement.value !== '') {
      targetSpec.step = Math.abs(parseFloat(axisIncrement.value)) || 1
    }

    if (axisDivision && axisDivision.value !== '') targetSpec.subDivs = parseInt(axisDivision.value, 10) || 5

    // Tick specs
    if (axisMajorIn) targetSpec.majorIn = axisMajorIn.checked
    if (axisMajorOut) targetSpec.majorOut = axisMajorOut.checked
    if (axisMajorColor) targetSpec.majorColor = axisMajorColor.value
    if (axisMajorWidth && axisMajorWidth.value !== '') targetSpec.majorWidth = parseFloat(axisMajorWidth.value) || 0.4
    if (axisMajorStyle) targetSpec.majorStyle = axisMajorStyle.value
    if (axisMajorLength && axisMajorLength.value !== '') targetSpec.majorLength = parseFloat(axisMajorLength.value) || 6

    if (axisMinorIn) targetSpec.minorIn = axisMinorIn.checked
    if (axisMinorOut) targetSpec.minorOut = axisMinorOut.checked
    if (axisMinorColor) targetSpec.minorColor = axisMinorColor.value
    if (axisMinorWidth && axisMinorWidth.value !== '') targetSpec.minorWidth = parseFloat(axisMinorWidth.value) || 0.4
    if (axisMinorStyle) targetSpec.minorStyle = axisMinorStyle.value
    if (axisMinorLength && axisMinorLength.value !== '') targetSpec.minorLength = parseFloat(axisMinorLength.value) || 3

    // Label specs
    if (axisDrawLabels) targetSpec.showLabels = axisDrawLabels.checked
    if (axisFontFamily) targetSpec.fontFamily = axisFontFamily.value
    if (axisLabelColor) targetSpec.labelColor = axisLabelColor.value
    if (axisFontStyle) {
      targetSpec.fontStyle = axisFontStyle.value
      targetSpec.fontWeight = axisFontStyle.value === 'bold' ? 700 : 400
    }
    if (axisFontSize && axisFontSize.value !== '') targetSpec.fontSize = parseInt(axisFontSize.value, 10) || 24
    if (axisShiftRight && axisShiftRight.value !== '') targetSpec.shiftRight = parseFloat(axisShiftRight.value) || 0
    if (axisShiftDown && axisShiftDown.value !== '') targetSpec.shiftDown = parseFloat(axisShiftDown.value) || 0

    // Linked (synced) axis logic:
    if (currentAxisTarget === 'x' || currentAxisTarget === 'u') {
      const isSynced = axisSync ? axisSync.checked : true
      smpDoc.syncWithU = isSynced
      smpDoc.axisX.isSynced = isSynced
      if (!smpDoc.axisTop) {
        smpDoc.axisTop = { ...smpDoc.axisX, showLabels: !isSynced, isSynced }
      }
      smpDoc.axisTop.isSynced = isSynced

      if (isSynced) {
        if (currentAxisTarget === 'x') {
          syncAxisPair(smpDoc.axisX, smpDoc.axisTop)
        } else {
          syncAxisPair(smpDoc.axisTop, smpDoc.axisX)
        }
        smpDoc.axisTop.showLabels = false
      }
    } else if (currentAxisTarget === 'y' || currentAxisTarget === 'r') {
      const isSynced = axisSync ? axisSync.checked : true
      smpDoc.syncWithR = isSynced
      smpDoc.axisY.isSynced = isSynced
      if (!smpDoc.axisRight) {
        smpDoc.axisRight = { ...smpDoc.axisY, showLabels: !isSynced, isSynced }
      }
      smpDoc.axisRight.isSynced = isSynced

      if (isSynced) {
        if (currentAxisTarget === 'y') {
          syncAxisPair(smpDoc.axisY, smpDoc.axisRight)
        } else {
          syncAxisPair(smpDoc.axisRight, smpDoc.axisY)
        }
        smpDoc.axisRight.showLabels = false
      }
    }

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

  // Real-time update listeners for all controls
  const allControls = [
    axisDraw, axisFrom, axisTo, axisDivision, axisSync,
    axisMajorIn, axisMajorOut, axisMajorColor, axisMajorWidth, axisMajorStyle, axisMajorLength,
    axisMinorIn, axisMinorOut, axisMinorColor, axisMinorWidth, axisMinorStyle, axisMinorLength,
    axisDrawLabels, axisFontFamily, axisLabelColor, axisFontStyle, axisFontSize, axisShiftRight, axisShiftDown
  ]
  allControls.forEach(ctrl => {
    ctrl?.addEventListener('change', applyAxisOptions)
    ctrl?.addEventListener('input', applyAxisOptions)
  })

  axisAutoStep?.addEventListener('change', () => {
    if (axisAutoStep && axisAutoStep.checked) {
      if (axisFrom && axisTo) {
        const minVal = parseFloat(axisFrom.value) || 0
        const maxVal = parseFloat(axisTo.value) || 100
        const autoSt = computeAutoStep(minVal, maxVal)
        if (axisIncrement) {
          axisIncrement.value = String(autoSt.increment)
          axisIncrement.disabled = true
        }
        if (axisDivision) {
          axisDivision.value = String(autoSt.division)
        }
      }
    } else if (axisIncrement) {
      axisIncrement.disabled = false
    }
    applyAxisOptions()
  })
  axisIncrement?.addEventListener('input', () => {
    if (axisAutoStep) axisAutoStep.checked = false
    if (axisIncrement) axisIncrement.disabled = false
    applyAxisOptions()
  })

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
  const syncLabelEl = overlayEl.querySelector<HTMLElement>('#axisSyncLabel')
  if (syncLabelEl) {
    if (axisType === 'x') syncLabelEl.textContent = 'Sync with U-axis'
    else if (axisType === 'u') syncLabelEl.textContent = 'Sync with X-axis'
    else if (axisType === 'y') syncLabelEl.textContent = 'Sync with R-axis'
    else syncLabelEl.textContent = 'Sync with Y-axis'
  }

  // Populate values from active plot's SmpDoc
  const svg = currentTargetSvg
  if (svg) {
    const smpDoc = getPlotSmpDoc(svg)
    if (smpDoc) {
      let spec: SmpAxisSpec
      let isSynced: boolean

      if (axisType === 'x') {
        spec = smpDoc.axisX
        isSynced = smpDoc.syncWithU !== false && smpDoc.axisX.isSynced !== false
      } else if (axisType === 'y') {
        spec = smpDoc.axisY
        isSynced = smpDoc.syncWithR !== false && smpDoc.axisY.isSynced !== false
      } else if (axisType === 'u') {
        if (!smpDoc.axisTop) {
          smpDoc.axisTop = { ...smpDoc.axisX, showLabels: false, isSynced: smpDoc.syncWithU !== false }
        }
        spec = smpDoc.axisTop
        isSynced = smpDoc.syncWithU !== false && smpDoc.axisTop.isSynced !== false
      } else {
        if (!smpDoc.axisRight) {
          smpDoc.axisRight = { ...smpDoc.axisY, showLabels: false, isSynced: smpDoc.syncWithR !== false }
        }
        spec = smpDoc.axisRight
        isSynced = smpDoc.syncWithR !== false && smpDoc.axisRight.isSynced !== false
      }

      const axisDraw = overlayEl.querySelector<HTMLInputElement>('#axisDraw')
      const axisSync = overlayEl.querySelector<HTMLInputElement>('#axisSync')
      const axisFrom = overlayEl.querySelector<HTMLInputElement>('#axisFrom')
      const axisTo = overlayEl.querySelector<HTMLInputElement>('#axisTo')
      const axisAutoStep = overlayEl.querySelector<HTMLInputElement>('#axisAutoStep')
      const axisIncrement = overlayEl.querySelector<HTMLInputElement>('#axisIncrement')
      const axisDivision = overlayEl.querySelector<HTMLInputElement>('#axisDivision')

      const axisMajorIn = overlayEl.querySelector<HTMLInputElement>('#axisMajorIn')
      const axisMajorOut = overlayEl.querySelector<HTMLInputElement>('#axisMajorOut')
      const axisMajorColor = overlayEl.querySelector<HTMLInputElement>('#axisMajorColor')
      const axisMajorWidth = overlayEl.querySelector<HTMLInputElement>('#axisMajorWidth')
      const axisMajorStyle = overlayEl.querySelector<HTMLSelectElement>('#axisMajorStyle')
      const axisMajorLength = overlayEl.querySelector<HTMLInputElement>('#axisMajorLength')

      const axisMinorIn = overlayEl.querySelector<HTMLInputElement>('#axisMinorIn')
      const axisMinorOut = overlayEl.querySelector<HTMLInputElement>('#axisMinorOut')
      const axisMinorColor = overlayEl.querySelector<HTMLInputElement>('#axisMinorColor')
      const axisMinorWidth = overlayEl.querySelector<HTMLInputElement>('#axisMinorWidth')
      const axisMinorStyle = overlayEl.querySelector<HTMLSelectElement>('#axisMinorStyle')
      const axisMinorLength = overlayEl.querySelector<HTMLInputElement>('#axisMinorLength')

      const axisDrawLabels = overlayEl.querySelector<HTMLInputElement>('#axisDrawLabels')
      const axisFontFamily = overlayEl.querySelector<HTMLSelectElement>('#axisFontFamily')
      const axisLabelColor = overlayEl.querySelector<HTMLInputElement>('#axisLabelColor')
      const axisFontStyle = overlayEl.querySelector<HTMLSelectElement>('#axisFontStyle')
      const axisFontSize = overlayEl.querySelector<HTMLInputElement>('#axisFontSize')
      const axisShiftRight = overlayEl.querySelector<HTMLInputElement>('#axisShiftRight')
      const axisShiftDown = overlayEl.querySelector<HTMLInputElement>('#axisShiftDown')

      if (axisSync) axisSync.checked = isSynced
      if (axisDraw) axisDraw.checked = spec.showTicks !== false
      if (axisFrom) axisFrom.value = String(spec.min)
      if (axisTo) axisTo.value = String(spec.max)
      if (axisAutoStep) axisAutoStep.checked = spec.autoStep ?? false
      if (axisIncrement) {
        axisIncrement.value = String(Math.abs(spec.step))
        axisIncrement.disabled = spec.autoStep ?? false
      }
      if (axisDivision) axisDivision.value = String(spec.subDivs || 5)

      if (axisMajorIn) axisMajorIn.checked = spec.majorIn ?? (spec.insideTicks !== false)
      if (axisMajorOut) axisMajorOut.checked = spec.majorOut ?? false
      if (axisMajorColor) axisMajorColor.value = spec.majorColor || '#000000'
      if (axisMajorWidth) axisMajorWidth.value = String(spec.majorWidth ?? 0.4)
      if (axisMajorStyle) axisMajorStyle.value = spec.majorStyle || 'solid'
      if (axisMajorLength) axisMajorLength.value = String(spec.majorLength ?? 6)

      if (axisMinorIn) axisMinorIn.checked = spec.minorIn ?? (spec.insideTicks !== false)
      if (axisMinorOut) axisMinorOut.checked = spec.minorOut ?? false
      if (axisMinorColor) axisMinorColor.value = spec.minorColor || '#000000'
      if (axisMinorWidth) axisMinorWidth.value = String(spec.minorWidth ?? 0.4)
      if (axisMinorStyle) axisMinorStyle.value = spec.minorStyle || 'solid'
      if (axisMinorLength) axisMinorLength.value = String(spec.minorLength ?? 3)

      if (axisDrawLabels) axisDrawLabels.checked = spec.showLabels !== false
      if (axisFontFamily) axisFontFamily.value = spec.fontFamily || 'Times New Roman'
      if (axisLabelColor) axisLabelColor.value = spec.labelColor || '#000000'
      if (axisFontStyle) axisFontStyle.value = spec.fontStyle || (spec.fontWeight >= 600 ? 'bold' : 'regular')
      if (axisFontSize) axisFontSize.value = String(spec.fontSize || 24)
      if (axisShiftRight) axisShiftRight.value = String(spec.shiftRight || 0)
      if (axisShiftDown) axisShiftDown.value = String(spec.shiftDown || 0)
    }
  }

  overlayEl.style.display = 'flex'
}

export function hideAxisDialog(overlayEl: HTMLElement): void {
  overlayEl.style.display = 'none'
}
