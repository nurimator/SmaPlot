import type { SmpLegendItem } from '../types.ts'
import { makeDraggable } from '../utils/draggable.ts'
import { pushSheetHeight, unpushSheetHeight } from '../utils/sheetSwipe.ts'
import { smpToUnicode, SYMBOL_ENTRIES } from '../utils/smpSymbolMapper.ts'
import { getPlotSmpDoc, getSelectedPlotSvg, updatePlotVisual } from './plot/index.ts'
import { pushUndoState } from '../utils/undoManager.ts'

let currentTargetSvg: SVGSVGElement | null = null
let currentItemIndex: number = -1
let currentPreset: TitlePreset | null = null

/** Predefined position/rotation/font for a newly inserted legend text item (e.g. axis titles). */
export interface TitlePreset {
  /** Sma4Win legend item type: 4=X-axis title, 5=Y-axis title, 6=U-axis title, 7=R-axis title */
  legendType?: number
  /** Stored rotation in degrees (-90 for vertical axis titles) */
  rotation: number
  /** Horizontal position in mm from the frame origin (converted to normalized xNorm on commit) */
  posX: number
  /** Vertical position in mm from the frame origin (converted to normalized yNorm on commit) */
  posY: number
  fontSize: number
  fontFamily?: string
}

const autoGrowTextarea = (el: HTMLTextAreaElement | null) => {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

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
  const deleteBtn = overlayEl.querySelector('#titleDeleteBtn')
  const symbolBtn = overlayEl.querySelector('#titleSymbolBtn')
  const symbolPanel = overlayEl.querySelector<HTMLElement>('#titleSymbolPanel')
  const symbolCloseBtn = overlayEl.querySelector('#titleSymbolCloseBtn')
  const symbolGrid = overlayEl.querySelector<HTMLElement>('#titleSymbolGrid')

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
    const docWidthMm = ((smpDoc.width || 10000) / 100) || 100
    const docHeightMm = ((smpDoc.height || 10000) / 100) || 100
    const xNorm = Math.round(((parseFloat(posXEl?.value || '0') || 0) / docWidthMm) * 10000)
    const yNorm = Math.round(((parseFloat(posYEl?.value || '0') || 0) / docHeightMm) * 10000)
    const fontSize = parseInt(sizeEl?.value || '16', 10) || 16
    const fontFamily = fontEl?.value || 'Times New Roman'
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
        legendType: currentPreset?.legendType,
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
    pushUndoState()
  }

  const hide = () => hideTitleDialog(overlayEl)

  closeBtn?.addEventListener('click', hide)
  cancelBtn?.addEventListener('click', hide)

  okBtn?.addEventListener('click', () => {
    applyTitleOptions()
    hide()
  })

  putBtn?.addEventListener('click', applyTitleOptions)

  deleteBtn?.addEventListener('click', () => {
    const svg = currentTargetSvg || getSelectedPlotSvg()
    if (svg) {
      const smpDoc = getPlotSmpDoc(svg)
      if (smpDoc && currentItemIndex >= 0 && currentItemIndex < smpDoc.legendItems.length) {
        smpDoc.legendItems.splice(currentItemIndex, 1)
        updatePlotVisual(svg)
        pushUndoState()
      }
    }
    hide()
  })

  const strEl = overlayEl.querySelector<HTMLTextAreaElement>('#titleStringText')

  const insertSymbolAtCursor = (char: string) => {
    if (!strEl) return
    const start = strEl.selectionStart ?? strEl.value.length
    const end = strEl.selectionEnd ?? strEl.value.length
    strEl.value = strEl.value.slice(0, start) + char + strEl.value.slice(end)
    const caret = start + char.length
    strEl.focus()
    strEl.setSelectionRange(caret, caret)
    autoGrowTextarea(strEl)
    applyTitleOptions()
  }

  const repositionSymbolPanel = () => {
    if (!symbolPanel || !dialogEl) return
    if (symbolPanel.style.display === 'none' || !symbolPanel.style.display) return
    const dlgLeft = parseInt(dialogEl.style.left || '0', 10) || 0
    const dlgTop = parseInt(dialogEl.style.top || '0', 10) || 0
    const dlgW = dialogEl.offsetWidth || 520
    const dlgH = dialogEl.offsetHeight || 350
    symbolPanel.style.height = `${dlgH}px`
    const panelW = symbolPanel.offsetWidth || 300
    const panelH = symbolPanel.offsetHeight || dlgH
    let panelLeft = dlgLeft + dlgW + 12
    if (panelLeft + panelW > window.innerWidth - 20) {
      panelLeft = Math.max(20, dlgLeft - panelW - 12)
    }
    let panelTop = dlgTop
    if (panelTop + panelH > window.innerHeight - 20) {
      panelTop = Math.max(20, window.innerHeight - 20 - panelH)
    }
    symbolPanel.style.left = `${panelLeft}px`
    symbolPanel.style.top = `${panelTop}px`
  }

  const toggleSymbolPanel = () => {
    if (!symbolPanel) return
    const isHidden = symbolPanel.style.display === 'none' || !symbolPanel.style.display
    if (isHidden) {
      symbolPanel.style.display = 'flex'
      repositionSymbolPanel()
    } else {
      symbolPanel.style.display = 'none'
    }
  }

  if (symbolGrid && symbolGrid.childElementCount === 0) {
    const categories = new Set<string>()
    for (const entry of SYMBOL_ENTRIES) {
      categories.add(entry.category)
      const cell = document.createElement('button')
      cell.type = 'button'
      cell.className = 'title-symbol-cell'
      cell.textContent = entry.unicodeChar
      cell.title = entry.desc
      cell.dataset.name = entry.desc
      cell.dataset.category = entry.category
      cell.addEventListener('click', () => insertSymbolAtCursor(entry.unicodeChar))
      symbolGrid.appendChild(cell)
    }

    const categorySelect = overlayEl.querySelector<HTMLSelectElement>('#titleSymbolCategory')
    if (categorySelect) {
      for (const cat of categories) {
        const opt = document.createElement('option')
        opt.value = cat
        opt.textContent = cat
        categorySelect.appendChild(opt)
      }
    }
  }

  const symbolSearch = overlayEl.querySelector<HTMLInputElement>('#titleSymbolSearch')
  const symbolCategory = overlayEl.querySelector<HTMLSelectElement>('#titleSymbolCategory')

  const filterSymbols = () => {
    const q = (symbolSearch?.value || '').trim().toLowerCase()
    const cat = symbolCategory?.value || 'all'
    const cells = symbolGrid?.querySelectorAll<HTMLElement>('.title-symbol-cell')
    cells?.forEach((c) => {
      const name = (c.dataset.name || '').toLowerCase()
      const cCat = c.dataset.category || ''
      const matchSearch = !q || name.includes(q)
      const matchCat = cat === 'all' || cat === cCat
      c.style.display = matchSearch && matchCat ? '' : 'none'
    })
  }

  symbolSearch?.addEventListener('input', filterSymbols)
  symbolCategory?.addEventListener('change', filterSymbols)

  symbolBtn?.addEventListener('click', toggleSymbolPanel)
  symbolCloseBtn?.addEventListener('click', () => {
    if (symbolPanel) symbolPanel.style.display = 'none'
  })

  if (dialogEl && symbolPanel) {
    const mo = new MutationObserver(repositionSymbolPanel)
    mo.observe(dialogEl, { attributes: true, attributeFilter: ['style'] })
  }

  // Mobile: the symbol panel is a bottom sheet too — reserve its height in the
  // workspace push so it never covers the canvas.
  if (symbolPanel) {
    const symbolPushObserver = new MutationObserver(() => {
      if (symbolPanel.style.display === 'flex') {
        pushSheetHeight(symbolPanel.offsetHeight)
      } else {
        unpushSheetHeight()
      }
    })
    symbolPushObserver.observe(symbolPanel, { attributes: true, attributeFilter: ['style'] })
  }

  // Live input change listeners
  const rotEl = overlayEl.querySelector<HTMLSelectElement>('#titleRotate')
  const posXEl = overlayEl.querySelector<HTMLInputElement>('#titlePosX')
  const posYEl = overlayEl.querySelector<HTMLInputElement>('#titlePosY')
  const sizeEl = overlayEl.querySelector<HTMLSelectElement>('#titleSize')
  const fontEl = overlayEl.querySelector<HTMLSelectElement>('#titleFont')
  const styleEl = overlayEl.querySelector<HTMLSelectElement>('#titleStyle')

  strEl?.addEventListener('input', () => {
    autoGrowTextarea(strEl)
    applyTitleOptions()
  })
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
  targetSvg?: SVGSVGElement | null,
  initialText?: string,
  preset?: TitlePreset
): void {
  currentTargetSvg = targetSvg || getSelectedPlotSvg()
  currentItemIndex = itemIndex
  currentPreset = preset || null

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

      if (posXEl || posYEl) {
        const docWidthMm = ((smpDoc.width || 10000) / 100) || 100
        const docHeightMm = ((smpDoc.height || 10000) / 100) || 100
        if (posXEl) posXEl.value = String(Math.round((item.xNorm / 10000) * docWidthMm))
        if (posYEl) posYEl.value = String(Math.round((item.yNorm / 10000) * docHeightMm))
      }

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
        const fontVal = item.fontFamily || 'Times New Roman'
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

      if (strEl) strEl.value = initialText || ''
      if (rotEl) {
        const rotVal = preset ? (preset.rotation === -90 || preset.rotation === 270 ? '90' : String(preset.rotation)) : '0'
        rotEl.value = rotVal
      }
      if (posXEl) posXEl.value = String(preset ? preset.posX : 24)
      if (posYEl) posYEl.value = String(preset ? preset.posY : -5)

      const presetSize = preset ? String(preset.fontSize) : '16'
      if (sizeEl) {
        const hasOption = Array.from(sizeEl.options).some((o) => o.value === presetSize)
        if (!hasOption) {
          const opt = document.createElement('option')
          opt.value = presetSize
          opt.textContent = presetSize
          sizeEl.appendChild(opt)
        }
        sizeEl.value = presetSize
      }

      const presetFont = preset?.fontFamily || 'Times New Roman'
      if (fontEl) {
        const hasOption = Array.from(fontEl.options).some((o) => o.value === presetFont)
        if (!hasOption) {
          const opt = document.createElement('option')
          opt.value = presetFont
          opt.textContent = presetFont
          fontEl.appendChild(opt)
        }
        fontEl.value = presetFont
      }

      if (styleEl) styleEl.value = 'Regular'
      if (alignRadio) alignRadio.checked = true
    }
  }

  overlayEl.style.display = 'flex'

  const symbolPanel = overlayEl.querySelector<HTMLElement>('#titleSymbolPanel')
  if (symbolPanel) symbolPanel.style.display = 'none'

  const strEl = overlayEl.querySelector<HTMLTextAreaElement>('#titleStringText')
  autoGrowTextarea(strEl)

  const dialogEl = overlayEl.querySelector<HTMLElement>('#titleDialog')
  if (dialogEl && !window.matchMedia('(max-width: 640px)').matches) {
    const dlgW = dialogEl.offsetWidth || 520
    const dlgH = dialogEl.offsetHeight || 350
    dialogEl.style.left = `${Math.max(20, (window.innerWidth - dlgW) / 2)}px`
    dialogEl.style.top = `${Math.max(20, (window.innerHeight - dlgH) / 2)}px`
  }
}

export function hideTitleDialog(overlayEl: HTMLElement): void {
  currentPreset = null
  const symbolPanel = overlayEl.querySelector<HTMLElement>('#titleSymbolPanel')
  if (symbolPanel) symbolPanel.style.display = 'none'
  overlayEl.style.display = 'none'
}
