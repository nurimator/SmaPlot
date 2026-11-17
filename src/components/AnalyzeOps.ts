import type { Dataset, SmpPlotDoc } from '../types.ts'
import { globalDataManager } from './DataManager.ts'
import {
  allDatasets,
  ensureSmpDoc,
  getAllPlotSvgs,
  getPlotDatasets,
  getSelectedPlotSvg,
  svgDataMap,
  updatePlotVisual,
} from './plot/index.ts'
import { pushUndoState } from '../utils/undoManager.ts'
import {
  ANALYZE_DIVISION_DEFAULT,
  applyFft,
  applyFunctionDraw,
  applyGaussLorentz,
  applyLsFit,
  applyMaxMin,
  applyPeakDetect,
  applySmooth,
  applySpline,
  applyUserFit,
  buildResultText,
  clearAnalyze,
  listSourceDatasets,
  findSourceDataset,
} from '../utils/analyze/index.ts'
import type { LsKind } from '../utils/analyze/index.ts'
import type { SplineMode } from '../utils/analyze/index.ts'
import type { GaussPeak } from '../utils/analyze/index.ts'

export function resolveAnalyzeSvg(): SVGSVGElement | null {
  const sel = getSelectedPlotSvg()
  if (sel && document.body.contains(sel)) return sel
  const graphArea = document.querySelector<HTMLElement>('.graph-area')
  if (!graphArea) return null
  const all = getAllPlotSvgs(graphArea)
  return all.length > 0 ? all[0] : null
}

export function getAnalyzeDoc(svg: SVGSVGElement): SmpPlotDoc {
  const doc = ensureSmpDoc(svg)
  doc.datasets = [...getPlotDatasets(svg)]
  return doc
}

export function commitAnalyzeDoc(svg: SVGSVGElement, doc: SmpPlotDoc): void {
  svgDataMap.set(svg, doc.datasets || [])
  for (const ds of doc.datasets || []) {
    if (ds.derivedKind) {
      const sameDerived = (d: Dataset): boolean =>
        (d.seriesId && ds.seriesId ? d.seriesId === ds.seriesId :
          (d.smpSeriesName || d.name) === (ds.smpSeriesName || ds.name)) &&
        (d.derivedKind || '') === (ds.derivedKind || '')
      if (!allDatasets.some(sameDerived)) {
        allDatasets.push(ds)
      }
      const gds = globalDataManager.getDatasets()
      if (!gds.some(sameDerived)) {
        globalDataManager.addDataset(ds)
      }
    }
  }
  updatePlotVisual(svg)
}

export function listAnalyzeSources(svg: SVGSVGElement): Dataset[] {
  return listSourceDatasets(getAnalyzeDoc(svg))
}

function recordConfig(doc: SmpPlotDoc, action: string, srcName: string, params: Record<string, number | string | boolean>): void {
  doc.analyzeLastAction = action
  doc.analyzeLastConfig = { action, srcName, params }
}

export function runLsFit(svg: SVGSVGElement, srcName: string, kind: LsKind, polyDegree = 1, division = 0): Dataset | null {
  const doc = getAnalyzeDoc(svg)
  pushUndoState()
  const label = kind === 'poly' ? `ls:poly${polyDegree}` : `ls:${kind}`
  const derived = kind === 'poly'
    ? applyLsFit(doc, srcName, kind, polyDegree, division)
    : applyLsFit(doc, srcName, kind, 1, division)
  if (!derived) return null
  recordConfig(doc, label, srcName, { kind, polyDegree, division })
  commitAnalyzeDoc(svg, doc)
  return derived
}

export function runUserFit(
  svg: SVGSVGElement,
  srcName: string,
  expr: string,
  derivs: string[],
  initial: number[],
  activeMask?: boolean[],
  division = 0
): Dataset | null {
  const doc = getAnalyzeDoc(svg)
  pushUndoState()
  const derived = applyUserFit(doc, srcName, expr, derivs, initial, activeMask, division)
  if (!derived) return null
  recordConfig(doc, 'ls:general', srcName, { expr, division })
  commitAnalyzeDoc(svg, doc)
  return derived
}

export function runSpline(svg: SVGSVGElement, srcName: string, mode: SplineMode, division = ANALYZE_DIVISION_DEFAULT): Dataset | null {
  const doc = getAnalyzeDoc(svg)
  pushUndoState()
  const derived = applySpline(doc, srcName, mode, division)
  if (!derived) return null
  recordConfig(doc, `spline:${mode}`, srcName, { mode, division })
  commitAnalyzeDoc(svg, doc)
  return derived
}

export function runGaussLorentz(
  svg: SVGSVGElement,
  srcName: string,
  kind: 'gauss' | 'lorentz',
  peaks: GaussPeak[],
  fitOffset: boolean,
  offset: number,
  division = ANALYZE_DIVISION_DEFAULT
): Dataset | null {
  const doc = getAnalyzeDoc(svg)
  pushUndoState()
  const derived = applyGaussLorentz(doc, srcName, kind, peaks, fitOffset, offset, division)
  if (!derived) return null
  recordConfig(doc, `ext:${kind}`, srcName, { kind, fitOffset, offset, division })
  commitAnalyzeDoc(svg, doc)
  return derived
}

export function runPeakDetect(svg: SVGSVGElement, srcName: string, threshold = 0, maxPeaks = 20): Dataset | null {
  const doc = getAnalyzeDoc(svg)
  pushUndoState()
  const derived = applyPeakDetect(doc, srcName, threshold, maxPeaks)
  if (!derived) return null
  recordConfig(doc, 'ext:peaks', srcName, { threshold, maxPeaks })
  commitAnalyzeDoc(svg, doc)
  return derived
}

