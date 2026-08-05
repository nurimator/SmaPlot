import type { Dataset } from '../types.ts'
import { loadDataset } from '../utils/dataset.ts'
import { makeDraggable } from '../utils/draggable.ts'

export class DataManager {
  private datasets: Dataset[] = []
  private listeners: (() => void)[] = []

  public async loadInitialDatasets(): Promise<Dataset[]> {
    if (this.datasets.length === 0) {
      const [cobalt, bivo] = await Promise.all([
        loadDataset('/dummy-data/Cobalt0.txt'),
        loadDataset('/dummy-data/BiVO4TiO2 PKM.txt'),
      ])
      this.datasets = [cobalt, bivo]
    }
    return this.datasets
  }

  public getDatasets(): Dataset[] {
    return [...this.datasets]
  }

  public addDataset(ds: Dataset): void {
    this.datasets.push(ds)
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

export function initDataManagerDialog(
  overlayEl: HTMLElement,
  onOpenProperty?: (selectedFileName?: string) => void
): void {
  const dialogEl = overlayEl.querySelector<HTMLElement>('#dataManagerDialog')
  const headerEl = overlayEl.querySelector<HTMLElement>('.dialog-header')

  if (dialogEl && headerEl) {
    makeDraggable(dialogEl, headerEl)
  }

  const closeHeaderBtn = overlayEl.querySelector('#closeDataManagerBtn')
  const closeDMBtn = overlayEl.querySelector('#closeDMBtn')
  const okBtn = overlayEl.querySelector('#dmOkBtn')
  const cancelBtn = overlayEl.querySelector('#dmCancelBtn')
  const propBtn = overlayEl.querySelector('#dmPropBtn')

  const upBtn = overlayEl.querySelector('#dmUpBtn')
  const downBtn = overlayEl.querySelector('#dmDownBtn')
  const allBtn = overlayEl.querySelector('#dmAllBtn')

  const listBox = overlayEl.querySelector<HTMLElement>('#dmListBox')

  const hide = () => hideDataManagerDialog(overlayEl)

  closeHeaderBtn?.addEventListener('click', hide)
  closeDMBtn?.addEventListener('click', hide)
  cancelBtn?.addEventListener('click', hide)

  const triggerPropertyModal = () => {
    hide()
    if (onOpenProperty) {
      const selected = listBox?.querySelector<HTMLElement>('.dm-list-item.selected')
      const fileName = selected?.getAttribute('data-filename') || 'Cobalt0.txt'
      onOpenProperty(fileName)
    }
  }

  okBtn?.addEventListener('click', triggerPropertyModal)
  propBtn?.addEventListener('click', triggerPropertyModal)

  // List Box item click and double click interaction
  if (listBox) {
    const items = Array.from(listBox.querySelectorAll<HTMLElement>('.dm-list-item'))

    const selectItem = (itemToSelect: HTMLElement) => {
      items.forEach((item) => item.classList.remove('selected'))
      itemToSelect.classList.add('selected')
    }

    items.forEach((item) => {
      // Single click -> select file item
      item.addEventListener('click', () => {
        selectItem(item)
      })

      // Double click -> select file item AND open Property modal
      item.addEventListener('dblclick', () => {
        selectItem(item)
        triggerPropertyModal()
      })
    })

    // Up(U) button action -> move selected item up in list box
    upBtn?.addEventListener('click', () => {
      const selected = listBox.querySelector<HTMLElement>('.dm-list-item.selected')
      if (selected && selected.previousElementSibling) {
        listBox.insertBefore(selected, selected.previousElementSibling)
      }
    })

    // Down(D) button action -> move selected item down in list box
    downBtn?.addEventListener('click', () => {
      const selected = listBox.querySelector<HTMLElement>('.dm-list-item.selected')
      if (selected && selected.nextElementSibling) {
        listBox.insertBefore(selected.nextElementSibling, selected)
      }
    })

    // All(A) button action -> select all items
    allBtn?.addEventListener('click', () => {
      items.forEach((item) => item.classList.add('selected'))
    })
  }
}

export function showDataManagerDialog(overlayEl: HTMLElement): void {
  overlayEl.style.display = 'flex'
}

export function hideDataManagerDialog(overlayEl: HTMLElement): void {
  overlayEl.style.display = 'none'
}
