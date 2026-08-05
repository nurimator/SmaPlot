# AGENTS.md — sma4win-replica

## Commands

```bash
npm run dev      # start Vite dev server (no test/lint scripts)
npm run build    # runs `tsc` then `vite build`; must pass both
npm run preview  # serve production build locally
```

No test runner, linter, or formatter is configured.

Do NOT run `npm run build`, `npm run dev`, or any npm command unless the user explicitly requests it.

## Structure

- `src/main.ts` — entrypoint. Builds the DOM shell from render functions and wires event listeners.
- `src/components/` — UI sections: `Titlebar`, `Menubar`, `Toolbar`, `Statusbar`, `ContextMenu` (all pure HTML-string renderers + `show`/`hide` helpers), and `Plot.ts` (SVG plotting, plot drag/resize).
- `src/utils/` — `dataset.ts` (`loadDataset` fetches + parses data), `scale.ts` (`niceScale`, `formatTick`).
- `src/types.ts` — shared interfaces (`Dataset`, `NiceScaleResult`, `ActiveDrag`).
- `src/style.css` — all styling.
- Static data: `public/dummy-data/` — fetched at runtime via `/dummy-data/...`.
- `index.html` is the Vite mount point and the only HTML file.

## TypeScript / Vite quirks

- Imports use explicit `.ts` extensions (e.g. `./components/Plot.ts`). This is required: enabled by `allowImportingTsExtensions` with `noEmit: true` (`tsc` typechecks only; Vite bundles). Drop the extension and the build breaks.
- `verbatimModuleSyntax` + `erasableSyntaxOnly` — type-only imports must use `import type`; no enums/namespaces/parameter properties.
- `vite/client` types included, so Vite globals like `import.meta.env` are available.

## Data format

`dummy-data/*.txt` are whitespace-separated x/y columns (two columns per line). `loadDataset()` in `src/utils/dataset.ts` parses them. File names auto-assign display names and colors (e.g. `*Cobalt*` → CoFeO/red, `*BiVO*` → BiVOTiO/green).

## Plot wiring notes

- `Plot.ts` owns the plot state (`activeDrag`, `boxCount`, `svgDataMap`) as module-local state. `main.ts` reads it via the exported getters (`getActiveDrag`, `getBoxCount`).
- Global `mousemove`/`mouseup` resize listeners are registered once via `initPlotDragListeners()` in `main.ts`; don't re-add them per plot.

## Feature implementation guidance

- Prefer adding new features to existing code files (keep changes in-place where they fit naturally).
- If an existing file becomes too generic, broad, or cluttered for the new feature, modularize instead: extract a dedicated module (e.g. a new file in `src/components/` or `src/utils/`) and keep `main.ts` as thin wiring.

## Constraints

- No external state/store, no routing, no bundler config overrides — all wiring lives in `src/main.ts` + the component modules.
- The app targets a desktop-like UI (Sma4Win clone), not mobile.