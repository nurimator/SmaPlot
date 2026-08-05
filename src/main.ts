import './style.css'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<div class="app">
  <!-- Title Bar -->
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

  <!-- Menu Bar -->
  <nav class="menubar">
    <div class="menu-item">File</div>
    <div class="menu-item">Data</div>
    <div class="menu-item">Edit</div>
    <div class="menu-item">Graph</div>
    <div class="menu-item">Insert</div>
    <div class="menu-item">Analyze</div>
    <div class="menu-item">Option</div>
    <div class="menu-item">Help</div>
  </nav>

  <!-- Toolbar -->
  <div class="toolbar">
    <div class="toolbar-btn" title="New"><span class="material-symbols-outlined">description</span></div>
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

  <!-- Main Workspace -->
  <main class="workspace">
    <div class="workspace-grid">
      <div class="graph-area">
        <div class="graph-box">
          <div class="graph-grid"></div>
          <div class="axis-y"></div>
          <div class="axis-x"></div>
          <div class="context-menu" style="top:40px; left:250px;">
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
        </div>
      </div>
      <div class="workspace-right"></div>
    </div>

    <div class="scrollbar-v">
      <div class="scroll-btn" title="Scroll up"><span class="material-symbols-outlined">arrow_drop_up</span></div>
      <div class="scroll-btn" title="Scroll down"><span class="material-symbols-outlined">arrow_drop_down</span></div>
    </div>
    <div class="scrollbar-h">
      <div class="scroll-btn" title="Scroll left"><span class="material-symbols-outlined">arrow_left</span></div>
      <div class="scroll-btn" title="Scroll right"><span class="material-symbols-outlined">arrow_right</span></div>
    </div>
  </main>

  <!-- Status Bar -->
  <footer class="statusbar">
    <div class="status-file">
      <span class="status-dot status-dot-idle"></span>
      No data
    </div>
    <div class="status-coords">(0, 0)</div>
    <div class="status-pos"></div>
  </footer>
</div>
`