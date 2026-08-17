export function initConstantDialog(overlayEl: HTMLElement): void {
  const hide = () => hideConstantDialog(overlayEl)
  const closeBtn = overlayEl.querySelector('#closeConstantDialogBtn')
  const okBtn = overlayEl.querySelector('#constantOkBtn')

  closeBtn?.addEventListener('click', hide)
  okBtn?.addEventListener('click', hide)
}

export function showConstantDialog(overlayEl: HTMLElement): void {
  overlayEl.style.display = 'flex'
}

export function hideConstantDialog(overlayEl: HTMLElement): void {
  overlayEl.style.display = 'none'
}
