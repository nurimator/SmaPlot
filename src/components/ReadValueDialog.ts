import type { Dataset } from '../types.ts'
import { getPlotLimits, getProcessedDataset, PLOT_MARGIN, removePlotCrossbar, setPlotCrossbar, setReadValueMode } from './Plot.ts'
import { makeDraggable } from '../utils/draggable.ts'

export function formatScientific(val: number): string {
  if (isNaN(val) || !isFinite(val)) return '0.0000e+00'
  const expStr = val.toExponential(4)
  return expStr.replace(/e([+-])(\d)$/, 'e$10$2')
}

let activeSvg: SVGSVGElement | null = null
let activeDataset: Dataset | null = null
let activeOverlayEl: HTMLElement | null = null

export function isReadValueOpen(): boolean {
  return activeSvg !== null && activeOverlayEl !== null && activeOverlayEl.style.display !== 'none'
}

export function getValidIndices(svg: SVGSVGElement | null, dataset: Dataset | null): number[] {
  if (!svg || !dataset) return []
  const proc = getProcessedDataset(dataset)
  const N = proc.x.length
  if (N === 0) return []

  const limits = getPlotLimits(svg)
  const minX = Math.min(limits.xMin, limits.xMax)
  const maxX = Math.max(limits.xMin, limits.xMax)
  const eps = Math.max(1e-9, (maxX - minX) * 1e-7)

  const indices: number[] = []
  for (let i = 0; i < N; i++) {
    const x = proc.x[i]
    if (x >= minX - eps && x <= maxX + eps) {
      indices.push(i)
    }
  }

  // If no points fall within range (e.g. plot limits zoomed completely away from data),
  // fallback to all indices to prevent breaking UI
  if (indices.length === 0) {
    for (let i = 0; i < N; i++) indices.push(i)
  }

  return indices
}

let currentIndex: number = 0
let markedPoints: { x: number; y: number; index: number }[] = []
let isDraggingGraph = false
let graphMouseDownListener: ((e: MouseEvent) => void) | null = null
let graphMouseMoveListener: ((e: MouseEvent) => void) | null = null
let graphMouseUpListener: (() => void) | null = null
let keydownListener: ((e: KeyboardEvent) => void) | null = null

function updateFromPointerCoords(clientX: number, clientY: number): void {
  if (!activeSvg || !activeDataset || !activeOverlayEl || activeOverlayEl.style.display === 'none') return

  const rect = activeSvg.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return

  let svgW = 400
  let svgH = 300
  const viewBox = activeSvg.getAttribute('viewBox')
  if (viewBox) {
    const parts = viewBox.split(/\s+/).map(Number)
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      svgW = parts[2]
      svgH = parts[3]
    }
  } else {
    svgW = activeSvg.clientWidth || parseFloat(activeSvg.style.width) || rect.width || 400
    svgH = activeSvg.clientHeight || parseFloat(activeSvg.style.height) || rect.height || 300
  }

  const scaleX = svgW / rect.width
  const scaleY = svgH / rect.height

  const clickX = (clientX - rect.left) * scaleX
  const clickY = (clientY - rect.top) * scaleY

  const plotW = Math.max(10, svgW - PLOT_MARGIN.l - PLOT_MARGIN.r)
  const plotH = Math.max(10, svgH - PLOT_MARGIN.t - PLOT_MARGIN.b)

  const clampedX = Math.max(PLOT_MARGIN.l, Math.min(PLOT_MARGIN.l + plotW, clickX))
  const clampedY = Math.max(PLOT_MARGIN.t, Math.min(PLOT_MARGIN.t + plotH, clickY))

  const limits = getPlotLimits(activeSvg)
  const dataX = limits.xMin + ((clampedX - PLOT_MARGIN.l) / plotW) * (limits.xMax - limits.xMin)
  const dataY = limits.yMin + ((PLOT_MARGIN.t + plotH - clampedY) / plotH) * (limits.yMax - limits.yMin)

  const procDs = getProcessedDataset(activeDataset)
  const validIndices = getValidIndices(activeSvg, activeDataset)
  if (validIndices.length === 0) return

  let bestIdx = validIndices[0]
  let minDist = Infinity
  const rangeX = limits.xMax - limits.xMin || 1
  const rangeY = limits.yMax - limits.yMin || 1

  for (const i of validIndices) {
    const dx = (procDs.x[i] - dataX) / rangeX
    const dy = (procDs.y[i] - dataY) / rangeY
    const dist = dx * dx + dy * dy
    if (dist < minDist) {
      minDist = dist
      bestIdx = i
    }
  }

  currentIndex = bestIdx
  updateReadValueUI(activeOverlayEl)
}

