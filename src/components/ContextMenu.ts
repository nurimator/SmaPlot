export function initContextMenu(
  ctxMenu: HTMLElement,
  onItemClick: (actionKey: string) => void
): void {
  const items = ctxMenu.querySelectorAll<HTMLElement>('.context-menu-item')
  items.forEach((item) => {
    item.addEventListener('click', () => {
      const actionKey = item.getAttribute('data-ctx') || item.textContent?.trim() || ''
      hideContextMenu(ctxMenu)
      onItemClick(actionKey)
    })
  })
}

export function hideContextMenu(ctxMenu: HTMLElement): void {
  ctxMenu.classList.remove('open')
}

export function showContextMenu(ctxMenu: HTMLElement, px: number, py: number): void {
  ctxMenu.classList.add('open')
  const rect = ctxMenu.getBoundingClientRect()
  let left = px
  let top = py
  if (left + rect.width > window.innerWidth) left = window.innerWidth - rect.width - 8
  if (top + rect.height > window.innerHeight) top = window.innerHeight - rect.height - 8
  ctxMenu.style.left = `${left}px`
  ctxMenu.style.top = `${top}px`
}
