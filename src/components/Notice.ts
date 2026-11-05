let noticeEl: HTMLElement | null = null
let titleEl: HTMLElement | null = null
let detailEl: HTMLElement | null = null
let hideTimer: number | undefined

export function initNotice(root: HTMLElement): void {
  noticeEl = root
  titleEl = root.querySelector<HTMLElement>('.app-notice-title')
  detailEl = root.querySelector<HTMLElement>('.app-notice-detail')
  root.querySelector<HTMLElement>('.app-notice-close')?.addEventListener('click', hideNotice)
}

export function showNotice(title: string, detail = '', timeoutMs = 8000): void {
  if (!noticeEl || !titleEl || !detailEl) return
  titleEl.textContent = title
  detailEl.textContent = detail
  detailEl.hidden = detail === ''
  noticeEl.hidden = false
  window.clearTimeout(hideTimer)
  if (timeoutMs > 0) hideTimer = window.setTimeout(hideNotice, timeoutMs)
}

export function hideNotice(): void {
  window.clearTimeout(hideTimer)
  if (noticeEl) noticeEl.hidden = true
}
