import type { Dataset } from '../types.ts'
import { getPlotLimits, getProcessedDataset, PLOT_MARGIN, removePlotCrossbar, setPlotCrossbar } from './Plot.ts'
import { makeDraggable } from '../utils/draggable.ts'

export function formatScientific(val: number): string {
  if (isNaN(val) || !isFinite(val)) return '0.0000e+00'
  const expStr = val.toExponential(4)
  return expStr.replace(/e([+-])(\d)$/, 'e$10$2')
}

let activeSvg: SVGSVGElement | null = null
let activeDataset: Dataset | null = null
let currentIndex: number = 0
let markedPoints: { x: number; y: number; index: number }[] = []
let activeOverlayEl: HTMLElement | null = null

let graphClickListener: ((e: MouseEvent) => void) | null = null
let keydownListener: ((e: KeyboardEvent) => void) | null = null

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
      setIndex(val)
    }
  })

  // Editable X & Y inputs
  const inputX = overlayEl.querySelector<HTMLInputElement>('#rvInputX')
  const inputY = overlayEl.querySelector<HTMLInputElement>('#rvInputY')

  const handleInputCommit = () => {
    if (!activeDataset) return
    const proc = getProcessedDataset(activeDataset)
    const typedX = parseFloat(inputX?.value || '')
    if (!isNaN(typedX)) {
      let bestIdx = 0
      let minDiff = Infinity
      for (let i = 0; i < proc.x.length; i++) {
        const diff = Math.abs(proc.x[i] - typedX)
        if (diff < minDiff) {
          minDiff = diff
          bestIdx = i
        }
      }
      setIndex(bestIdx)
    }
  }

  inputX?.addEventListener('change', handleInputCommit)
  inputY?.addEventListener('change', handleInputCommit)

  // X axis tool buttons (Copy, Find Highest, Find Lowest)
  const copyXBtn = overlayEl.querySelector<HTMLElement>('#rvCopyXBtn')
  copyXBtn?.addEventListener('click', () => {
    if (!activeDataset) return
    const proc = getProcessedDataset(activeDataset)
    const rawVal = proc.x[currentIndex] ?? 0
    copyToClipboard(String(rawVal), copyXBtn)
  })

  overlayEl.querySelector('#rvMaxXBtn')?.addEventListener('click', () => {
    if (!activeDataset) return
    const proc = getProcessedDataset(activeDataset)
    let maxIdx = 0
    let maxVal = -Infinity
    for (let i = 0; i < proc.x.length; i++) {
      if (proc.x[i] > maxVal) {
        maxVal = proc.x[i]
        maxIdx = i
      }
    }
    setIndex(maxIdx)
  })

  overlayEl.querySelector('#rvMinXBtn')?.addEventListener('click', () => {
    if (!activeDataset) return
    const proc = getProcessedDataset(activeDataset)
    let minIdx = 0
    let minVal = Infinity
    for (let i = 0; i < proc.x.length; i++) {
      if (proc.x[i] < minVal) {
        minVal = proc.x[i]
        minIdx = i
      }
    }
    setIndex(minIdx)
  })

  overlayEl.querySelector('#rvZeroXBtn')?.addEventListener('click', () => {
    if (!activeDataset) return
    const proc = getProcessedDataset(activeDataset)
    let zeroIdx = 0
    let minAbs = Infinity
    for (let i = 0; i < proc.x.length; i++) {
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
    if (!activeDataset) return
    const proc = getProcessedDataset(activeDataset)
    let maxIdx = 0
    let maxVal = -Infinity
    for (let i = 0; i < proc.y.length; i++) {
      if (proc.y[i] > maxVal) {
        maxVal = proc.y[i]
        maxIdx = i
      }
    }
    setIndex(maxIdx)
  })

  overlayEl.querySelector('#rvMinYBtn')?.addEventListener('click', () => {
    if (!activeDataset) return
    const proc = getProcessedDataset(activeDataset)
    let minIdx = 0
    let minVal = Infinity
    for (let i = 0; i < proc.y.length; i++) {
      if (proc.y[i] < minVal) {
        minVal = proc.y[i]
        minIdx = i
      }
    }
    setIndex(minIdx)
  })

  overlayEl.querySelector('#rvZeroYBtn')?.addEventListener('click', () => {
    if (!activeDataset) return
    const proc = getProcessedDataset(activeDataset)
    let zeroIdx = 0
    let minAbs = Infinity
    for (let i = 0; i < proc.y.length; i++) {
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
  if (!activeDataset) return
  const proc = getProcessedDataset(activeDataset)
  const N = proc.x.length
  if (N <= 0) return

  const cur1 = currentIndex + 1
  let target1 = cur1 + delta

  if (delta > 0) {
    while (target1 > N) {
      target1 -= N
    }
  } else if (delta < 0) {
    while (target1 < 1) {
      target1 += N
    }
  }

  setIndex(target1 - 1)
}

function setIndex(idx: number): void {
  if (!activeDataset || !activeOverlayEl) return
  const proc = getProcessedDataset(activeDataset)
  const maxIdx = Math.max(0, proc.x.length - 1)
  currentIndex = Math.max(0, Math.min(maxIdx, idx))
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
  const maxIdx = Math.max(0, proc.x.length - 1)
  currentIndex = Math.max(0, Math.min(maxIdx, currentIndex))

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
    slider.min = '0'
    slider.max = String(maxIdx)
    slider.value = String(currentIndex)
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
  const proc = getProcessedDataset(dataset)
  currentIndex = Math.max(0, Math.min(proc.x.length - 1, startIndex))
  markedPoints = []

  const titleEl = overlayEl.querySelector('#readValueTitle')
  if (titleEl) {
    titleEl.textContent = 'Read Value'
  }

  updateAveragesDisplay()
  updateReadValueUI(overlayEl)

  // Attach graph click listener to update crossbar position by clicking directly on plot
  if (graphClickListener) {
    document.removeEventListener('mousedown', graphClickListener)
  }

  graphClickListener = (e: MouseEvent) => {
    if (!activeSvg || !activeDataset || overlayEl.style.display === 'none') return
    const target = e.target as HTMLElement
    if (target.closest('.dialog-window')) return

    const clickedSvg = target.closest('.plot-svg') as SVGSVGElement | null
    if (clickedSvg !== activeSvg) return

    const rect = activeSvg.getBoundingClientRect()
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

    const scaleX = svgW / (rect.width || 1)
    const scaleY = svgH / (rect.height || 1)

    const clickX = (e.clientX - rect.left) * scaleX
    const clickY = (e.clientY - rect.top) * scaleY

    const plotW = Math.max(10, svgW - PLOT_MARGIN.l - PLOT_MARGIN.r)
    const plotH = Math.max(10, svgH - PLOT_MARGIN.t - PLOT_MARGIN.b)

    if (
      clickX >= PLOT_MARGIN.l &&
      clickX <= PLOT_MARGIN.l + plotW &&
      clickY >= PLOT_MARGIN.t &&
      clickY <= PLOT_MARGIN.t + plotH
    ) {
      const limits = getPlotLimits(activeSvg)
      const dataX = limits.xMin + ((clickX - PLOT_MARGIN.l) / plotW) * (limits.xMax - limits.xMin)
      const dataY = limits.yMin + ((PLOT_MARGIN.t + plotH - clickY) / plotH) * (limits.yMax - limits.yMin)

      const procDs = getProcessedDataset(activeDataset)
      let bestIdx = 0
      let minDist = Infinity
      const rangeX = limits.xMax - limits.xMin || 1
      const rangeY = limits.yMax - limits.yMin || 1

      for (let i = 0; i < procDs.x.length; i++) {
        const dx = (procDs.x[i] - dataX) / rangeX
        const dy = (procDs.y[i] - dataY) / rangeY
        const dist = dx * dx + dy * dy
        if (dist < minDist) {
          minDist = dist
          bestIdx = i
        }
      }
      currentIndex = bestIdx
      updateReadValueUI(overlayEl)
    }
  }
  document.addEventListener('mousedown', graphClickListener)

  // Attach keydown listener for keyboard arrow navigation
  if (keydownListener) {
    document.removeEventListener('keydown', keydownListener)
  }

  keydownListener = (e: KeyboardEvent) => {
    if (overlayEl.style.display === 'none' || !activeDataset) return

    const activeTag = (document.activeElement?.tagName || '').toLowerCase()
    if (activeTag === 'input' || activeTag === 'textarea') return

    const procDs = getProcessedDataset(activeDataset)

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
      setIndex(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setIndex(procDs.x.length - 1)
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
  if (activeSvg) {
    removePlotCrossbar(activeSvg)
  }
  if (graphClickListener) {
    document.removeEventListener('mousedown', graphClickListener)
    graphClickListener = null
  }
  if (keydownListener) {
    document.removeEventListener('keydown', keydownListener)
    keydownListener = null
  }
  activeSvg = null
  activeDataset = null
  overlayEl.style.display = 'none'
}
