export function initToolbar(
  container: HTMLElement,
  onActionClick: (action: string, title: string) => void
): void {
  const toolbarBtns = container.querySelectorAll<HTMLElement>('.toolbar-btn')
  toolbarBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-action') || ''
      const title = btn.getAttribute('title') || ''

      toolbarBtns.forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')

      onActionClick(action, title)
    })
  })
}
