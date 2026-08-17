import { makeDraggable } from '../utils/draggable.ts'

declare const __APP_VERSION__: string

const REPO_URL = 'https://github.com/nurimator/SmaPlot'

let aboutOverlay: HTMLElement | null = null

export function initAboutDialog(overlayEl: HTMLElement): void {
  aboutOverlay = overlayEl
  const dialogEl = overlayEl.querySelector<HTMLElement>('.about-dialog')
  const headerEl = overlayEl.querySelector<HTMLElement>('.dialog-header')

  if (dialogEl && headerEl) {
    makeDraggable(dialogEl, headerEl)
  }

  const versionEl = overlayEl.querySelector<HTMLElement>('#aboutVersionText')
  if (versionEl) versionEl.textContent = `Version ${__APP_VERSION__}`

  const closeBtn = overlayEl.querySelector<HTMLElement>('#closeAboutBtn')
  closeBtn?.addEventListener('click', () => hideAboutDialog())

  const repoBtn = overlayEl.querySelector<HTMLAnchorElement>('#aboutRepoLink')
  if (repoBtn) repoBtn.href = REPO_URL
}

export function showAboutDialog(): void {
  if (aboutOverlay) aboutOverlay.style.display = 'flex'
}

export function hideAboutDialog(): void {
  if (aboutOverlay) aboutOverlay.style.display = 'none'
}