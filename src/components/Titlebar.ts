export function initTitlebar(container?: HTMLElement | null): void {
  if (!container) return
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
