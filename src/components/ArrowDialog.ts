import type { SmpLineAnnotation } from '../types.ts'
import { getPlotSmpDoc, getSelectedPlotSvg, updatePlotVisual } from './Plot.ts'
import { pushUndoState } from '../utils/undoManager.ts'

let currentTargetSvg: SVGSVGElement | null = null
let currentAnnotationIndex: number = -1

export function initArrowDialog(overlayEl: HTMLElement): void {
  const dialogEl = overlayEl.querySelector<HTMLElement>('#arrowDialog')
  const closeBtn = overlayEl.querySelector('#closeArrowDialogBtn')
  const okBtn = overlayEl.querySelector('#arrowOkBtn')
  const cancelBtn = overlayEl.querySelector('#arrowCancelBtn')
  const deleteBtn = overlayEl.querySelector('#arrowDeleteBtn')
  const saveBtn = overlayEl.querySelector('#arrowSaveBtn')

  const hide = () => hideArrowDialog(overlayEl)

  if (closeBtn) closeBtn.addEventListener('click', hide)
  if (cancelBtn) cancelBtn.addEventListener('click', hide)

  if (okBtn || saveBtn) {
    const handleApply = () => {
      const svg = currentTargetSvg || getSelectedPlotSvg()
      if (!svg) return
      const smpDoc = getPlotSmpDoc(svg)
      if (!smpDoc) return

      const arrowheadEl = overlayEl.querySelector<HTMLInputElement>('#arrowheadInput')
      const widthEl = overlayEl.querySelector<HTMLInputElement>('#arrowWidthInput')
      const colorEl = overlayEl.querySelector<HTMLInputElement>('#arrowColorInput')
      const lineTypeEl = overlayEl.querySelector<HTMLSelectElement>('#arrowLineTypeSelect')
      const pitchEl = overlayEl.querySelector<HTMLInputElement>('#arrowPitchInput')
      const xStartEl = overlayEl.querySelector<HTMLInputElement>('#arrowXStartInput')
      const yStartEl = overlayEl.querySelector<HTMLInputElement>('#arrowYStartInput')
      const xEndEl = overlayEl.querySelector<HTMLInputElement>('#arrowXEndInput')
      const yEndEl = overlayEl.querySelector<HTMLInputElement>('#arrowYEndInput')
      const shapeEl = overlayEl.querySelector<HTMLSelectElement>('#arrowShapeSelect')
      const spreadEl = overlayEl.querySelector<HTMLInputElement>('#arrowSpreadInput')
      const shutEl = overlayEl.querySelector<HTMLInputElement>('#arrowShutInput')

      const unitXEl = overlayEl.querySelector<HTMLInputElement>('input[name="arrowUnitX"]:checked')
      const unitYEl = overlayEl.querySelector<HTMLInputElement>('input[name="arrowUnitY"]:checked')

      const arrowhead = parseFloat(arrowheadEl?.value || '0.5') || 0.5
      const width = parseFloat(widthEl?.value || '0.4') || 0.4
      const color = colorEl?.value || '#000000'
      const lineTypeVal = lineTypeEl?.value || 'Dashed'
      const style = lineTypeVal.toLowerCase().includes('dashed') ? 'dashed' : 'solid'
      const pitch = parseFloat(pitchEl?.value || '3') || 3
      const x1Norm = parseFloat(xStartEl?.value || '0') || 0
      const y1Norm = parseFloat(yStartEl?.value || '0') || 0
      const x2Norm = parseFloat(xEndEl?.value || '0') || 0
      const y2Norm = parseFloat(yEndEl?.value || '0') || 0
      const shape = shapeEl?.value || 'arrow'
      const spread = parseFloat(spreadEl?.value || '0.3') || 0.3
      const shut = parseFloat(shutEl?.value || '1') || 1
      const unitX = (unitXEl?.value as 'mm' | 'xa' | 'ua') || 'mm'
      const unitY = (unitYEl?.value as 'mm' | 'ya' | 'ra') || 'mm'

      const updatedAnnotation: SmpLineAnnotation = {
        x1Norm,
        y1Norm,
        x2Norm,
        y2Norm,
        style,
        width,
        arrowhead,
        pitch,
        shape,
        spread,
        shut,
        unitX,
        unitY,
        color,
      }

      if (!smpDoc.annotationLines) smpDoc.annotationLines = []

      if (currentAnnotationIndex >= 0 && currentAnnotationIndex < smpDoc.annotationLines.length) {
        smpDoc.annotationLines[currentAnnotationIndex] = updatedAnnotation
      } else {
        smpDoc.annotationLines.push(updatedAnnotation)
      }

      updatePlotVisual(svg)
      pushUndoState()
      hide()
    }

    if (okBtn) okBtn.addEventListener('click', handleApply)
    if (saveBtn) saveBtn.addEventListener('click', handleApply)
  }

  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      const svg = currentTargetSvg || getSelectedPlotSvg()
      if (!svg) return
      const smpDoc = getPlotSmpDoc(svg)
      if (!smpDoc || !smpDoc.annotationLines) return

      if (currentAnnotationIndex >= 0 && currentAnnotationIndex < smpDoc.annotationLines.length) {
        smpDoc.annotationLines.splice(currentAnnotationIndex, 1)
        updatePlotVisual(svg)
        pushUndoState()
      }
      hide()
    })
  }

  // Draggable dialog header
  const headerEl = overlayEl.querySelector<HTMLElement>('.dialog-header')
  if (headerEl && dialogEl) {
    let isDragging = false
    let startX = 0
    let startY = 0
    let startLeft = 0
    let startTop = 0

    headerEl.addEventListener('mousedown', (e: MouseEvent) => {
      if ((e.target as HTMLElement).tagName === 'BUTTON') return
      isDragging = true
      startX = e.clientX
      startY = e.clientY
      startLeft = dialogEl.offsetLeft
      startTop = dialogEl.offsetTop
      e.preventDefault()
    })

    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (!isDragging) return
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      dialogEl.style.left = `${startLeft + dx}px`
      dialogEl.style.top = `${startTop + dy}px`
    })

    document.addEventListener('mouseup', () => {
      isDragging = false
    })
  }
}

