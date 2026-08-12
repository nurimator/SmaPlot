import type { SmpLegendItem } from '../types.ts'
import { makeDraggable } from '../utils/draggable.ts'
import { smpToUnicode } from '../utils/smpSymbolMapper.ts'
import { getPlotSmpDoc, getSelectedPlotSvg, updatePlotVisual } from './Plot.ts'

let currentTargetSvg: SVGSVGElement | null = null
let currentItemIndex: number = -1

export function initTitleDialog(overlayEl: HTMLElement): void {
  const dialogEl = overlayEl.querySelector<HTMLElement>('#titleDialog')
  const headerEl = overlayEl.querySelector<HTMLElement>('.dialog-header')

  if (dialogEl && headerEl) {
    makeDraggable(dialogEl, headerEl)
  }

  const closeBtn = overlayEl.querySelector('#closeTitleDialogBtn')
  const cancelBtn = overlayEl.querySelector('#titleCancelBtn')
  const okBtn = overlayEl.querySelector('#titleOkBtn')
  const putBtn = overlayEl.querySelector('#titlePutBtn')
  const saveBtn = overlayEl.querySelector('#titleSaveBtn')
  const deleteBtn = overlayEl.querySelector('#titleDeleteBtn')
  const helpBtn = overlayEl.querySelector('#titleHelpBtn')

  const applyTitleOptions = () => {
    const svg = currentTargetSvg || getSelectedPlotSvg()
    const strEl = overlayEl.querySelector<HTMLTextAreaElement>('#titleStringText')
    const rawText = strEl?.value || ''

    if (!svg) return
    const smpDoc = getPlotSmpDoc(svg)
    if (!smpDoc) return

    const rotEl = overlayEl.querySelector<HTMLSelectElement>('#titleRotate')
    const posXEl = overlayEl.querySelector<HTMLInputElement>('#titlePosX')
    const posYEl = overlayEl.querySelector<HTMLInputElement>('#titlePosY')
    const sizeEl = overlayEl.querySelector<HTMLSelectElement>('#titleSize')
    const fontEl = overlayEl.querySelector<HTMLSelectElement>('#titleFont')
    const styleEl = overlayEl.querySelector<HTMLSelectElement>('#titleStyle')

    const text = smpToUnicode(rawText)
    const rotVal = parseInt(rotEl?.value || '0', 10)
    const rotation = rotVal === 90 ? -90 : rotVal
    const xNorm = Math.round((parseFloat(posXEl?.value || '0') || 0) * 100)
    const yNorm = Math.round((parseFloat(posYEl?.value || '0') || 0) * 100)
    const fontSize = parseInt(sizeEl?.value || '16', 10) || 16
    const fontFamily = fontEl?.value || 'cambria'
    const fontWeight = styleEl?.value?.toLowerCase().includes('bold') ? 700 : 400

    const alignRadio = overlayEl.querySelector<HTMLInputElement>('input[name="titleAlign"]:checked')
    const align = (alignRadio?.value as 'left' | 'center' | 'right') || 'left'

    if (currentItemIndex >= 0 && currentItemIndex < smpDoc.legendItems.length) {
      smpDoc.legendItems[currentItemIndex] = {
        ...smpDoc.legendItems[currentItemIndex],
        text,
        rawText: text,
        rotation,
        xNorm,
        yNorm,
        fontSize,
        fontFamily,
        fontWeight,
        align,
      }
    } else {
      const newItem: SmpLegendItem = {
        type: 'text',
        text,
        rawText,
        rotation,
        xNorm,
        yNorm,
        fontSize,
        fontFamily,
        fontWeight,
        align,
      }
      smpDoc.legendItems.push(newItem)
      currentItemIndex = smpDoc.legendItems.length - 1
    }

    updatePlotVisual(svg)
  }

  const hide = () => hideTitleDialog(overlayEl)

  closeBtn?.addEventListener('click', hide)
  cancelBtn?.addEventListener('click', hide)

  okBtn?.addEventListener('click', () => {
    applyTitleOptions()
    hide()
  })

  putBtn?.addEventListener('click', applyTitleOptions)
  saveBtn?.addEventListener('click', applyTitleOptions)

  deleteBtn?.addEventListener('click', () => {
    const svg = currentTargetSvg || getSelectedPlotSvg()
    if (svg) {
      const smpDoc = getPlotSmpDoc(svg)
      if (smpDoc && currentItemIndex >= 0 && currentItemIndex < smpDoc.legendItems.length) {
        smpDoc.legendItems.splice(currentItemIndex, 1)
        updatePlotVisual(svg)
      }
    }
    hide()
  })

  helpBtn?.addEventListener('click', () => {
    alert('Title / Text Editor properties for Sma4Win replica.')
  })

  // Live input change listeners
  const strEl = overlayEl.querySelector<HTMLTextAreaElement>('#titleStringText')
  const rotEl = overlayEl.querySelector<HTMLSelectElement>('#titleRotate')
  const posXEl = overlayEl.querySelector<HTMLInputElement>('#titlePosX')
  const posYEl = overlayEl.querySelector<HTMLInputElement>('#titlePosY')
  const sizeEl = overlayEl.querySelector<HTMLSelectElement>('#titleSize')
  const fontEl = overlayEl.querySelector<HTMLSelectElement>('#titleFont')
  const styleEl = overlayEl.querySelector<HTMLSelectElement>('#titleStyle')

  strEl?.addEventListener('input', applyTitleOptions)
  rotEl?.addEventListener('change', applyTitleOptions)
  posXEl?.addEventListener('input', applyTitleOptions)
  posYEl?.addEventListener('input', applyTitleOptions)
  sizeEl?.addEventListener('change', applyTitleOptions)
  fontEl?.addEventListener('change', applyTitleOptions)
  styleEl?.addEventListener('change', applyTitleOptions)
}

