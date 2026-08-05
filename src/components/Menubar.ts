export function initMenubar(
  container: HTMLElement,
  onMenuClick: (menuName: string) => void
): void {
  const menuItems = container.querySelectorAll<HTMLElement>('.menu-item')
  menuItems.forEach((item) => {
    item.addEventListener('click', () => {
      const menuName = item.getAttribute('data-menu') || item.textContent?.trim().toLowerCase() || ''
      onMenuClick(menuName)
    })
  })
}
