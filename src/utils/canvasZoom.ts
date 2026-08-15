import { updateStatusCoords } from '../components/Statusbar.ts'

export const ZOOM_BASE = 1.5

let currentZoom = ZOOM_BASE
let panX = 0
let panY = 0

const MAX_ZOOM = 5.0 * ZOOM_BASE
const MIN_ZOOM = 0.5 * ZOOM_BASE
const GRID_CANVAS_SIZE = 601
const MAJOR_GRID_BLOCK = 100

let isPanning = false
let startMouseX = 0
let startMouseY = 0
let startPanX = 0
let startPanY = 0
let isSpacePressed = false

const zoomListeners: Array<(zoom: number) => void> = []

export function subscribeZoom(listener: (zoom: number) => void): void {
  zoomListeners.push(listener)
}

export function getCanvasZoom(): number {
  return currentZoom
}

export function getCanvasPan(): { panX: number; panY: number } {
  return { panX, panY }
}

export function calculateMinZoom(container: HTMLElement): number {
  const viewW = container.clientWidth || 800
  const viewH = container.clientHeight || 600
  const neededW = GRID_CANVAS_SIZE + 2 * MAJOR_GRID_BLOCK
  const neededH = GRID_CANVAS_SIZE + 2 * MAJOR_GRID_BLOCK
  const minW = viewW / neededW
  const minH = viewH / neededH
  return Math.min(minW, minH, MIN_ZOOM)
}

function clampPan(container: HTMLElement): void {
  const viewW = container.clientWidth || 800
  const viewH = container.clientHeight || 600
  const scaledW = GRID_CANVAS_SIZE * currentZoom
  const scaledH = GRID_CANVAS_SIZE * currentZoom

  const minVisible = 150
  const minPanX = minVisible - scaledW
  const maxPanX = viewW - minVisible
  const minPanY = minVisible - scaledH
  const maxPanY = viewH - minVisible

  panX = Math.min(maxPanX, Math.max(minPanX, panX))
  panY = Math.min(maxPanY, Math.max(minPanY, panY))
}

function updateCustomScrollbars(container: HTMLElement): void {
  const vThumb = document.querySelector<HTMLElement>('.scrollbar-v-thumb')
  const vTrack = document.querySelector<HTMLElement>('.scrollbar-v-track')
  const hThumb = document.querySelector<HTMLElement>('.scrollbar-h-thumb')
  const hTrack = document.querySelector<HTMLElement>('.scrollbar-h-track')

  const viewW = container.clientWidth || 800
  const viewH = container.clientHeight || 600
  const scaledW = GRID_CANVAS_SIZE * currentZoom
  const scaledH = GRID_CANVAS_SIZE * currentZoom

  const minVisible = 150
  const minPanX = minVisible - scaledW
  const maxPanX = viewW - minVisible
  const minPanY = minVisible - scaledH
  const maxPanY = viewH - minVisible

  if (vThumb && vTrack && maxPanY > minPanY) {
    const trackH = vTrack.clientHeight
    const thumbH = Math.max(24, Math.round((viewH / (scaledH + 300)) * trackH))
    const ratioY = (panY - minPanY) / (maxPanY - minPanY)
    const thumbTop = Math.round((1 - ratioY) * (trackH - thumbH))
    vThumb.style.height = `${thumbH}px`
    vThumb.style.top = `${Math.max(0, Math.min(trackH - thumbH, thumbTop))}px`
  }

  if (hThumb && hTrack && maxPanX > minPanX) {
    const trackW = hTrack.clientWidth
    const thumbW = Math.max(24, Math.round((viewW / (scaledW + 300)) * trackW))
    const ratioX = (panX - minPanX) / (maxPanX - minPanX)
    const thumbLeft = Math.round((1 - ratioX) * (trackW - thumbW))
    hThumb.style.width = `${thumbW}px`
    hThumb.style.left = `${Math.max(0, Math.min(trackW - thumbW, thumbLeft))}px`
  }
}