export function initReadValueDialog(overlayEl: HTMLElement): void {
  activeOverlayEl = overlayEl
  const dialogEl = overlayEl.querySelector<HTMLElement>('#readValueDialog')
  const headerEl = overlayEl.querySelector<HTMLElement>('.dialog-header')

  if (dialogEl && headerEl) {
    makeDraggable(dialogEl, headerEl)
  }

  const closeHeaderBtn = overlayEl.querySelector('#closeReadValueDialogBtn')
  const closeFooterBtn = overlayEl.querySelector('#rvCloseBtn')
  const hide = () => hideReadValueDialog(overlayEl)

  closeHeaderBtn?.addEventListener('click', hide)
  closeFooterBtn?.addEventListener('click', hide)

  // Step navigation buttons
  overlayEl.querySelector('#rvStepBack100')?.addEventListener('click', () => stepIndex(-100))
  overlayEl.querySelector('#rvStepBack10')?.addEventListener('click', () => stepIndex(-10))
  overlayEl.querySelector('#rvStepBack1')?.addEventListener('click', () => stepIndex(-1))
  overlayEl.querySelector('#rvStepFwd1')?.addEventListener('click', () => stepIndex(1))
  overlayEl.querySelector('#rvStepFwd10')?.addEventListener('click', () => stepIndex(10))
  overlayEl.querySelector('#rvStepFwd100')?.addEventListener('click', () => stepIndex(100))

  // Slider range input
  const sliderEl = overlayEl.querySelector<HTMLInputElement>('#rvSlider')
  sliderEl?.addEventListener('input', () => {
    const val = parseInt(sliderEl.value, 10)
    if (!isNaN(val)) {
      const validIndices = getValidIndices(activeSvg, activeDataset)
      if (validIndices.length > 0) {
        const clampedVal = Math.max(0, Math.min(validIndices.length - 1, val))
        setIndex(validIndices[clampedVal])
      }
    }
  })

  // Editable X & Y inputs
  const inputX = overlayEl.querySelector<HTMLInputElement>('#rvInputX')
  const inputY = overlayEl.querySelector<HTMLInputElement>('#rvInputY')

  const handleInputXCommit = () => {
    if (!activeDataset || !activeSvg) return
    const proc = getProcessedDataset(activeDataset)
    const validIndices = getValidIndices(activeSvg, activeDataset)
    if (validIndices.length === 0) return
    const typedX = parseFloat(inputX?.value || '')
    if (!isNaN(typedX)) {
      let bestIdx = validIndices[0]
      let minDiff = Infinity
      for (const i of validIndices) {
        const diff = Math.abs(proc.x[i] - typedX)
        if (diff < minDiff) {
          minDiff = diff
          bestIdx = i
        }
      }
      setIndex(bestIdx)
    } else {
      updateReadValueUI(overlayEl)
    }
  }

  const handleInputYCommit = () => {
    if (!activeDataset || !activeSvg) return
    const proc = getProcessedDataset(activeDataset)
    const validIndices = getValidIndices(activeSvg, activeDataset)
    if (validIndices.length === 0) return
    const typedY = parseFloat(inputY?.value || '')
    if (!isNaN(typedY)) {
      let bestIdx = validIndices[0]
      let minDiff = Infinity
      for (const i of validIndices) {
        const diff = Math.abs(proc.y[i] - typedY)
        if (diff < minDiff) {
          minDiff = diff
          bestIdx = i
        }
      }
      setIndex(bestIdx)
    } else {
      updateReadValueUI(overlayEl)
    }
  }

  inputX?.addEventListener('change', handleInputXCommit)
  inputY?.addEventListener('change', handleInputYCommit)

  // X axis tool buttons (Copy, Find Highest, Find Lowest, Find Zero)
  const copyXBtn = overlayEl.querySelector<HTMLElement>('#rvCopyXBtn')
  copyXBtn?.addEventListener('click', () => {
    if (!activeDataset) return
    const proc = getProcessedDataset(activeDataset)
    const rawVal = proc.x[currentIndex] ?? 0
    copyToClipboard(String(rawVal), copyXBtn)
  })

  overlayEl.querySelector('#rvMaxXBtn')?.addEventListener('click', () => {
    if (!activeDataset || !activeSvg) return
    const proc = getProcessedDataset(activeDataset)
    const validIndices = getValidIndices(activeSvg, activeDataset)
    if (validIndices.length === 0) return
    let maxIdx = validIndices[0]
    let maxVal = -Infinity
    for (const i of validIndices) {
      if (proc.x[i] > maxVal) {
        maxVal = proc.x[i]
        maxIdx = i
      }
    }
    setIndex(maxIdx)
  })

  overlayEl.querySelector('#rvMinXBtn')?.addEventListener('click', () => {
    if (!activeDataset || !activeSvg) return
    const proc = getProcessedDataset(activeDataset)
    const validIndices = getValidIndices(activeSvg, activeDataset)
    if (validIndices.length === 0) return
    let minIdx = validIndices[0]
    let minVal = Infinity
    for (const i of validIndices) {
      if (proc.x[i] < minVal) {
        minVal = proc.x[i]
        minIdx = i
      }
    }
    setIndex(minIdx)
  })

  overlayEl.querySelector('#rvZeroXBtn')?.addEventListener('click', () => {
    if (!activeDataset || !activeSvg) return
    const proc = getProcessedDataset(activeDataset)
    const validIndices = getValidIndices(activeSvg, activeDataset)
    if (validIndices.length === 0) return
    let zeroIdx = validIndices[0]
    let minAbs = Infinity
    for (const i of validIndices) {
      const absVal = Math.abs(proc.x[i])
      if (absVal < minAbs) {
        minAbs = absVal
        zeroIdx = i
      }
    }
    setIndex(zeroIdx)
  })

  // Y axis tool buttons (Copy, Find Highest, Find Lowest, Find Zero)
  const copyYBtn = overlayEl.querySelector<HTMLElement>('#rvCopyYBtn')
  copyYBtn?.addEventListener('click', () => {
    if (!activeDataset) return
    const proc = getProcessedDataset(activeDataset)
    const rawVal = proc.y[currentIndex] ?? 0
    copyToClipboard(String(rawVal), copyYBtn)
  })

  overlayEl.querySelector('#rvMaxYBtn')?.addEventListener('click', () => {
    if (!activeDataset || !activeSvg) return
    const proc = getProcessedDataset(activeDataset)
    const validIndices = getValidIndices(activeSvg, activeDataset)
    if (validIndices.length === 0) return
    let maxIdx = validIndices[0]
    let maxVal = -Infinity
    for (const i of validIndices) {
      if (proc.y[i] > maxVal) {
        maxVal = proc.y[i]
        maxIdx = i
      }
    }
    setIndex(maxIdx)
  })

  overlayEl.querySelector('#rvMinYBtn')?.addEventListener('click', () => {
    if (!activeDataset || !activeSvg) return
    const proc = getProcessedDataset(activeDataset)
    const validIndices = getValidIndices(activeSvg, activeDataset)
    if (validIndices.length === 0) return
    let minIdx = validIndices[0]
    let minVal = Infinity
    for (const i of validIndices) {
      if (proc.y[i] < minVal) {
        minVal = proc.y[i]
        minIdx = i
      }
    }
    setIndex(minIdx)
  })

  overlayEl.querySelector('#rvZeroYBtn')?.addEventListener('click', () => {
    if (!activeDataset || !activeSvg) return
    const proc = getProcessedDataset(activeDataset)
    const validIndices = getValidIndices(activeSvg, activeDataset)
    if (validIndices.length === 0) return
    let zeroIdx = validIndices[0]
    let minAbs = Infinity
    for (const i of validIndices) {
      const absVal = Math.abs(proc.y[i])
      if (absVal < minAbs) {
        minAbs = absVal
        zeroIdx = i
      }
    }
    setIndex(zeroIdx)
  })

  // Mark button
  overlayEl.querySelector('#rvMarkBtn')?.addEventListener('click', () => {
    if (!activeDataset) return
    const proc = getProcessedDataset(activeDataset)
    if (currentIndex < 0 || currentIndex >= proc.x.length) return
    const pt = {
      x: proc.x[currentIndex],
      y: proc.y[currentIndex],
      index: currentIndex,
    }
    markedPoints.push(pt)
    updateAveragesDisplay()
  })

  // Average button
  overlayEl.querySelector('#rvAvgBtn')?.addEventListener('click', () => {
    updateAveragesDisplay()
  })
}

