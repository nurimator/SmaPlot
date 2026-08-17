import type { Dataset, PlotVisualOptions } from '../types.ts'
import { makeDraggable } from '../utils/draggable.ts'
import {
  exportPlotToSmpDoc,
  getPlotDatasets,
  getSelectedPlotSvg,
  setPropertyDialogTarget,
  updatePlotVisual,
} from './plot/index.ts'
import { globalDataManager } from './DataManager.ts'
import { downloadFile, serializeSmpDoc } from '../utils/smpExporter.ts'
import { createSeriesIconFromOpts } from './plot/symbols.ts'

let currentActiveDataset: Dataset | undefined
let currentTargetSvg: SVGSVGElement | null = null

export function initPropertyDialog(overlayEl: HTMLElement): void {
  const dialogEl = overlayEl.querySelector<HTMLElement>('#propertyDialog')
  const headerEl = overlayEl.querySelector<HTMLElement>('.dialog-header')

  if (dialogEl && headerEl) {
    makeDraggable(dialogEl, headerEl)
  }

  const closeBtn = overlayEl.querySelector('#closePropDialogBtn')
  const cancelBtn = overlayEl.querySelector('#cancelPropBtn')
  const applyBtn = overlayEl.querySelector('#applyPropBtn')
  const tabs = overlayEl.querySelectorAll<HTMLButtonElement>('.tab-btn')

  const fileShow = overlayEl.querySelector<HTMLInputElement>('#propFileShow')
  const fileLineStyle = overlayEl.querySelector<HTMLSelectElement>('#propFileLineStyle')
  const plotType = overlayEl.querySelector<HTMLSelectElement>('#propPlotType')
  const lineType = overlayEl.querySelector<HTMLSelectElement>('#propLineType')
  const dotColor = overlayEl.querySelector<HTMLInputElement>('#propDotColor')
  const paintColor = overlayEl.querySelector<HTMLInputElement>('#propPaintColor')
  const lineColor = overlayEl.querySelector<HTMLInputElement>('#propLineColor')
  const sizeInput = overlayEl.querySelector<HTMLInputElement>('#propSizeInput')
  const widthInput = overlayEl.querySelector<HTMLInputElement>('#propWidthInput')
  const pitchInput = overlayEl.querySelector<HTMLInputElement>('#propPitchInput')
  const brushSelect = overlayEl.querySelector<HTMLSelectElement>('#propBrushSelect')

  const xTransCheck = overlayEl.querySelector<HTMLInputElement>('#propXTransCheck')
  const xTransExpr = overlayEl.querySelector<HTMLInputElement>('#propXTransExpr')
  const yTransCheck = overlayEl.querySelector<HTMLInputElement>('#propYTransCheck')
  const yTransExpr = overlayEl.querySelector<HTMLInputElement>('#propYTransExpr')

  const xColSelect = overlayEl.querySelector<HTMLSelectElement>('#propXColumn')
  const yColSelect = overlayEl.querySelector<HTMLSelectElement>('#propYColumn')

  const applyVisualOptions = () => {
    const opts: PlotVisualOptions = {
      show: fileShow?.checked,
      lineStyle: fileLineStyle?.value,
      plotType: plotType?.value,
      lineType: lineType?.value,
      dotColor: dotColor?.value,
      paintColor: paintColor?.value,
      lineColor: lineColor?.value,
      size: parseInt(sizeInput?.value || '3', 10),
      width: parseFloat(widthInput?.value || '1'),
      pitch: parseInt(pitchInput?.value || '1', 10),
      brush: brushSelect?.value,
      xTransCheck: xTransCheck?.checked,
      xExpr: xTransExpr?.value,
      yTransCheck: yTransCheck?.checked,
      yExpr: yTransExpr?.value,
      xColumn: parseInt(xColSelect?.value || '1', 10),
      yColumn: parseInt(yColSelect?.value || '2', 10),
    }

    if (currentActiveDataset) {
      if (lineColor?.value) currentActiveDataset.color = lineColor.value
      currentActiveDataset.options = opts
    }

    const svg = currentTargetSvg || getSelectedPlotSvg()
    if (svg) {
      updatePlotVisual(svg)
    }
  }

  const hide = () => hidePropertyDialog(overlayEl)

  closeBtn?.addEventListener('click', hide)
  cancelBtn?.addEventListener('click', hide)
  applyBtn?.addEventListener('click', () => {
    applyVisualOptions()
    hide()
  })

  const propSaveBtn1 = overlayEl.querySelector('#propSaveBtn1')
  const propSaveBtn2 = overlayEl.querySelector('#propSaveBtn2')

  const handleSave = () => {
    const svg = currentTargetSvg || getSelectedPlotSvg()
    if (svg) {
      const doc = exportPlotToSmpDoc(svg, currentActiveDataset?.name ? `${currentActiveDataset.name}.SMP` : 'FTIR.SMP')
      const smpContent = serializeSmpDoc(doc)
      const fileName = currentActiveDataset?.fileName?.endsWith('.SMP') ? currentActiveDataset.fileName : (currentActiveDataset?.name ? `${currentActiveDataset.name}.SMP` : 'Project.SMP')
      downloadFile(smpContent, fileName)
    } else {
      alert('No active plot to save.')
    }
  }

  propSaveBtn1?.addEventListener('click', handleSave)
  propSaveBtn2?.addEventListener('click', handleSave)

  fileShow?.addEventListener('change', applyVisualOptions)
  fileLineStyle?.addEventListener('change', applyVisualOptions)
  plotType?.addEventListener('change', applyVisualOptions)
  lineType?.addEventListener('change', applyVisualOptions)

  dotColor?.addEventListener('input', applyVisualOptions)
  paintColor?.addEventListener('input', applyVisualOptions)
  lineColor?.addEventListener('input', applyVisualOptions)

  sizeInput?.addEventListener('input', applyVisualOptions)
  widthInput?.addEventListener('input', applyVisualOptions)
  pitchInput?.addEventListener('input', applyVisualOptions)

  brushSelect?.addEventListener('change', applyVisualOptions)

  xTransCheck?.addEventListener('change', applyVisualOptions)
  xTransExpr?.addEventListener('input', applyVisualOptions)
  yTransCheck?.addEventListener('change', applyVisualOptions)
  yTransExpr?.addEventListener('input', applyVisualOptions)

  xColSelect?.addEventListener('change', applyVisualOptions)
  yColSelect?.addEventListener('change', applyVisualOptions)

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'))
      tab.classList.add('active')
      const targetTab = tab.getAttribute('data-tab')
      const contents = overlayEl.querySelectorAll('.tab-content')
      contents.forEach((c) => c.classList.remove('active'))
      const targetContent = overlayEl.querySelector(`#tab-${targetTab}`)
      targetContent?.classList.add('active')

      const svg = currentTargetSvg || getSelectedPlotSvg()
      if (targetTab === 'plot' && svg) {
        setPropertyDialogTarget({ svg, dataset: currentActiveDataset })
        updatePlotVisual(svg)
      } else {
        setPropertyDialogTarget(null)
        if (svg) updatePlotVisual(svg)
      }
    })
  })

  lineColor?.addEventListener('input', () => renderSamplePreview(overlayEl))
  widthInput?.addEventListener('input', () => renderSamplePreview(overlayEl))
  lineType?.addEventListener('change', () => renderSamplePreview(overlayEl))
  plotType?.addEventListener('change', () => renderSamplePreview(overlayEl))
  dotColor?.addEventListener('input', () => renderSamplePreview(overlayEl))
  paintColor?.addEventListener('input', () => renderSamplePreview(overlayEl))
  sizeInput?.addEventListener('input', () => renderSamplePreview(overlayEl))

  const sampleContainer = overlayEl.querySelector<HTMLElement>('#propLineSamplePreview')
  if (sampleContainer) {
    const sampleObserver = new ResizeObserver(() => renderSamplePreview(overlayEl))
    sampleObserver.observe(sampleContainer)
  }
}