function applyTransform(graphAreaEl: HTMLElement, statusEl?: HTMLElement | null): void {
  graphAreaEl.style.transform = `translate(${panX}px, ${panY}px) scale(${currentZoom})`
  graphAreaEl.style.transformOrigin = '0 0'

  const container = graphAreaEl.parentElement || document.body
  updateCustomScrollbars(container)

  if (statusEl) {
    statusEl.textContent = `Zoom: ${Math.round((currentZoom / ZOOM_BASE) * 100)}%`
  }

  zoomListeners.forEach((listener) => listener(currentZoom))
}

export function centerCanvas(
  container: HTMLElement,
  graphAreaEl: HTMLElement,
  statusEl?: HTMLElement | null
): void {
  const viewW = container.clientWidth || 800
  const viewH = container.clientHeight || 600
  panX = Math.max(20, (viewW - GRID_CANVAS_SIZE * currentZoom) / 2)
  panY = Math.max(20, (viewH - GRID_CANVAS_SIZE * currentZoom) / 2)
  clampPan(container)
  applyTransform(graphAreaEl, statusEl)
}

export function setCanvasZoom(
  zoom: number,
  workspaceOrContainer: HTMLElement,
  graphAreaEl: HTMLElement,
  statusEl?: HTMLElement | null
): void {
  const container = workspaceOrContainer.classList.contains('workspace-grid')
    ? workspaceOrContainer
    : workspaceOrContainer.querySelector<HTMLElement>('.workspace-grid') || workspaceOrContainer

  const viewW = container.clientWidth || 800
  const viewH = container.clientHeight || 600
  const centerX = viewW / 2
  const centerY = viewH / 2

  const canvasX = (centerX - panX) / currentZoom
  const canvasY = (centerY - panY) / currentZoom

  const minZoom = calculateMinZoom(container)
  const newZoom = Math.min(MAX_ZOOM, Math.max(minZoom, zoom))

  currentZoom = newZoom
  panX = centerX - canvasX * newZoom
  panY = centerY - canvasY * newZoom

  clampPan(container)
  applyTransform(graphAreaEl, statusEl)
}

