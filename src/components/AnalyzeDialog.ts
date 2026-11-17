import { makeDraggable } from '../utils/draggable.ts'
import {
  buildAnalyzeResultText,
  copyAnalyzeResults,
  getDocConstants,
  listAnalyzeSources,
  resolveAnalyzeSvg,
  runAnalyzeClear,
  runFft,
  runFunctionDraw,
  runGaussLorentz,
  runLsFit,
  runMaxMin,
  runPeakDetect,
  runSmooth,
  runSpline,
  runUserFit,
} from './AnalyzeOps.ts'
import { getProcessedDataset } from './plot/dataset.ts'
import type { GaussPeak } from '../utils/analyze/index.ts'
import type { LsKind } from '../utils/analyze/index.ts'
import type { SplineMode } from '../utils/analyze/index.ts'

export type AnalyzeTab = 'fit' | 'general' | 'spline' | 'special' | 'function' | 'result'

let currentSvg: SVGSVGElement | null = null
let currentTab: AnalyzeTab = 'fit'

function q<T extends HTMLElement>(overlay: HTMLElement, sel: string): T | null {
  return overlay.querySelector<T>(sel)
}

function numVal(el: HTMLInputElement | null, fallback: number): number {
  if (!el) return fallback
  const v = parseFloat(el.value)
  return isNaN(v) ? fallback : v
}

function setStatus(overlay: HTMLElement, msg: string): void {
  const st = q<HTMLElement>(overlay, '#analyzeStatus')
  if (st) st.textContent = msg
}

function switchTab(overlay: HTMLElement, tab: AnalyzeTab): void {
  currentTab = tab
  overlay.querySelectorAll<HTMLButtonElement>('#analyzeTabBar .tab-btn').forEach((b) => {
    b.classList.toggle('btn-primary', b.getAttribute('data-atab') === tab)
  })
  overlay.querySelectorAll<HTMLElement>('.analyze-tab-panel').forEach((p) => {
    p.style.display = p.getAttribute('data-apanel') === tab ? '' : 'none'
  })
}

function selectedDatasetName(overlay: HTMLElement): string {
  const sel = q<HTMLSelectElement>(overlay, '#analyzeDataset')
  return sel?.value || ''
}

function refreshDatasetSelect(overlay: HTMLElement): void {
  const sel = q<HTMLSelectElement>(overlay, '#analyzeDataset')
  if (!sel || !currentSvg) return
  const prev = sel.value
  sel.innerHTML = ''
  const sources = listAnalyzeSources(currentSvg)
  for (const ds of sources) {
    const opt = document.createElement('option')
    const value = ds.seriesId || ds.smpSeriesName || ds.name
    opt.value = value
    opt.textContent = ds.seriesIndex !== undefined ? `${ds.smpSeriesName || ds.name} [${ds.seriesIndex + 1}]` : (ds.smpSeriesName || ds.name)
    sel.appendChild(opt)
  }
  if (sources.length === 0) {
    const opt = document.createElement('option')
    opt.value = ''
    opt.textContent = '(no datasets)'
    sel.appendChild(opt)
  } else if (prev && sources.some((d) => (d.seriesId || d.smpSeriesName || d.name) === prev)) {
    sel.value = prev
  }
  estimatePeakGrid(overlay)
}