async function copyToClipboard(text: string, btnEl?: HTMLElement | null): Promise<void> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
    } else {
      const textArea = document.createElement('textarea')
      textArea.value = text
      textArea.style.position = 'fixed'
      textArea.style.left = '-999999px'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      document.execCommand('copy')
      textArea.remove()
    }
    if (btnEl) {
      const lastNode = btnEl.childNodes[btnEl.childNodes.length - 1]
      if (lastNode && lastNode.nodeType === Node.TEXT_NODE) {
        const origText = lastNode.textContent
        lastNode.textContent = ' Copied!'
        setTimeout(() => {
          lastNode.textContent = origText
        }, 1000)
      }
    }
  } catch (err) {
    console.error('Failed to copy to clipboard:', err)
  }
}

function stepIndex(delta: number): void {
  if (!activeDataset || !activeSvg) return
  const validIndices = getValidIndices(activeSvg, activeDataset)
  const M = validIndices.length
  if (M <= 0) return

  let pos = validIndices.indexOf(currentIndex)
  if (pos < 0) pos = 0

  let targetPos = pos + delta

  if (delta > 0) {
    while (targetPos >= M) {
      targetPos -= M
    }
  } else if (delta < 0) {
    while (targetPos < 0) {
      targetPos += M
    }
  }

  setIndex(validIndices[targetPos])
}