function renderSamplePreview(overlayEl: HTMLElement): void {
  const container = overlayEl.querySelector<HTMLElement>('#propLineSamplePreview')
  if (!container) return
  const lineColor = overlayEl.querySelector<HTMLInputElement>('#propLineColor')
  const widthInput = overlayEl.querySelector<HTMLInputElement>('#propWidthInput')
  const lineType = overlayEl.querySelector<HTMLSelectElement>('#propLineType')
  const plotType = overlayEl.querySelector<HTMLSelectElement>('#propPlotType')
  const dotColor = overlayEl.querySelector<HTMLInputElement>('#propDotColor')
  const paintColor = overlayEl.querySelector<HTMLInputElement>('#propPaintColor')
  const sizeInput = overlayEl.querySelector<HTMLInputElement>('#propSizeInput')

  const widthMm = parseFloat(widthInput?.value || '0.6') || 0.6
  const icon = createSeriesIconFromOpts({
    color: lineColor?.value || '#10b981',
    lineWidthPx: Math.max(1, Math.round(widthMm * 2)),
    lineType: lineType?.value || 'solid',
    plotType: plotType?.value || 'no_dot',
    dotColor: dotColor?.value || '#000000',
    paintColor: paintColor?.value || '#ffffff',
    size: parseFloat(sizeInput?.value || '3') || 3,
    markerCount: 3,
    viewBoxWidth: Math.max(72, container.clientWidth / 2),
  })
  container.innerHTML = ''
  container.appendChild(icon)
}

