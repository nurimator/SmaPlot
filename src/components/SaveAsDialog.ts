import { makeDraggable } from '../utils/draggable.ts'

let saveAsOverlayEl: HTMLElement | null = null
let resolver: ((fileName: string | null) => void) | null = null

function finish(result: string | null): void {
  if (saveAsOverlayEl) saveAsOverlayEl.style.display = 'none'
  const r = resolver
  resolver = null
  if (r) r(result)
}

export function hideSaveAsDialog(overlayEl: HTMLElement): void {
  saveAsOverlayEl = overlayEl
  finish(null)
}

export function initSaveAsDialog(overlayEl: HTMLElement): void {
  saveAsOverlayEl = overlayEl
  const dialogEl = overlayEl.querySelector<HTMLElement>('#saveAsDialog')
  const headerEl = overlayEl.querySelector<HTMLElement>('.dialog-header')
  const inputEl = overlayEl.querySelector<HTMLInputElement>('#saveAsFileNameInput')
  const saveBtn = overlayEl.querySelector<HTMLButtonElement>('#saveAsConfirmBtn')
  const cancelBtn = overlayEl.querySelector<HTMLButtonElement>('#saveAsCancelBtn')
  const closeBtn = overlayEl.querySelector<HTMLButtonElement>('#closeSaveAsBtn')

  if (dialogEl && headerEl) {
    makeDraggable(dialogEl, headerEl)
  }

  const handleSave = () => {
    let name = inputEl?.value.trim() || ''
    if (!name) {
      inputEl?.focus()
      return
    }
    if (!name.toLowerCase().endsWith('.smp')) {
      name += '.SMP'
    }
    finish(name)
  }

  saveBtn?.addEventListener('click', handleSave)
  cancelBtn?.addEventListener('click', () => finish(null))
  closeBtn?.addEventListener('click', () => finish(null))

  inputEl?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      finish(null)
    }
  })
}

export function showSaveAsDialog(defaultName: string = 'Project.SMP'): Promise<string | null> {
  const overlayEl = document.querySelector<HTMLElement>('#saveAsOverlay')
  if (!overlayEl) return Promise.resolve(null)
  saveAsOverlayEl = overlayEl
  const inputEl = overlayEl.querySelector<HTMLInputElement>('#saveAsFileNameInput')
  if (inputEl) {
    inputEl.value = defaultName
  }
  overlayEl.style.display = 'flex'

  if (inputEl) {
    inputEl.focus()
    const dotIdx = defaultName.lastIndexOf('.')
    if (dotIdx > 0) {
      inputEl.setSelectionRange(0, dotIdx)
    } else {
      inputEl.select()
    }
  }

  return new Promise<string | null>((resolve) => {
    resolver = resolve
  })
}
