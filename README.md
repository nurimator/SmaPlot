<p align="center">
  <img src="public/favicon/favicon.svg" alt="SmaPlot logo" width="96" height="96">
</p>

<h1 align="center">SmaPlot</h1>

<p align="center">
  <b>A free, open-source alternative to the legacy Windows plotting software Sma4Win.</b>
</p>

<p align="center">
  <a href="https://nurimator.github.io/SmaPlot/" target="_blank" rel="noopener">
    <img src="https://img.shields.io/badge/Launch-Demo-2f7d3a?style=for-the-badge" alt="Launch demo">
  </a>
</p>

SmaPlot is a desktop-style scientific plotting application built as a web app. It is designed to read and write the native Sma4Win `.SMP` project format, so that people who have relied on that familiar workflow for years can keep working the way they always have, without being forced onto something unfamiliar.

---

## Overview

SmaPlot is an open-source **alternative** built around a familiar way of working. For many researchers, plotting on Sma4Win has simply become second nature, but the program's era has passed, and so has its platform. SmaPlot keeps that same workflow available where it needs to be today, in a browser on modern Windows, and on the Macs, Linux machines, and tablets many of those users now work from.

The practical bridge is the **native `.SMP` format**. SmaPlot can import existing Sma4Win project files (metadata, series, graph coordinates, 4-axis specs, legends, annotations, and data blocks) and export projects back out in a format that remains compatible with Sma4Win. It can also import `.SMA` and `.TXT` datasets. Files created decades ago still open; work done today can still go back.

- **Free and open source.** Released under the MIT License.
- **Cross-platform.** Runs as an installable web app on Windows, macOS, Linux, and tablets.
- **Familiar, not foreign.** Keeps the Sma4Win plotting workflow and stays compatible with native Sma4Win `.SMP` files.

## Features

- **Multi-plot SVG workspace.** Create multiple plots, drag, resize, and group-move them; marquee multi-select of boxes, labels, legends, and annotation lines/arrows.
- **4-axis system.** Independent X, Y, Top, and Right axes with configurable min/max, step, subdivisions, and font options.
- **Series & legend management.** Per-series color, original file path, and X/Y math transforms, with an editable legend.
- **Annotations.** Line and arrow annotations with a dedicated dialog.
- **Title / text editor.** Edit plot text items (string, rotation, position in mm, size, font family, style, alignment) for legends and labels.
- **Data Manager.** Load `.SMA` / `.TXT` datasets with automatic naming/coloring by filename and `x`/`y` math expression transforms (`evaluateMathExpr`).
- **Canvas zoom & pan.** Ctrl/Cmd + wheel zoom; panning via two-finger trackpad scroll, two-finger touch drag, middle-click drag, or Space + drag; pinch-zoom and touch smoothing on the desktop variant.
- **Installable web app.** Service-worker auto-update toggle and a persisted recent-files list (`localStorage`).
- **Read value.** Inspect data-point values directly via the Read Value dialog.
- **Insert symbol.** A math & symbol glyph picker for text and legend items, a convenience not available in the original Sma4Win.
- **Project save / export.** Save and export projects; native `.SMP` export preserving Sma4Win compatibility (CRLF line endings, 2-digit scientific exponents, `[End of Data]` markers).

## Current status & limitations

> **This project is in early development (`v0.1.0`).**

SmaPlot is functional but intentionally incomplete. Expect the following.

- **Not yet at full Sma4Win feature parity.** Some legacy behaviors, dialogs, and export nuances may be missing or simplified.
- **No automated tests, linter, or formatter** are configured yet. Correctness is currently verified manually via `npm run build` (TypeScript typecheck + Vite bundle).
- Native window controls and other desktop-only features are available in the desktop build. The default web build runs in any browser.
- The UI targets a desktop-like (Sma4Win clone) experience and is not optimized for mobile.

Contributions that close these gaps are very welcome. See [Contributing](#contributing).

## Installation

### Web

SmaPlot runs as an installable web app. When it is installable, an **Install** item automatically appears in the app's menu bar. Click it to install SmaPlot as a standalone desktop-style app (no manual build required).

If the menu item is not shown (e.g. the browser suppresses the install prompt), use the browser's built-in **Install** / **Add to Home Screen** option (address-bar install icon or the app menu) in a supported browser such as Chrome, Edge, or Firefox.

### From source

Prerequisites are a recent [Node.js](https://nodejs.org/) (with npm).

```bash
# clone the repository
git clone <your-fork-or-this-repo-url> smaplot
cd smaplot

# install dependencies
npm install
```

## Getting started

Prerequisites are a recent [Node.js](https://nodejs.org/) (with npm).

```bash
# start the Vite dev server (web)
npm run dev

# typecheck + production build
npm run build

# serve the production build locally
npm run preview
```

The web build runs entirely from the `main` branch.

## Desktop build

A desktop build with native window controls is available on the `tauri` branch. You need the [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) installed (Rust toolchain and platform build dependencies).

```bash
git checkout tauri
npm install            # install dependencies (run once, see Installation)
npm run tauri:dev     # run the desktop app in development
npm run tauri:build   # build a native installer (.exe, .msi, .dmg, .deb, ...)
```

## Contributing

1. Fork the repository and create a feature branch from `main` (or `tauri` for desktop work).
2. Keep the `main` / `tauri` separation. No Tauri code on `main`, no web-only regressions on `tauri`.
3. Run `npm run build` and ensure both the typecheck and the Vite bundle pass before opening a PR.

Bug reports, feature requests, and pull requests are appreciated, especially help closing the [early-development gaps](#current-status--limitations).

## License

Released under the **MIT License**. © 2026 Nurhidayat. See [`LICENSE`](./LICENSE).