function setIndex(idx: number): void {
  if (!activeDataset || !activeOverlayEl || !activeSvg) return
  const validIndices = getValidIndices(activeSvg, activeDataset)
  if (validIndices.length === 0) return

  if (validIndices.includes(idx)) {
    currentIndex = idx
  } else {
    let best = validIndices[0]
    let minDiff = Math.abs(best - idx)
    for (let i = 1; i < validIndices.length; i++) {
      const diff = Math.abs(validIndices[i] - idx)
      if (diff < minDiff) {
        minDiff = diff
        best = validIndices[i]
      }
    }
    currentIndex = best
  }
  updateReadValueUI(activeOverlayEl)
}

function updateAveragesDisplay(): void {
  if (!activeOverlayEl) return
  const avgXEl = activeOverlayEl.querySelector('#rvAvgXText')
  const avgYEl = activeOverlayEl.querySelector('#rvAvgYText')
  const avgBtn = activeOverlayEl.querySelector<HTMLButtonElement>('#rvAvgBtn')

  if (markedPoints.length > 0) {
    if (avgBtn) avgBtn.disabled = false
    const sumX = markedPoints.reduce((acc, p) => acc + p.x, 0)
    const sumY = markedPoints.reduce((acc, p) => acc + p.y, 0)
    const avgX = sumX / markedPoints.length
    const avgY = sumY / markedPoints.length
    if (avgXEl) avgXEl.textContent = `avr(x): ${formatScientific(avgX)}`
    if (avgYEl) avgYEl.textContent = `avr(y): ${formatScientific(avgY)}`
  } else {
    if (avgBtn) avgBtn.disabled = true
    if (avgXEl) avgXEl.textContent = 'avr(x):'
    if (avgYEl) avgYEl.textContent = 'avr(y):'
  }
}