function estimatePeakGrid(overlay: HTMLElement): void {
  if (!currentSvg) return
  const name = selectedDatasetName(overlay)
  const ds = listAnalyzeSources(currentSvg).find((d) =>
    (d.seriesId || d.smpSeriesName || d.name) === name ||
    d.seriesId === name ||
    (d.smpSeriesName || d.name) === name ||
    d.name === name
  )
  if (!ds) return
  const p = getProcessedDataset(ds)
  if (p.x.length === 0) return
  let lo = Infinity
  let hi = -Infinity
  let peak = -Infinity
  for (let i = 0; i < p.x.length; i++) {
    if (!isFinite(p.x[i]) || !isFinite(p.y[i])) continue
    if (p.x[i] < lo) lo = p.x[i]
    if (p.x[i] > hi) hi = p.x[i]
    if (p.y[i] > peak) peak = p.y[i]
  }
  if (!isFinite(lo) || !isFinite(hi) || lo === hi) return
  const grid = q<HTMLElement>(overlay, '#analyzePeakGrid')
  if (!grid) return
  const rows = grid.querySelectorAll('[data-peak-row]')
  rows.forEach((row, i) => {
    const pos = row.querySelector<HTMLInputElement>('[data-peak-pos]')
    const inten = row.querySelector<HTMLInputElement>('[data-peak-int]')
    const width = row.querySelector<HTMLInputElement>('[data-peak-width]')
    if (pos && !pos.dataset.touched) pos.value = String(lo + ((hi - lo) * (i + 0.5)) / rows.length)
    if (inten && !inten.dataset.touched) inten.value = String(isFinite(peak) ? peak : 1)
    if (width && !width.dataset.touched) width.value = String((hi - lo) / (rows.length * 4))
  })
}

function readPeakGrid(overlay: HTMLElement): GaussPeak[] {
  const grid = q<HTMLElement>(overlay, '#analyzePeakGrid')
  const peaks: GaussPeak[] = []
  if (!grid) return peaks
  grid.querySelectorAll('[data-peak-row]').forEach((row) => {
    const active = row.querySelector<HTMLInputElement>('[data-peak-active]')
    const inten = row.querySelector<HTMLInputElement>('[data-peak-int]')
    const pos = row.querySelector<HTMLInputElement>('[data-peak-pos]')
    const width = row.querySelector<HTMLInputElement>('[data-peak-width]')
    peaks.push({
      intensity: inten ? numVal(inten, 0) : 0,
      position: pos ? numVal(pos, 0) : 0,
      width: width ? numVal(width, 1) : 1,
      active: active ? active.checked : true,
    })
  })
  return peaks
}

function buildPeakGrid(overlay: HTMLElement): void {
  const grid = q<HTMLElement>(overlay, '#analyzePeakGrid')
  if (!grid || grid.children.length > 0) return
  const names = ['On', 'Int', 'Pos', 'Width']
  for (const n of names) {
    const h = document.createElement('div')
    h.textContent = n
    h.style.fontWeight = '600'
    grid.appendChild(h)
  }
  for (let i = 0; i < 6; i++) {
    const row = document.createElement('div')
    row.setAttribute('data-peak-row', String(i))
    row.style.display = 'contents'
    const active = document.createElement('input')
    active.type = 'checkbox'
    active.checked = i === 0
    active.setAttribute('data-peak-active', '1')
    const inten = document.createElement('input')
    inten.type = 'number'
    inten.step = 'any'
    inten.value = '1'
    inten.setAttribute('data-peak-int', '1')
    const pos = document.createElement('input')
    pos.type = 'number'
    pos.step = 'any'
    pos.value = String(i)
    pos.setAttribute('data-peak-pos', '1')
    const width = document.createElement('input')
    width.type = 'number'
    width.step = 'any'
    width.value = '1'
    width.setAttribute('data-peak-width', '1')
    for (const el of [inten, pos, width]) {
      el.style.width = '100%'
      el.addEventListener('input', () => {
        el.dataset.touched = '1'
      })
    }
    const wrap = document.createElement('div')
    wrap.appendChild(active)
    row.appendChild(wrap)
    for (const el of [inten, pos, width]) {
      const cell = document.createElement('div')
      cell.appendChild(el)
      row.appendChild(cell)
    }
    grid.appendChild(row)
  }
}

function refreshResult(overlay: HTMLElement): void {
  const ta = q<HTMLTextAreaElement>(overlay, '#analyzeResultText')
  if (ta && currentSvg) ta.value = buildAnalyzeResultText(currentSvg)
}

