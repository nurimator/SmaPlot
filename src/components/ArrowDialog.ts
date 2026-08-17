import type { SmpLineAnnotation } from '../types.ts'
import { getPlotSmpDoc, getSelectedPlotSvg, updatePlotVisual } from './plot/index.ts'
import { pushUndoState } from '../utils/undoManager.ts'
import { beginShapeDraw } from './ShapeDraw.ts'
import { makeDraggable } from '../utils/draggable.ts'

let currentTargetSvg: SVGSVGElement | null = null
let currentAnnotationIndex: number = -1

export function initArrowDialog(overlayEl: HTMLElement): void {
  const dialogEl = overlayEl.querySelector<HTMLElement>('#arrowDialog')
  const closeBtn = overlayEl.querySelector('#closeArrowDialogBtn')
  const okBtn = overlayEl.querySelector('#arrowOkBtn')
  const cancelBtn = overlayEl.querySelector('#arrowCancelBtn')
  const deleteBtn = overlayEl.querySelector('#arrowDeleteBtn')
  const saveBtn = overlayEl.querySelector('#arrowSaveBtn')
  const drawBtn = overlayEl.querySelector('#arrowDrawBtn')

  const hide = () => hideArrowDialog(overlayEl)

  const handleStartMouseDraw = () => {
    const svg = currentTargetSvg || getSelectedPlotSvg()
    if (!svg) return
    beginShapeDraw({
      shape: 'arrow',
      svg,
      overlayEl,
      annotationIndex: currentAnnotationIndex,
      baseAnnotation: buildArrowFromDialog(),
    })
  }

  if (drawBtn) drawBtn.addEventListener('click', handleStartMouseDraw)

  if (closeBtn) closeBtn.addEventListener('click', hide)
  if (cancelBtn) cancelBtn.addEventListener('click', hide)

  const buildArrowFromDialog = (): SmpLineAnnotation => {
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

    const arrowhead = parseFloat(arrowheadEl?.value || '5.0') || 5.0
    const width = parseFloat(widthEl?.value || '0.4') || 0.4
    const color = colorEl?.value || '#000000'
    const style = lineTypeEl?.value || 'solid'
    const pitch = parseFloat(pitchEl?.value || '3') || 3
    const x1Norm = parseFloat(xStartEl?.value || '0') || 0
    const y1Norm = parseFloat(yStartEl?.value || '0') || 0
    const x2Norm = parseFloat(xEndEl?.value || '0') || 0
    const y2Norm = parseFloat(yEndEl?.value || '0') || 0
    const shape = shapeEl?.value || 'arrow_end'
    let arrowMode = 1
    if (shape === 'arrow_start') arrowMode = 2
    else if (shape === 'arrow_both') arrowMode = 3
    else if (shape === 'line' || shape === 'measure_line') arrowMode = 0
    const spread = parseFloat(spreadEl?.value || '30') || 30
    const shut = parseFloat(shutEl?.value || '100') || 100
    const unitX = (unitXEl?.value as 'mm' | 'xa' | 'ua') || 'mm'
    const unitY = (unitYEl?.value as 'mm' | 'ya' | 'ra') || 'mm'

    return {
      x1Norm,
      y1Norm,
      x2Norm,
      y2Norm,
      style,
      width,
      arrowhead,
      pitch,
      shape,
      arrowMode,
      spread,
      shut,
      unitX,
      unitY,
      color,
    }
  }

  const previewArrow = (): void => {
    if (currentAnnotationIndex < 0) return
    const svg = currentTargetSvg || getSelectedPlotSvg()
    if (!svg) return
    const smpDoc = getPlotSmpDoc(svg)
    if (!smpDoc || !smpDoc.annotationLines) return
    if (currentAnnotationIndex >= smpDoc.annotationLines.length) return
    smpDoc.annotationLines[currentAnnotationIndex] = buildArrowFromDialog()
    updatePlotVisual(svg)
  }

  if (okBtn || saveBtn) {
    const handleApply = () => {
      const svg = currentTargetSvg || getSelectedPlotSvg()
      if (!svg) return
      const smpDoc = getPlotSmpDoc(svg)
      if (!smpDoc) return

      if (!smpDoc.annotationLines) smpDoc.annotationLines = []

      if (currentAnnotationIndex >= 0 && currentAnnotationIndex < smpDoc.annotationLines.length) {
        smpDoc.annotationLines[currentAnnotationIndex] = buildArrowFromDialog()
      } else {
        smpDoc.annotationLines.push(buildArrowFromDialog())
      }

      updatePlotVisual(svg)
      pushUndoState()
      hide()
    }

    if (okBtn) okBtn.addEventListener('click', handleApply)
    if (saveBtn) saveBtn.addEventListener('click', handleApply)
  }

  // Real-time preview: update the plot as arrow parameters change in the panel.
  const liveEls: (Element | null)[] = [
    overlayEl.querySelector('#arrowheadInput'),
    overlayEl.querySelector('#arrowWidthInput'),
    overlayEl.querySelector('#arrowColorInput'),
    overlayEl.querySelector('#arrowLineTypeSelect'),
    overlayEl.querySelector('#arrowPitchInput'),
    overlayEl.querySelector('#arrowXStartInput'),
    overlayEl.querySelector('#arrowYStartInput'),
    overlayEl.querySelector('#arrowXEndInput'),
    overlayEl.querySelector('#arrowYEndInput'),
    overlayEl.querySelector('#arrowShapeSelect'),
    overlayEl.querySelector('#arrowSpreadInput'),
    overlayEl.querySelector('#arrowShutInput'),
  ]
  liveEls.forEach((el) => {
    if (!el) return
    el.addEventListener('input', previewArrow)
    el.addEventListener('change', previewArrow)
  })
  overlayEl.querySelectorAll<HTMLInputElement>('input[name="arrowUnitX"]').forEach((r) =>
    r.addEventListener('change', previewArrow)
  )
  overlayEl.querySelectorAll<HTMLInputElement>('input[name="arrowUnitY"]').forEach((r) =>
    r.addEventListener('change', previewArrow)
  )

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
    makeDraggable(dialogEl, headerEl)
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

      if (arrowheadEl) arrowheadEl.value = String(aLine.arrowhead ?? 5.0)
      if (widthEl) widthEl.value = String(aLine.width ?? 0.4)
      if (colorEl) colorEl.value = aLine.color || '#000000'
      if (lineTypeEl) lineTypeEl.value = aLine.style === 'dashed' ? 'dash' : aLine.style || 'solid'
      if (pitchEl) pitchEl.value = String(aLine.pitch ?? 3)
      if (xStartEl) xStartEl.value = String(Math.round(aLine.x1Norm))
      if (yStartEl) yStartEl.value = String(Math.round(aLine.y1Norm))
      if (xEndEl) xEndEl.value = String(Math.round(aLine.x2Norm))
      if (yEndEl) yEndEl.value = String(Math.round(aLine.y2Norm))
      if (shapeEl) {
        shapeEl.value = aLine.shape === 'measure_line' ? 'measure_line' : (
          aLine.arrowMode === 2 || aLine.shape === 'arrow_start' ? 'arrow_start' :
          aLine.arrowMode === 3 || aLine.shape === 'arrow_both' ? 'arrow_both' :
          aLine.arrowMode === 0 || aLine.shape === 'line' ? 'line' : 'arrow_end'
        )
      }
      if (spreadEl) spreadEl.value = String(aLine.spread ?? 30)
      if (shutEl) shutEl.value = String(aLine.shut ?? 100)

      const unitXRadio = overlayEl.querySelector<HTMLInputElement>(`input[name="arrowUnitX"][value="${aLine.unitX || 'mm'}"]`)
      if (unitXRadio) unitXRadio.checked = true

      const unitYRadio = overlayEl.querySelector<HTMLInputElement>(`input[name="arrowUnitY"][value="${aLine.unitY || 'mm'}"]`)
      if (unitYRadio) unitYRadio.checked = true
    } else {
      if (arrowheadEl) arrowheadEl.value = '5.0'
      if (widthEl) widthEl.value = '0.4'
      if (colorEl) colorEl.value = '#000000'
      if (lineTypeEl) lineTypeEl.value = 'solid'
      if (pitchEl) pitchEl.value = '3'
      if (xStartEl) xStartEl.value = '18'
      if (yStartEl) yStartEl.value = '92'
      if (xEndEl) xEndEl.value = '18'
      if (yEndEl) yEndEl.value = '20'
      if (shapeEl) shapeEl.value = 'arrow_end'
      if (spreadEl) spreadEl.value = '30'
      if (shutEl) shutEl.value = '100'

      const defaultUnitX = overlayEl.querySelector<HTMLInputElement>('input[name="arrowUnitX"][value="mm"]')
      if (defaultUnitX) defaultUnitX.checked = true
      const defaultUnitY = overlayEl.querySelector<HTMLInputElement>('input[name="arrowUnitY"][value="mm"]')
      if (defaultUnitY) defaultUnitY.checked = true
    }
  }

  const dialogEl = overlayEl.querySelector<HTMLElement>('#arrowDialog')
  if (dialogEl) {
    dialogEl.style.display = ''
    if (!window.matchMedia('(max-width: 640px)').matches) {
      dialogEl.style.left = `${Math.max(20, (window.innerWidth - 480) / 2)}px`
      dialogEl.style.top = `${Math.max(20, (window.innerHeight - 380) / 2)}px`
    }
  }
  overlayEl.style.display = 'flex'
}

export function hideArrowDialog(overlayEl: HTMLElement): void {
  overlayEl.style.display = 'none'
}
