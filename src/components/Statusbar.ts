export function renderStatusbar(): string {
  return `
  <footer class="statusbar">
    <div class="status-file">
      <span class="status-dot status-dot-idle"></span>
      No data
    </div>
    <div class="status-coords">(0, 0)</div>
    <div class="status-pos"></div>
  </footer>
  `
}