export function initCanvasZoom(
  workspaceEl: HTMLElement,
  graphAreaEl: HTMLElement,
  statusEl?: HTMLElement | null
): void {
  const container = workspaceEl.classList.contains('workspace-grid')
    ? workspaceEl
    : workspaceEl.querySelector<HTMLElement>('.workspace-grid') || workspaceEl

  // Initial centering
  centerCanvas(container, graphAreaEl, statusEl)

  // Live Sma4Win coordinate tracking (0..300 statusbar units, 50 units per major grid block)
  graphAreaEl.addEventListener('mousemove', (e: MouseEvent) => {
    const rect = graphAreaEl.getBoundingClientRect()
    const mouseX = (e.clientX - rect.left) / currentZoom
    const mouseY = (e.clientY - rect.top) / currentZoom

    if (mouseX >= 0 && mouseX <= 600 && mouseY >= 0 && mouseY <= 600) {
      const statusX = Math.round(mouseX * 0.5)
      const statusY = Math.round(mouseY * 0.5)
      updateStatusCoords(document.body, statusX, statusY)
    }
  })

  window.addEventListener('resize', () => {
    clampPan(container)
    applyTransform(graphAreaEl, statusEl)
  })

  // Key listeners for Spacebar panning
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.code === 'Space' && !isSpacePressed) {
      const activeEl = document.activeElement
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return
      isSpacePressed = true
      container.style.cursor = 'grab'
    }
  })

  window.addEventListener('keyup', (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      isSpacePressed = false
      if (!isPanning) container.style.cursor = 'default'
    }
  })

  // Mouse pan listeners (middle-click or Space+drag only; left-drag is reserved for marquee selection)
  container.addEventListener('mousedown', (e: MouseEvent) => {
    const target = e.target as HTMLElement
    const isScrollbarTarget = target.closest('.scrollbar-v') || target.closest('.scrollbar-h')
    if (isScrollbarTarget) return

    const isMiddleClick = e.button === 1
    const isSpaceClick = e.button === 0 && isSpacePressed

    if (isMiddleClick || isSpaceClick) {
      isPanning = true
      startMouseX = e.clientX
      startMouseY = e.clientY
      startPanX = panX
      startPanY = panY
      container.style.cursor = 'grabbing'
      e.preventDefault()
    }
  })

  window.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isPanning) return
    const dx = e.clientX - startMouseX
    const dy = e.clientY - startMouseY
    panX = startPanX + dx
    panY = startPanY + dy
    clampPan(container)
    applyTransform(graphAreaEl, statusEl)
  })

  window.addEventListener('mouseup', () => {
    if (isPanning) {
      isPanning = false
      container.style.cursor = isSpacePressed ? 'grab' : 'default'
    }
  })

  // Arrow button click handlers on custom scrollbars
  const btnUp = document.querySelector<HTMLElement>('.scroll-btn-up')
  const btnDown = document.querySelector<HTMLElement>('.scroll-btn-down')
  const btnLeft = document.querySelector<HTMLElement>('.scroll-btn-left')
  const btnRight = document.querySelector<HTMLElement>('.scroll-btn-right')

  btnUp?.addEventListener('click', () => {
    panY += 40
    clampPan(container)
    applyTransform(graphAreaEl, statusEl)
  })

  btnDown?.addEventListener('click', () => {
    panY -= 40
    clampPan(container)
    applyTransform(graphAreaEl, statusEl)
  })

  btnLeft?.addEventListener('click', () => {
    panX += 40
    clampPan(container)
    applyTransform(graphAreaEl, statusEl)
  })

  btnRight?.addEventListener('click', () => {
    panX -= 40
    clampPan(container)
    applyTransform(graphAreaEl, statusEl)
  })

  // Custom Scrollbar Thumb Drag Listeners
  const vThumb = document.querySelector<HTMLElement>('.scrollbar-v-thumb')
  const vTrack = document.querySelector<HTMLElement>('.scrollbar-v-track')
  const hThumb = document.querySelector<HTMLElement>('.scrollbar-h-thumb')
  const hTrack = document.querySelector<HTMLElement>('.scrollbar-h-track')

  if (vThumb && vTrack) {
    let isVDragging = false
    let dragStartY = 0
    let dragStartPanY = 0

    vThumb.addEventListener('mousedown', (e: MouseEvent) => {
      isVDragging = true
      dragStartY = e.clientY
      dragStartPanY = panY
      e.preventDefault()
      e.stopPropagation()
    })

    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (!isVDragging) return
      const dy = e.clientY - dragStartY
      const trackH = vTrack.clientHeight
      const thumbH = vThumb.clientHeight
      const maxThumbMove = trackH - thumbH
      if (maxThumbMove <= 0) return

      const viewH = container.clientHeight || 600
      const scaledH = GRID_CANVAS_SIZE * currentZoom
      const minVisible = 150
      const minPanY = minVisible - scaledH
      const maxPanY = viewH - minVisible

      const panDelta = -(dy / maxThumbMove) * (maxPanY - minPanY)
      panY = dragStartPanY + panDelta
      clampPan(container)
      applyTransform(graphAreaEl, statusEl)
    })

    window.addEventListener('mouseup', () => {
      isVDragging = false
    })
  }

  if (hThumb && hTrack) {
    let isHDragging = false
    let dragStartX = 0
    let dragStartPanX = 0

    hThumb.addEventListener('mousedown', (e: MouseEvent) => {
      isHDragging = true
      dragStartX = e.clientX
      dragStartPanX = panX
      e.preventDefault()
      e.stopPropagation()
    })

    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (!isHDragging) return
      const dx = e.clientX - dragStartX
      const trackW = hTrack.clientWidth
      const thumbW = hThumb.clientWidth
      const maxThumbMove = trackW - thumbW
      if (maxThumbMove <= 0) return

      const viewW = container.clientWidth || 800
      const scaledW = GRID_CANVAS_SIZE * currentZoom
      const minVisible = 150
      const minPanX = minVisible - scaledW
      const maxPanX = viewW - minVisible

      const panDelta = -(dx / maxThumbMove) * (maxPanX - minPanX)
      panX = dragStartPanX + panDelta
      clampPan(container)
      applyTransform(graphAreaEl, statusEl)
    })

    window.addEventListener('mouseup', () => {
      isHDragging = false
    })
  }

  // Wheel listener for cursor-centered zoom (pinch) + 2-finger trackpad / wheel pan
  container.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()

        const rect = container.getBoundingClientRect()
        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top

        const canvasX = (mouseX - panX) / currentZoom
        const canvasY = (mouseY - panY) / currentZoom

        const delta = e.deltaY > 0 ? -0.1 : 0.1
        const minZoom = calculateMinZoom(container)
        const targetZoom = currentZoom * (1 + delta)
        const newZoom = Math.min(MAX_ZOOM, Math.max(minZoom, targetZoom))

        currentZoom = newZoom
        panX = mouseX - canvasX * newZoom
        panY = mouseY - canvasY * newZoom

        clampPan(container)
        applyTransform(graphAreaEl, statusEl)
      } else {
        // Two-finger scroll on a trackpad (and plain mouse wheel) pans the canvas
        e.preventDefault()
        panX -= e.deltaX
        panY -= e.deltaY
        clampPan(container)
        applyTransform(graphAreaEl, statusEl)
      }
    },
    { passive: false }
  )

  // Two-finger touch pan & pinch-zoom (trackpad / touch device gesture)
  let touchPanStart: {
    midX: number
    midY: number
    panX: number
    panY: number
    startDist: number
    startZoom: number
    canvasX: number
    canvasY: number
  } | null = null

  const getTouchMid = (touches: TouchList): { midX: number; midY: number } => ({
    midX: (touches[0].clientX + touches[1].clientX) / 2,
    midY: (touches[0].clientY + touches[1].clientY) / 2,
  })

  const getTouchDist = (touches: TouchList): number =>
    Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)

  container.addEventListener(
    'touchstart',
    (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const mid = getTouchMid(e.touches)
        const dist = Math.max(10, getTouchDist(e.touches))
        const canvasX = (mid.midX - panX) / currentZoom
        const canvasY = (mid.midY - panY) / currentZoom
        touchPanStart = {
          midX: mid.midX,
          midY: mid.midY,
          panX,
          panY,
          startDist: dist,
          startZoom: currentZoom,
          canvasX,
          canvasY,
        }
        e.preventDefault()
      }
    },
    { passive: false }
  )

  container.addEventListener(
    'touchmove',
    (e: TouchEvent) => {
      if (!touchPanStart || e.touches.length < 2) return
      e.preventDefault()
      const mid = getTouchMid(e.touches)
      const currentDist = Math.max(10, getTouchDist(e.touches))
      const scale = currentDist / touchPanStart.startDist
      const targetZoom = touchPanStart.startZoom * scale
      const minZoom = calculateMinZoom(container)
      const newZoom = Math.min(MAX_ZOOM, Math.max(minZoom, targetZoom))

      currentZoom = newZoom
      panX = mid.midX - touchPanStart.canvasX * newZoom
      panY = mid.midY - touchPanStart.canvasY * newZoom
      clampPan(container)
      applyTransform(graphAreaEl, statusEl)
    },
    { passive: false }
  )

  container.addEventListener('touchend', (e: TouchEvent) => {
    if (e.touches.length < 2) touchPanStart = null
  })

  container.addEventListener('touchcancel', () => {
    touchPanStart = null
  })
}

