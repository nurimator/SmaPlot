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

const SVG_NS = 'http://www.w3.org/2000/svg'

// Legend-style series icon: line sample (color + dash pattern) with the plot
// marker shape on top, mirroring the legend rendering in Plot.ts. Purely
// visual — not clickable.
function createSeriesIcon(ds: Dataset): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('class', 'dm-series-icon')
  svg.setAttribute('viewBox', '0 0 24 14')
  svg.setAttribute('aria-hidden', 'true')

  const color = ds.options?.lineColor || ds.color || '#000000'
  const cx = 12
  const cy = 7

  const line = document.createElementNS(SVG_NS, 'line')
  line.setAttribute('x1', '2')
  line.setAttribute('y1', String(cy))
  line.setAttribute('x2', '22')
  line.setAttribute('y2', String(cy))
  line.setAttribute('stroke', color)
  const widthMm = ds.options?.width ?? (ds.smpSeriesStylePrefix ? ds.smpSeriesStylePrefix / 100 : 0.6)
  line.setAttribute('stroke-width', String(Math.max(1, Number((widthMm * 2).toFixed(2)))))
  line.setAttribute('stroke-linecap', 'round')

  const brush = ds.options?.brush || ds.options?.lineStyle || 'solid'
  const lineType = ds.options?.lineType || 'solid'
  let dashArray = 'none'
  if (lineType === 'dotted' || brush === 'dot' || brush === 'dotted') {
    dashArray = '2 2'
  } else if (lineType === 'dash_dot') {
    dashArray = '6 3 2 3'
  } else if (lineType === 'dash_dot_dot') {
    dashArray = '6 3 2 3 2 3'
  } else if (brush === 'dash' || brush === 'dashed') {
    dashArray = '6 3'
  }
  if (dashArray !== 'none') line.setAttribute('stroke-dasharray', dashArray)
  svg.appendChild(line)

  const plotType = ds.options?.plotType || 'no_dot'
  if (plotType !== 'no_dot' && plotType !== 'none') {
    const dotColor = ds.options?.dotColor || color
    const paintColor = ds.options?.paintColor || '#ffffff'
    const r = Math.min(5.5, Math.max(3, ds.options?.size || 3.5))

    if (plotType === 'circle' || plotType === 'filled_circle') {
      const circle = document.createElementNS(SVG_NS, 'circle')
      circle.setAttribute('cx', String(cx))
      circle.setAttribute('cy', String(cy))
      circle.setAttribute('r', String(r))
      circle.setAttribute('fill', plotType === 'filled_circle' ? dotColor : 'none')
      circle.setAttribute('stroke', plotType === 'filled_circle' ? paintColor : dotColor)
      circle.setAttribute('stroke-width', '1')
      svg.appendChild(circle)
    } else if (plotType === 'square' || plotType === 'filled_square') {
      const rect = document.createElementNS(SVG_NS, 'rect')
      rect.setAttribute('x', String(cx - r))
      rect.setAttribute('y', String(cy - r))
      rect.setAttribute('width', String(r * 2))
      rect.setAttribute('height', String(r * 2))
      rect.setAttribute('fill', plotType === 'filled_square' ? dotColor : 'none')
      rect.setAttribute('stroke', plotType === 'filled_square' ? paintColor : dotColor)
      rect.setAttribute('stroke-width', '1')
      svg.appendChild(rect)
    } else if (plotType === 'triangle' || plotType === 'filled_triangle') {
      const poly = document.createElementNS(SVG_NS, 'polygon')
      poly.setAttribute('points', `${cx},${cy - r} ${cx - r},${cy + r} ${cx + r},${cy + r}`)
      poly.setAttribute('fill', plotType === 'filled_triangle' ? dotColor : 'none')
      poly.setAttribute('stroke', plotType === 'filled_triangle' ? paintColor : dotColor)
      poly.setAttribute('stroke-width', '1')
      svg.appendChild(poly)
    } else if (plotType === 'diamond' || plotType === 'filled_diamond') {
      const poly = document.createElementNS(SVG_NS, 'polygon')
      poly.setAttribute('points', `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`)
      poly.setAttribute('fill', plotType === 'filled_diamond' ? dotColor : 'none')
      poly.setAttribute('stroke', plotType === 'filled_diamond' ? paintColor : dotColor)
      poly.setAttribute('stroke-width', '1')
      svg.appendChild(poly)
    }
  }

  return svg
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
