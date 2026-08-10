export function initMenubar(
  container: HTMLElement,
  onMenuClick: (action: string) => void
): void {
  const menuItems = container.querySelectorAll<HTMLElement>('.menu-item')

  const closeAllDropdowns = () => {
    container.querySelectorAll('.menu-dropdown').forEach((d) => d.classList.remove('open'))
  }

  menuItems.forEach((item) => {
    item.addEventListener('click', (e) => {
      const target = e.target as HTMLElement
      const dropdownItem = target.closest('.dropdown-item')
      if (dropdownItem) {
        if (dropdownItem.classList.contains('has-submenu') && !target.closest('.menu-submenu')) {
          e.stopPropagation()
          dropdownItem.classList.toggle('open')
          return
        }
        const action = dropdownItem.getAttribute('data-action') || ''
        if (action && action !== 'clear_scale') {
          closeAllDropdowns()
          onMenuClick(action)
        }
        return
      }

      const dropdown = item.querySelector('.menu-dropdown')
      if (dropdown) {
        const isOpen = dropdown.classList.contains('open')
        closeAllDropdowns()
        if (!isOpen) dropdown.classList.add('open')
      } else {
        const menuName = item.getAttribute('data-menu') || item.textContent?.trim().toLowerCase() || ''
        closeAllDropdowns()
        onMenuClick(menuName)
      }
    })
  })

  document.addEventListener('click', (e) => {
    if (!container.contains(e.target as Node)) {
      closeAllDropdowns()
    }
  })
}
