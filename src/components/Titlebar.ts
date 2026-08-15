export function initTitlebar(container?: HTMLElement | null): void {
  if (!container) return

  // macOS-style: center the title bar content (native titlebars center the title)
  const isMac =
    /Mac|iPhone|iPad|iPod/i.test(navigator.platform || '') ||
    /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent || '')
  if (isMac) {
    document.body.classList.add('os-mac')
  }

  // Setup Window Controls Overlay geometry listener if supported
  if ('windowControlsOverlay' in navigator) {
    const wco = (navigator as unknown as { windowControlsOverlay?: { visible: boolean; addEventListener: (type: string, cb: () => void) => void } }).windowControlsOverlay
    if (wco) {
      const updateWco = () => {
        if (wco.visible) {
          document.body.classList.add('wco-active')
        } else {
          document.body.classList.remove('wco-active')
        }
      }
      wco.addEventListener('geometrychange', updateWco)
      updateWco()
    }
  }

  const minimizeBtn = container.querySelector<HTMLButtonElement>('[title="Minimize"]')
  const maximizeBtn = container.querySelector<HTMLButtonElement>('[title="Maximize"]')
  const closeBtn = container.querySelector<HTMLButtonElement>('[title="Close"]')

  minimizeBtn?.addEventListener('click', () => {
    console.log('Window minimize requested')
  })

  maximizeBtn?.addEventListener('click', () => {
    console.log('Window maximize requested')
  })

  closeBtn?.addEventListener('click', () => {
    console.log('Window close requested')
  })
}