function applyCurrentTab(overlay: HTMLElement): void {
  if (!currentSvg) {
    setStatus(overlay, 'No plot selected.')
    return
  }
  const srcName = selectedDatasetName(overlay)
  if (currentTab !== 'function' && !srcName) {
    setStatus(overlay, 'No dataset selected.')
    return
  }
  if (currentTab === 'fit') {
    const model = q<HTMLSelectElement>(overlay, '#analyzeFitModel')?.value || 'linear'
    const degree = Math.max(1, Math.min(6, Math.round(numVal(q<HTMLInputElement>(overlay, '#analyzePolyDegree'), 1))))
    const division = Math.max(2, Math.min(2000, Math.round(numVal(q<HTMLInputElement>(overlay, '#analyzeFitDivision'), 101))))
    const res = runLsFit(currentSvg, srcName, model as LsKind, degree, division)
    setStatus(overlay, res ? `Applied ${model} fit → ${res.name}` : 'Fit failed (need ≥2 valid points).')
  } else if (currentTab === 'general') {
    const expr = q<HTMLInputElement>(overlay, '#analyzeUserExpr')?.value.trim() || 'a*exp(b*x)'
    const derivRaw = q<HTMLTextAreaElement>(overlay, '#analyzeUserDerivs')?.value || ''
    const derivs = derivRaw.split(/\r?\n/).map((s) => s.trim()).filter((s) => s !== '')
    const useDoc = q<HTMLInputElement>(overlay, '#analyzeUseDocConstants')?.checked !== false
    const initial = useDoc && currentSvg ? getDocConstants(currentSvg) : [1, 1, 0, 0, 0, 0, 0, 0, 0]
    const res = runUserFit(currentSvg, srcName, expr, derivs, initial)
    setStatus(overlay, res ? `Applied general fit → ${res.name}` : 'General fit failed.')
  } else if (currentTab === 'spline') {
    const mode = (q<HTMLSelectElement>(overlay, '#analyzeSplineMode')?.value || 'cubic') as SplineMode
    const division = Math.max(2, Math.min(5000, Math.round(numVal(q<HTMLInputElement>(overlay, '#analyzeSplineDivision'), 101))))
    const res = runSpline(currentSvg, srcName, mode, division)
    setStatus(overlay, res ? `Applied spline → ${res.name}` : 'Spline failed (need ≥2 points).')
  } else if (currentTab === 'special') {
    const kind = q<HTMLSelectElement>(overlay, '#analyzeSpecialKind')?.value || 'gauss'
    if (kind === 'gauss' || kind === 'lorentz') {
      const peaks = readPeakGrid(overlay)
      const fitOffset = q<HTMLInputElement>(overlay, '#analyzeFitOffset')?.checked !== false
      const offset = numVal(q<HTMLInputElement>(overlay, '#analyzeOffset'), 0)
      const res = runGaussLorentz(currentSvg, srcName, kind, peaks, fitOffset, offset)
      setStatus(overlay, res ? `Applied ${kind} fit → ${res.name}` : 'Peak fit failed.')
    } else if (kind === 'peak') {
      const threshold = numVal(q<HTMLInputElement>(overlay, '#analyzeThreshold'), 0)
      const res = runPeakDetect(currentSvg, srcName, threshold)
      setStatus(overlay, res ? `Detected → ${res.name}` : 'No peaks found.')
    } else if (kind === 'smooth') {
      const cutoff = numVal(q<HTMLInputElement>(overlay, '#analyzeCutoff'), 10)
      const res = runSmooth(currentSvg, srcName, cutoff)
      setStatus(overlay, res ? `Smoothed → ${res.name}` : 'Smooth failed.')
    } else if (kind === 'fft') {
      const res = runFft(currentSvg, srcName)
      setStatus(overlay, res ? `FFT → ${res.name}` : 'FFT failed.')
    } else if (kind === 'max' || kind === 'min') {
      const text = runMaxMin(currentSvg, srcName, kind)
      setStatus(overlay, text || 'Not found.')
    }
  } else if (currentTab === 'function') {
    const yExpr = q<HTMLInputElement>(overlay, '#analyzeFuncExpr')?.value.trim() || 'sin(x)'
    const xMin = numVal(q<HTMLInputElement>(overlay, '#analyzeFuncXMin'), -200)
    const xMax = numVal(q<HTMLInputElement>(overlay, '#analyzeFuncXMax'), 200)
    const count = Math.max(2, Math.min(2000, Math.round(numVal(q<HTMLInputElement>(overlay, '#analyzeFuncCount'), 200))))
    const res = runFunctionDraw(currentSvg, yExpr, Math.min(xMin, xMax), Math.max(xMin, xMax), count)
    setStatus(overlay, res ? `Drew function → ${res.name}` : 'Function evaluation failed.')
  }
  refreshDatasetSelect(overlay)
  refreshResult(overlay)
}

