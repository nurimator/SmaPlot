export function renderTitlebar(): string {
  return `
  <header class="titlebar">
    <div class="titlebar-left">
      <div class="app-icon">
        <span class="material-symbols-outlined">analytics</span>
      </div>
      <span class="app-title">Sma4Win - Untitled</span>
    </div>
    <div class="window-controls">
      <button class="window-btn" title="Minimize"><span class="material-symbols-outlined" style="font-size:16px">remove</span></button>
      <button class="window-btn" title="Maximize"><span class="material-symbols-outlined" style="font-size:14px">crop_square</span></button>
      <button class="window-btn close" title="Close"><span class="material-symbols-outlined" style="font-size:18px">close</span></button>
    </div>
  </header>
  `
}
