export function initPropertyDialog(overlayEl: HTMLElement): void {
  const closeBtn = overlayEl.querySelector('#closePropDialogBtn')
  const cancelBtn = overlayEl.querySelector('#cancelPropBtn')
  const applyBtn = overlayEl.querySelector('#applyPropBtn')
  const tabs = overlayEl.querySelectorAll<HTMLButtonElement>('.tab-btn')

  const hide = () => hidePropertyDialog(overlayEl)

  closeBtn?.addEventListener('click', hide)
  cancelBtn?.addEventListener('click', hide)
  applyBtn?.addEventListener('click', () => {
    hide()
  })

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'))
      tab.classList.add('active')
      const targetTab = tab.getAttribute('data-tab')
      const contents = overlayEl.querySelectorAll('.tab-content')
      contents.forEach((c) => c.classList.remove('active'))
      const targetContent = overlayEl.querySelector(`#tab-${targetTab}`)
      targetContent?.classList.add('active')
    })
  })

  overlayEl.addEventListener('click', (e) => {
    if (e.target === overlayEl) hide()
  })
}

export function showPropertyDialog(overlayEl: HTMLElement): void {
  overlayEl.style.display = 'flex'
}

export function hidePropertyDialog(overlayEl: HTMLElement): void {
  overlayEl.style.display = 'none'
}
