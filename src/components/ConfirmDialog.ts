export type ConfirmChoice = 'save' | 'dontSave' | 'cancel'

import { makeDraggable } from '../utils/draggable.ts'

let resolver: ((choice: ConfirmChoice) => void) | null = null

export function initConfirmDialog(overlayEl: HTMLElement): void {
  const dialogEl = overlayEl.querySelector<HTMLElement>('#confirmDialog')
  const headerEl = overlayEl.querySelector<HTMLElement>('.dialog-header')

  if (dialogEl && headerEl) {
    makeDraggable(dialogEl, headerEl)
  }

  const saveBtn = overlayEl.querySelector('#confirmSaveBtn')
  const dontSaveBtn = overlayEl.querySelector('#confirmDontSaveBtn')
  const cancelBtn = overlayEl.querySelector('#confirmCancelBtn')
  const closeBtn = overlayEl.querySelector('#closeConfirmBtn')

  const finish = (choice: ConfirmChoice) => {
    overlayEl.style.display = 'none'
    const r = resolver
    resolver = null
    if (r) r(choice)
  }

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
