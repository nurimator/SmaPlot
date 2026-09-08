import type { SmpFrameTitle, SmpPlotDoc } from '../types.ts'
import { makeDraggable } from '../utils/draggable.ts'
import { getPlotSmpDoc, getSelectedPlotSvg, PLOT_MARGIN, SMP_SCALE, setAxisSync, syncPlotOverlay, updatePlotVisual } from './plot/index.ts'
import { pushUndoState } from '../utils/undoManager.ts'

let currentTargetSvg: SVGSVGElement | null = null
let initialSnapshot: SmpPlotDoc | null = null
let populateTitleInputsFn: ((doc: SmpPlotDoc) => void) | null = null
let populateScaleInputsFn: ((doc: SmpPlotDoc) => void) | null = null

function parseNum(raw: string | null | undefined, fallback: number): number {
  if (raw === null || raw === undefined || raw.trim() === '') return fallback
  const v = parseFloat(raw)
  return Number.isNaN(v) ? fallback : v
}

interface ScaleReadState {
  isUSynced: boolean
  isRSynced: boolean
  uShow: boolean
  rShow: boolean
  uMin: number
  uMax: number
  rMin: number
  rMax: number
}

function readScaleState(smpDoc: SmpPlotDoc): ScaleReadState {
  const isUSynced = smpDoc.syncWithU !== false && smpDoc.axisX.isSynced !== false
  const isRSynced = smpDoc.syncWithR !== false && smpDoc.axisY.isSynced !== false
  const uShow = smpDoc.axisTop ? smpDoc.axisTop.showTicks !== false : smpDoc.axisX.showTicks !== false
  const rShow = smpDoc.axisRight ? smpDoc.axisRight.showTicks !== false : smpDoc.axisY.showTicks !== false
  const uMin = isUSynced ? smpDoc.axisX.min : (smpDoc.axisTop?.min ?? smpDoc.axisX.min)
  const uMax = isUSynced ? smpDoc.axisX.max : (smpDoc.axisTop?.max ?? smpDoc.axisX.max)
  const rMin = isRSynced ? smpDoc.axisY.min : (smpDoc.axisRight?.min ?? smpDoc.axisY.min)
  const rMax = isRSynced ? smpDoc.axisY.max : (smpDoc.axisRight?.max ?? smpDoc.axisY.max)
  return { isUSynced, isRSynced, uShow, rShow, uMin, uMax, rMin, rMax }
}

interface TitleReadState {
  text: string
  fontFamily: string
  fontSize: number
  bold: boolean
  italic: boolean
  align: 'left' | 'center' | 'right'
  color: string
}

function readTitleState(smpDoc: SmpPlotDoc): TitleReadState {
  const item = smpDoc.frameTitle
  return {
    text: item?.text || '',
    fontFamily: item?.fontFamily || 'Times New Roman',
    fontSize: item?.fontSize || 16,
    bold: item?.bold ?? false,
    italic: item?.italic ?? false,
    align: item?.align || 'center',
    color: item?.color || '#000000',
  }
}