export function showTitleDialog(
  overlayEl: HTMLElement,
  itemIndex: number = -1,
  targetSvg?: SVGSVGElement | null
): void {
  currentTargetSvg = targetSvg || getSelectedPlotSvg()
  currentItemIndex = itemIndex

  const svg = currentTargetSvg
  if (svg) {
    const smpDoc = getPlotSmpDoc(svg)
    if (smpDoc && itemIndex >= 0 && itemIndex < smpDoc.legendItems.length) {
      const item = smpDoc.legendItems[itemIndex]

      const strEl = overlayEl.querySelector<HTMLTextAreaElement>('#titleStringText')
      const rotEl = overlayEl.querySelector<HTMLSelectElement>('#titleRotate')
      const posXEl = overlayEl.querySelector<HTMLInputElement>('#titlePosX')
      const posYEl = overlayEl.querySelector<HTMLInputElement>('#titlePosY')
      const sizeEl = overlayEl.querySelector<HTMLSelectElement>('#titleSize')
      const fontEl = overlayEl.querySelector<HTMLSelectElement>('#titleFont')
      const styleEl = overlayEl.querySelector<HTMLSelectElement>('#titleStyle')

      if (strEl) strEl.value = smpToUnicode(item.text || item.rawText || '').replace(/\\n/g, '\n')

      if (rotEl) {
        const itemRot = Math.round(item.rotation)
        const rotValStr = itemRot === -90 || itemRot === 270 ? '90' : String(itemRot)
        rotEl.value = rotValStr
      }

      if (posXEl) posXEl.value = String(Math.round(item.xNorm / 100))
      if (posYEl) posYEl.value = String(Math.round(item.yNorm / 100))

      if (sizeEl) {
        const sizeValStr = String(item.fontSize || 16)
        const hasOption = Array.from(sizeEl.options).some((o) => o.value === sizeValStr)
        if (!hasOption) {
          const opt = document.createElement('option')
          opt.value = sizeValStr
          opt.textContent = sizeValStr
          sizeEl.appendChild(opt)
        }
        sizeEl.value = sizeValStr
      }

      if (fontEl) {
        const fontVal = item.fontFamily || 'cambria'
        const hasOption = Array.from(fontEl.options).some((o) => o.value === fontVal)
        if (!hasOption) {
          const opt = document.createElement('option')
          opt.value = fontVal
          opt.textContent = fontVal
          fontEl.appendChild(opt)
        }
        fontEl.value = fontVal
      }

      if (styleEl) styleEl.value = item.fontWeight >= 600 ? 'Bold' : 'Regular'

      const alignRadio = overlayEl.querySelector<HTMLInputElement>(`input[name="titleAlign"][value="${item.align || 'left'}"]`)
      if (alignRadio) alignRadio.checked = true
    } else {
      const strEl = overlayEl.querySelector<HTMLTextAreaElement>('#titleStringText')
      const rotEl = overlayEl.querySelector<HTMLSelectElement>('#titleRotate')
      const posXEl = overlayEl.querySelector<HTMLInputElement>('#titlePosX')
      const posYEl = overlayEl.querySelector<HTMLInputElement>('#titlePosY')
      const sizeEl = overlayEl.querySelector<HTMLSelectElement>('#titleSize')
      const fontEl = overlayEl.querySelector<HTMLSelectElement>('#titleFont')
      const styleEl = overlayEl.querySelector<HTMLSelectElement>('#titleStyle')
      const alignRadio = overlayEl.querySelector<HTMLInputElement>('input[name="titleAlign"][value="left"]')

      if (strEl) strEl.value = ''
      if (rotEl) rotEl.value = '0'
      if (posXEl) posXEl.value = '24'
      if (posYEl) posYEl.value = '-5'
      if (sizeEl) sizeEl.value = '16'
      if (fontEl) fontEl.value = 'cambria'
      if (styleEl) styleEl.value = 'Regular'
      if (alignRadio) alignRadio.checked = true
    }
  }

  const dialogEl = overlayEl.querySelector<HTMLElement>('#titleDialog')
  if (dialogEl) {
    dialogEl.style.left = `${Math.max(20, (window.innerWidth - 520) / 2)}px`
    dialogEl.style.top = `${Math.max(20, (window.innerHeight - 350) / 2)}px`
  }

  overlayEl.style.display = 'flex'
}

export function hideTitleDialog(overlayEl: HTMLElement): void {
  overlayEl.style.display = 'none'
}
