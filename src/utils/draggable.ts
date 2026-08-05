export function makeDraggable(dialogEl: HTMLElement, handleEl: HTMLElement): void {
  let isDragging = false
  let startX = 0
  let startY = 0
  let initialLeft = 0
  let initialTop = 0

  handleEl.addEventListener('mousedown', (e: MouseEvent) => {
    // Ignore clicks on close or help buttons inside header
    if ((e.target as HTMLElement).closest('.dialog-close-btn, .dialog-help-btn')) {
      return
    }

    e.preventDefault()
    isDragging = true

    const rect = dialogEl.getBoundingClientRect()
    startX = e.clientX
    startY = e.clientY
    initialLeft = rect.left
    initialTop = rect.top

    // Ensure dialog is positioned via top/left explicitly
    dialogEl.style.position = 'fixed'
    dialogEl.style.left = `${initialLeft}px`
    dialogEl.style.top = `${initialTop}px`
    dialogEl.style.transform = 'none'

    document.body.style.userSelect = 'none'

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDragging) return
      const dx = moveEvent.clientX - startX
      const dy = moveEvent.clientY - startY

      const newLeft = Math.max(0, Math.min(window.innerWidth - rect.width, initialLeft + dx))
      const newTop = Math.max(0, Math.min(window.innerHeight - rect.height, initialTop + dy))

      dialogEl.style.left = `${newLeft}px`
      dialogEl.style.top = `${newTop}px`
    }

    const onMouseUp = () => {
      isDragging = false
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  })
}
