export type ConfirmChoice = 'save' | 'dontSave' | 'cancel'

import { makeDraggable } from '../utils/draggable.ts'

let resolver: ((choice: ConfirmChoice) => void) | null = null
let confirmOverlay: HTMLElement | null = null

function finish(choice: ConfirmChoice): void {
  if (confirmOverlay) confirmOverlay.style.display = 'none'
  const r = resolver
  resolver = null
  if (r) r(choice)
}

export function hideConfirmDialog(): void {
  finish('cancel')
}

export function initConfirmDialog(overlayEl: HTMLElement): void {
  confirmOverlay = overlayEl
  const dialogEl = overlayEl.querySelector<HTMLElement>('#confirmDialog')
  const headerEl = overlayEl.querySelector<HTMLElement>('.dialog-header')

  if (dialogEl && headerEl) {
    makeDraggable(dialogEl, headerEl)
  }

  const saveBtn = overlayEl.querySelector('#confirmSaveBtn')
  const dontSaveBtn = overlayEl.querySelector('#confirmDontSaveBtn')
  const cancelBtn = overlayEl.querySelector('#confirmCancelBtn')
  const closeBtn = overlayEl.querySelector('#closeConfirmBtn')

  saveBtn?.addEventListener('click', () => finish('save'))
  dontSaveBtn?.addEventListener('click', () => finish('dontSave'))
  cancelBtn?.addEventListener('click', () => finish('cancel'))
  closeBtn?.addEventListener('click', () => finish('cancel'))
}

export function showConfirmDialog(message: string): Promise<ConfirmChoice> {
  const overlayEl = document.querySelector<HTMLElement>('#confirmOverlay')
  if (!overlayEl) return Promise.resolve('cancel')
  const msgEl = overlayEl.querySelector<HTMLElement>('#confirmMessage')
  if (msgEl) msgEl.textContent = message
  overlayEl.style.display = 'flex'
  return new Promise<ConfirmChoice>((resolve) => {
    resolver = resolve
  })
}