function renderDatasetPreview(overlayEl: HTMLElement, dataset?: Dataset): void {
  const previewRows = overlayEl.querySelector('#propPreviewRows')
  const xColSelect = overlayEl.querySelector<HTMLSelectElement>('#propXColumn')
  const yColSelect = overlayEl.querySelector<HTMLSelectElement>('#propYColumn')
  const lineColorInput = overlayEl.querySelector<HTMLInputElement>('#propLineColor')

  const fileBanner1 = overlayEl.querySelector('#propFilePathText')
  const fileBanner2 = overlayEl.querySelector('#propPlotFilePathText')

  if (!previewRows) return

  if (!dataset) {
    if (fileBanner1) fileBanner1.textContent = 'No file loaded'
    if (fileBanner2) fileBanner2.textContent = 'No file loaded'
    previewRows.innerHTML = '<div style="padding: 12px; color: #94a3b8; text-align: center;">No dataset loaded</div>'

    if (xColSelect && yColSelect) {
      xColSelect.innerHTML = '<option value="1">Col 1</option>'
      yColSelect.innerHTML = '<option value="2">Col 2</option>'
    }
    return
  }

  const displayName = dataset.filePath || dataset.fileName || `${dataset.name}.txt`
  if (fileBanner1) fileBanner1.textContent = displayName
  if (fileBanner2) fileBanner2.textContent = displayName

  if (lineColorInput && dataset.color) {
    lineColorInput.value = dataset.color
  }

  let maxCols = 2
  const rowsFragment = document.createDocumentFragment()

  if (dataset.rawLines && dataset.rawLines.length > 0) {
    dataset.rawLines.forEach((parts) => {
      if (parts.length > maxCols) maxCols = parts.length
      const rowDiv = document.createElement('div')
      rowDiv.className = 'preview-row'
      parts.forEach((part) => {
        const colSpan = document.createElement('span')
        colSpan.textContent = part
        rowDiv.appendChild(colSpan)
      })
      rowsFragment.appendChild(rowDiv)
    })
  } else if (dataset.x && dataset.y) {
    maxCols = 2
    const len = Math.min(dataset.x.length, dataset.y.length)
    for (let i = 0; i < len; i++) {
      const rowDiv = document.createElement('div')
      rowDiv.className = 'preview-row'
      const span1 = document.createElement('span')
      span1.textContent = String(dataset.x[i])
      const span2 = document.createElement('span')
      span2.textContent = String(dataset.y[i])
      rowDiv.appendChild(span1)
      rowDiv.appendChild(span2)
      rowsFragment.appendChild(rowDiv)
    }
  }

  previewRows.innerHTML = ''
  previewRows.appendChild(rowsFragment)

  if (xColSelect && yColSelect) {
    const currentX = xColSelect.value
    const currentY = yColSelect.value

    xColSelect.innerHTML = ''
    yColSelect.innerHTML = ''

    for (let i = 1; i <= maxCols; i++) {
      const optX = document.createElement('option')
      optX.value = String(i)
      optX.textContent = `Col ${i}`
      xColSelect.appendChild(optX)

      const optY = document.createElement('option')
      optY.value = String(i)
      optY.textContent = `Col ${i}`
      yColSelect.appendChild(optY)
    }

    xColSelect.value = parseInt(currentX, 10) <= maxCols ? currentX : '1'
    yColSelect.value = parseInt(currentY, 10) <= maxCols ? currentY : (maxCols >= 2 ? '2' : '1')
  }
}

