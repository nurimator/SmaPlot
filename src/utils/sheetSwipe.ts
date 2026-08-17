const SCROLLABLE_SELECTOR = [
  '.dialog-content',
  '.data-manager-body',
  '.title-dialog-body',
  '.rect-dialog-body',
  '.arrow-dialog-body',
  '.color-picker-body',
  '.confirm-body',
].join(', ')

const DISMISS_DISTANCE = 110
const START_THRESHOLD = 10
const DISMISS_ANIM_MS = 220
const MIN_SHEET_RATIO = 0.1
const MAX_SHEET_RATIO = 0.92
const IGNORE_TARGETS = 'button, input, select, textarea, a, [contenteditable="true"]'

import { adaptCanvasToHeight, setCanvasTransition, snapshotCanvasAdapt } from './canvasZoom.ts'

const sheetHeights = new Map<object, number>()
const transientKey: object = {}

function updateSheetPush(): void {
  let max = 0
  for (const h of sheetHeights.values()) max = Math.max(max, h)
  document.documentElement.style.setProperty('--sheet-h', max > 0 ? `${max}px` : '0px')
}

const NAV_BAR_H = 56

function currentSheetPush(): number {
  const raw = document.documentElement.style.getPropertyValue('--sheet-h')
  const h = parseFloat(raw)
  return Number.isFinite(h) && h > 0 ? h : 0
}

function effectivePad(push: number): number {
  return Math.max(push, NAV_BAR_H)
}

function gridHeight(): number {
  const grid = document.querySelector<HTMLElement>('.workspace-grid')
  return grid ? grid.clientHeight : 0
}

export function pushSheetHeight(px: number): void {
  const oldPush = currentSheetPush()
  const oldGridH = gridHeight()
  sheetHeights.set(transientKey, px)
  updateSheetPush()
  const newPush = currentSheetPush()
  animateCanvasAdapt(oldGridH - (effectivePad(newPush) - effectivePad(oldPush)))
}

export function unpushSheetHeight(): void {
  const oldPush = currentSheetPush()
  const oldGridH = gridHeight()
  sheetHeights.delete(transientKey)
  updateSheetPush()
  const newPush = currentSheetPush()
  animateCanvasAdapt(oldGridH - (effectivePad(newPush) - effectivePad(oldPush)))
}

function workspaceEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.workspace')
}

const CANVAS_ANIM_MS = 320

function animateCanvasAdapt(targetH: number): void {
  if (targetH <= 0) return
  snapshotCanvasAdapt()
  setCanvasTransition(true)
  adaptCanvasToHeight(targetH)
  endCanvasTransition()
}

function endCanvasTransition(): void {
  window.setTimeout(() => setCanvasTransition(false), CANVAS_ANIM_MS)
}

export function initSheetSwipe(sheetEl: HTMLElement, onDismiss: () => void): void {
  initPullToClose(sheetEl, onDismiss)
  initHeaderResize(sheetEl, onDismiss)
  trackSheetPush(sheetEl)
}

function initPullToClose(sheetEl: HTMLElement, onDismiss: () => void): void {
  let startY = 0
  let startX = 0
  let active = false
  let pulling = false

  sheetEl.addEventListener(
    'touchstart',
    (e: TouchEvent) => {
      if (!window.matchMedia('(max-width: 640px)').matches) return
      const touch = e.touches[0]
      if (!touch) return
      const target = e.target as HTMLElement
      if (target.closest(`${IGNORE_TARGETS}, .dialog-header`)) return
      startY = touch.clientY
      startX = touch.clientX
      active = true
      pulling = false
    },
    { passive: true }
  )

  sheetEl.addEventListener(
    'touchmove',
    (e: TouchEvent) => {
      if (!active) return
      const touch = e.touches[0]
      if (!touch) return
      const dy = touch.clientY - startY
      const dx = touch.clientX - startX

      if (!pulling) {
        if (dy < START_THRESHOLD || Math.abs(dx) > Math.abs(dy)) return
        const scroller = (e.target as HTMLElement).closest<HTMLElement>(SCROLLABLE_SELECTOR)
        if (scroller && scroller.scrollTop > 0) return
        pulling = true
        sheetEl.style.transition = 'none'
        sheetEl.style.willChange = 'translate, opacity'
      }

      sheetEl.style.translate = `0 ${dy * 0.45}px`
      sheetEl.style.opacity = String(Math.max(0.25, 1 - dy / Math.max(sheetEl.offsetHeight, 400)))
    },
    { passive: true }
  )

  sheetEl.addEventListener(
    'touchend',
    (e: TouchEvent) => {
      if (!active) return
      active = false
      if (!pulling) return
      const touch = e.changedTouches[0]
      const dy = touch ? touch.clientY - startY : 0
      pulling = false
      sheetEl.style.willChange = ''
      sheetEl.style.transition = 'translate 0.25s ease, opacity 0.25s ease'

      if (dy >= DISMISS_DISTANCE) {
        sheetEl.style.translate = `0 ${sheetEl.offsetHeight}px`
        sheetEl.style.opacity = '0'
        window.setTimeout(() => {
          sheetEl.style.transition = ''
          sheetEl.style.translate = ''
          sheetEl.style.opacity = ''
          onDismiss()
        }, DISMISS_ANIM_MS)
      } else {
        sheetEl.style.translate = ''
        sheetEl.style.opacity = ''
      }
    },
    { passive: true }
  )
}

