export function initToolbar(
  container: HTMLElement,
  onActionClick: (action: string, title: string) => void
): void {
  const toolbarBtns = container.querySelectorAll<HTMLElement>('.toolbar-btn')
  toolbarBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-action') || ''
      const title = btn.getAttribute('title') || ''
      onActionClick(action, title)
    })
  })
}

export function bindActionButtons(
  container: HTMLElement,
  onActionClick: (action: string, title: string) => void
): void {
  container.querySelectorAll<HTMLElement>('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      onActionClick(btn.getAttribute('data-action') || '', btn.getAttribute('title') || '')
    })
  })
}

export function setToolbarButtonActive(container: HTMLElement, action: string, active: boolean): void {
  const btn = container.querySelector<HTMLElement>(`[data-action="${action}"]`)
  if (btn) {
    btn.classList.toggle('active', active)
  }
}

