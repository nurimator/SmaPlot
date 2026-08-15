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
  masterSvg.setAttribute('shape-rendering', 'crispEdges')

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style')
  styleEl.textContent = 'path, line, polyline, polygon, rect, circle, ellipse { shape-rendering: crispEdges; }'
  defs.appendChild(styleEl)
  masterSvg.appendChild(defs)

  // Full-area transparent hit-test layer for Word, PowerPoint, and vector editors
  const masterBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  masterBg.setAttribute('x', `${mLeft}`)
  masterBg.setAttribute('y', `${mTop}`)
  masterBg.setAttribute('width', `${Math.round(mWidth)}`)
  masterBg.setAttribute('height', `${Math.round(mHeight)}`)
  masterBg.setAttribute('fill', '#ffffff')
  masterBg.setAttribute('fill-opacity', '0')
  masterBg.setAttribute('pointer-events', 'all')
  masterSvg.appendChild(masterBg)

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
      clone.setAttribute('overflow', 'visible')
      clone.setAttribute('shape-rendering', 'crispEdges')
      clone.removeAttribute('style')
      clone.classList.remove('plot-svg')

      // Transparent hit layer specifically covering the inside boxplot area
      const margin = { l: 65, r: 25, t: 25, b: 55 }
      const plotW = Math.max(10, widthPx - margin.l - margin.r)
      const plotH = Math.max(10, heightPx - margin.t - margin.b)
      const innerBoxBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      innerBoxBg.setAttribute('x', `${margin.l}`)
      innerBoxBg.setAttribute('y', `${margin.t}`)
      innerBoxBg.setAttribute('width', `${plotW}`)
      innerBoxBg.setAttribute('height', `${plotH}`)
      innerBoxBg.setAttribute('fill', '#ffffff')
      innerBoxBg.setAttribute('fill-opacity', '0')
      innerBoxBg.setAttribute('pointer-events', 'all')
      clone.insertBefore(innerBoxBg, clone.firstChild)

      const allShapes = clone.querySelectorAll('path, line, polyline, polygon, rect, circle, ellipse, g')
      allShapes.forEach((s) => {
        s.setAttribute('shape-rendering', 'crispEdges')
      })

      const handles = clone.querySelectorAll('.handle, [data-dir]')
      handles.forEach((h) => h.remove())

      const foreignObjects = clone.querySelectorAll('foreignObject')
      foreignObjects.forEach((fo) => {
        const div = fo.querySelector('div')
        if (!div) return


        const fontSize = div.style.fontSize || '12px'
        const fontFamily = div.style.fontFamily || 'sans-serif'
        const fontWeight = div.style.fontWeight || '400'
        const color = div.style.color || '#000000'
        const textAlign = div.style.textAlign || 'left'

        const textNode = document.createElementNS('http://www.w3.org/2000/svg', 'text')

        let foX = parseFloat(fo.getAttribute('x') || '0')
        let foY = parseFloat(fo.getAttribute('y') || '0')
        const fontSzNum = parseFloat(fontSize) || 12

        if (textAlign === 'center') {
          textNode.setAttribute('text-anchor', 'middle')
          textNode.style.textAnchor = 'middle'
        } else if (textAlign === 'right') {
          textNode.setAttribute('text-anchor', 'end')
          textNode.style.textAnchor = 'end'
        } else {
          textNode.setAttribute('text-anchor', 'start')
          textNode.style.textAnchor = 'start'
        }

        textNode.setAttribute('x', String(foX))
        textNode.setAttribute('y', String(foY + fontSzNum))

        if (fo.hasAttribute('transform')) {
          textNode.setAttribute('transform', fo.getAttribute('transform')!)
        }

        textNode.setAttribute('font-size', fontSize)
        textNode.setAttribute('font-family', fontFamily)
        textNode.setAttribute('font-weight', fontWeight)
        textNode.setAttribute('fill', color)

        const parseHtmlToSvgText = (htmlNode: Node, svgParent: SVGElement, currentX: string) => {
          Array.from(htmlNode.childNodes).forEach((child) => {
            if (child.nodeType === Node.TEXT_NODE) {
              const txt = child.textContent
              if (txt) {
                svgParent.appendChild(document.createTextNode(txt))
              }
            } else if (child.nodeType === Node.ELEMENT_NODE) {
              const el = child as HTMLElement
              const tagName = el.tagName.toLowerCase()

              if (tagName === 'br') {
                const brTspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan')
                brTspan.setAttribute('x', currentX)
                brTspan.setAttribute('dy', '1.2em')
                svgParent.appendChild(brTspan)
                return
              }

              const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan')

              if (tagName === 'sub') {
                tspan.setAttribute('baseline-shift', 'sub')
                tspan.setAttribute('font-size', '0.75em')
              } else if (tagName === 'sup') {
                tspan.setAttribute('baseline-shift', 'super')
                tspan.setAttribute('font-size', '0.75em')
              } else if (tagName === 'i' || tagName === 'em') {
                tspan.setAttribute('font-style', 'italic')
              } else if (tagName === 'b' || tagName === 'strong') {
                tspan.setAttribute('font-weight', 'bold')
              }

              parseHtmlToSvgText(child, tspan, currentX)
              svgParent.appendChild(tspan)
            }
          })
        }

        parseHtmlToSvgText(div, textNode, String(foX))

        fo.parentNode?.replaceChild(textNode, fo)
      })

      const texts = clone.querySelectorAll('text')
      texts.forEach(txt => {
        if (!txt.hasAttribute('font-family')) {
          txt.setAttribute('font-family', 'Inter, system-ui, sans-serif')
        }

        // Apply text-anchor to style for broader compatibility
        if (txt.hasAttribute('text-anchor')) {
          txt.style.textAnchor = txt.getAttribute('text-anchor') || 'start'
        }

        // Replace dominant-baseline="hanging" with dy="0.75em"
        if (txt.getAttribute('dominant-baseline') === 'hanging') {
          txt.removeAttribute('dominant-baseline')
          txt.setAttribute('dy', '0.75em')
        }
      })

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