function initHeaderResize(sheetEl: HTMLElement, onDismiss: () => void): void {
  const headerEl = sheetEl.querySelector<HTMLElement>('.dialog-header')
  if (!headerEl) return

  let startY = 0
  let startHeight = 0
  let resizing = false
  let closeOnRelease = false

  headerEl.addEventListener('pointerdown', (e: PointerEvent) => {
    if (!window.matchMedia('(max-width: 640px)').matches) return
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest(IGNORE_TARGETS)) return
    resizing = true
    closeOnRelease = false
    startY = e.clientY
    startHeight = sheetEl.offsetHeight
    headerEl.setPointerCapture(e.pointerId)
    e.preventDefault()
    sheetEl.style.transition = 'none'
    sheetEl.style.willChange = 'height, translate'
    setCanvasTransition(false)
    const workspace = workspaceEl()
    if (workspace) workspace.style.transition = 'none'
    snapshotCanvasAdapt()
  })

  headerEl.addEventListener('pointermove', (e: PointerEvent) => {
    if (!resizing) return
    const viewportH = window.innerHeight
    const minH = Math.round(viewportH * MIN_SHEET_RATIO)
    const maxPx = parseFloat(getComputedStyle(sheetEl).maxHeight || '')
    const maxH = Number.isFinite(maxPx) && maxPx > 0 ? maxPx : viewportH * MAX_SHEET_RATIO
    const targetH = startHeight - (e.clientY - startY)

    let appliedH: number
    if (targetH <= minH) {
      closeOnRelease = true
      appliedH = Math.max(0, Math.round(targetH))
      sheetEl.style.height = `${minH}px`
      sheetEl.style.translate = `0 ${minH - targetH}px`
    } else {
      closeOnRelease = false
      appliedH = Math.min(targetH, maxH)
      sheetEl.style.height = `${appliedH}px`
      sheetEl.style.translate = ''
    }

    const overlay = sheetEl.parentElement
    if (overlay) {
      sheetHeights.set(overlay, appliedH)
      updateSheetPush()
    }
    adaptCanvasToHeight(gridHeight())
  })

  const finishResize = (dismissed: boolean): void => {
    if (!resizing) return
    resizing = false
    sheetEl.style.willChange = ''
    const workspace = workspaceEl()
    if (workspace) workspace.style.transition = ''
    sheetEl.style.transition = 'height 0.2s ease, translate 0.25s ease'

    if (dismissed) {
      sheetEl.style.height = ''
      sheetEl.style.translate = `0 ${sheetEl.offsetHeight}px`
      window.setTimeout(() => {
        sheetEl.style.transition = ''
        sheetEl.style.translate = ''
        onDismiss()
      }, DISMISS_ANIM_MS)
    } else {
      sheetEl.style.translate = ''
    }
  }

  headerEl.addEventListener('pointerup', () => finishResize(closeOnRelease))
  headerEl.addEventListener('pointercancel', () => finishResize(false))
}

function trackSheetPush(sheetEl: HTMLElement): void {
  const overlayEl = sheetEl.parentElement
  if (!overlayEl) return
  const observer = new MutationObserver(() => {
    if (overlayEl.style.display === 'none') {
      const oldPush = currentSheetPush()
      const oldGridH = gridHeight()
      sheetHeights.delete(overlayEl)
      updateSheetPush()
      const newPush = currentSheetPush()
      sheetEl.style.height = ''
      sheetEl.style.translate = ''
      sheetEl.style.opacity = ''
      sheetEl.style.transition = ''
      sheetEl.style.willChange = ''
      animateCanvasAdapt(oldGridH - (effectivePad(newPush) - effectivePad(oldPush)))
    } else if (overlayEl.style.display === 'flex') {
      const oldPush = currentSheetPush()
      const oldGridH = gridHeight()
      sheetHeights.set(overlayEl, sheetEl.offsetHeight)
      updateSheetPush()
      const newPush = currentSheetPush()
      animateCanvasAdapt(oldGridH - (effectivePad(newPush) - effectivePad(oldPush)))
    }
  })
  observer.observe(overlayEl, { attributes: true, attributeFilter: ['style'] })
}
