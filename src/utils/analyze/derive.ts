import type { Dataset, SmpPlotDoc } from '../../types.ts'
import { parseZerosLine } from './zerosLine.ts'
import { fitExponential, fitLinear, fitLogarithmic, fitPolynomial, fitPower } from './lsFit.ts'
import type { LsKind } from './lsFit.ts'
import { evaluateFitExpr } from './lsFit.ts'
import { fitGeneralFunction, sampleUserFunction } from './userFit.ts'
import { interpolateSpline } from './spline.ts'
import type { SplineMode } from './spline.ts'
import { fitGaussLorentz, sampleGaussLorentz } from './gaussLorentz.ts'
import type { GaussPeak } from './types.ts'
import { detectPeaks, filterPeaksByThreshold, findMaximum, findMinimum } from './peak.ts'
import { fftOfSignal, smoothFFT } from './fft.ts'
import { sampleFunction } from './functionSeries.ts'
import { getProcessedDataset } from '../../components/plot/dataset.ts'

export const ANALYZE_DIVISION_DEFAULT = 101

let derivedSeriesCounter = 0

function baseName(ds: Dataset): string {
  return ds.smpSeriesName || ds.name
}

function sourceCoords(ds: Dataset): { x: number[]; y: number[] } {
  const p = getProcessedDataset(ds)
  return { x: [...p.x], y: [...p.y] }
}

