import type { SmpLineAnnotation } from '../types.ts'
import { getPlotSmpDoc, getSelectedPlotSvg, updatePlotVisual } from './Plot.ts'
import { pushUndoState } from '../utils/undoManager.ts'

let currentTargetSvg: SVGSVGElement | null = null
let currentAnnotationIndex: number = -1

export function initRectangleDialog(overlayEl: HTMLElement): void {
  const dialogEl = overlayEl.querySelector<HTMLElement>('#rectangleDialog')
  const closeBtn = overlayEl.querySelector('#closeRectangleDialogBtn')
  const okBtn = overlayEl.querySelector('#rectangleOkBtn')
  const cancelBtn = overlayEl.querySelector('#rectangleCancelBtn')
  const deleteBtn = overlayEl.querySelector('#rectangleDeleteBtn')
  const saveBtn = overlayEl.querySelector('#rectangleSaveBtn')

  const hide = () => hideRectangleDialog(overlayEl)

  if (closeBtn) closeBtn.addEventListener('click', hide)
  if (cancelBtn) cancelBtn.addEventListener('click', hide)

  if (okBtn || saveBtn) {
    const handleApply = () => {
      const svg = currentTargetSvg || getSelectedPlotSvg()
      if (!svg) return
      const smpDoc = getPlotSmpDoc(svg)
      if (!smpDoc) return

      const faceColorEl = overlayEl.querySelector<HTMLInputElement>('#rectFaceColor')
      const colorEl = overlayEl.querySelector<HTMLInputElement>('#rectColor')
      const thicknessEl = overlayEl.querySelector<HTMLInputElement>('#rectThickness')
      const widthEl = overlayEl.querySelector<HTMLInputElement>('#rectWidth')
      const styleEl = overlayEl.querySelector<HTMLSelectElement>('#rectStyleSelect')
      const roundXEl = overlayEl.querySelector<HTMLInputElement>('#rectRoundX')
      const roundYEl = overlayEl.querySelector<HTMLInputElement>('#rectRoundY')

      const faceColor = faceColorEl?.value || 'none'
      const color = colorEl?.value || '#000000'
      const thickness = parseFloat(thicknessEl?.value || '0.4') || 0.4
      const width = parseFloat(widthEl?.value || '0.4') || 0.4
      const styleVal = styleEl?.value || 'Solid'
      const style = styleVal.toLowerCase().includes('dashed') ? 'dashed' : 'solid'
      const roundX = parseFloat(roundXEl?.value || '0') || 0
      const roundY = parseFloat(roundYEl?.value || '0') || 0

      const updatedAnnotation: SmpLineAnnotation = {
        x1Norm: 0,
        y1Norm: 0,
        x2Norm: 0,
        y2Norm: 0,
        style,
        width,
        color,
        thickness,
        faceColor,
        roundX,
        roundY,
      }

      if (!smpDoc.annotationLines) smpDoc.annotationLines = []

      if (currentAnnotationIndex >= 0 && currentAnnotationIndex < smpDoc.annotationLines.length) {
        const existing = smpDoc.annotationLines[currentAnnotationIndex]
        smpDoc.annotationLines[currentAnnotationIndex] = { ...existing, ...updatedAnnotation }
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
    const faceColorEl = overlayEl.querySelector<HTMLInputElement>('#rectFaceColor')
    const colorEl = overlayEl.querySelector<HTMLInputElement>('#rectColor')
    const thicknessEl = overlayEl.querySelector<HTMLInputElement>('#rectThickness')
    const widthEl = overlayEl.querySelector<HTMLInputElement>('#rectWidth')
    const styleEl = overlayEl.querySelector<HTMLSelectElement>('#rectStyleSelect')
    const roundXEl = overlayEl.querySelector<HTMLInputElement>('#rectRoundX')
    const roundYEl = overlayEl.querySelector<HTMLInputElement>('#rectRoundY')

    if (smpDoc && smpDoc.annotationLines && annotationIndex >= 0 && annotationIndex < smpDoc.annotationLines.length) {
      const aLine = smpDoc.annotationLines[annotationIndex]

      if (faceColorEl) faceColorEl.value = aLine.faceColor || 'none'
      if (colorEl) colorEl.value = aLine.color || '#000000'
      if (thicknessEl) thicknessEl.value = String(aLine.thickness ?? 0.4)
      if (widthEl) widthEl.value = String(aLine.width ?? 0.4)
      if (styleEl) styleEl.value = aLine.style === 'dashed' ? 'Dashed' : 'Solid'
      if (roundXEl) roundXEl.value = String(aLine.roundX ?? 0)
      if (roundYEl) roundYEl.value = String(aLine.roundY ?? 0)
    } else {
      if (faceColorEl) faceColorEl.value = 'none'
      if (colorEl) colorEl.value = '#000000'
      if (thicknessEl) thicknessEl.value = '0.4'
      if (widthEl) widthEl.value = '0.4'
      if (styleEl) styleEl.value = 'Solid'
      if (roundXEl) roundXEl.value = '0'
      if (roundYEl) roundYEl.value = '0'
    }
  }

  const dialogEl = overlayEl.querySelector<HTMLElement>('#rectangleDialog')
  if (dialogEl) {
    dialogEl.style.left = `${Math.max(20, (window.innerWidth - 480) / 2)}px`
    dialogEl.style.top = `${Math.max(20, (window.innerHeight - 380) / 2)}px`
  }
  overlayEl.style.display = 'flex'
}

export function hideRectangleDialog(overlayEl: HTMLElement): void {
  overlayEl.style.display = 'none'
}
