import { showContextMenu, hideContextMenu } from './ContextMenu.ts'
import { getCanvasZoom } from '../utils/canvasZoom.ts'

let activeMarqueeBox: HTMLElement | null = null
let currentMarqueeBounds: { left: number; top: number; width: number; height: number } | null = null

export function generateMarqueeSvg(
  graphAreaEl: HTMLElement,
  mLeft: number,
  mTop: number,
  mWidth: number,
  mHeight: number
): string {
  const masterSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  masterSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  masterSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
  masterSvg.setAttribute('viewBox', `${mLeft} ${mTop} ${mWidth} ${mHeight}`)
  masterSvg.setAttribute('width', `${Math.round(mWidth)}`)
  masterSvg.setAttribute('height', `${Math.round(mHeight)}`)


  const plots = Array.from(graphAreaEl.querySelectorAll<SVGSVGElement>('.plot-svg'))
  plots.forEach((svg) => {
    const leftPx = parseFloat(svg.style.left) || 0
    const topPx = parseFloat(svg.style.top) || 0
    const widthPx = parseFloat(svg.style.width) || 400
    const heightPx = parseFloat(svg.style.height) || 300

    if (
      leftPx < mLeft + mWidth &&
      leftPx + widthPx > mLeft &&
      topPx < mTop + mHeight &&
      topPx + heightPx > mTop
    ) {
      const clone = svg.cloneNode(true) as SVGSVGElement
      clone.setAttribute('x', `${leftPx}`)
      clone.setAttribute('y', `${topPx}`)
      clone.setAttribute('width', `${widthPx}`)
      clone.setAttribute('height', `${heightPx}`)
      clone.removeAttribute('style')
      clone.classList.remove('plot-svg')

      const handles = clone.querySelectorAll('.handle, [data-dir], rect[fill="#2563eb"]')
      handles.forEach((h) => h.remove())

      masterSvg.appendChild(clone)
    }
  })

  const serializer = new XMLSerializer()
  let svgString = serializer.serializeToString(masterSvg)
  if (!svgString.startsWith('<?xml')) {
    svgString = `<?xml version="1.0" encoding="UTF-8"?>\n` + svgString
  }
  return svgString
}

export async function copySvgToClipboard(svgString: string): Promise<boolean> {
  try {
    const blob = new Blob([svgString], { type: 'image/svg+xml' })
    const textBlob = new Blob([svgString], { type: 'text/plain' })
    if (navigator.clipboard && typeof navigator.clipboard.write === 'function') {
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/svg+xml': blob,
          'text/plain': textBlob,
        }),
      ])
      return true
    }
  } catch (err) {
    console.warn('ClipboardItem write failed, falling back to writeText:', err)
  }

  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(svgString)
      return true
    }
  } catch (err) {
    console.error('Failed to copy SVG to clipboard:', err)
  }

  return false
}

export function hideMarqueeSelection(marqueeCtxMenuEl?: HTMLElement | null): void {
  if (activeMarqueeBox) {
    activeMarqueeBox.remove()
    activeMarqueeBox = null
  }
  currentMarqueeBounds = null
  if (marqueeCtxMenuEl) {
    hideContextMenu(marqueeCtxMenuEl)
  }
}

export function initMarqueeSelection(
  graphAreaEl: HTMLElement,
  marqueeCtxMenuEl: HTMLElement,
  statusFileTextEl?: HTMLElement | null
): void {
  let isRightDragging = false
  let hasRightDragged = false
  let startClientX = 0
  let startClientY = 0
  let startGraphX = 0
  let startGraphY = 0

  const getMarqueeBox = (): HTMLElement => {
    if (!activeMarqueeBox) {
      activeMarqueeBox = document.createElement('div')
      activeMarqueeBox.className = 'marquee-selection-box'
      graphAreaEl.appendChild(activeMarqueeBox)
    }
    return activeMarqueeBox
  }

  const workspaceEl = graphAreaEl.closest<HTMLElement>('.workspace') || document.body

  workspaceEl.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button !== 2) return
    hideContextMenu(marqueeCtxMenuEl)

    const rect = graphAreaEl.getBoundingClientRect()
    const zoom = getCanvasZoom()
    startClientX = e.clientX
    startClientY = e.clientY
    startGraphX = (e.clientX - rect.left) / zoom
    startGraphY = (e.clientY - rect.top) / zoom

    isRightDragging = true
    hasRightDragged = false
  })

  window.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isRightDragging) return
    const dist = Math.hypot(e.clientX - startClientX, e.clientY - startClientY)
    if (dist > 5) {
      hasRightDragged = true

      const rect = graphAreaEl.getBoundingClientRect()
      const zoom = getCanvasZoom()
      const currentGraphX = (e.clientX - rect.left) / zoom
      const currentGraphY = (e.clientY - rect.top) / zoom

      const mLeft = Math.min(startGraphX, currentGraphX)
      const mTop = Math.min(startGraphY, currentGraphY)
      const mWidth = Math.abs(currentGraphX - startGraphX)
      const mHeight = Math.abs(currentGraphY - startGraphY)

      currentMarqueeBounds = { left: mLeft, top: mTop, width: mWidth, height: mHeight }

      const box = getMarqueeBox()
      box.style.left = `${mLeft}px`
      box.style.top = `${mTop}px`
      box.style.width = `${mWidth}px`
      box.style.height = `${mHeight}px`
      box.style.display = 'block'
    }
  })

  window.addEventListener('mouseup', (e: MouseEvent) => {
    if (!isRightDragging) return
    isRightDragging = false

    if (hasRightDragged && currentMarqueeBounds && currentMarqueeBounds.width > 5 && currentMarqueeBounds.height > 5) {
      e.preventDefault()
      e.stopPropagation()
      showContextMenu(marqueeCtxMenuEl, e.clientX, e.clientY)
    }
  })

  window.addEventListener(
    'contextmenu',
    (e: MouseEvent) => {
      if (hasRightDragged) {
        e.preventDefault()
        e.stopPropagation()
        setTimeout(() => {
          hasRightDragged = false
        }, 50)
      }
    },
    true
  )

  const copyBtn = marqueeCtxMenuEl.querySelector('#marqueeCopyBtn') || marqueeCtxMenuEl.querySelector('[data-ctx="copy_svg_marquee"]')
  copyBtn?.addEventListener('click', async () => {
    if (!currentMarqueeBounds) return
    const { left, top, width, height } = currentMarqueeBounds
    const svgCode = generateMarqueeSvg(graphAreaEl, left, top, width, height)
    const success = await copySvgToClipboard(svgCode)
    if (success && statusFileTextEl) {
      statusFileTextEl.textContent = 'SVG marquee selection copied to clipboard!'
    }
    hideMarqueeSelection(marqueeCtxMenuEl)
  })

  document.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('#marqueeCtxMenu') || target.closest('.marquee-selection-box')) return
    hideMarqueeSelection(marqueeCtxMenuEl)
  })

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      hideMarqueeSelection(marqueeCtxMenuEl)
    }
  })
}
