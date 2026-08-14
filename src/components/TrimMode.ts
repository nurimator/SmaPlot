import { activeSvgs, ensureSmpDoc, isTrimmingMode, PLOT_MARGIN, setSelectedPlotSvg, updatePlotVisual } from './Plot.ts'
import { getCanvasZoom } from '../utils/canvasZoom.ts'

interface PlotFrame {
  svg: SVGSVGElement
  l: number
  t: number
  w: number
  h: number
}

// Locate the inner plot frame (graph area) that contains a graph-area-local point.
// Iterates in reverse so the topmost (last-drawn) plot wins on overlap.
function findPlotFrameAt(gx: number, gy: number): PlotFrame | null {
  for (let i = activeSvgs.length - 1; i >= 0; i--) {
    const svg = activeSvgs[i]
    const left = parseFloat(svg.style.left) || 0
    const top = parseFloat(svg.style.top) || 0
    const width = parseFloat(svg.style.width) || 400
    const height = parseFloat(svg.style.height) || 300
    const l = left + PLOT_MARGIN.l
    const t = top + PLOT_MARGIN.t
    const w = Math.max(10, width - PLOT_MARGIN.l - PLOT_MARGIN.r)
    const h = Math.max(10, height - PLOT_MARGIN.t - PLOT_MARGIN.b)
    if (gx >= l && gx <= l + w && gy >= t && gy <= t + h) {
      return { svg, l, t, w, h }
    }
  }
  return null
}

// Trimming mode: left-click hold-drag on a plot's graph area defines a rectangle
// that re-scopes that plot's X/Y axis start & end. The box size is unchanged — the
// data simply zooms in to fill the trimmed region. Marquee selection is disabled
// while this mode is active (see MarqueeSelect.ts). The mode auto-exits after a
// single successful trim; onFinish restores the toolbar/marquee state.
export function initTrimMode(graphAreaEl: HTMLElement, onCommit: () => void, onFinish: () => void): void {
  let isTrimming = false
  let hasMoved = false
  let startClientX = 0
  let startClientY = 0
  let startGraphX = 0
  let startGraphY = 0
  let lastGraphX = 0
  let lastGraphY = 0
  let frame: PlotFrame | null = null
  let trimBox: HTMLElement | null = null

  const workspaceEl = graphAreaEl.closest<HTMLElement>('.workspace') || document.body

  workspaceEl.addEventListener('mousedown', (e: MouseEvent) => {
    if (!isTrimmingMode()) return
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    // Skip UI chrome / dialogs / resize handles
    if (target.closest('.scrollbar-v, .scrollbar-h, .workspace-right, #ctxMenu, #marqueeCtxMenu, [data-dir]')) return
    if (target.closest('.dialog-overlay, .modal')) return

    const rect = graphAreaEl.getBoundingClientRect()
    const zoom = getCanvasZoom()
    const gx = (e.clientX - rect.left) / zoom
    const gy = (e.clientY - rect.top) / zoom

    const hitFrame = findPlotFrameAt(gx, gy)
    if (!hitFrame) return

    e.preventDefault()
    e.stopPropagation()

    isTrimming = true
    hasMoved = false
    frame = hitFrame
    startClientX = e.clientX
    startClientY = e.clientY
    startGraphX = gx
    startGraphY = gy
    lastGraphX = gx
    lastGraphY = gy
    document.body.style.userSelect = 'none'
  })

  window.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isTrimming || !frame) return
    const dx = e.clientX - startClientX
    const dy = e.clientY - startClientY
    if (!hasMoved && Math.hypot(dx, dy) < 4) return

    const rect = graphAreaEl.getBoundingClientRect()
    const zoom = getCanvasZoom()
    lastGraphX = (e.clientX - rect.left) / zoom
    lastGraphY = (e.clientY - rect.top) / zoom

    if (!hasMoved) {
      hasMoved = true
      trimBox = document.createElement('div')
      trimBox.className = 'trim-selection-box'
      graphAreaEl.appendChild(trimBox)
    }

    const left = Math.min(startGraphX, lastGraphX)
    const top = Math.min(startGraphY, lastGraphY)
    const width = Math.abs(lastGraphX - startGraphX)
    const height = Math.abs(lastGraphY - startGraphY)

    if (trimBox) {
      trimBox.style.left = `${left}px`
      trimBox.style.top = `${top}px`
      trimBox.style.width = `${width}px`
      trimBox.style.height = `${height}px`
      trimBox.style.display = 'block'
    }
  })

  window.addEventListener('mouseup', () => {
    if (!isTrimming || !frame) return
    isTrimming = false
    document.body.style.userSelect = ''
    if (trimBox) {
      trimBox.remove()
      trimBox = null
    }

    const f = frame
    frame = null

    // Single click without drag: nothing to trim.
    if (!hasMoved) return

    // Clamp the drag rectangle to the plot's inner frame.
    const cl = Math.max(f.l, Math.min(startGraphX, lastGraphX))
    const cr = Math.min(f.l + f.w, Math.max(startGraphX, lastGraphX))
    const ct = Math.max(f.t, Math.min(startGraphY, lastGraphY))
    const cb = Math.min(f.t + f.h, Math.max(startGraphY, lastGraphY))

    if (cr - cl < 2 || cb - ct < 2) return

    const doc = ensureSmpDoc(f.svg)
    const ax = doc.axisX
    const ay = doc.axisY
    const xMin = ax.min
    const xMax = ax.max
    const yMin = ay.min
    const yMax = ay.max

    // Map frame pixel coordinates back into data coordinates.
    const xAt = (gx: number) => xMin + ((gx - f.l) / f.w) * (xMax - xMin)
    const yAt = (gy: number) => yMax - ((gy - f.t) / f.h) * (yMax - yMin)

    // Preserve the original axis direction (including reversed/negative ranges
    // such as xMin=400, xMax=0): the axis min is always at the left frame edge
    // and the axis max at the right edge, regardless of value ordering.
    const newXMin = xAt(cl)
    const newXMax = xAt(cr)
    const newYMin = yAt(cb)
    const newYMax = yAt(ct)

    ax.min = newXMin
    ax.max = newXMax
    ay.min = newYMin
    ay.max = newYMax

    if (doc.commonWithU !== false && doc.axisTop) {
      doc.axisTop.min = newXMin
      doc.axisTop.max = newXMax
    }
    if (doc.commonWithR !== false && doc.axisRight) {
      doc.axisRight.min = newYMin
      doc.axisRight.max = newYMax
    }

    setSelectedPlotSvg(f.svg)
    updatePlotVisual(f.svg)
    onCommit()
    onFinish()
  })

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && isTrimming) {
      isTrimming = false
      document.body.style.userSelect = ''
      if (trimBox) {
        trimBox.remove()
        trimBox = null
      }
      frame = null
    }
  })
}