export function showPropertyDialog(
  overlayEl: HTMLElement,
  datasetOrName?: Dataset | string,
  targetSvg?: SVGSVGElement
): void {
  const svg = targetSvg || getSelectedPlotSvg()
  currentTargetSvg = svg

  let dataset: Dataset | undefined

  if (typeof datasetOrName === 'string') {
    dataset = globalDataManager.getDatasets().find((d) =>
      d.filePath === datasetOrName ||
      d.fileName === datasetOrName ||
      d.name === datasetOrName ||
      `${d.name}.txt` === datasetOrName
    )
  } else if (datasetOrName) {
    dataset = datasetOrName
  } else {
    if (svg) {
      const svgDatasets = getPlotDatasets(svg)
      if (svgDatasets.length > 0) {
        dataset = svgDatasets[0]
      }
    }
    if (!dataset) {
      dataset = globalDataManager.getDatasets()[0]
    }
  }

  currentActiveDataset = dataset
  renderDatasetPreview(overlayEl, dataset)

  if (dataset) {
    const existingOpts = dataset.options || {}
    const fileShow = overlayEl.querySelector<HTMLInputElement>('#propFileShow')
    const fileLineStyle = overlayEl.querySelector<HTMLSelectElement>('#propFileLineStyle')
    const plotType = overlayEl.querySelector<HTMLSelectElement>('#propPlotType')
    const lineType = overlayEl.querySelector<HTMLSelectElement>('#propLineType')
    const dotColor = overlayEl.querySelector<HTMLInputElement>('#propDotColor')
    const paintColor = overlayEl.querySelector<HTMLInputElement>('#propPaintColor')
    const lineColor = overlayEl.querySelector<HTMLInputElement>('#propLineColor')
    const sizeInput = overlayEl.querySelector<HTMLInputElement>('#propSizeInput')
    const widthInput = overlayEl.querySelector<HTMLInputElement>('#propWidthInput')
    const pitchInput = overlayEl.querySelector<HTMLInputElement>('#propPitchInput')
    const brushSelect = overlayEl.querySelector<HTMLSelectElement>('#propBrushSelect')

    const xTransCheck = overlayEl.querySelector<HTMLInputElement>('#propXTransCheck')
    const xTransExpr = overlayEl.querySelector<HTMLInputElement>('#propXTransExpr')
    const yTransCheck = overlayEl.querySelector<HTMLInputElement>('#propYTransCheck')
    const yTransExpr = overlayEl.querySelector<HTMLInputElement>('#propYTransExpr')

    const xColSelect = overlayEl.querySelector<HTMLSelectElement>('#propXColumn')
    const yColSelect = overlayEl.querySelector<HTMLSelectElement>('#propYColumn')

    if (fileShow) fileShow.checked = existingOpts.show !== false
    if (fileLineStyle) fileLineStyle.value = existingOpts.lineStyle || 'solid'
    if (plotType) plotType.value = existingOpts.plotType || 'no_dot'
    if (lineType) lineType.value = existingOpts.lineType || 'solid'
    if (dotColor) dotColor.value = existingOpts.dotColor || '#000000'
    if (paintColor) paintColor.value = existingOpts.paintColor || '#ffffff'
    if (lineColor && (existingOpts.lineColor || dataset?.color)) {
      lineColor.value = existingOpts.lineColor || dataset?.color || '#10b981'
    }
    if (sizeInput) sizeInput.value = String(existingOpts.size || 3)
    if (widthInput) widthInput.value = String(existingOpts.width ?? (dataset?.smpSeriesStylePrefix ? dataset.smpSeriesStylePrefix / 100 : 0.6))
    if (pitchInput) pitchInput.value = String(existingOpts.pitch || 1)
    const validBrushes = ['filled', 'empty', 'white', 'hatch1', 'hatch2', 'hatch3', 'hatch4', 'hatch5', 'hatch6']
    if (brushSelect) brushSelect.value = validBrushes.includes(existingOpts.brush || '') ? existingOpts.brush! : 'filled'

    if (xTransCheck) xTransCheck.checked = !!existingOpts.xTransCheck
    if (xTransExpr) xTransExpr.value = existingOpts.xExpr || 'x'
    if (yTransCheck) yTransCheck.checked = !!existingOpts.yTransCheck
    if (yTransExpr) yTransExpr.value = existingOpts.yExpr || 'y'

    if (xColSelect) xColSelect.value = String(existingOpts.xColumn || 1)
    if (yColSelect) yColSelect.value = String(existingOpts.yColumn || 2)
  }

  const activeTabBtn = overlayEl.querySelector('.tab-btn.active')
  const activeTab = activeTabBtn?.getAttribute('data-tab') || 'file'
  if (activeTab === 'plot' && svg) {
    setPropertyDialogTarget({ svg, dataset })
    updatePlotVisual(svg)
  } else {
    setPropertyDialogTarget(null)
    if (svg) updatePlotVisual(svg)
  }
  overlayEl.style.display = 'flex'
  renderSamplePreview(overlayEl)
}

export function hidePropertyDialog(overlayEl: HTMLElement): void {
  overlayEl.style.display = 'none'
  const svg = currentTargetSvg
  setPropertyDialogTarget(null)
  if (svg) updatePlotVisual(svg)
  currentTargetSvg = null
  currentActiveDataset = undefined
}