function updateReadValueUI(overlayEl: HTMLElement): void {
  if (!activeDataset || !activeSvg) return

  const proc = getProcessedDataset(activeDataset)
  const validIndices = getValidIndices(activeSvg, activeDataset)
  if (validIndices.length > 0 && !validIndices.includes(currentIndex)) {
    currentIndex = validIndices[0]
  }

  const xVal = proc.x[currentIndex] ?? 0
  const yVal = proc.y[currentIndex] ?? 0

  const indexValEl = overlayEl.querySelector('#rvIndexVal')
  const inputX = overlayEl.querySelector<HTMLInputElement>('#rvInputX')
  const inputY = overlayEl.querySelector<HTMLInputElement>('#rvInputY')
  const slider = overlayEl.querySelector<HTMLInputElement>('#rvSlider')

  if (indexValEl) indexValEl.textContent = `${currentIndex + 1}/${proc.x.length}`
  if (inputX) inputX.value = formatScientific(xVal)
  if (inputY) inputY.value = formatScientific(yVal)

  if (slider) {
    const validPos = validIndices.indexOf(currentIndex)
    const pos = validPos >= 0 ? validPos : 0
    slider.min = '0'
    slider.max = String(Math.max(0, validIndices.length - 1))
    slider.value = String(pos)
  }

  setPlotCrossbar(activeSvg, xVal, yVal)
}

