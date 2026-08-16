import type { Dataset } from '../types.ts'
import { makeDraggable } from '../utils/draggable.ts'
import { createSeriesIcon } from './plot/symbols.ts'

export class DataManager {
  private datasets: Dataset[] = []
  private listeners: (() => void)[] = []

  public getDatasets(): Dataset[] {
    return [...this.datasets]
  }

  public addDataset(ds: Dataset): void {
    if (!this.datasets.some((d) => d.name === ds.name && d.filePath === ds.filePath)) {
      this.datasets.push(ds)
      this.notify()
    }
  }

  public clearDatasets(): void {
    this.datasets = []
    this.notify()
  }

  public removeDataset(index: number): void {
    if (index >= 0 && index < this.datasets.length) {
      this.datasets.splice(index, 1)
      this.notify()
    }
  }

  public subscribe(fn: () => void): () => void {
    this.listeners.push(fn)
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn)
    }
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn())
  }
}

export const globalDataManager = new DataManager()

let activeSelectCallback: ((fileName: string) => void) | null = null
let legendSelectCallback: ((identifiers: string[]) => void) | null = null
let multiSelectMode = false

// The dialog renders only the datasets of the currently selected (or last
// selected) boxplot, so datasets of different plots never mix. Falls back to
// the global pool only when the active plot has no datasets of its own.
let dmDatasetsProvider: () => Dataset[] = () => globalDataManager.getDatasets()
let dmOverlayEl: HTMLElement | null = null
let dmListBoxEl: HTMLElement | null = null
let dmOnOpenProperty: ((selectedFileName?: string) => void) | undefined
let dmOnDeleteDataset: ((identifier: string) => void) | undefined

function refreshDataManagerList(): void {
  if (!dmListBoxEl) return
  renderDataManagerListBox(dmListBoxEl, dmDatasetsProvider(), (fn) => {
    const cb = activeSelectCallback
    activeSelectCallback = null
    hideDataManagerDialog(document.querySelector('#dataManagerOverlay') as HTMLElement)
    if (cb) {
      cb(fn)
    } else if (dmOnOpenProperty) {
      dmOnOpenProperty(fn)
    }
  })
}

export function renderDataManagerListBox(
  listBoxEl: HTMLElement,
  datasets: Dataset[],
  onOpenProperty?: (fileName: string) => void
): void {
  listBoxEl.innerHTML = ''
  if (datasets.length === 0) {
    const emptyMsg = document.createElement('div')
    emptyMsg.style.padding = '12px 8px'
    emptyMsg.style.color = '#94a3b8'
    emptyMsg.style.fontSize = '12px'
    emptyMsg.style.textAlign = 'center'
    emptyMsg.textContent = 'No datasets loaded'
    listBoxEl.appendChild(emptyMsg)
    return
  }

  datasets.forEach((ds, idx) => {
    const item = document.createElement('div')
    item.className = `dm-list-item${idx === 0 ? ' selected' : ''}`
    const identifier = ds.filePath || ds.fileName || `${ds.name}.txt`
    item.setAttribute('data-filename', identifier)

    const indicator = createSeriesIcon(ds)

    const text = document.createElement('span')
    text.className = 'dm-item-text'
    text.textContent = `${ds.name}.txt`

    item.appendChild(indicator)
    item.appendChild(text)

    item.addEventListener('click', () => {
      if (multiSelectMode) {
        item.classList.toggle('selected')
      } else {
        listBoxEl.querySelectorAll('.dm-list-item').forEach((i) => i.classList.remove('selected'))
        item.classList.add('selected')
      }
    })

    item.addEventListener('dblclick', () => {
      if (multiSelectMode) return
      listBoxEl.querySelectorAll('.dm-list-item').forEach((i) => i.classList.remove('selected'))
      item.classList.add('selected')
      const cb = activeSelectCallback
      activeSelectCallback = null
      hideDataManagerDialog(document.querySelector('#dataManagerOverlay') as HTMLElement)
      if (cb) {
        cb(identifier)
      } else if (onOpenProperty) {
        onOpenProperty(identifier)
      }
    })

    listBoxEl.appendChild(item)
  })
}