export function initFrameDialog(overlayEl: HTMLElement): void {
  const dialogEl = overlayEl.querySelector<HTMLElement>('#frameDialog')
  const headerEl = overlayEl.querySelector<HTMLElement>('.dialog-header')

  if (dialogEl && headerEl) {
    makeDraggable(dialogEl, headerEl)
  }

  const closeBtn = overlayEl.querySelector('#closeFrameDialogBtn')
  const cancelBtn = overlayEl.querySelector('#cancelFrameBtn')
  const okBtn = overlayEl.querySelector('#okFrameBtn')
  const tabs = overlayEl.querySelectorAll<HTMLButtonElement>('.tab-btn')

  // Frame tab inputs
  const leftMarginInput = overlayEl.querySelector<HTMLInputElement>('#frameLeftMargin')
  const topMarginInput = overlayEl.querySelector<HTMLInputElement>('#frameTopMargin')
  const widthInput = overlayEl.querySelector<HTMLInputElement>('#frameWidthInput')
  const heightInput = overlayEl.querySelector<HTMLInputElement>('#frameHeightInput')
  const lineWidthInput = overlayEl.querySelector<HTMLInputElement>('#frameLineWidth')
  const lineColorInput = overlayEl.querySelector<HTMLInputElement>('#frameLineColor')
  const bgColorInput = overlayEl.querySelector<HTMLInputElement>('#frameBgColor')
  const typeRadios = overlayEl.querySelectorAll<HTMLInputElement>('input[name="frameTypeRadio"]')

  // Title tab inputs
  const titleStringInput = overlayEl.querySelector<HTMLInputElement>('#frameTitleString')
  const titleFontSelect = overlayEl.querySelector<HTMLSelectElement>('#frameTitleFont')
  const titleSizeInput = overlayEl.querySelector<HTMLInputElement>('#frameTitleSize')
  const titleStyleSelect = overlayEl.querySelector<HTMLSelectElement>('#frameTitleStyle')
  const titleAlignSelect = overlayEl.querySelector<HTMLSelectElement>('#frameTitleAlign')
  const titleColorInput = overlayEl.querySelector<HTMLInputElement>('#frameTitleColor')

  // Scale tab inputs
  const frameScaleCheckX = overlayEl.querySelector<HTMLInputElement>('#frameScaleCheckX')
  const frameScaleMinX = overlayEl.querySelector<HTMLInputElement>('#frameScaleMinX')
  const frameScaleMaxX = overlayEl.querySelector<HTMLInputElement>('#frameScaleMaxX')

  const frameScaleCheckY = overlayEl.querySelector<HTMLInputElement>('#frameScaleCheckY')
  const frameScaleMinY = overlayEl.querySelector<HTMLInputElement>('#frameScaleMinY')
  const frameScaleMaxY = overlayEl.querySelector<HTMLInputElement>('#frameScaleMaxY')

  const frameScaleCheckU = overlayEl.querySelector<HTMLInputElement>('#frameScaleCheckU')
  const frameScaleMinU = overlayEl.querySelector<HTMLInputElement>('#frameScaleMinU')
  const frameScaleMaxU = overlayEl.querySelector<HTMLInputElement>('#frameScaleMaxU')

  const frameScaleCheckR = overlayEl.querySelector<HTMLInputElement>('#frameScaleCheckR')
  const frameScaleMinR = overlayEl.querySelector<HTMLInputElement>('#frameScaleMinR')
  const frameScaleMaxR = overlayEl.querySelector<HTMLInputElement>('#frameScaleMaxR')

  const frameSyncXU = overlayEl.querySelector<HTMLInputElement>('#frameSyncXU')
  const frameSyncYR = overlayEl.querySelector<HTMLInputElement>('#frameSyncYR')

  const getOrCreateFrameTitle = (smpDoc: SmpPlotDoc): SmpFrameTitle => {
    if (!smpDoc.frameTitle) {
      smpDoc.frameTitle = {
        text: '',
        fontFamily: 'Times New Roman',
        fontSize: 16,
        bold: false,
        italic: false,
        align: 'center',
        color: '#000000',
      }
    }
    return smpDoc.frameTitle
  }

  const populateTitleInputs = (smpDoc: SmpPlotDoc) => {
    const t = readTitleState(smpDoc)
    if (titleStringInput) titleStringInput.value = t.text
    if (titleFontSelect) titleFontSelect.value = t.fontFamily
    if (titleSizeInput) {
      titleSizeInput.value = String(t.fontSize || 16)
    }
    if (titleStyleSelect) {
      if (t.bold && t.italic) titleStyleSelect.value = 'bold-italic'
      else if (t.bold) titleStyleSelect.value = 'bold'
      else if (t.italic) titleStyleSelect.value = 'italic'
      else titleStyleSelect.value = 'regular'
    }
    if (titleAlignSelect) titleAlignSelect.value = t.align
    if (titleColorInput) titleColorInput.value = t.color
  }

  const applyTitleOptions = () => {
    const svg = currentTargetSvg || getSelectedPlotSvg()
    if (!svg) return
    const smpDoc = getPlotSmpDoc(svg)
    if (!smpDoc) return

    const titleText = titleStringInput?.value || ''
    const item = getOrCreateFrameTitle(smpDoc)
    item.text = titleText
    item.fontFamily = titleFontSelect?.value || 'Times New Roman'
    item.fontSize = parseInt(titleSizeInput?.value || '16', 10) || 16

    const styleVal = titleStyleSelect?.value || 'regular'
    item.bold = styleVal.includes('bold')
    item.italic = styleVal.includes('italic')
    item.align = (titleAlignSelect?.value as 'left' | 'center' | 'right') || 'center'
    item.color = titleColorInput?.value || '#000000'

    syncPlotOverlay(svg)
    updatePlotVisual(svg)
  }

  const populateScaleInputs = (smpDoc: SmpPlotDoc) => {
    if (frameScaleCheckX) frameScaleCheckX.checked = smpDoc.axisX.showTicks !== false
    if (frameScaleMinX) frameScaleMinX.value = String(smpDoc.axisX.min)
    if (frameScaleMaxX) frameScaleMaxX.value = String(smpDoc.axisX.max)

    if (frameScaleCheckY) frameScaleCheckY.checked = smpDoc.axisY.showTicks !== false
    if (frameScaleMinY) frameScaleMinY.value = String(smpDoc.axisY.min)
    if (frameScaleMaxY) frameScaleMaxY.value = String(smpDoc.axisY.max)

    const s = readScaleState(smpDoc)
    if (frameSyncXU) frameSyncXU.checked = s.isUSynced
    if (frameScaleCheckU) frameScaleCheckU.checked = s.uShow
    if (frameScaleMinU) frameScaleMinU.value = String(s.uMin)
    if (frameScaleMaxU) frameScaleMaxU.value = String(s.uMax)

    if (frameSyncYR) frameSyncYR.checked = s.isRSynced
    if (frameScaleCheckR) frameScaleCheckR.checked = s.rShow
    if (frameScaleMinR) frameScaleMinR.value = String(s.rMin)
    if (frameScaleMaxR) frameScaleMaxR.value = String(s.rMax)
  }

  const applyFrameOptions = () => {
    const svg = currentTargetSvg || getSelectedPlotSvg()
    if (!svg) return
    const smpDoc = getPlotSmpDoc(svg)
    if (!smpDoc) return

    const leftMm = parseNum(leftMarginInput?.value, 0)
    const topMm = parseNum(topMarginInput?.value, 0)
    const widthMm = Math.max(10, parseNum(widthInput?.value, 100))
    const heightMm = Math.max(10, parseNum(heightInput?.value, 100))

    smpDoc.left = Math.round(leftMm * 100)
    smpDoc.top = Math.round(topMm * 100)
    smpDoc.width = Math.round(widthMm * 100)
    smpDoc.height = Math.round(heightMm * 100)

    const frameLeft = smpDoc.left * SMP_SCALE
    const frameTop = smpDoc.top * SMP_SCALE
    const frameWidth = smpDoc.width * SMP_SCALE
    const frameHeight = smpDoc.height * SMP_SCALE

    svg.style.left = `${frameLeft - PLOT_MARGIN.l}px`
    svg.style.top = `${frameTop - PLOT_MARGIN.t}px`
    svg.style.width = `${frameWidth + PLOT_MARGIN.l + PLOT_MARGIN.r}px`
    svg.style.height = `${frameHeight + PLOT_MARGIN.t + PLOT_MARGIN.b}px`

    if (lineWidthInput && lineWidthInput.value !== '') {
      smpDoc.frameWidth = parseNum(lineWidthInput.value, 0.4)
    }
    if (lineColorInput) {
      smpDoc.frameColor = lineColorInput.value || '#000000'
    }
    if (bgColorInput) {
      smpDoc.frameBgColor = bgColorInput.value || '#ffffff'
    }

    typeRadios.forEach((r) => {
      if (r.checked) {
        smpDoc.frameType = parseInt(r.value, 10)
      }
    })

    syncPlotOverlay(svg)
    updatePlotVisual(svg)
  }

  const applyScaleOptions = () => {
    const svg = currentTargetSvg || getSelectedPlotSvg()
    if (!svg) return
    const smpDoc = getPlotSmpDoc(svg)
    if (!smpDoc) return

    if (frameScaleCheckX) smpDoc.axisX.showTicks = frameScaleCheckX.checked
    if (frameScaleMinX && frameScaleMinX.value !== '') {
      smpDoc.axisX.min = parseNum(frameScaleMinX.value, 0)
    }
    if (frameScaleMaxX && frameScaleMaxX.value !== '') {
      smpDoc.axisX.max = parseNum(frameScaleMaxX.value, 100)
    }

    if (frameScaleCheckY) smpDoc.axisY.showTicks = frameScaleCheckY.checked
    if (frameScaleMinY && frameScaleMinY.value !== '') {
      smpDoc.axisY.min = parseNum(frameScaleMinY.value, 0)
    }
    if (frameScaleMaxY && frameScaleMaxY.value !== '') {
      smpDoc.axisY.max = parseNum(frameScaleMaxY.value, 100)
    }

    // U axis
    const isUSynced = frameSyncXU ? frameSyncXU.checked : (smpDoc.syncWithU !== false && smpDoc.axisX.isSynced !== false)
    setAxisSync(smpDoc, 'u', isUSynced)
    if (frameScaleCheckU) smpDoc.axisTop!.showTicks = frameScaleCheckU.checked

    if (isUSynced) {
      smpDoc.axisTop!.min = smpDoc.axisX.min
      smpDoc.axisTop!.max = smpDoc.axisX.max
      if (frameScaleMinU) frameScaleMinU.value = String(smpDoc.axisX.min)
      if (frameScaleMaxU) frameScaleMaxU.value = String(smpDoc.axisX.max)
    } else {
      if (frameScaleMinU && frameScaleMinU.value !== '') {
        smpDoc.axisTop!.min = parseNum(frameScaleMinU.value, 0)
      }
      if (frameScaleMaxU && frameScaleMaxU.value !== '') {
        smpDoc.axisTop!.max = parseNum(frameScaleMaxU.value, 100)
      }
    }

    // R axis
    const isRSynced = frameSyncYR ? frameSyncYR.checked : (smpDoc.syncWithR !== false && smpDoc.axisY.isSynced !== false)
    setAxisSync(smpDoc, 'r', isRSynced)
    if (frameScaleCheckR) smpDoc.axisRight!.showTicks = frameScaleCheckR.checked

    if (isRSynced) {
      smpDoc.axisRight!.min = smpDoc.axisY.min
      smpDoc.axisRight!.max = smpDoc.axisY.max
      if (frameScaleMinR) frameScaleMinR.value = String(smpDoc.axisY.min)
      if (frameScaleMaxR) frameScaleMaxR.value = String(smpDoc.axisY.max)
    } else {
      if (frameScaleMinR && frameScaleMinR.value !== '') {
        smpDoc.axisRight!.min = parseNum(frameScaleMinR.value, 0)
      }
      if (frameScaleMaxR && frameScaleMaxR.value !== '') {
        smpDoc.axisRight!.max = parseNum(frameScaleMaxR.value, 100)
      }
    }

    syncPlotOverlay(svg)
    updatePlotVisual(svg)
  }

  const hide = () => hideFrameDialog(overlayEl)

  closeBtn?.addEventListener('click', () => {
    restoreSnapshot()
    hide()
  })

  cancelBtn?.addEventListener('click', () => {
    restoreSnapshot()
    hide()
  })

  okBtn?.addEventListener('click', () => {
    applyFrameOptions()
    applyTitleOptions()
    applyScaleOptions()
    pushUndoState()
    hide()
  })

  const inputs = [
    leftMarginInput,
    topMarginInput,
    widthInput,
    heightInput,
    lineWidthInput,
    lineColorInput,
    bgColorInput,
  ]
  inputs.forEach((input) => {
    input?.addEventListener('input', applyFrameOptions)
    input?.addEventListener('change', applyFrameOptions)
  })

  typeRadios.forEach((radio) => {
    radio.addEventListener('change', applyFrameOptions)
  })

  const titleInputs = [
    titleStringInput,
    titleFontSelect,
    titleSizeInput,
    titleStyleSelect,
    titleAlignSelect,
    titleColorInput,
  ]
  titleInputs.forEach((input) => {
    input?.addEventListener('input', applyTitleOptions)
    input?.addEventListener('change', applyTitleOptions)
  })

  const scaleInputs = [
    frameScaleMinX,
    frameScaleMaxX,
    frameScaleMinY,
    frameScaleMaxY,
    frameScaleMinU,
    frameScaleMaxU,
    frameScaleMinR,
    frameScaleMaxR,
  ]
  scaleInputs.forEach((input) => {
    input?.addEventListener('input', () => {
      if (input === frameScaleMinU || input === frameScaleMaxU) {
        if (frameSyncXU && frameScaleMinX && frameScaleMaxX) {
          if (frameScaleMinU?.value !== frameScaleMinX.value || frameScaleMaxU?.value !== frameScaleMaxX.value) {
            frameSyncXU.checked = false
          }
        }
      }
      if (input === frameScaleMinR || input === frameScaleMaxR) {
        if (frameSyncYR && frameScaleMinY && frameScaleMaxY) {
          if (frameScaleMinR?.value !== frameScaleMinY.value || frameScaleMaxR?.value !== frameScaleMaxY.value) {
            frameSyncYR.checked = false
          }
        }
      }
      applyScaleOptions()
    })
    input?.addEventListener('change', applyScaleOptions)
  })

  const scaleChecks = [
    frameScaleCheckX,
    frameScaleCheckY,
    frameScaleCheckU,
    frameScaleCheckR,
    frameSyncXU,
    frameSyncYR,
  ]
  scaleChecks.forEach((chk) => {
    chk?.addEventListener('change', applyScaleOptions)
  })

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab')
      tabs.forEach((t) => t.classList.toggle('active', t === tab))

      const propsContent = overlayEl.querySelector<HTMLElement>('#tab-frame-props')
      const titleContent = overlayEl.querySelector<HTMLElement>('#tab-frame-title')
      const scaleContent = overlayEl.querySelector<HTMLElement>('#tab-frame-scale')

      if (propsContent) propsContent.style.display = targetTab === 'frame-props' ? 'block' : 'none'
      if (titleContent) titleContent.style.display = targetTab === 'frame-title' ? 'block' : 'none'
      if (scaleContent) scaleContent.style.display = targetTab === 'frame-scale' ? 'block' : 'none'

      const svg = currentTargetSvg || getSelectedPlotSvg()
      if (svg) {
        const doc = getPlotSmpDoc(svg)
        if (doc) {
          if (targetTab === 'frame-title') populateTitleInputs(doc)
          if (targetTab === 'frame-scale') populateScaleInputs(doc)
        }
      }
    })
  })

  populateTitleInputsFn = populateTitleInputs
  populateScaleInputsFn = populateScaleInputs
}

