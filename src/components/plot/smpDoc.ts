import type { Dataset, SmpAxisSpec, SmpMetadata, SmpPlotDoc } from '../../types.ts'
import { createValueScale, niceAxisBounds, niceLogAxisBounds, resolveAxisStep, type ValueScale } from '../../utils/scale.ts'
import { getProcessedDataset } from './dataset.ts'
import { getExplicitSelectedPlotSvg, getMultiSelectedSvgs, getSelectedPlotSvg } from './selection.ts'
import { PLOT_MARGIN } from './svg.ts'
import {
  activeSvgs,
  autoScaleSvgs,
  svgBaseScaleMap,
  svgDataMap,
  svgSmpDocMap,
  svgSmpMetaMap,
} from './state.ts'
import { updatePlotVisual } from './drawPlot.ts'

export const SMP_SCALE = 0.02

function styleNumber(value: string, fallback: number): number {
  const parsed = parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function getSvgRectForSmpDoc(doc: SmpPlotDoc): {
  svgLeft: number
  svgTop: number
  svgWidth: number
  svgHeight: number
} {
  const frameLeft = doc.left * SMP_SCALE
  const frameTop = doc.top * SMP_SCALE
  const frameWidth = doc.width * SMP_SCALE
  const frameHeight = doc.height * SMP_SCALE

  const svgLeft = frameLeft - PLOT_MARGIN.l
  const svgTop = frameTop - PLOT_MARGIN.t
  const svgWidth = frameWidth + PLOT_MARGIN.l + PLOT_MARGIN.r
  const svgHeight = frameHeight + PLOT_MARGIN.t + PLOT_MARGIN.b

  return { svgLeft, svgTop, svgWidth, svgHeight }
}

export function setPlotSmpMeta(svg: SVGSVGElement, meta: SmpMetadata): void {
  svgSmpMetaMap.set(svg, meta)
}

export function setPlotSmpDoc(svg: SVGSVGElement, doc: SmpPlotDoc): void {
  svgSmpDocMap.set(svg, doc)
  autoScaleSvgs.delete(svg)
}

export function getPlotSmpDoc(svg: SVGSVGElement): SmpPlotDoc | undefined {
  return svgSmpDocMap.get(svg)
}

export function setAxisSync(smpDoc: SmpPlotDoc, axis: 'u' | 'r', synced: boolean): void {
  if (axis === 'u') {
    if (!smpDoc.axisTop) {
      smpDoc.axisTop = { ...smpDoc.axisX, showLabels: !synced, isSynced: synced }
    }
    smpDoc.syncWithU = synced
    smpDoc.axisX.isSynced = synced
    smpDoc.axisTop.isSynced = synced
    if (synced) {
      smpDoc.axisTop.showLabels = false
      smpDoc.axisTop.logScale = smpDoc.axisX.logScale
      smpDoc.axisTop.scaleType = smpDoc.axisX.scaleType
    }
  } else {
    if (!smpDoc.axisRight) {
      smpDoc.axisRight = { ...smpDoc.axisY, showLabels: !synced, isSynced: synced }
    }
    smpDoc.syncWithR = synced
    smpDoc.axisY.isSynced = synced
    smpDoc.axisRight.isSynced = synced
    if (synced) {
      smpDoc.axisRight.showLabels = false
      smpDoc.axisRight.logScale = smpDoc.axisY.logScale
      smpDoc.axisRight.scaleType = smpDoc.axisY.scaleType
    }
  }
}

export function getPlotDatasets(svg: SVGSVGElement): Dataset[] {
  return svgDataMap.get(svg) || []
}

export function getPlotLimits(svg: SVGSVGElement): { xMin: number; xMax: number; yMin: number; yMax: number } {
  const smpDoc = svgSmpDocMap.get(svg)
  const smpMeta = svgSmpMetaMap.get(svg)
  const baseScale = svgBaseScaleMap.get(svg)
  const rawDatasets = svgDataMap.get(svg) || []
  const datasets = rawDatasets.map((ds) => getProcessedDataset(ds))

  let xMin = smpDoc?.axisX.min ?? smpMeta?.xMin ?? (baseScale ? baseScale.xMin : 0)
  let xMax = smpDoc?.axisX.max ?? smpMeta?.xMax ?? (baseScale ? baseScale.xMax : 10)
  let yMin = smpDoc?.axisY.min ?? smpMeta?.yMin ?? (baseScale ? baseScale.yMin : 0)
  let yMax = smpDoc?.axisY.max ?? smpMeta?.yMax ?? (baseScale ? baseScale.yMax : 10)

  if (!smpDoc && !smpMeta && !baseScale && datasets.length > 0) {
    xMin = Infinity
    xMax = -Infinity
    yMin = Infinity
    yMax = -Infinity
    for (const ds of datasets) {
      for (let i = 0; i < ds.x.length; i++) {
        if (ds.x[i] < xMin) xMin = ds.x[i]
        if (ds.x[i] > xMax) xMax = ds.x[i]
        if (ds.y[i] < yMin) yMin = ds.y[i]
        if (ds.y[i] > yMax) yMax = ds.y[i]
      }
    }
    if (xMin === Infinity) xMin = 0
    if (xMax === -Infinity) xMax = 10
    if (yMin === Infinity) yMin = 0
    if (yMax === -Infinity) yMax = 10
    if (yMin > 0) yMin = 0
  }
  return { xMin, xMax, yMin, yMax }
}

export interface PlotValueScales {
  x: ValueScale
  y: ValueScale
  u: ValueScale
  r: ValueScale
}

export function getPlotValueScales(
  svg: SVGSVGElement,
  plotW: number,
  plotH: number
): PlotValueScales {
  const limits = getPlotLimits(svg)
  const doc = svgSmpDocMap.get(svg)
  const uIndependent = !!doc && !(
    doc.syncWithU !== false &&
    doc.axisX.isSynced !== false &&
    (!doc.axisTop || doc.axisTop.isSynced !== false)
  )
  const rIndependent = !!doc && !(
    doc.syncWithR !== false &&
    doc.axisY.isSynced !== false &&
    (!doc.axisRight || doc.axisRight.isSynced !== false)
  )
  const uSpec = uIndependent && doc?.axisTop ? doc.axisTop : doc?.axisX
  const rSpec = rIndependent && doc?.axisRight ? doc.axisRight : doc?.axisY
  const width = Number.isFinite(plotW) ? plotW : 1
  const height = Number.isFinite(plotH) ? plotH : 1
  return {
    x: createValueScale(limits.xMin, limits.xMax, PLOT_MARGIN.l, PLOT_MARGIN.l + width, doc?.axisX.logScale ? 'log' : 'linear'),
    y: createValueScale(limits.yMin, limits.yMax, PLOT_MARGIN.t + height, PLOT_MARGIN.t, doc?.axisY.logScale ? 'log' : 'linear'),
    u: createValueScale(uSpec?.min ?? limits.xMin, uSpec?.max ?? limits.xMax, PLOT_MARGIN.l, PLOT_MARGIN.l + width, uSpec?.logScale ? 'log' : 'linear'),
    r: createValueScale(rSpec?.min ?? limits.yMin, rSpec?.max ?? limits.yMax, PLOT_MARGIN.t + height, PLOT_MARGIN.t, rSpec?.logScale ? 'log' : 'linear'),
  }
}

export function captureWorkspaceDigest(): string {
  return JSON.stringify(
    activeSvgs.map((svg) => {
      const smpMeta = svgSmpMetaMap.get(svg)
      const baseScale = svgBaseScaleMap.get(svg)
      const doc = exportPlotToSmpDoc(svg, svgSmpDocMap.get(svg)?.name || 'PLOT.SMP')
      const datasets = svgDataMap.get(svg) || []

      return {
        left: parseFloat(svg.style.left) || 0,
        top: parseFloat(svg.style.top) || 0,
        width: parseFloat(svg.style.width) || 400,
        height: parseFloat(svg.style.height) || 300,
        baseScale: baseScale
          ? { xMin: baseScale.xMin, xMax: baseScale.xMax, yMin: baseScale.yMin, yMax: baseScale.yMax }
          : null,
        doc: {
          name: doc.name,
          sourceVersion: doc.sourceVersion || null,
          nativeFormatVersion: doc.nativeFormatVersion || null,
          left: doc.left,
          top: doc.top,
          width: doc.width,
          height: doc.height,
          axisX: doc.axisX,
          axisY: doc.axisY,
          axisTop: doc.axisTop || null,
          axisRight: doc.axisRight || null,
          syncWithU: doc.syncWithU ?? true,
          syncWithR: doc.syncWithR ?? true,
          legendItems: doc.legendItems.map((item) => ({
            type: item.type || null,
            text: item.text,
            rawText: item.rawText || null,
            xNorm: item.xNorm,
            yNorm: item.yNorm,
            rotation: item.rotation,
            fontFamily: item.fontFamily,
            fontSize: item.fontSize,
            fontWeight: item.fontWeight,
            showBg: item.showBg ?? null,
            align: item.align || null,
            x2Norm: item.x2Norm ?? null,
            y2Norm: item.y2Norm ?? null,
            rawLine: item.rawLine || null,
          })),
          annotationLines: (doc.annotationLines || []).map((aLine) => ({ ...aLine })),
          frameTitle: doc.frameTitle ? { ...doc.frameTitle } : null,
          xLabel: doc.xLabel || null,
          yLabel: doc.yLabel || null,
          datasets: datasets.map((ds) => ({
            name: ds.name,
            seriesId: ds.seriesId || null,
            dataId: ds.dataId || null,
            color: ds.color,
            xLen: ds.x.length,
            yLen: ds.y.length,
            options: ds.options || null,
          })),
        },
        meta: smpMeta
          ? {
              xMin: smpMeta.xMin ?? null,
              xMax: smpMeta.xMax ?? null,
              xStep: smpMeta.xStep ?? null,
              yMin: smpMeta.yMin ?? null,
              yMax: smpMeta.yMax ?? null,
              yStep: smpMeta.yStep ?? null,
              xLabel: smpMeta.xLabel ?? null,
              yLabel: smpMeta.yLabel ?? null,
              docsLen: smpMeta.docs?.length ?? 0,
            }
          : null,
      }
    })
  )
}

export function getAllPlotSvgs(graphArea: HTMLElement): SVGSVGElement[] {
  return Array.from(graphArea.querySelectorAll<SVGSVGElement>('.plot-svg'))
}

export function exportPlotToSmpDoc(svg: SVGSVGElement, defaultName = 'FTIR.SMP'): SmpPlotDoc {
  const existingDoc = svgSmpDocMap.get(svg)
  const datasets = svgDataMap.get(svg) || []
  const baseScale = svgBaseScaleMap.get(svg)

  const leftPx = styleNumber(svg.style.left, 40)
  const topPx = styleNumber(svg.style.top, 40)
  const widthPx = parseFloat(svg.style.width) || 500
  const heightPx = parseFloat(svg.style.height) || 350

  const frameLeft = leftPx + PLOT_MARGIN.l
  const frameTop = topPx + PLOT_MARGIN.t
  const frameWidth = Math.max(10, widthPx - PLOT_MARGIN.l - PLOT_MARGIN.r)
  const frameHeight = Math.max(10, heightPx - PLOT_MARGIN.t - PLOT_MARGIN.b)

  const left = Math.round(frameLeft / SMP_SCALE)
  const top = Math.round(frameTop / SMP_SCALE)
  const width = Math.round(frameWidth / SMP_SCALE)
  const height = Math.round(frameHeight / SMP_SCALE)

  const axisX: SmpAxisSpec = existingDoc?.axisX || {
    min: baseScale?.xMin ?? 0,
    max: baseScale?.xMax ?? 10,
    step: baseScale ? Math.round((baseScale.xMax - baseScale.xMin) / 5) || 2 : 2,
    subDivs: 5,
    showTicks: true,
    showSubTicks: true,
    showLabels: true,
    insideTicks: true,
    fontFamily: 'Segoe UI, sans-serif',
    fontSize: 24,
    fontWeight: 400,
  }

  const axisY: SmpAxisSpec = existingDoc?.axisY || {
    min: baseScale?.yMin ?? 0,
    max: baseScale?.yMax ?? 10,
    step: baseScale ? Math.round((baseScale.yMax - baseScale.yMin) / 5) || 2 : 2,
    subDivs: 5,
    showTicks: true,
    showSubTicks: true,
    showLabels: true,
    insideTicks: true,
    fontFamily: 'Segoe UI, sans-serif',
    fontSize: 24,
    fontWeight: 400,
  }

  const syncWithU = existingDoc?.syncWithU ?? (existingDoc?.axisTop ? existingDoc.axisTop.isSynced !== false : true)
  const syncWithR = existingDoc?.syncWithR ?? (existingDoc?.axisRight ? existingDoc.axisRight.isSynced !== false : true)

  const axisTop: SmpAxisSpec = existingDoc?.axisTop || {
    ...axisX,
    showLabels: !syncWithU,
    isSynced: syncWithU,
  }

  const axisRight: SmpAxisSpec = existingDoc?.axisRight || {
    ...axisY,
    showLabels: !syncWithR,
    isSynced: syncWithR,
  }

  return {
    name: existingDoc?.name || defaultName,
    sourceVersion: existingDoc?.sourceVersion,
    nativeFormatVersion: existingDoc?.nativeFormatVersion,
    left,
    top,
    width,
    height,
    datasets,
    analyzeConstants: existingDoc?.analyzeConstants ? [...existingDoc.analyzeConstants] : undefined,
    analyzeLastAction: existingDoc?.analyzeLastAction,
    analyzeLastConfig: existingDoc?.analyzeLastConfig ? { ...existingDoc.analyzeLastConfig, params: { ...existingDoc.analyzeLastConfig.params } } : undefined,
    axisX,
    axisY,
    axisTop,
    axisRight,
    syncWithU,
    syncWithR,
    legendItems: existingDoc?.legendItems || [],
    annotationLines: existingDoc?.annotationLines || [],
    frameTitle: existingDoc?.frameTitle ? { ...existingDoc.frameTitle } : undefined,
    xLabel: existingDoc?.xLabel,
    yLabel: existingDoc?.yLabel,
    frameType: existingDoc?.frameType,
    graphFixed1: existingDoc?.graphFixed1,
    graphFixed2: existingDoc?.graphFixed2,
    frameWidth: existingDoc?.frameWidth,
    frameColor: existingDoc?.frameColor,
    frameBgColor: existingDoc?.frameBgColor,
    mergeZeroLabels: existingDoc?.mergeZeroLabels,
    othersZerosLine: existingDoc?.othersZerosLine,
    othersSymbolLine: existingDoc?.othersSymbolLine,
    pageSetupLine: existingDoc?.pageSetupLine,
    headerLines: existingDoc?.headerLines,
    rawMarker: existingDoc?.rawMarker,
    masksLines: existingDoc?.masksLines,
    legendRawObjects: existingDoc?.legendRawObjects,
  }
}

export function syncDocGeometry(svg: SVGSVGElement): void {
  const doc = svgSmpDocMap.get(svg)
  if (!doc) return

  const leftPx = styleNumber(svg.style.left, 40)
  const topPx = styleNumber(svg.style.top, 40)
  const widthPx = parseFloat(svg.style.width) || 500
  const heightPx = parseFloat(svg.style.height) || 350

  const frameLeft = leftPx + PLOT_MARGIN.l
  const frameTop = topPx + PLOT_MARGIN.t
  const frameWidth = Math.max(10, widthPx - PLOT_MARGIN.l - PLOT_MARGIN.r)
  const frameHeight = Math.max(10, heightPx - PLOT_MARGIN.t - PLOT_MARGIN.b)

  doc.left = Math.round(frameLeft / SMP_SCALE)
  doc.top = Math.round(frameTop / SMP_SCALE)
  doc.width = Math.round(frameWidth / SMP_SCALE)
  doc.height = Math.round(frameHeight / SMP_SCALE)
}

export function ensureSmpDoc(svg: SVGSVGElement): SmpPlotDoc {
  let doc = svgSmpDocMap.get(svg)
  if (!doc) {
    doc = exportPlotToSmpDoc(svg, svgSmpDocMap.get(svg)?.name || 'PLOT.SMP')
    svgSmpDocMap.set(svg, doc)
  }
  const base = svgBaseScaleMap.get(svg)
  const makeAxis = (min: number, max: number): SmpAxisSpec => ({
    min,
    max,
    step: Math.abs(max - min) / 5 || 2,
    subDivs: 5,
    showTicks: true,
    showSubTicks: true,
    showLabels: true,
    insideTicks: true,
    fontFamily: 'Segoe UI, sans-serif',
    fontSize: 24,
    fontWeight: 400,
  })
  if (!doc.axisX) {
    doc.axisX = makeAxis(base?.xMin ?? 0, base?.xMax ?? 10)
  }
  if (!doc.axisY) {
    doc.axisY = makeAxis(base?.yMin ?? 0, base?.yMax ?? 10)
  }
  if (doc.syncWithU === undefined) {
    doc.syncWithU = doc.axisTop ? doc.axisTop.isSynced !== false : true
  }
  if (doc.syncWithR === undefined) {
    doc.syncWithR = doc.axisRight ? doc.axisRight.isSynced !== false : true
  }
  if (!doc.axisTop) {
    doc.axisTop = { ...doc.axisX, showLabels: !doc.syncWithU, isSynced: doc.syncWithU }
  }
  if (!doc.axisRight) {
    doc.axisRight = { ...doc.axisY, showLabels: !doc.syncWithR, isSynced: doc.syncWithR }
  }
  return doc
}

export function getTargetPlotSvgs(specificSvg?: SVGSVGElement | null): SVGSVGElement[] {
  if (specificSvg && document.body.contains(specificSvg)) {
    return [specificSvg]
  }
  const multiSelected = getMultiSelectedSvgs()
  if (multiSelected.length > 0) {
    return multiSelected
  }
  const explicitSelected = getExplicitSelectedPlotSvg()
  if (explicitSelected && document.body.contains(explicitSelected)) {
    return [explicitSelected]
  }
  const fallbackSvg = getSelectedPlotSvg()
  if (fallbackSvg) {
    return [fallbackSvg]
  }
  return []
}

export function hasIndependentUAxis(svg: SVGSVGElement): boolean {
  const doc = svgSmpDocMap.get(svg)
  if (!doc) return false
  const synced = doc.syncWithU !== false && doc.axisX.isSynced !== false && (!doc.axisTop || doc.axisTop.isSynced !== false)
  return !synced
}

export function hasIndependentRAxis(svg: SVGSVGElement): boolean {
  const doc = svgSmpDocMap.get(svg)
  if (!doc) return false
  const synced = doc.syncWithR !== false && doc.axisY.isSynced !== false && (!doc.axisRight || doc.axisRight.isSynced !== false)
  return !synced
}

export function canClearAxis(kind: 'u' | 'r', specificSvg?: SVGSVGElement | null): boolean {
  const targets = getTargetPlotSvgs(specificSvg)
  if (targets.length === 0) return false
  const hasIndependent = kind === 'u' ? hasIndependentUAxis : hasIndependentRAxis
  return targets.some((svg) => hasIndependent(svg))
}

export function clearPlotScale(
  target: 'all' | 'x' | 'y' | 'u' | 'r' = 'all',
  specificSvg?: SVGSVGElement | null
): void {
  const targetSvgs = getTargetPlotSvgs(specificSvg)

  for (const svg of targetSvgs) {
    const doc = svgSmpDocMap.get(svg)
    const independentU = hasIndependentUAxis(svg)
    const independentR = hasIndependentRAxis(svg)
    const xLog = target === 'u' ? !!doc?.axisTop?.logScale : !!doc?.axisX.logScale
    const yLog = target === 'r' ? !!doc?.axisRight?.logScale : !!doc?.axisY.logScale
    const datasets = svgDataMap.get(svg) || []
    const processed = datasets.map((ds) => getProcessedDataset(ds))

    let xMin = Infinity
    let xMax = -Infinity
    let yMin = Infinity
    let yMax = -Infinity

    for (const ds of processed) {
      for (let i = 0; i < ds.x.length; i++) {
        const xv = ds.x[i]
        const yv = ds.y[i]
        if (Number.isFinite(xv) && (!xLog || xv > 0)) {
          if (xv < xMin) xMin = xv
          if (xv > xMax) xMax = xv
        }
        if (Number.isFinite(yv) && (!yLog || yv > 0)) {
          if (yv < yMin) yMin = yv
          if (yv > yMax) yMax = yv
        }
      }
    }

    if (xMin === Infinity || xMax === -Infinity) {
      const currentMin = target === 'u' ? doc?.axisTop?.min : doc?.axisX.min
      const currentMax = target === 'u' ? doc?.axisTop?.max : doc?.axisX.max
      const useCurrent = xLog && Number.isFinite(currentMin) && Number.isFinite(currentMax) && currentMin! > 0 && currentMax! > 0
      xMin = useCurrent ? currentMin! : xLog ? 0.1 : 0
      xMax = useCurrent ? currentMax! : 10
    }
    if (yMin === Infinity || yMax === -Infinity) {
      const currentMin = target === 'r' ? doc?.axisRight?.min : doc?.axisY.min
      const currentMax = target === 'r' ? doc?.axisRight?.max : doc?.axisY.max
      const useCurrent = yLog && Number.isFinite(currentMin) && Number.isFinite(currentMax) && currentMin! > 0 && currentMax! > 0
      yMin = useCurrent ? currentMin! : yLog ? 0.1 : 0
      yMax = useCurrent ? currentMax! : 10
    }
    if (yMin > 0 && !yLog) yMin = 0

    const rawXMin = xMin
    const rawXMax = xMax
    const rawYMin = yMin
    const rawYMax = yMax
    const xBounds = xLog ? niceLogAxisBounds(rawXMin, rawXMax) : niceAxisBounds(rawXMin, rawXMax)
    const yBounds = yLog ? niceLogAxisBounds(rawYMin, rawYMax) : niceAxisBounds(rawYMin, rawYMax)
    xMin = xBounds.min
    xMax = xBounds.max
    yMin = yBounds.min
    yMax = yBounds.max

    const updateAxis = (axis: SmpAxisSpec, rangeMin: number, rangeMax: number, rawMin: number, rawMax: number, logScale: boolean): void => {
      const reversed = axis.min > axis.max
      axis.min = reversed ? rangeMax : rangeMin
      axis.max = reversed ? rangeMin : rangeMax
      axis.autoStep = true
      if (logScale) {
        if (!Number.isFinite(axis.step) || Math.abs(axis.step) <= 0) axis.step = 1
      } else {
        const step = resolveAxisStep(rawMin, rawMax, axis.step, true, false)
        axis.step = step.increment
        axis.subDivs = step.division
      }
    }

    if (doc) {
      if (target === 'all' || target === 'x') {
        updateAxis(doc.axisX, xMin, xMax, rawXMin, rawXMax, !!doc.axisX.logScale)
        if (doc.syncWithU !== false && doc.axisTop) {
          doc.axisTop.min = doc.axisX.min
          doc.axisTop.max = doc.axisX.max
          doc.axisTop.step = doc.axisX.step
          doc.axisTop.subDivs = doc.axisX.subDivs
          doc.axisTop.autoStep = true
          doc.axisTop.logScale = doc.axisX.logScale
          doc.axisTop.scaleType = doc.axisX.scaleType
        }
      }
      if (target === 'all' || target === 'y') {
        updateAxis(doc.axisY, yMin, yMax, rawYMin, rawYMax, !!doc.axisY.logScale)
        if (doc.syncWithR !== false && doc.axisRight) {
          doc.axisRight.min = doc.axisY.min
          doc.axisRight.max = doc.axisY.max
          doc.axisRight.step = doc.axisY.step
          doc.axisRight.subDivs = doc.axisY.subDivs
          doc.axisRight.autoStep = true
          doc.axisRight.logScale = doc.axisY.logScale
          doc.axisRight.scaleType = doc.axisY.scaleType
        }
      }
      if (target === 'u' && doc.axisTop && independentU) {
        updateAxis(doc.axisTop, xMin, xMax, rawXMin, rawXMax, !!doc.axisTop.logScale)
      }
      if (target === 'r' && doc.axisRight && independentR) {
        updateAxis(doc.axisRight, yMin, yMax, rawYMin, rawYMax, !!doc.axisRight.logScale)
      }
    }

    const existing = svgBaseScaleMap.get(svg) || { xMin, xMax, yMin, yMax }
    if (target === 'all') {
      svgBaseScaleMap.set(svg, { xMin, xMax, yMin, yMax })
    } else if (target === 'x' || (target === 'u' && independentU)) {
      svgBaseScaleMap.set(svg, { ...existing, xMin, xMax })
    } else if (target === 'y' || (target === 'r' && independentR)) {
      svgBaseScaleMap.set(svg, { ...existing, yMin, yMax })
    }

    updatePlotVisual(svg)
  }
}

export function getPlotBaseScale(
  svg: SVGSVGElement
): { xMin: number; xMax: number; yMin: number; yMax: number } | undefined {
  return svgBaseScaleMap.get(svg)
}

export function setPlotBaseScale(
  svg: SVGSVGElement,
  base: { xMin: number; xMax: number; yMin: number; yMax: number } | null
): void {
  if (base === null) svgBaseScaleMap.delete(svg)
  else svgBaseScaleMap.set(svg, base)
}

export function makeDefaultPlotDoc(svg: SVGSVGElement): SmpPlotDoc {
  const leftPx = styleNumber(svg.style.left, 40)
  const topPx = styleNumber(svg.style.top, 40)
  const widthPx = parseFloat(svg.style.width) || 500
  const heightPx = parseFloat(svg.style.height) || 350

  const frameLeft = leftPx + PLOT_MARGIN.l
  const frameTop = topPx + PLOT_MARGIN.t
  const frameWidth = Math.max(10, widthPx - PLOT_MARGIN.l - PLOT_MARGIN.r)
  const frameHeight = Math.max(10, heightPx - PLOT_MARGIN.t - PLOT_MARGIN.b)

  const left = Math.round(frameLeft / SMP_SCALE)
  const top = Math.round(frameTop / SMP_SCALE)
  const width = Math.round(frameWidth / SMP_SCALE)
  const height = Math.round(frameHeight / SMP_SCALE)

  const defaultAxis = (): SmpAxisSpec => ({
    min: 0,
    max: 10,
    step: 2,
    subDivs: 5,
    autoStep: true,
    showTicks: true,
    showSubTicks: true,
    showLabels: true,
    insideTicks: true,
    fontFamily: 'Times New Roman',
    fontWeight: 400,
  })

  return {
    name: 'PLOT.SMP',
    left,
    top,
    width,
    height,
    datasets: [],
    axisX: defaultAxis(),
    axisY: defaultAxis(),
    legendItems: [],
    annotationLines: [],
  }
}