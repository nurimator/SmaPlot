export function renderContextMenu(): string {
  return `
  <div class="context-menu" id="ctxMenu">
    <div class="context-menu-item">Date property <span class="material-symbols-outlined">chevron_right</span></div>
    <div class="context-separator"></div>
    <div class="context-menu-item">X-Axis <span class="material-symbols-outlined">chevron_right</span></div>
    <div class="context-menu-item">Y-Axis <span class="material-symbols-outlined">chevron_right</span></div>
    <div class="context-menu-item">U-Axis <span class="material-symbols-outlined">chevron_right</span></div>
    <div class="context-menu-item">R-Axis <span class="material-symbols-outlined">chevron_right</span></div>
    <div class="context-separator"></div>
    <div class="context-menu-item">Frame <span class="material-symbols-outlined">chevron_right</span></div>
    <div class="context-separator"></div>
    <div class="context-menu-item">String</div>
    <div class="context-menu-item">Arrow</div>
    <div class="context-menu-item">Rectangle</div>
  </div>
  `
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