function restoreSnapshot(): void {
  const svg = currentTargetSvg
  if (!svg || !initialSnapshot) return
  const smpDoc = getPlotSmpDoc(svg)
  if (!smpDoc) return

  const snap = structuredClone(initialSnapshot)
  Object.assign(smpDoc, snap)

  if (!('axisTop' in snap) && smpDoc.axisTop) delete smpDoc.axisTop
  if (!('axisRight' in snap) && smpDoc.axisRight) delete smpDoc.axisRight
  if (!('frameTitle' in snap) && smpDoc.frameTitle) delete smpDoc.frameTitle

  const frameLeft = smpDoc.left * SMP_SCALE
  const frameTop = smpDoc.top * SMP_SCALE
  const frameWidth = smpDoc.width * SMP_SCALE
  const frameHeight = smpDoc.height * SMP_SCALE

  svg.style.left = `${frameLeft - PLOT_MARGIN.l}px`
  svg.style.top = `${frameTop - PLOT_MARGIN.t}px`
  svg.style.width = `${frameWidth + PLOT_MARGIN.l + PLOT_MARGIN.r}px`
  svg.style.height = `${frameHeight + PLOT_MARGIN.t + PLOT_MARGIN.b}px`

  syncPlotOverlay(svg)
  updatePlotVisual(svg)
}

