import type { Dataset } from '../types.ts'
import { loadDataset } from '../utils/dataset.ts'

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
  manager: DataManager = globalDataManager
): void {
  const closeBtn = overlayEl.querySelector('#closeDataManagerBtn')
  const closeDMBtn = overlayEl.querySelector('#closeDMBtn')
  const tbody = overlayEl.querySelector<HTMLTableSectionElement>('#dataManagerTableBody')

  const hide = () => hideDataManagerDialog(overlayEl)

  closeBtn?.addEventListener('click', hide)
  closeDMBtn?.addEventListener('click', hide)
  overlayEl.addEventListener('click', (e) => {
    if (e.target === overlayEl) hide()
  })

  const refreshTable = () => {
    if (!tbody) return
    tbody.replaceChildren() // Clear table body safely without innerHTML

    const datasets = manager.getDatasets()
    datasets.forEach((ds, idx) => {
      const tr = document.createElement('tr')

      // # Column
      const tdIndex = document.createElement('td')
      tdIndex.textContent = String(idx + 1)

      // Color Column
      const tdColor = document.createElement('td')
      const inputColor = document.createElement('input')
      inputColor.type = 'color'
      inputColor.value = ds.color
      inputColor.className = 'color-picker-input'
      inputColor.addEventListener('change', () => {
        manager.updateDatasetColor(idx, inputColor.value)
      })
      tdColor.appendChild(inputColor)

      // Name Column
      const tdName = document.createElement('td')
      const strongName = document.createElement('strong')
      strongName.textContent = ds.name
      tdName.appendChild(strongName)

      // Points Column
      const tdPoints = document.createElement('td')
      tdPoints.textContent = String(ds.x.length)

      // X Min..Max Column
      const tdXRange = document.createElement('td')
      const xMin = ds.x.length ? Math.min(...ds.x).toFixed(1) : '0'
      const xMax = ds.x.length ? Math.max(...ds.x).toFixed(1) : '0'
      tdXRange.textContent = `${xMin} .. ${xMax}`

      // Y Max Column
      const tdYMax = document.createElement('td')
      const yMax = ds.y.length ? Math.max(...ds.y).toFixed(1) : '0'
      tdYMax.textContent = yMax

      // Actions Column
      const tdActions = document.createElement('td')
      const delBtn = document.createElement('button')
      delBtn.className = 'btn-icon delete-ds-btn'
      delBtn.title = 'Remove Dataset'

      const iconSpan = document.createElement('span')
      iconSpan.className = 'material-symbols-outlined'
      iconSpan.style.fontSize = '16px'
      iconSpan.textContent = 'delete'

      delBtn.appendChild(iconSpan)
      delBtn.addEventListener('click', () => {
        manager.removeDataset(idx)
      })
      tdActions.appendChild(delBtn)

      tr.append(tdIndex, tdColor, tdName, tdPoints, tdXRange, tdYMax, tdActions)
      tbody.appendChild(tr)
    })
  }

  manager.subscribe(refreshTable)
  refreshTable()
}

export function showDataManagerDialog(overlayEl: HTMLElement): void {
  overlayEl.style.display = 'flex'
}

export function hideDataManagerDialog(overlayEl: HTMLElement): void {
  overlayEl.style.display = 'none'
}