function dataRange(xs: number[]): { min: number; max: number } {
  let lo = Infinity
  let hi = -Infinity
  for (const v of xs) {
    if (!isFinite(v)) continue
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  if (!isFinite(lo) || !isFinite(hi)) return { min: 0, max: 10 }
  if (lo === hi) return { min: lo - 1, max: hi + 1 }
  return { min: lo, max: hi }
}

function makeDerived(
  src: Dataset,
  kind: string,
  xs: number[],
  ys: number[]
): Dataset {
  let from = 0
  let to = 10
  if (xs.length > 0) {
    const r = dataRange(xs)
    from = r.min
    to = r.max
  }
  derivedSeriesCounter += 1
  return {
    name: `${src.name} (${kind})`,
    seriesId: `${src.seriesId || src.filePath || src.name}::derived:${derivedSeriesCounter}`,
    dataId: `${src.dataId || src.smpDataName || src.name}::derived:${derivedSeriesCounter}`,
    seriesIndex: src.seriesIndex,
    documentId: src.documentId,
    color: src.color,
    x: xs,
    y: ys,
    rawLines: xs.map((x, i) => [String(x), String(ys[i] ?? 0)]),
    fileName: src.fileName,
    filePath: src.filePath,
    smpSeriesName: `${baseName(src)}:${kind}`,
    smpDataName: `${baseName(src)}:${kind}`,
    smpSeriesStylePrefix: src.smpSeriesStylePrefix,
    smpSeriesZerosLine: `0 ${Math.max(2, xs.length)} 0 0 ${from} ${to} 0 0 0`,
    smpSeriesFixed5: '1 40 0 300 1',
    smpExprFlag: '0 0 0',
    derivedFrom: baseName(src),
    derivedKind: kind,
    options: {
      show: true,
      lineColor: src.options?.lineColor || src.color,
      width: src.options?.width ?? 0.6,
      lineStyle: 'solid',
      plotType: 'no_dot',
      lineType: 'dash',
      dotColor: src.options?.lineColor || src.color,
      paintColor: '#ffffff',
      size: 3,
    },
  }
}

export function findSourceDataset(doc: SmpPlotDoc, identifier: string): Dataset | undefined {
  const datasets = doc.datasets || []
  return datasets.find((d) => d.seriesId && d.seriesId === identifier) ||
    datasets.find((d) => (d.smpSeriesName || d.name) === identifier || d.name === identifier) ||
    datasets.find((d) => d.filePath === identifier || d.fileName === identifier || `${d.name}.txt` === identifier)
}

export function listSourceDatasets(doc: SmpPlotDoc): Dataset[] {
  return (doc.datasets || []).filter((ds) => !ds.derivedKind)
}

export function applyLsFit(
  doc: SmpPlotDoc,
  srcName: string,
  kind: LsKind,
  polyDegree = 1,
  divisionOverride = 0
): Dataset | null {
  const src = findSourceDataset(doc, srcName)
  if (!src) return null
  const { x, y } = sourceCoords(src)
  let a = 0
  let b = 0
  let expr = ''
  let fitKind = kind
  if (kind === 'poly' && polyDegree !== 1) {
    const r = fitPolynomial(x, y, polyDegree)
    a = r.a
    b = r.b
    expr = r.expr
    fitKind = 'poly'
  } else if (kind === 'exp') {
    const r = fitExponential(x, y)
    a = r.a
    b = r.b
    expr = r.expr
  } else if (kind === 'log') {
    const r = fitLogarithmic(x, y)
    a = r.a
    b = r.b
    expr = r.expr
  } else if (kind === 'power') {
    const r = fitPower(x, y)
    a = r.a
    b = r.b
    expr = r.expr
  } else {
    const r = kind === 'poly' ? fitPolynomial(x, y, 1) : fitLinear(x, y)
    a = r.a
    b = r.b
    expr = r.expr
    fitKind = 'linear'
  }
  const info = parseZerosLine(src.smpSeriesZerosLine)
  const division = divisionOverride > 0
    ? Math.round(divisionOverride)
    : info.count > 0 ? info.count : ANALYZE_DIVISION_DEFAULT
  const { min, max } = dataRange(x)
  const ox: number[] = []
  const oy: number[] = []
  for (let i = 0; i < division; i++) {
    const xv = division === 1 ? min : min + ((max - min) * i) / (division - 1)
    const yv = evaluateFitExpr(fitKind === 'poly' ? 'linear' : fitKind, a, b, xv)
    if (!isFinite(yv)) continue
    ox.push(xv)
    oy.push(yv)
  }
  const label = kind === 'poly' ? `poly${polyDegree}` : kind
  const derived = makeDerived(src, `LS:${label} ${expr}`, ox, oy)
  doc.datasets = [...(doc.datasets || []), derived]
  doc.analyzeLastAction = `ls:${label}`
  return derived
}

export function applyUserFit(
  doc: SmpPlotDoc,
  srcName: string,
  expr: string,
  derivs: string[],
  initial: number[],
  activeMask?: boolean[],
  divisionOverride = 0
): Dataset | null {
  const src = findSourceDataset(doc, srcName)
  if (!src) return null
  const { x, y } = sourceCoords(src)
  const fit = fitGeneralFunction(expr, derivs, x, y, initial, activeMask)
  const { min, max } = dataRange(x)
  const info = parseZerosLine(src.smpSeriesZerosLine)
  const division = divisionOverride > 0
    ? Math.round(divisionOverride)
    : info.count > 0 ? info.count : ANALYZE_DIVISION_DEFAULT
  const s = sampleUserFunction(expr, fit.constants, min, max, division)
  const fitNote = fit.converged ? '' : ' not-converged'
  const derived = makeDerived(src, `LS:F ${expr} rmse=${fit.rmse.toPrecision(4)}${fitNote}`, s.x, s.y)
  doc.datasets = [...(doc.datasets || []), derived]
  doc.analyzeLastAction = 'ls:general'
  return derived
}

export function applySpline(
  doc: SmpPlotDoc,
  srcName: string,
  mode: SplineMode,
  division = ANALYZE_DIVISION_DEFAULT
): Dataset | null {
  const src = findSourceDataset(doc, srcName)
  if (!src) return null
  const { x, y } = sourceCoords(src)
  const s = interpolateSpline(x, y, mode, division)
  const label = mode === 'cubic' ? 'spline' : mode === 'parametric' ? 'pspline' : 'pspline-closed'
  const derived = makeDerived(src, label, s.x, s.y)
  doc.datasets = [...(doc.datasets || []), derived]
  doc.analyzeLastAction = `spline:${mode}`
  return derived
}

export function applyGaussLorentz(
  doc: SmpPlotDoc,
  srcName: string,
  kind: 'gauss' | 'lorentz',
  peaks: GaussPeak[],
  fitOffset: boolean,
  offset: number,
  division = ANALYZE_DIVISION_DEFAULT
): Dataset | null {
  const src = findSourceDataset(doc, srcName)
  if (!src) return null
  const { x, y } = sourceCoords(src)
  const fit = fitGaussLorentz(kind, x, y, peaks, fitOffset, offset)
  const { min, max } = dataRange(x)
  const s = sampleGaussLorentz(kind, fit.peaks, fit.offset, min, max, division)
  const label = kind === 'gauss' ? 'gauss' : 'lorentz'
  const derived = makeDerived(src, `${label} off=${fit.offset.toPrecision(4)}`, s.x, s.y)
  doc.datasets = [...(doc.datasets || []), derived]
  doc.analyzeLastAction = `ext:${label}`
  return derived
}

export function applyPeakDetect(
  doc: SmpPlotDoc,
  srcName: string,
  threshold = 0,
  maxPeaks = 20
): Dataset | null {
  const src = findSourceDataset(doc, srcName)
  if (!src) return null
  const { x, y } = sourceCoords(src)
  const peaks = filterPeaksByThreshold(detectPeaks(x, y, maxPeaks), threshold)
  const derived = makeDerived(
    src,
    `peaks(${peaks.length})`,
    peaks.map((p) => p.x),
    peaks.map((p) => p.y)
  )
  derived.options = { ...(derived.options || {}), plotType: 'circle', lineType: 'no_line' }
  doc.datasets = [...(doc.datasets || []), derived]
  doc.analyzeLastAction = 'ext:peaks'
  return derived
}

export function applySmooth(
  doc: SmpPlotDoc,
  srcName: string,
  cutoff = 10
): Dataset | null {
  const src = findSourceDataset(doc, srcName)
  if (!src) return null
  const { x, y } = sourceCoords(src)
  const sy = smoothFFT(y, cutoff)
  const derived = makeDerived(src, 'smooth', [...x], sy)
  doc.datasets = [...(doc.datasets || []), derived]
  doc.analyzeLastAction = 'ext:smooth'
  return derived
}

export function applyMaxMin(
  doc: SmpPlotDoc,
  srcName: string,
  which: 'max' | 'min'
): string | null {
  const src = findSourceDataset(doc, srcName)
  if (!src) return null
  const { x, y } = sourceCoords(src)
  const p = which === 'max' ? findMaximum(x, y) : findMinimum(x, y)
  if (!p) return null
  doc.analyzeLastAction = `ext:${which}`
  return which === 'max' ? `MAX(X,Y)=${p.x},${p.y}` : `MIN(X,Y)=${p.x},${p.y}`
}

export function applyFft(doc: SmpPlotDoc, srcName: string): Dataset | null {
  const src = findSourceDataset(doc, srcName)
  if (!src) return null
  const { y } = sourceCoords(src)
  const { freq, mag } = fftOfSignal(y)
  const derived = makeDerived(src, 'fft', freq, mag)
  doc.datasets = [...(doc.datasets || []), derived]
  doc.analyzeLastAction = 'ext:fft'
  return derived
}

export function applyFunctionDraw(
  doc: SmpPlotDoc,
  yExpr: string,
  xMin: number,
  xMax: number,
  count = 200,
  constants?: number[]
): Dataset {
  const consts = constants || doc.analyzeConstants || [0, 0, 0, 0, 0, 0, 0, 0, 0]
  const s = sampleFunction(yExpr, xMin, xMax, count, consts)
  derivedSeriesCounter += 1
  const derived: Dataset = {
    name: `Function ${yExpr}`,
    seriesId: `function::${derivedSeriesCounter}`,
    dataId: `function::${derivedSeriesCounter}`,
    color: '#000000',
    x: s.x,
    y: s.y,
    rawLines: s.x.map((x, i) => [String(x), String(s.y[i] ?? 0)]),
    smpSeriesName: `Function:${yExpr}`,
    smpDataName: `Function:${yExpr}`,
    smpSeriesZerosLine: `0 101 0 0 ${xMin} ${xMax} 0 0 0`,
    smpSeriesFixed5: '1 40 0 300 1',
    smpExprFlag: '3 0 0 0 0 11 101 89 282',
    derivedKind: 'function',
    options: {
      show: true,
      lineColor: '#000000',
      width: 0.6,
      lineStyle: 'solid',
      plotType: 'no_dot',
      lineType: 'solid',
      dotColor: '#000000',
      paintColor: '#ffffff',
      size: 3,
      xTransCheck: false,
      xExpr: 'x',
      yTransCheck: false,
      yExpr,
    },
  }
  doc.datasets = [...(doc.datasets || []), derived]
  doc.analyzeLastAction = 'function'
  return derived
}

export function clearAnalyze(doc: SmpPlotDoc): number {
  const before = (doc.datasets || []).length
  doc.datasets = (doc.datasets || []).filter((ds) => !ds.derivedKind)
  doc.analyzeLastAction = undefined
  return before - doc.datasets.length
}

export function buildResultText(doc: SmpPlotDoc): string {
  const lines: string[] = []
  for (const ds of doc.datasets || []) {
    if (!ds.derivedKind) continue
    lines.push(`${ds.smpSeriesName || ds.name}: ${ds.x.length} pts`)
  }
  if (lines.length === 0) lines.push('(no analyze results)')
  return lines.join('\n')
}