export function showFrameDialog(
  overlayEl: HTMLElement,
  targetSvg?: SVGSVGElement | null
): void {
  currentTargetSvg = targetSvg || getSelectedPlotSvg()
  const svg = currentTargetSvg
  if (!svg) return

  const smpDoc: SmpPlotDoc | undefined = getPlotSmpDoc(svg)
  if (!smpDoc) return

  initialSnapshot = structuredClone(smpDoc)

  // Populate Frame inputs
  const leftMarginInput = overlayEl.querySelector<HTMLInputElement>('#frameLeftMargin')
  const topMarginInput = overlayEl.querySelector<HTMLInputElement>('#frameTopMargin')
  const widthInput = overlayEl.querySelector<HTMLInputElement>('#frameWidthInput')
  const heightInput = overlayEl.querySelector<HTMLInputElement>('#frameHeightInput')
  const lineWidthInput = overlayEl.querySelector<HTMLInputElement>('#frameLineWidth')
  const lineColorInput = overlayEl.querySelector<HTMLInputElement>('#frameLineColor')
  const bgColorInput = overlayEl.querySelector<HTMLInputElement>('#frameBgColor')
  const typeRadios = overlayEl.querySelectorAll<HTMLInputElement>('input[name="frameTypeRadio"]')

  if (leftMarginInput) leftMarginInput.value = String(Math.round(smpDoc.left / 100))
  if (topMarginInput) topMarginInput.value = String(Math.round(smpDoc.top / 100))
  if (widthInput) widthInput.value = String(Math.round(smpDoc.width / 100))
  if (heightInput) heightInput.value = String(Math.round(smpDoc.height / 100))
  if (lineWidthInput) lineWidthInput.value = String(smpDoc.frameWidth ?? 0.4)
  if (lineColorInput) lineColorInput.value = smpDoc.frameColor || '#000000'
  if (bgColorInput) bgColorInput.value = smpDoc.frameBgColor || '#ffffff'

  const currentType = smpDoc.frameType !== undefined ? smpDoc.frameType : 1
  typeRadios.forEach((r) => {
    r.checked = parseInt(r.value, 10) === currentType
  })

  // Populate Title inputs
  populateTitleInputsFn?.(smpDoc)

  // Populate Scale inputs
  populateScaleInputsFn?.(smpDoc)

  // Default active tab to Frame
  const tabs = overlayEl.querySelectorAll<HTMLButtonElement>('.tab-btn')
  tabs.forEach((t) => t.classList.toggle('active', t.getAttribute('data-tab') === 'frame-props'))
  const propsContent = overlayEl.querySelector<HTMLElement>('#tab-frame-props')
  const titleContent = overlayEl.querySelector<HTMLElement>('#tab-frame-title')
  const scaleContent = overlayEl.querySelector<HTMLElement>('#tab-frame-scale')
  if (propsContent) propsContent.style.display = 'block'
  if (titleContent) titleContent.style.display = 'none'
  if (scaleContent) scaleContent.style.display = 'none'

  overlayEl.style.display = 'flex'
}

export function hideFrameDialog(overlayEl: HTMLElement): void {
  overlayEl.style.display = 'none'
  currentTargetSvg = null
  initialSnapshot = null
}