export function initDataManagerDialog(
  overlayEl: HTMLElement,
  getDatasets?: () => Dataset[],
  onOpenProperty?: (selectedFileName?: string) => void,
  onDeleteDataset?: (identifier: string) => void
): void {
  dmOverlayEl = overlayEl
  if (getDatasets) dmDatasetsProvider = getDatasets
  dmOnOpenProperty = onOpenProperty
  dmOnDeleteDataset = onDeleteDataset

  const dialogEl = overlayEl.querySelector<HTMLElement>('#dataManagerDialog')
  const headerEl = overlayEl.querySelector<HTMLElement>('.dialog-header')

  if (dialogEl && headerEl) {
    makeDraggable(dialogEl, headerEl)
  }

  const closeHeaderBtn = overlayEl.querySelector('#closeDataManagerBtn')
  const deleteBtn = overlayEl.querySelector('#closeDMBtn')
  const okBtn = overlayEl.querySelector('#dmOkBtn')
  const cancelBtn = overlayEl.querySelector('#dmCancelBtn')

  const upBtn = overlayEl.querySelector('#dmUpBtn')
  const downBtn = overlayEl.querySelector('#dmDownBtn')
  const allBtn = overlayEl.querySelector('#dmAllBtn')

  const listBox = overlayEl.querySelector<HTMLElement>('#dmListBox')

  const hide = () => hideDataManagerDialog(overlayEl)

  closeHeaderBtn?.addEventListener('click', hide)
  cancelBtn?.addEventListener('click', hide)

  deleteBtn?.addEventListener('click', () => {
    if (multiSelectMode) return
    if (!listBox || !dmOnDeleteDataset) return
    const onDelete = dmOnDeleteDataset
    const selectedItems = listBox.querySelectorAll<HTMLElement>('.dm-list-item.selected')
    selectedItems.forEach((item) => {
      const identifier = item.getAttribute('data-filename')
      if (identifier) onDelete(identifier)
    })
    refreshDataManagerList()
  })

  const triggerPropertyModal = () => {
    const cb = activeSelectCallback
    activeSelectCallback = null
    hide()
    const selected = listBox?.querySelector<HTMLElement>('.dm-list-item.selected')
    const fileName = selected?.getAttribute('data-filename') || 'Dataset.txt'
    if (cb) {
      cb(fileName)
    } else if (dmOnOpenProperty) {
      dmOnOpenProperty(fileName)
    }
  }

  okBtn?.addEventListener('click', () => {
    if (legendSelectCallback) {
      const selectedItems = listBox?.querySelectorAll<HTMLElement>('.dm-list-item.selected') || []
      const identifiers = Array.from(selectedItems)
        .map((i) => i.getAttribute('data-filename'))
        .filter((v): v is string => Boolean(v))
      const cb = legendSelectCallback
      legendSelectCallback = null
      multiSelectMode = false
      hide()
      if (identifiers.length > 0) cb(identifiers)
      return
    }
    triggerPropertyModal()
  })

  if (listBox) {
    dmListBoxEl = listBox
    refreshDataManagerList()

    globalDataManager.subscribe(() => {
      refreshDataManagerList()
    })

    // Up(U) button action
    upBtn?.addEventListener('click', () => {
      const selected = listBox.querySelector<HTMLElement>('.dm-list-item.selected')
      if (selected && selected.previousElementSibling) {
        listBox.insertBefore(selected, selected.previousElementSibling)
      }
    })

    // Down(D) button action
    downBtn?.addEventListener('click', () => {
      const selected = listBox.querySelector<HTMLElement>('.dm-list-item.selected')
      if (selected && selected.nextElementSibling) {
        listBox.insertBefore(selected.nextElementSibling, selected)
      }
    })

    // All(A) button action
    allBtn?.addEventListener('click', () => {
      listBox.querySelectorAll('.dm-list-item').forEach((item) => item.classList.add('selected'))
    })
  }
}

export function showDataManagerDialog(
  overlayEl: HTMLElement,
  onSelectDatasetCallback?: (selectedFileName: string) => void
): void {
  activeSelectCallback = onSelectDatasetCallback || null
  legendSelectCallback = null
  multiSelectMode = false
  refreshDataManagerList()
  const okBtn = overlayEl.querySelector<HTMLElement>('#dmOkBtn')
  if (okBtn) okBtn.textContent = 'Open'
  const delBtn = overlayEl.querySelector<HTMLElement>('#closeDMBtn')
  if (delBtn) delBtn.style.display = ''
  overlayEl.style.display = 'flex'
}

export function showDataManagerForLegend(
  overlayEl: HTMLElement,
  onChoose: (identifiers: string[]) => void
): void {
  legendSelectCallback = onChoose
  multiSelectMode = true
  refreshDataManagerList()
  const okBtn = overlayEl.querySelector<HTMLElement>('#dmOkBtn')
  if (okBtn) okBtn.textContent = 'Insert'
  const delBtn = overlayEl.querySelector<HTMLElement>('#closeDMBtn')
  if (delBtn) delBtn.style.display = 'none'
  overlayEl.style.display = 'flex'
}

export function hideDataManagerDialog(overlayEl: HTMLElement): void {
  legendSelectCallback = null
  multiSelectMode = false
  if (overlayEl === dmOverlayEl) dmOverlayEl = null
  const okBtn = overlayEl.querySelector<HTMLElement>('#dmOkBtn')
  if (okBtn) okBtn.textContent = 'Open'
  const delBtn = overlayEl.querySelector<HTMLElement>('#closeDMBtn')
  if (delBtn) delBtn.style.display = ''
  overlayEl.style.display = 'none'
}
