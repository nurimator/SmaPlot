# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-11-17

Feature release focused on analysis, native Sma4Win rendering parity, and project
handling.

### Added

#### Analyze & fitting
- Analyze menu with fitting engines: least-squares variants, user-function
  Levenberg–Marquardt fits, splines, Gauss-Lorentz, peak detection, FFT and
  smoothing.
- Fit results are added as derived datasets with undo, repeat, clear and
  clipboard copy, plus a per-plot constants editor.
- Curve tab in the Property dialog (range, division, style, increment, out-of-range).
- Error bars and analyzed curves are rendered as plot series.

#### Plot & axis
- Frame properties dialog with type, title and scale tabs, including a stored
  frame title that round-trips through the SMP export.
- Log-scale axes (log 10ⁿ) wired to the Axis dialog, synced Top/Right axes,
  log ticks and the native increment table.
- Extended marker set with 46 marker types, discrete step markers, and a shared
  two-way marker mapping table used by the parser and the exporter.
- Legacy SMP 1.3 / 1.4 files are read and exported again (`[TITLE]`, `[ARROW]`,
  `[DOT]` sections), and legacy Dot objects are drawn.
- Editable font-size combobox for axis frame and text sizes.

#### Project & files
- Unsaved-change tracking: a ` *` marker in the title bar, Save / Don't save /
  Cancel prompts before opening another project or starting a new one, and a
  `beforeunload` guard.
- The installed PWA can open `.SMP` / `.SMA` projects from the operating system
  via file handlers.
- After a project is opened, SmaPlot reports the features it keeps but cannot
  draw or read.

### Changed

- Saving always downloads a copy instead of writing back to the opened file.
- Selection outlines and handles are drawn on a dedicated, devicePixelRatio-aware
  canvas layer; the DOM overlays are transparent hit areas only.
- Axis, legend and secondary text sizes are converted from points to pixels
  (`ptToPx`) instead of using a flat factor.
- Legend text is rendered as native SVG `tspan` runs instead of HTML
  `foreignObject`, and series legend rows follow the measured text ink.
- Dash patterns are derived from the native style codes with a pitch derived
  from the stroke width.
- Arrow head geometry and annotation drawing direction follow the native
  application.
- Kana and CJK text support: hiragana, katakana, halfwidth/fullwidth forms and
  6356 CJK unified ideographs, with a faster two-way symbol conversion.
- The math expression evaluator follows the native Sma4Win grammar (unary sign
  binds tighter than `^`, `^` is right-associative, `ln` / `log` constants).

### Fixed

- The Axis dialog creates Top and Right axis specs on demand instead of
  throwing when a project has no such spec.
- Series markers stay aligned with the scaled line while X/Y transforms are
  dragged.
- Dragged legend text snaps to the frame center with guide lines.
- Native parity fixes: exponent multiplier scale and placement, series legend
  background, error bar flag, marker size, data row whitespace, axis tick style
  codes, axis label offsets as fractional millimetres, auto tick flag and auto
  step rules.
- Series names encoded as `%nnN` are shown literally, and inserted series legend
  codes are padded to two digits.
- Native X/Y expression transform flags are honoured on parse and on export.
- Stacked frame clicks resolve to the right plot, series legends are skipped on
  click select, and the Data Manager lists data across all frames.
- Unmodeled SMP content (masks, dots, header lines, raw markers) survives a
  parse/serialize round trip, the native axis scale type is kept, and frame
  geometry no longer drifts on export.
- Data rows follow the strict Sma4Win separator rules (comma and TAB are strict,
  `=` marks a missing value, `|` skips a row, non-numeric rows are ignored).
- Added `npm run test:compat`, a round-trip script that parses and re-serializes
  every `.SMP` / `.SMA` sample file and reports byte-level differences.

## [0.1.1] - 2026-08-19

### Fixed

#### SMP export compatibility
- Fixed project files exported from SmaPlot triggering a "duplicate data overwrite"
  warning when opened in the original Sma4Win application, especially for projects
  that contain more than one plot frame reusing the same dataset.
- Ensured each dataset is written only once in the exported file, even when it is
  shared by multiple plot frames, so Sma4Win no longer sees conflicting copies.
- Corrected the file header and ending so exported `.SMP` projects follow the exact
  native Sma4Win format and load cleanly without prompts.

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

[0.2.0]: https://github.com/nurimator/SmaPlot/releases/tag/v0.2.0
[0.1.1]: https://github.com/nurimator/SmaPlot/releases/tag/v0.1.1
[0.1.0]: https://github.com/nurimator/SmaPlot/releases/tag/v0.1.0