export function showArrowDialog(
  overlayEl: HTMLElement,
  annotationIndex: number = -1,
  targetSvg?: SVGSVGElement | null
): void {
  currentTargetSvg = targetSvg || getSelectedPlotSvg()
  currentAnnotationIndex = annotationIndex

  const svg = currentTargetSvg
  if (svg) {
    const smpDoc = getPlotSmpDoc(svg)
    const arrowheadEl = overlayEl.querySelector<HTMLInputElement>('#arrowheadInput')
    const widthEl = overlayEl.querySelector<HTMLInputElement>('#arrowWidthInput')
    const colorEl = overlayEl.querySelector<HTMLInputElement>('#arrowColorInput')
    const lineTypeEl = overlayEl.querySelector<HTMLSelectElement>('#arrowLineTypeSelect')
    const pitchEl = overlayEl.querySelector<HTMLInputElement>('#arrowPitchInput')
    const xStartEl = overlayEl.querySelector<HTMLInputElement>('#arrowXStartInput')
    const yStartEl = overlayEl.querySelector<HTMLInputElement>('#arrowYStartInput')
    const xEndEl = overlayEl.querySelector<HTMLInputElement>('#arrowXEndInput')
    const yEndEl = overlayEl.querySelector<HTMLInputElement>('#arrowYEndInput')
    const shapeEl = overlayEl.querySelector<HTMLSelectElement>('#arrowShapeSelect')
    const spreadEl = overlayEl.querySelector<HTMLInputElement>('#arrowSpreadInput')
    const shutEl = overlayEl.querySelector<HTMLInputElement>('#arrowShutInput')

    if (smpDoc && smpDoc.annotationLines && annotationIndex >= 0 && annotationIndex < smpDoc.annotationLines.length) {
      const aLine = smpDoc.annotationLines[annotationIndex]

      if (arrowheadEl) arrowheadEl.value = String(aLine.arrowhead ?? 0.5)
      if (widthEl) widthEl.value = String(aLine.width ?? 0.4)
      if (colorEl) colorEl.value = aLine.color || '#000000'
      if (lineTypeEl) lineTypeEl.value = aLine.style === 'dashed' ? 'Dashed' : 'Solid'
      if (pitchEl) pitchEl.value = String(aLine.pitch ?? 3)
      if (xStartEl) xStartEl.value = String(Math.round(aLine.x1Norm))
      if (yStartEl) yStartEl.value = String(Math.round(aLine.y1Norm))
      if (xEndEl) xEndEl.value = String(Math.round(aLine.x2Norm))
      if (yEndEl) yEndEl.value = String(Math.round(aLine.y2Norm))
      if (shapeEl) shapeEl.value = aLine.shape || 'arrow'
      if (spreadEl) spreadEl.value = String(aLine.spread ?? 0.3)
      if (shutEl) shutEl.value = String(aLine.shut ?? 1)

      const unitXRadio = overlayEl.querySelector<HTMLInputElement>(`input[name="arrowUnitX"][value="${aLine.unitX || 'mm'}"]`)
      if (unitXRadio) unitXRadio.checked = true

      const unitYRadio = overlayEl.querySelector<HTMLInputElement>(`input[name="arrowUnitY"][value="${aLine.unitY || 'mm'}"]`)
      if (unitYRadio) unitYRadio.checked = true
    } else {
      if (arrowheadEl) arrowheadEl.value = '0.5'
      if (widthEl) widthEl.value = '0.4'
      if (colorEl) colorEl.value = '#000000'
      if (lineTypeEl) lineTypeEl.value = 'Dashed'
      if (pitchEl) pitchEl.value = '3'
      if (xStartEl) xStartEl.value = '18'
      if (yStartEl) yStartEl.value = '92'
      if (xEndEl) xEndEl.value = '18'
      if (yEndEl) yEndEl.value = '20'
      if (shapeEl) shapeEl.value = 'arrow'
      if (spreadEl) spreadEl.value = '0.3'
      if (shutEl) shutEl.value = '1'

      const defaultUnitX = overlayEl.querySelector<HTMLInputElement>('input[name="arrowUnitX"][value="mm"]')
      if (defaultUnitX) defaultUnitX.checked = true
      const defaultUnitY = overlayEl.querySelector<HTMLInputElement>('input[name="arrowUnitY"][value="mm"]')
      if (defaultUnitY) defaultUnitY.checked = true
    }
  }

  const dialogEl = overlayEl.querySelector<HTMLElement>('#arrowDialog')
  if (dialogEl) {
    dialogEl.style.left = `${Math.max(20, (window.innerWidth - 480) / 2)}px`
    dialogEl.style.top = `${Math.max(20, (window.innerHeight - 380) / 2)}px`
  }
  overlayEl.style.display = 'flex'
}

export function hideArrowDialog(overlayEl: HTMLElement): void {
  overlayEl.style.display = 'none'
}