export function runSmooth(svg: SVGSVGElement, srcName: string, cutoff = 10): Dataset | null {
  const doc = getAnalyzeDoc(svg)
  pushUndoState()
  const derived = applySmooth(doc, srcName, cutoff)
  if (!derived) return null
  recordConfig(doc, 'ext:smooth', srcName, { cutoff })
  commitAnalyzeDoc(svg, doc)
  return derived
}

export function runFft(svg: SVGSVGElement, srcName: string): Dataset | null {
  const doc = getAnalyzeDoc(svg)
  pushUndoState()
  const derived = applyFft(doc, srcName)
  if (!derived) return null
  recordConfig(doc, 'ext:fft', srcName, {})
  commitAnalyzeDoc(svg, doc)
  return derived
}

export function runMaxMin(svg: SVGSVGElement, srcName: string, which: 'max' | 'min'): string | null {
  const doc = getAnalyzeDoc(svg)
  const text = applyMaxMin(doc, srcName, which)
  if (text === null) return null
  pushUndoState()
  recordConfig(doc, `ext:${which}`, srcName, {})
  commitAnalyzeDoc(svg, doc)
  return text
}

export function runFunctionDraw(
  svg: SVGSVGElement,
  yExpr: string,
  xMin: number,
  xMax: number,
  count = 200
): Dataset | null {
  const doc = getAnalyzeDoc(svg)
  pushUndoState()
  const derived = applyFunctionDraw(doc, yExpr, xMin, xMax, count)
  recordConfig(doc, 'function', '', { yExpr, xMin, xMax, count })
  commitAnalyzeDoc(svg, doc)
  return derived
}

export function runAnalyzeClear(svg: SVGSVGElement): number {
  const doc = getAnalyzeDoc(svg)
  const removed = clearAnalyze(doc)
  if (removed === 0) return 0
  pushUndoState()
  const live = doc.datasets
  svgDataMap.set(svg, live)
  const gds = globalDataManager.getDatasets()
  for (let i = gds.length - 1; i >= 0; i--) {
    if ((gds[i] as Dataset).derivedKind) globalDataManager.removeDataset(i)
  }
  for (let i = allDatasets.length - 1; i >= 0; i--) {
    if (allDatasets[i].derivedKind) allDatasets.splice(i, 1)
  }
  updatePlotVisual(svg)
  return removed
}

export function runAnalyzeRepeat(svg: SVGSVGElement): Dataset | string | null {
  const doc = getAnalyzeDoc(svg)
  const cfg = doc.analyzeLastConfig
  if (!cfg) return null
  const num = (key: string, fallback: number): number => {
    const v = cfg.params[key]
    return typeof v === 'number' && isFinite(v) ? v : fallback
  }
  const str = (key: string, fallback: string): string => {
    const v = cfg.params[key]
    return typeof v === 'string' ? v : fallback
  }
  switch (cfg.action) {
    case 'ls:linear': return runLsFit(svg, cfg.srcName, 'linear', 1, num('division', 0))
    case 'ls:exp': return runLsFit(svg, cfg.srcName, 'exp', 1, num('division', 0))
    case 'ls:log': return runLsFit(svg, cfg.srcName, 'log', 1, num('division', 0))
    case 'ls:power': return runLsFit(svg, cfg.srcName, 'power', 1, num('division', 0))
    case 'ls:general': {
      const src = findSourceDataset(getAnalyzeDoc(svg), cfg.srcName)
      const uf = src?.smpUserFunction
      return runUserFit(svg, cfg.srcName, uf?.expr || str('expr', 'a*exp(b*x)'), uf?.derivs || [], getDocConstants(svg), undefined, num('division', 0))
    }
    default: {
      if (cfg.action.startsWith('ls:poly')) {
        return runLsFit(svg, cfg.srcName, 'poly', num('polyDegree', 1), num('division', 0))
      }
      if (cfg.action.startsWith('spline:')) {
        return runSpline(svg, cfg.srcName, str('mode', 'cubic') as SplineMode, num('division', ANALYZE_DIVISION_DEFAULT))
      }
      if (cfg.action === 'ext:peaks') return runPeakDetect(svg, cfg.srcName, num('threshold', 0), num('maxPeaks', 20))
      if (cfg.action === 'ext:smooth') return runSmooth(svg, cfg.srcName, num('cutoff', 10))
      if (cfg.action === 'ext:fft') return runFft(svg, cfg.srcName)
      if (cfg.action === 'ext:max' || cfg.action === 'ext:min') {
        return runMaxMin(svg, cfg.srcName, cfg.action === 'ext:max' ? 'max' : 'min')
      }
      if (cfg.action === 'function') {
        return runFunctionDraw(svg, str('yExpr', 'sin(x)'), num('xMin', 0), num('xMax', 10), num('count', 200))
      }
      return null
    }
  }
}

export function getDocConstants(svg: SVGSVGElement): number[] {
  const doc = ensureSmpDoc(svg)
  if (!doc.analyzeConstants || doc.analyzeConstants.length < 9) {
    doc.analyzeConstants = [1, 1, 0, 0, 0, 0, 0, 0, 0]
  }
  return [...doc.analyzeConstants]
}

export function setDocConstants(svg: SVGSVGElement, values: number[]): void {
  const doc = ensureSmpDoc(svg)
  const next = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  for (let i = 0; i < 9; i++) {
    const v = values[i]
    next[i] = typeof v === 'number' && isFinite(v) ? v : 0
  }
  pushUndoState()
  doc.analyzeConstants = next
}

export function buildAnalyzeResultText(svg: SVGSVGElement): string {
  const doc = getAnalyzeDoc(svg)
  return buildResultText(doc)
}

export async function copyAnalyzeResults(svg: SVGSVGElement): Promise<string> {
  const text = buildAnalyzeResultText(svg)
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
  return text
}
