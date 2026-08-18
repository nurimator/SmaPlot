export type ShortcutHandler = (e: KeyboardEvent) => void

export interface ShortcutSpec {
  key: string
  ctrlOrCmd?: boolean
  shift?: boolean
  alt?: boolean
  allowInEditable?: boolean
}

interface RegisteredShortcut {
  spec: ShortcutSpec
  handler: ShortcutHandler
}

const shortcuts: RegisteredShortcut[] = []
let listenerInstalled = false

function isEditableTarget(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

function matchSpec(e: KeyboardEvent, spec: ShortcutSpec): boolean {
  if (e.key.toLowerCase() !== spec.key.toLowerCase()) return false
  if ((e.ctrlKey || e.metaKey) !== !!spec.ctrlOrCmd) return false
  if (e.shiftKey !== !!spec.shift) return false
  if (e.altKey !== !!spec.alt) return false
  if (spec.allowInEditable !== true && isEditableTarget()) return false
  return true
}

function dispatchShortcuts(e: KeyboardEvent): void {
  for (const { spec, handler } of shortcuts) {
    if (matchSpec(e, spec)) {
      handler(e)
      return
    }
  }
}

// ── Access-key mode (Alt toggles, then press the underlined letter) ──
let accessKeyContainer: HTMLElement | null = null
let accessKeyOnMenuClick: ((action: string) => void) | null = null
let accessKeyCloseAll: (() => void) | null = null

function isAccessKeyMode(): boolean {
  return document.body.classList.contains('accesskey-mode')
}

function setAccessKeyMode(on: boolean): void {
  document.body.classList.toggle('accesskey-mode', on)
}

function openMenuByAccessKey(key: string): void {
  const item = accessKeyContainer?.querySelector<HTMLElement>(
    `.menu-item[data-accesskey="${key.toLowerCase()}"]`,
  )
  if (!item) return
  const dropdown = item.querySelector<HTMLElement>('.menu-dropdown')
  accessKeyCloseAll?.()
  if (dropdown) {
    dropdown.classList.add('open')
  } else {
    const menuName = item.getAttribute('data-menu') || ''
    accessKeyOnMenuClick?.(menuName)
  }
}

export function initAccessKeyMode(
  container: HTMLElement,
  onMenuClick: (action: string) => void,
  closeAllDropdowns: () => void,
): void {
  accessKeyContainer = container
  accessKeyOnMenuClick = onMenuClick
  accessKeyCloseAll = closeAllDropdowns
  ensureListener()
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Alt') {
    if (!e.repeat) {
      setAccessKeyMode(!isAccessKeyMode())
    }
    e.preventDefault()
    return
  }

  if (isAccessKeyMode() && !e.ctrlKey && !e.metaKey && e.key.length === 1) {
    e.preventDefault()
    setAccessKeyMode(false)
    openMenuByAccessKey(e.key)
    return
  }

  dispatchShortcuts(e)
}

function ensureListener(): void {
  if (listenerInstalled) return
  listenerInstalled = true
  document.addEventListener('keydown', onKeydown)

  document.addEventListener('click', () => {
    if (isAccessKeyMode()) setAccessKeyMode(false)
  })
}

export function registerShortcut(spec: ShortcutSpec, handler: ShortcutHandler): void {
  shortcuts.push({ spec, handler })
  ensureListener()
}

// ── Application-wide shortcuts (registered once) ──
export interface AppShortcutHandlers {
  deleteSelectedObjects: () => boolean
  pushUndoState: () => void
  undo: () => void
  redo: () => void
  handleSaveProject: () => void
  handleSaveAsProject: () => void
  openFileDialog: () => void
  hideContextMenu: () => void
  zoomStep: (delta: number) => void
  resetZoom: () => void
  openXAxis: () => void
  openYAxis: () => void
}

export function initAppShortcuts(h: AppShortcutHandlers): void {
  registerShortcut({ key: 'Escape', allowInEditable: true }, () => h.hideContextMenu())

  registerShortcut({ key: 'Delete' }, (e) => {
    e.preventDefault()
    if (h.deleteSelectedObjects()) h.pushUndoState()
  })
  registerShortcut({ key: 'Backspace' }, (e) => {
    e.preventDefault()
    if (h.deleteSelectedObjects()) h.pushUndoState()
  })
  registerShortcut({ key: 'd', ctrlOrCmd: true }, (e) => {
    e.preventDefault()
    if (h.deleteSelectedObjects()) h.pushUndoState()
  })
  registerShortcut({ key: 'z', ctrlOrCmd: true }, (e) => {
    e.preventDefault()
    h.undo()
  })
  registerShortcut({ key: 'z', ctrlOrCmd: true, shift: true }, (e) => {
    e.preventDefault()
    h.redo()
  })
  registerShortcut({ key: 'x', ctrlOrCmd: true }, (e) => {
    e.preventDefault()
    h.openXAxis()
  })
  registerShortcut({ key: 'y', ctrlOrCmd: true }, (e) => {
    e.preventDefault()
    h.openYAxis()
  })
  registerShortcut({ key: 's', ctrlOrCmd: true }, (e) => {
    e.preventDefault()
    h.handleSaveProject()
  })
  registerShortcut({ key: 's', ctrlOrCmd: true, shift: true }, (e) => {
    e.preventDefault()
    h.handleSaveAsProject()
  })
  registerShortcut({ key: 'o', ctrlOrCmd: true }, (e) => {
    e.preventDefault()
    h.openFileDialog()
  })
  registerShortcut({ key: '=', ctrlOrCmd: true }, (e) => {
    e.preventDefault()
    h.zoomStep(10)
  })
  registerShortcut({ key: '+', ctrlOrCmd: true }, (e) => {
    e.preventDefault()
    h.zoomStep(10)
  })
  registerShortcut({ key: '+', ctrlOrCmd: true, shift: true }, (e) => {
    e.preventDefault()
    h.zoomStep(10)
  })
  registerShortcut({ key: '-', ctrlOrCmd: true }, (e) => {
    e.preventDefault()
    h.zoomStep(-10)
  })
  registerShortcut({ key: '_', ctrlOrCmd: true }, (e) => {
    e.preventDefault()
    h.zoomStep(-10)
  })
  registerShortcut({ key: '_', ctrlOrCmd: true, shift: true }, (e) => {
    e.preventDefault()
    h.zoomStep(-10)
  })
  registerShortcut({ key: '0', ctrlOrCmd: true }, (e) => {
    e.preventDefault()
    h.resetZoom()
  })
}
