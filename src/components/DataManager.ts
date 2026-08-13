import type { Dataset } from '../types.ts'
import { makeDraggable } from '../utils/draggable.ts'

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

  public updateDatasetColor(index: number, color: string): void {
    if (this.datasets[index]) {
      this.datasets[index].color = color
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
    item.setAttribute('data-color', ds.color)

    const indicator = document.createElement('span')
    indicator.className = 'dm-line-indicator'
    indicator.style.backgroundColor = ds.color

    const text = document.createElement('span')
    text.className = 'dm-item-text'
    text.textContent = `${ds.name}.txt`

    item.appendChild(indicator)
    item.appendChild(text)

    item.addEventListener('click', () => {
      listBoxEl.querySelectorAll('.dm-list-item').forEach((i) => i.classList.remove('selected'))
      item.classList.add('selected')
    })

    item.addEventListener('dblclick', () => {
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
  onOpenProperty?: (selectedFileName?: string) => void,
  onDeleteDataset?: (identifier: string) => void
): void {
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
    if (!listBox || !onDeleteDataset) return
    const selectedItems = listBox.querySelectorAll<HTMLElement>('.dm-list-item.selected')
    selectedItems.forEach((item) => {
      const identifier = item.getAttribute('data-filename')
      if (identifier) onDeleteDataset(identifier)
    })
  })

  const triggerPropertyModal = () => {
    const cb = activeSelectCallback
    activeSelectCallback = null
    hide()
    const selected = listBox?.querySelector<HTMLElement>('.dm-list-item.selected')
    const fileName = selected?.getAttribute('data-filename') || 'Dataset.txt'
    if (cb) {
      cb(fileName)
    } else if (onOpenProperty) {
      onOpenProperty(fileName)
    }
  }

  okBtn?.addEventListener('click', triggerPropertyModal)

  if (listBox) {
    renderDataManagerListBox(listBox, globalDataManager.getDatasets(), (fn) => {
      const cb = activeSelectCallback
      activeSelectCallback = null
      hide()
      if (cb) {
        cb(fn)
      } else if (onOpenProperty) {
        onOpenProperty(fn)
      }
    })

    globalDataManager.subscribe(() => {
      renderDataManagerListBox(listBox, globalDataManager.getDatasets(), (fn) => {
        const cb = activeSelectCallback
        activeSelectCallback = null
        hide()
        if (cb) {
          cb(fn)
        } else if (onOpenProperty) {
          onOpenProperty(fn)
        }
      })
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
  overlayEl.style.display = 'flex'
}

export function hideDataManagerDialog(overlayEl: HTMLElement): void {
  overlayEl.style.display = 'none'
}
