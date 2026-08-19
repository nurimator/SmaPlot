# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-08-19

Initial release of SmaPlot, an open-source, web-based alternative to the legacy
Sma4Win plotting software with native `.SMP` project format compatibility.

### Added

#### Workspace & plots
- Multi-plot SVG workspace: create, spawn, delete, and clear plots.
- Drag, resize, and group-move plot frames with edge/corner SVG resize handles
  (including a center-top move zone) and magnetic grid snapping (major gridline
  snap with a configurable threshold).
- Unified object selection covering plots, legend items, and annotation lines,
  with marquee (rubber-band) multi-select.
- Unified selection helpers (`MarqueeSelect.ts`, `plot/selection.ts`) and
  plot hit-testing (`plot/hitTest.ts`).

#### File format & data
- Native Sma4Win `.SMP` project import: metadata, series specs, graph
  coordinates, 4-axis specs, legends, annotations, and `[DATA]` blocks.
- Native `.SMP` project export with Sma4Win compatibility: Windows CRLF line
  endings, 2-digit scientific exponents (`e+02`), and `[End of Data]` markers.
- `.SMA` and `.TXT` dataset import via file picker or drag-and-drop
  (`windows-1252` decoding).
- Sma4Win symbol encoding conversion to/from Unicode for labels and titles
  (`smpSymbolMapper.ts`), plus an insert-symbol glyph picker.
- Dataset naming derived from the source filename (`.txt` extension stripped).
- X/Y math expression transforms on datasets with a safe evaluator.

#### Plot rendering
- 4-axis system: independent X, Y, Top, and Right axes with configurable
  min/max, step, subdivisions, and font options, plus "Sync with" axis linking.
- Auto-scaling with nice rounded axis bounds (`niceAxisBounds`/`niceScale`)
  and manual scale clearing per axis or for all axes.
- Series rendering with color, line width, dash patterns, and per-series
  symbol/icon generation; series clip-path support.
- Editable legend with per-item text, alignment, and repositioning.
- Annotation lines and arrows with a dedicated properties dialog, plus
  rectangle annotations.
- Read-value mode to inspect data-point values on a plot, with a crossbar
  cursor.

#### Dialogs & UI
- Menu bar (File/Edit/Graph/etc.), toolbar, status bar with live coordinates,
  and a right-click context menu.
- Property dialog with File/Plot/More tabs and dataset preview.
- Axis, Title (text editor), Arrow, Rectangle, About, Save-As, and Confirm
  dialogs, plus a Constant dialog (placeholder).
- Color picker dialog with HSV/RGB/hex controls.
- Data Manager modal with a dataset list (series icon, name, reorder, delete,
  open in Property dialog) and legend insertion mode.
- Custom select widgets with SVG-glyph options (e.g. arrow shapes).
- Alt-key access-key menu navigation with visible accelerator hints.
- Keyboard shortcuts: Delete/Backspace/Ctrl+D, Ctrl+Z/Ctrl+Shift+Z undo/redo,
  Ctrl+S/Ctrl+Shift+S save/save-as, Ctrl+O open, Ctrl+=/- zoom, Ctrl+0 reset
  zoom, Ctrl+X/Ctrl+Y axis dialogs.

#### Canvas interaction
- Canvas zoom & pan: Ctrl/Cmd + wheel zoom, zoom slider/buttons, panning via
  two-finger trackpad scroll, middle-click drag, or Space + drag; live mouse
  coordinate tracking in the status bar.
- Trim mode for cropping the visible X/Y axis range of the active plot
  (including synced Top/Right axes).
- Marquee (right-drag) region export with copy-to-clipboard (SVG) and
  download as SVG, PNG, or JPG.

#### Undo / project state
- Workspace-level undo/redo with per-plot snapshots (`undoManager.ts`).
- Project save / save-as flows with native file picker and current-file
  tracking (`projectState.ts`).
- Recent-files list persisted in `localStorage` (quota-safe).

#### PWA & installability
- Installable web app with `vite-plugin-pwa`, service-worker registration, and
  an update toast with an Auto Update toggle in the Help menu.
- Install menubar item driven by the native `beforeinstallprompt` event.
- Version number displayed in the title bar and browser tab.
- Offline-ready status message in the status bar.

#### Touch & responsiveness
- Touch gestures: tap/select, double-tap shortcuts (axis/graph/legend/
  annotation), press-and-hold with haptic feedback, and pinch-zoom.
- Bottom-sheet dialogs with swipe-down to close (`sheetSwipe.ts`).
- Mobile header/toolbar and menu drawer.

#### Infrastructure
- GitHub Pages deployment workflow with relative-path Vite base (`./`).
- Vite + TypeScript build pipeline (`tsc` typecheck then `vite build`).
- MIT License and project documentation.

[0.1.0]: https://github.com/nurimator/SmaPlot/releases/tag/v0.1.0
