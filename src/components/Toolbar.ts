export function renderToolbar(): string {
  return `
  <div class="toolbar">
    <div class="toolbar-btn" title="New" data-action="new"><span class="material-symbols-outlined">description</span></div>
    <div class="toolbar-btn" title="Open"><span class="material-symbols-outlined">folder_open</span></div>
    <div class="toolbar-btn" title="Save"><span class="material-symbols-outlined">save</span></div>
    <div class="toolbar-btn" title="Print"><span class="material-symbols-outlined">print</span></div>
    <div class="toolbar-sep"></div>
    <div class="toolbar-btn" title="Text"><span class="toolbar-icon-text">AB</span></div>
    <div class="toolbar-btn active" title="Select"><div class="toolbar-icon-select"></div></div>
    <div class="toolbar-btn" title="Line"><div class="toolbar-icon-line"></div></div>
    <div class="toolbar-btn" title="Zoom"><span class="material-symbols-outlined">search</span></div>
    <div class="toolbar-btn" title="Add Text"><span class="toolbar-icon-text-blue">A</span></div>
    <div class="toolbar-btn" title="Clear"><span class="toolbar-icon-text">C</span></div>
    <div class="toolbar-sep"></div>
    <div class="toolbar-btn" title="Copy"><span class="material-symbols-outlined">content_copy</span></div>
    <div class="toolbar-btn" title="Chart"><span class="material-symbols-outlined">show_chart</span></div>
    <div class="toolbar-sep"></div>
    <div class="toolbar-btn" title="Warning"><span class="material-symbols-outlined toolbar-icon-error">error</span></div>
    <div class="toolbar-btn" title="Help"><span class="material-symbols-outlined toolbar-icon-help">help</span></div>
  </div>
  `
}
