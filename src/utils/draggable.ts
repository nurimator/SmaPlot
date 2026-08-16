export function makeDraggable(dialogEl: HTMLElement, handleEl: HTMLElement): void {
  let isDragging = false
  let startX = 0
  let startY = 0
  let initialLeft = 0
  let initialTop = 0
  let rect: DOMRect

  handleEl.style.touchAction = 'none'

  const startDrag = (clientX: number, clientY: number, target: HTMLElement): boolean => {
    // Mobile: dialogs are bottom sheets — not draggable (dismissed via backdrop tap / swipe-down)
    if (window.matchMedia('(max-width: 640px)').matches) {
      return false
    }
    // Ignore clicks/touches on close button or other interactive controls inside header
    if (target.closest('.dialog-close-btn, button, input, select, textarea')) {
      return false
    }

    isDragging = true
    rect = dialogEl.getBoundingClientRect()
    startX = clientX
    startY = clientY
    initialLeft = rect.left
    initialTop = rect.top

    // Ensure dialog is positioned via top/left explicitly
    dialogEl.style.position = 'fixed'
    dialogEl.style.left = `${initialLeft}px`
    dialogEl.style.top = `${initialTop}px`
    dialogEl.style.transform = 'none'

    document.body.style.userSelect = 'none'
    return true
  }

  const moveDrag = (clientX: number, clientY: number) => {
    if (!isDragging) return
    const dx = clientX - startX
    const dy = clientY - startY

    const newLeft = Math.max(0, Math.min(window.innerWidth - rect.width, initialLeft + dx))
    const newTop = Math.max(0, Math.min(window.innerHeight - rect.height, initialTop + dy))

    dialogEl.style.left = `${newLeft}px`
    dialogEl.style.top = `${newTop}px`
  }

  const endDrag = () => {
    if (isDragging) {
      isDragging = false
      document.body.style.userSelect = ''
    }
  }

  // Mouse listeners
  handleEl.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button !== 0) return
    if (startDrag(e.clientX, e.clientY, e.target as HTMLElement)) {
      e.preventDefault()

      const onMouseMove = (moveEvent: MouseEvent) => {
        moveDrag(moveEvent.clientX, moveEvent.clientY)
      }

      const onMouseUp = () => {
        endDrag()
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    }
  })

  // Touch listeners
  handleEl.addEventListener(
    'touchstart',
    (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const touch = e.touches[0]
      if (startDrag(touch.clientX, touch.clientY, e.target as HTMLElement)) {
        e.preventDefault()

        const onTouchMove = (moveEvent: TouchEvent) => {
          if (!isDragging || moveEvent.touches.length !== 1) return
          moveEvent.preventDefault()
          const t = moveEvent.touches[0]
          moveDrag(t.clientX, t.clientY)
        }

        const onTouchEnd = () => {
          endDrag()
          document.removeEventListener('touchmove', onTouchMove)
          document.removeEventListener('touchend', onTouchEnd)
          document.removeEventListener('touchcancel', onTouchEnd)
        }

        document.addEventListener('touchmove', onTouchMove, { passive: false })
        document.addEventListener('touchend', onTouchEnd)
        document.addEventListener('touchcancel', onTouchEnd)
      }
    },
    { passive: false }
  )
}
