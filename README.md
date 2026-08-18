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

SmaPlot is a desktop-style scientific plotting application built as a web app (PWA) and, on its desktop branch, a native Tauri application. It is designed to read and write the native Sma4Win `.SMP` project format so that users of the discontinued legacy tool can keep working with their existing files.

---

## Overview

SmaPlot aims to be a drop-in, no-cost, open-source replacement for **Sma4Win**, the long-running Windows plotting program. Rather than locking users into proprietary, unmaintained software, SmaPlot reproduces the familiar plotting workflow while running anywhere a browser does — and on the desktop via Tauri.

The key compatibility promise is the **native `.SMP` format**: SmaPlot can import existing Sma4Win project files (metadata, series, graph coordinates, 4-axis specs, legends, annotations, and data blocks) and export projects back out in a format that remains compatible with Sma4Win. It can also import `.SMA` and `.TXT` datasets.

- **Free and open source** — released under the MIT License.
- **Cross-platform** — runs as an installable Progressive Web App, and as a native desktop app on the `tauri` branch.
- **Legacy-compatible** — reads and writes native Sma4Win `.SMP` files.

## Features

- **Multi-plot SVG workspace** — create multiple plots, drag, resize, and group-move them; marquee multi-select of boxes, labels, legends, and annotation lines/arrows.
- **4-axis system** — independent X, Y, Top, and Right axes with configurable min/max, step, subdivisions, and font options.
- **Series & legend management** — per-series color, original file path, and X/Y math transforms, with an editable legend.
- **Annotations** — line and arrow annotations with a dedicated dialog.
- **Title / text editor** — edit plot text items (string, rotation, position in mm, size, font family, style, alignment) for legends and labels.
- **Data Manager** — load `.SMA` / `.TXT` datasets with automatic naming/coloring by filename and `x`/`y` math expression transforms (`evaluateMathExpr`).
- **Canvas zoom & pan** — Ctrl/Cmd + wheel zoom; panning via two-finger trackpad scroll, two-finger touch drag, middle-click drag, or Space + drag; pinch-zoom and touch smoothing on the desktop branch.
- **PWA capabilities** — installable web app, service-worker auto-update toggle, and a persisted recent-files list (`localStorage`).
- **Read value** — inspect data-point values directly via the Read Value dialog.
- **Insert symbol** — a math & symbol glyph picker for text and legend items, a convenience not available in the original Sma4Win.
- **Project save / export** — save and export projects; native `.SMP` export preserving Sma4Win compatibility (CRLF line endings, 2-digit scientific exponents, `[End of Data]` markers).

## Current status & limitations

> **This project is in early development (`v0.1.0`).**

SmaPlot is functional but intentionally incomplete. Expect the following:

- **Not yet at full Sma4Win feature parity.** Some legacy behaviors, dialogs, and export nuances may be missing or simplified.
- **No automated tests, linter, or formatter** are configured yet. Correctness is currently verified manually via `npm run build` (TypeScript typecheck + Vite bundle).
- **Desktop / native-window features live only on the `tauri` branch.** The default `main` branch is web/PWA only and contains no Tauri code.
- The UI targets a desktop-like (Sma4Win clone) experience and is not optimized for mobile.

Contributions that close these gaps are very welcome — see [Contributing](#contributing).

## Installation

### Web / PWA

SmaPlot runs as an installable Progressive Web App. When it is installable, an **Install** item automatically appears in the app's menu bar — click it to install SmaPlot as a standalone desktop-style app (no manual build required).

If the menu item is not shown (e.g. the browser suppresses the install prompt), use the browser's built-in **Install** / **Add to Home Screen** option (address-bar install icon or the app menu) in a supported browser such as Chrome, Edge, or Firefox.

### From source

Prerequisites: a recent [Node.js](https://nodejs.org/) (with npm) installed.

```bash
# clone the repository
git clone <your-fork-or-this-repo-url> sma4win-replica
cd sma4win-replica

# install dependencies
npm install
```

## Getting started

Prerequisites: a recent [Node.js](https://nodejs.org/) (with npm) installed.

```bash
# start the Vite dev server (web/PWA)
npm run dev

# typecheck + production build
npm run build

# serve the production build locally
npm run preview
```

The web/PWA build runs entirely from the `main` branch.

## Desktop build (Tauri)

The native desktop app lives on the `tauri` branch, which uses **Tauri v2**. You need the [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) installed (Rust toolchain and platform build dependencies).

```bash
git checkout tauri
npm install            # install dependencies (run once, see Installation)
npm run tauri:dev     # run the desktop app in development
npm run tauri:build   # build a native installer (.exe, .msi, .dmg, .deb, ...)
```

## Contributing

1. Fork the repository and create a feature branch from `main` (or `tauri` for desktop work).
2. Keep the `main` / `tauri` separation: no Tauri code on `main`, no web-only regressions on `tauri`.
3. Run `npm run build` and ensure both the typecheck and the Vite bundle pass before opening a PR.

Bug reports, feature requests, and pull requests are appreciated — especially help closing the [early-development gaps](#current-status--limitations).

## License

Released under the **MIT License**. © 2026 Nurhidayat. See [`LICENSE`](./LICENSE).