export function initAnalyzeDialog(overlayEl: HTMLElement): void {
  const dialogEl = overlayEl.querySelector<HTMLElement>('#analyzeDialog')
  const headerEl = overlayEl.querySelector<HTMLElement>('.dialog-header')
  if (dialogEl && headerEl) makeDraggable(dialogEl, headerEl)

  buildPeakGrid(overlayEl)

  overlayEl.querySelectorAll<HTMLButtonElement>('#analyzeTabBar .tab-btn').forEach((b) => {
    b.addEventListener('click', () => {
      const tab = (b.getAttribute('data-atab') || 'fit') as AnalyzeTab
      switchTab(overlayEl, tab)
    })
  })

  q<HTMLSelectElement>(overlayEl, '#analyzeDataset')?.addEventListener('change', () => estimatePeakGrid(overlayEl))
  q<HTMLButtonElement>(overlayEl, '#analyzeApplyBtn')?.addEventListener('click', () => applyCurrentTab(overlayEl))
  q<HTMLButtonElement>(overlayEl, '#analyzeCancelBtn')?.addEventListener('click', () => hideAnalyzeDialog(overlayEl))
  q<HTMLButtonElement>(overlayEl, '#closeAnalyzeDialogBtn')?.addEventListener('click', () => hideAnalyzeDialog(overlayEl))
  q<HTMLButtonElement>(overlayEl, '#analyzeClearBtn')?.addEventListener('click', () => {
    if (!currentSvg) return
    const n = runAnalyzeClear(currentSvg)
    setStatus(overlayEl, n > 0 ? `Cleared ${n} derived dataset(s).` : 'Nothing to clear.')
    refreshDatasetSelect(overlayEl)
    refreshResult(overlayEl)
  })
  q<HTMLButtonElement>(overlayEl, '#analyzeCopyBtn')?.addEventListener('click', () => {
    if (!currentSvg) return
    void copyAnalyzeResults(currentSvg).then((text) => {
      setStatus(overlayEl, `Copied ${text.split('\n').length} line(s) to clipboard.`)
    })
  })
  overlayEl.addEventListener('mousedown', (e) => {
    if (e.target === overlayEl) hideAnalyzeDialog(overlayEl)
  })
}

export function showAnalyzeDialog(overlayEl: HTMLElement, tab: AnalyzeTab = 'fit', svg?: SVGSVGElement | null): void {
  currentSvg = svg && document.body.contains(svg) ? svg : resolveAnalyzeSvg()
  if (!currentSvg) return
  overlayEl.style.display = ''
  refreshDatasetSelect(overlayEl)
  refreshResult(overlayEl)
  setStatus(overlayEl, '')
  switchTab(overlayEl, tab)
}

export function hideAnalyzeDialog(overlayEl: HTMLElement): void {
  overlayEl.style.display = 'none'
}
