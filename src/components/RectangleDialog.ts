import type { SmpLineAnnotation } from '../types.ts'
import { getPlotSmpDoc, getSelectedPlotSvg, updatePlotVisual } from './Plot.ts'
import { pushUndoState } from '../utils/undoManager.ts'
import { beginShapeDraw } from './ShapeDraw.ts'
import { makeDraggable } from '../utils/draggable.ts'

let currentTargetSvg: SVGSVGElement | null = null
let currentAnnotationIndex: number = -1

export function initRectangleDialog(overlayEl: HTMLElement): void {
  const dialogEl = overlayEl.querySelector<HTMLElement>('#rectangleDialog')
  const closeBtn = overlayEl.querySelector('#closeRectangleDialogBtn')
  const okBtn = overlayEl.querySelector('#rectangleOkBtn')
  const cancelBtn = overlayEl.querySelector('#rectangleCancelBtn')
  const deleteBtn = overlayEl.querySelector('#rectangleDeleteBtn')
  const saveBtn = overlayEl.querySelector('#rectangleSaveBtn')
  const drawBtn = overlayEl.querySelector('#rectangleDrawBtn')

  const hide = () => hideRectangleDialog(overlayEl)

  if (closeBtn) closeBtn.addEventListener('click', hide)
  if (cancelBtn) cancelBtn.addEventListener('click', hide)

  const applyChanges = (shouldClose: boolean) => {
    const svg = currentTargetSvg || getSelectedPlotSvg()
    if (!svg) return
    const smpDoc = getPlotSmpDoc(svg)
    if (!smpDoc) return

    const startXEl = overlayEl.querySelector<HTMLInputElement>('#rectStartX')
    const startYEl = overlayEl.querySelector<HTMLInputElement>('#rectStartY')
    const endXEl = overlayEl.querySelector<HTMLInputElement>('#rectEndX')
    const endYEl = overlayEl.querySelector<HTMLInputElement>('#rectEndY')
    const faceColorEl = overlayEl.querySelector<HTMLInputElement>('#rectFaceColor')
    const shadeEl = overlayEl.querySelector<HTMLInputElement>('#rectShade')
    const shadeColorEl = overlayEl.querySelector<HTMLInputElement>('#rectShadeColor')
    const thicknessEl = overlayEl.querySelector<HTMLInputElement>('#rectThickness')
    const roundXEl = overlayEl.querySelector<HTMLInputElement>('#rectRoundX')
    const roundYEl = overlayEl.querySelector<HTMLInputElement>('#rectRoundY')

    const x1Norm = parseFloat(startXEl?.value || '70') || 70
    const y1Norm = parseFloat(startYEl?.value || '50') || 50
    const x2Norm = parseFloat(endXEl?.value || '90') || 90
    const y2Norm = parseFloat(endYEl?.value || '20.5') || 20.5
    const faceColor = faceColorEl?.value || '#ffffff'
    const shadeDepth = parseFloat(shadeEl?.value || '0') || 0
    const shadeColor = shadeColorEl?.value || '#000000'
    const thickness = parseFloat(thicknessEl?.value || '0.4') || 0.4
    const roundX = parseFloat(roundXEl?.value || '0') || 0
    const roundY = parseFloat(roundYEl?.value || '0') || 0

    const updatedAnnotation: SmpLineAnnotation = {
      x1Norm,
      y1Norm,
      x2Norm,
      y2Norm,
      style: 'solid',
      width: thickness,
      thickness,
      color: shadeColor,
      faceColor,
      shadeDepth,
      shadeColor,
      roundX,
      roundY,
      shape: 'rectangle',
    }

    if (!smpDoc.annotationLines) smpDoc.annotationLines = []

    if (currentAnnotationIndex >= 0 && currentAnnotationIndex < smpDoc.annotationLines.length) {
      const existing = smpDoc.annotationLines[currentAnnotationIndex]
      smpDoc.annotationLines[currentAnnotationIndex] = { ...existing, ...updatedAnnotation }
    } else {
      smpDoc.annotationLines.push(updatedAnnotation)
      currentAnnotationIndex = smpDoc.annotationLines.length - 1
    }

    updatePlotVisual(svg)
    pushUndoState()
    if (shouldClose) hide()
  }

  const handleStartMouseDraw = () => {
    const svg = currentTargetSvg || getSelectedPlotSvg()
    if (!svg) return
    beginShapeDraw({
      shape: 'rectangle',
      svg,
      overlayEl,
      annotationIndex: currentAnnotationIndex,
    })
  }

  if (drawBtn) drawBtn.addEventListener('click', handleStartMouseDraw)
  if (okBtn) okBtn.addEventListener('click', () => applyChanges(true))
  if (saveBtn) saveBtn.addEventListener('click', () => applyChanges(true))

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

export function showRectangleDialog(
  overlayEl: HTMLElement,
  annotationIndex: number = -1,
  targetSvg?: SVGSVGElement | null
): void {
  currentTargetSvg = targetSvg || getSelectedPlotSvg()
  currentAnnotationIndex = annotationIndex

  const svg = currentTargetSvg
  if (svg) {
    const smpDoc = getPlotSmpDoc(svg)
    const startXEl = overlayEl.querySelector<HTMLInputElement>('#rectStartX')
    const startYEl = overlayEl.querySelector<HTMLInputElement>('#rectStartY')
    const endXEl = overlayEl.querySelector<HTMLInputElement>('#rectEndX')
    const endYEl = overlayEl.querySelector<HTMLInputElement>('#rectEndY')
    const faceColorEl = overlayEl.querySelector<HTMLInputElement>('#rectFaceColor')
    const shadeEl = overlayEl.querySelector<HTMLInputElement>('#rectShade')
    const shadeColorEl = overlayEl.querySelector<HTMLInputElement>('#rectShadeColor')
    const thicknessEl = overlayEl.querySelector<HTMLInputElement>('#rectThickness')
    const roundXEl = overlayEl.querySelector<HTMLInputElement>('#rectRoundX')
    const roundYEl = overlayEl.querySelector<HTMLInputElement>('#rectRoundY')

function formatNum(val: number): string {
  if (isNaN(val)) return '0'
  const rounded = Math.round(val * 100) / 100
  return String(rounded)
}

    if (smpDoc && smpDoc.annotationLines && annotationIndex >= 0 && annotationIndex < smpDoc.annotationLines.length) {
      const aLine = smpDoc.annotationLines[annotationIndex]

      if (startXEl) startXEl.value = formatNum(aLine.x1Norm ?? 70)
      if (startYEl) startYEl.value = formatNum(aLine.y1Norm ?? 50)
      if (endXEl) endXEl.value = formatNum(aLine.x2Norm ?? 90)
      if (endYEl) endYEl.value = formatNum(aLine.y2Norm ?? 20.5)
      if (faceColorEl) faceColorEl.value = aLine.faceColor || '#ffffff'
      if (shadeEl) shadeEl.value = formatNum(aLine.shadeDepth ?? 0)
      if (shadeColorEl) shadeColorEl.value = aLine.shadeColor || aLine.color || '#000000'
      if (thicknessEl) thicknessEl.value = formatNum(aLine.thickness ?? aLine.width ?? 0.4)
      if (roundXEl) roundXEl.value = formatNum(aLine.roundX ?? 0)
      if (roundYEl) roundYEl.value = formatNum(aLine.roundY ?? 0)
    } else {
      if (startXEl) startXEl.value = '70'
      if (startYEl) startYEl.value = '50'
      if (endXEl) endXEl.value = '90'
      if (endYEl) endYEl.value = '20.5'
      if (faceColorEl) faceColorEl.value = '#ffffff'
      if (shadeEl) shadeEl.value = '0'
      if (shadeColorEl) shadeColorEl.value = '#000000'
      if (thicknessEl) thicknessEl.value = '0.4'
      if (roundXEl) roundXEl.value = '0'
      if (roundYEl) roundYEl.value = '0'
    }
  }

  const dialogEl = overlayEl.querySelector<HTMLElement>('#rectangleDialog')
  if (dialogEl) {
    dialogEl.style.display = ''
    if (!window.matchMedia('(max-width: 640px)').matches) {
      dialogEl.style.left = `${Math.max(20, (window.innerWidth - 380) / 2)}px`
      dialogEl.style.top = `${Math.max(20, (window.innerHeight - 340) / 2)}px`
    }
  }
  overlayEl.style.display = 'flex'
}

export function hideRectangleDialog(overlayEl: HTMLElement): void {
  overlayEl.style.display = 'none'
}