export function showReadValueDialog(
  overlayEl: HTMLElement,
  svg: SVGSVGElement,
  dataset: Dataset,
  startIndex: number = 0
): void {
  activeOverlayEl = overlayEl
  activeSvg = svg
  activeDataset = dataset
  const validIndices = getValidIndices(svg, dataset)
  if (validIndices.includes(startIndex)) {
    currentIndex = startIndex
  } else if (validIndices.length > 0) {
    let best = validIndices[0]
    let minDiff = Math.abs(best - startIndex)
    for (let i = 1; i < validIndices.length; i++) {
      const diff = Math.abs(validIndices[i] - startIndex)
      if (diff < minDiff) {
        minDiff = diff
        best = validIndices[i]
      }
    }
    currentIndex = best
  } else {
    currentIndex = 0
  }
  markedPoints = []

  const titleEl = overlayEl.querySelector('#readValueTitle')
  if (titleEl) {
    titleEl.textContent = 'Read Value'
  }

  updateAveragesDisplay()
  updateReadValueUI(overlayEl)

  setReadValueMode(true)
  svg.style.cursor = 'crosshair'
  document.querySelectorAll('[data-action="read-value"], [data-action="read_value"]').forEach((el) => {
    el.classList.add('active')
  })

  // Attach graph pointer listeners to update crossbar position by clicking or dragging directly on plot
  if (graphMouseDownListener) {
    document.removeEventListener('mousedown', graphMouseDownListener)
  }
  if (graphMouseMoveListener) {
    window.removeEventListener('mousemove', graphMouseMoveListener)
  }
  if (graphMouseUpListener) {
    window.removeEventListener('mouseup', graphMouseUpListener)
  }

  isDraggingGraph = false

  graphMouseDownListener = (e: MouseEvent) => {
    if (e.button !== 0) return
    if (!activeSvg || !activeDataset || overlayEl.style.display === 'none') return
    const target = e.target as HTMLElement
    if (target.closest('.dialog-window')) return

    const clickedSvg = target.closest('.plot-svg') as SVGSVGElement | null
    if (clickedSvg !== activeSvg) return

    e.preventDefault()
    e.stopPropagation()
    isDraggingGraph = true
    updateFromPointerCoords(e.clientX, e.clientY)
  }

  graphMouseMoveListener = (e: MouseEvent) => {
    if (!isDraggingGraph) return
    e.preventDefault()
    updateFromPointerCoords(e.clientX, e.clientY)
  }

  graphMouseUpListener = () => {
    isDraggingGraph = false
  }

  document.addEventListener('mousedown', graphMouseDownListener)
  window.addEventListener('mousemove', graphMouseMoveListener)
  window.addEventListener('mouseup', graphMouseUpListener)

  // Attach keydown listener for keyboard arrow navigation
  if (keydownListener) {
    document.removeEventListener('keydown', keydownListener)
  }

  keydownListener = (e: KeyboardEvent) => {
    if (overlayEl.style.display === 'none' || !activeDataset || !activeSvg) return

    const activeTag = (document.activeElement?.tagName || '').toLowerCase()
    if (activeTag === 'input' || activeTag === 'textarea') return

    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      stepIndex(-1)
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      stepIndex(1)
    } else if (e.key === 'PageDown') {
      e.preventDefault()
      stepIndex(10)
    } else if (e.key === 'PageUp') {
      e.preventDefault()
      stepIndex(-10)
    } else if (e.key === 'Home') {
      e.preventDefault()
      const validIndices = getValidIndices(activeSvg, activeDataset)
      if (validIndices.length > 0) {
        setIndex(validIndices[0])
      }
    } else if (e.key === 'End') {
      e.preventDefault()
      const validIndices = getValidIndices(activeSvg, activeDataset)
      if (validIndices.length > 0) {
        setIndex(validIndices[validIndices.length - 1])
      }
    } else if (e.key === 'Escape') {
      hideReadValueDialog(overlayEl)
    }
  }
  document.addEventListener('keydown', keydownListener)

  // Display dialog centered on screen
  overlayEl.style.display = 'flex'
  const dialogEl = overlayEl.querySelector<HTMLElement>('#readValueDialog')
  if (dialogEl) {
    const dialogW = dialogEl.offsetWidth || 320
    const dialogH = dialogEl.offsetHeight || 400
    const left = Math.max(10, Math.round((window.innerWidth - dialogW) / 2))
    const top = Math.max(10, Math.round((window.innerHeight - dialogH) / 2))
    dialogEl.style.left = `${left}px`
    dialogEl.style.top = `${top}px`
  }
}

export function hideReadValueDialog(overlayEl: HTMLElement): void {
  setReadValueMode(false)
  document.querySelectorAll('[data-action="read-value"], [data-action="read_value"]').forEach((el) => {
    el.classList.remove('active')
  })
  if (activeSvg) {
    activeSvg.style.cursor = ''
    removePlotCrossbar(activeSvg)
  }
  if (graphMouseDownListener) {
    document.removeEventListener('mousedown', graphMouseDownListener)
    graphMouseDownListener = null
  }
  if (graphMouseMoveListener) {
    window.removeEventListener('mousemove', graphMouseMoveListener)
    graphMouseMoveListener = null
  }
  if (graphMouseUpListener) {
    window.removeEventListener('mouseup', graphMouseUpListener)
    graphMouseUpListener = null
  }
  if (keydownListener) {
    document.removeEventListener('keydown', keydownListener)
    keydownListener = null
  }
  isDraggingGraph = false
  activeSvg = null
  activeDataset = null
  overlayEl.style.display = 'none'
}