export function hideMarqueeExport(marqueeCtxMenuEl?: HTMLElement | null): void {
  if (activeMarqueeBox) {
    activeMarqueeBox.remove()
    activeMarqueeBox = null
  }
  currentMarqueeBounds = null
  if (marqueeCtxMenuEl) {
    hideContextMenu(marqueeCtxMenuEl)
  }
}

export function getOrCreateMarqueeBox(graphAreaEl: HTMLElement): HTMLElement {
  if (!activeMarqueeBox) {
    activeMarqueeBox = document.createElement('div')
    activeMarqueeBox.className = 'marquee-export-box'
    graphAreaEl.appendChild(activeMarqueeBox)
  }
  return activeMarqueeBox
}

export function updateMarqueeExportBox(
  graphAreaEl: HTMLElement,
  startGraphX: number,
  startGraphY: number,
  currentGraphX: number,
  currentGraphY: number
): boolean {
  const mLeft = Math.min(startGraphX, currentGraphX)
  const mTop = Math.min(startGraphY, currentGraphY)
  const mWidth = Math.abs(currentGraphX - startGraphX)
  const mHeight = Math.abs(currentGraphY - startGraphY)

  currentMarqueeBounds = { left: mLeft, top: mTop, width: mWidth, height: mHeight }

  const box = getOrCreateMarqueeBox(graphAreaEl)
  box.style.left = `${mLeft}px`
  box.style.top = `${mTop}px`
  box.style.width = `${mWidth}px`
  box.style.height = `${mHeight}px`
  box.style.display = 'block'
  return mWidth > 5 && mHeight > 5
}

export function finishMarqueeExportBox(
  marqueeCtxMenuEl: HTMLElement,
  clientX: number,
  clientY: number
): boolean {
  if (currentMarqueeBounds && currentMarqueeBounds.width > 5 && currentMarqueeBounds.height > 5) {
    showContextMenu(marqueeCtxMenuEl, clientX, clientY)
    return true
  }
  return false
}

export function initMarqueeExport(
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
    document.body.style.userSelect = 'none'
    window.getSelection()?.removeAllRanges()
  })

  window.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isRightDragging) return
    window.getSelection()?.removeAllRanges()
    const dist = Math.hypot(e.clientX - startClientX, e.clientY - startClientY)
    if (dist > 5) {
      hasRightDragged = true
      e.preventDefault()

      const rect = graphAreaEl.getBoundingClientRect()
      const zoom = getCanvasZoom()
      const currentGraphX = (e.clientX - rect.left) / zoom
      const currentGraphY = (e.clientY - rect.top) / zoom

      updateMarqueeExportBox(graphAreaEl, startGraphX, startGraphY, currentGraphX, currentGraphY)
    }
  })

  window.addEventListener('mouseup', (e: MouseEvent) => {
    if (!isRightDragging) return
    isRightDragging = false
    document.body.style.userSelect = ''
    window.getSelection()?.removeAllRanges()

    if (hasRightDragged) {
      const shown = finishMarqueeExportBox(marqueeCtxMenuEl, e.clientX, e.clientY)
      if (shown) {
        e.preventDefault()
        e.stopPropagation()
      }
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
    hideMarqueeExport(marqueeCtxMenuEl)
  })

  document.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('#marqueeCtxMenu') || target.closest('.marquee-export-box')) return
    hideMarqueeExport(marqueeCtxMenuEl)
  })

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      hideMarqueeExport(marqueeCtxMenuEl)
    }
  })
}
