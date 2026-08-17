import type { Dataset } from '../../types.ts'
import { extractLinearParams, getDatasetRawMinMax } from './dataset.ts'
import { createOverlayEl } from './svg.ts'
import { getPlotOverlay } from './state.ts'
import { isReadValueMode, isTrimmingMode } from './modes.ts'
import { svgDataMap } from './state.ts'
import { updatePlotVisual } from './drawPlot.ts'

interface ActiveTransDrag {
  svg: SVGSVGElement
  dataset: Dataset
  dir: 'box' | 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  startX: number
  startY: number
  xTransActive: boolean
  yTransActive: boolean
  startXLinear: { a: number; b: number }
  startYLinear: { a: number; b: number }
  rawXMin: number
  rawXMax: number
  rawYMin: number
  rawYMax: number
  startXTransMin: number
  startXTransMax: number
  startYTransMin: number
  startYTransMax: number
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  plotW: number
  plotH: number
  margin: { l: number; r: number; t: number; b: number }
  boxGeoms: Array<{ el: HTMLElement; left: number; top: number; width: number; height: number }>
}

let activeTransDrag: ActiveTransDrag | null = null

export function getActiveTransDrag(): ActiveTransDrag | null {
  return activeTransDrag
}

export function clearActiveTransDrag(): void {
  activeTransDrag = null
}

let activePropertyTarget: { svg: SVGSVGElement; dataset?: Dataset } | null = null

export function isPropertyTabMode(): boolean {
  return activePropertyTarget !== null
}

export function setPropertyDialogTarget(target: { svg: SVGSVGElement; dataset?: Dataset } | null): void {
  const prevSvg = activePropertyTarget?.svg
  activePropertyTarget = target
  if (prevSvg && prevSvg !== target?.svg) {
    updatePlotVisual(prevSvg)
  }
}

function startTransformDrag(
  clientX: number,
  clientY: number,
  svg: SVGSVGElement,
  dataset: Dataset,
  dir: 'box' | 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right',
  xTransActive: boolean,
  yTransActive: boolean,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  plotW: number,
  plotH: number,
  margin: { l: number; r: number; t: number; b: number }
): void {
  const opts = dataset.options || {}
  const startXLinear = extractLinearParams(opts.xExpr || 'x', 'x')
  const startYLinear = extractLinearParams(opts.yExpr || 'y', 'y')

  const { rawXMin, rawXMax, rawYMin, rawYMax } = getDatasetRawMinMax(dataset)

  const xTrans1 = startXLinear.a * rawXMin + startXLinear.b
  const xTrans2 = startXLinear.a * rawXMax + startXLinear.b
  const startXTransMin = Math.min(xTrans1, xTrans2)
  const startXTransMax = Math.max(xTrans1, xTrans2)

  const yTrans1 = startYLinear.a * rawYMin + startYLinear.b
  const yTrans2 = startYLinear.a * rawYMax + startYLinear.b
  const startYTransMin = Math.min(yTrans1, yTrans2)
  const startYTransMax = Math.max(yTrans1, yTrans2)

  const boxGeoms: Array<{ el: HTMLElement; left: number; top: number; width: number; height: number }> = []
  getPlotOverlay(svg)
    .querySelectorAll<HTMLElement>('.ov-trans-box, .ov-trans-handle')
    .forEach((el) => {
      const left = parseFloat(el.style.left)
      const top = parseFloat(el.style.top)
      const width = parseFloat(el.style.width)
      const height = parseFloat(el.style.height)
      if (isNaN(left) || isNaN(top)) return
      boxGeoms.push({
        el,
        left,
        top,
        width: isNaN(width) ? 0 : width,
        height: isNaN(height) ? 0 : height,
      })
    })

  activeTransDrag = {
    svg,
    dataset,
    dir,
    startX: clientX,
    startY: clientY,
    xTransActive,
    yTransActive,
    startXLinear,
    startYLinear,
    rawXMin,
    rawXMax,
    rawYMin,
    rawYMax,
    startXTransMin,
    startXTransMax,
    startYTransMin,
    startYTransMax,
    xMin,
    xMax,
    yMin,
    yMax,
    plotW,
    plotH,
    margin,
    boxGeoms,
  }

  document.body.style.userSelect = 'none'
}

export function applyTransDragVisual(
  drag: ActiveTransDrag,
  newAx: number,
  newBx: number,
  newAy: number,
  newBy: number
): boolean {
  const {
    svg,
    dataset,
    xTransActive,
    yTransActive,
    startXLinear,
    startYLinear,
    margin,
    plotW,
    plotH,
    xMin,
    xMax,
    yMin,
    yMax,
  } = drag

  let mx = 1
  let my = 1
  let kx = 0
  let ky = 0

  if (xTransActive) {
    const aOld = startXLinear.a
    if (Math.abs(aOld) < 1e-9) return false
    mx = newAx / aOld
    const c = newBx - mx * startXLinear.b
    const sx = plotW / (xMax - xMin || 1)
    kx = (1 - mx) * (margin.l - xMin * sx) + c * sx
  }

  if (yTransActive) {
    const aOld = startYLinear.a
    if (Math.abs(aOld) < 1e-9) return false
    my = newAy / aOld
    const c = newBy - my * startYLinear.b
    const sy = plotH / (yMax - yMin || 1)
    ky = (1 - my) * (margin.t + plotH + yMin * sy) - c * sy
  }

  if (mx !== 1 || my !== 1 || kx !== 0 || ky !== 0) {
    const datasets = svgDataMap.get(svg) || []
    const idx = datasets.indexOf(dataset)
    if (idx >= 0) {
      const dsGroup = svg.querySelector<SVGGElement>(`g[data-series="${idx}"]`)
      if (dsGroup) {
        if (kx !== 0 || ky !== 0) dsGroup.setAttribute('transform', `translate(${kx}, ${ky})`)
        else dsGroup.removeAttribute('transform')
        const scaleGroup = dsGroup.querySelector<SVGGElement>('g[data-scale-group]')
        if (scaleGroup) {
          if (mx !== 1 || my !== 1) scaleGroup.setAttribute('transform', `scale(${mx}, ${my})`)
          else scaleGroup.removeAttribute('transform')
        }
      }
    }

    for (const g of drag.boxGeoms) {
      g.el.style.left = `${mx * g.left + kx}px`
      g.el.style.top = `${my * g.top + ky}px`
      if (g.el.classList.contains('ov-trans-box')) {
        g.el.style.width = `${mx * g.width}px`
        g.el.style.height = `${my * g.height}px`
      }
    }
  }

  return true
}

export function renderDatasetTransformOverlays(
  svg: SVGSVGElement,
  datasets: Dataset[],
  processedDatasets: Dataset[],
  plotW: number,
  plotH: number,
  margin: { l: number; r: number; t: number; b: number },
  sx: (v: number) => number,
  sy: (v: number) => number,
  su: (v: number) => number,
  sr: (v: number) => number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  uMin: number,
  uMax: number,
  rMin: number,
  rMax: number
): void {
  const ov = getPlotOverlay(svg)
  if (isTrimmingMode() || isReadValueMode() || !activePropertyTarget || activePropertyTarget.svg !== svg) return

  for (let dIdx = 0; dIdx < datasets.length; dIdx++) {
    const rawDs = datasets[dIdx]
    const procDs = processedDatasets[dIdx]
    if (!rawDs || !procDs) continue
    if (activePropertyTarget.dataset && rawDs !== activePropertyTarget.dataset) continue

    const opts = rawDs.options || {}
    const xTransActive = !!opts.xTransCheck
    const yTransActive = !!opts.yTransCheck

    if (!xTransActive && !yTransActive) continue

    const dsSx = opts.axisX === 'u' ? su : sx
    const dsSy = opts.axisY === 'r' ? sr : sy

    const effXMin = opts.axisX === 'u' ? uMin : xMin
    const effXMax = opts.axisX === 'u' ? uMax : xMax
    const effYMin = opts.axisY === 'r' ? rMin : yMin
    const effYMax = opts.axisY === 'r' ? rMax : yMax

    if (!procDs.x || procDs.x.length === 0 || !procDs.y || procDs.y.length === 0) continue

    let minPx = Infinity,
      maxPx = -Infinity
    let minPy = Infinity,
      maxPy = -Infinity

    for (let i = 0; i < procDs.x.length; i++) {
      const px = dsSx(procDs.x[i])
      const py = dsSy(procDs.y[i])
      if (!isNaN(px) && !isNaN(py)) {
        if (px < minPx) minPx = px
        if (px > maxPx) maxPx = px
        if (py < minPy) minPy = py
        if (py > maxPy) maxPy = py
      }
    }

    if (minPx === Infinity || maxPx === -Infinity || minPy === Infinity || maxPy === -Infinity) continue

    const boxLeft = minPx
    const boxTop = minPy
    const boxW = Math.max(12, maxPx - minPx)
    const boxH = Math.max(12, maxPy - minPy)

    const boxEl = createOverlayEl('ov-trans-box')
    boxEl.style.left = `${boxLeft}px`
    boxEl.style.top = `${boxTop}px`
    boxEl.style.width = `${boxW}px`
    boxEl.style.height = `${boxH}px`

    if (xTransActive && yTransActive) {
      boxEl.style.cursor = 'move'
    } else if (yTransActive) {
      boxEl.style.cursor = 'ns-resize'
    } else {
      boxEl.style.cursor = 'ew-resize'
    }

    const exprParts: string[] = []
    if (xTransActive) exprParts.push(`X: ${opts.xExpr || 'x'}`)
    if (yTransActive) exprParts.push(`Y: ${opts.yExpr || 'y'}`)
    const exprText = exprParts.join(' | ')
    boxEl.title = `Transform (${exprText}) — Drag to translate, drag handles to resize`

    boxEl.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button !== 0) return
      e.stopPropagation()
      e.preventDefault()
      startTransformDrag(
        e.clientX,
        e.clientY,
        svg,
        rawDs,
        'box',
        xTransActive,
        yTransActive,
        effXMin,
        effXMax,
        effYMin,
        effYMax,
        plotW,
        plotH,
        margin
      )
    })

    boxEl.addEventListener(
      'touchstart',
      (e: TouchEvent) => {
        if (e.touches.length !== 1) return
        e.preventDefault()
        e.stopPropagation()
        startTransformDrag(
          e.touches[0].clientX,
          e.touches[0].clientY,
          svg,
          rawDs,
          'box',
          xTransActive,
          yTransActive,
          effXMin,
          effXMax,
          effYMin,
          effYMax,
          plotW,
          plotH,
          margin
        )
      },
      { passive: false }
    )

    ov.appendChild(boxEl)

    const addHandle = (
      hx: number,
      hy: number,
      dir: 'top' | 'bottom' | 'left' | 'right',
      orientation: 'h' | 'v'
    ) => {
      const isHorizontal = orientation === 'h'
      const hw = isHorizontal ? 10 : 5
      const hh = isHorizontal ? 5 : 10
      const cursor = isHorizontal ? 'ns-resize' : 'ew-resize'

      const handle = createOverlayEl(`ov-trans-handle ov-trans-handle-${orientation}`)
      handle.style.left = `${hx - hw / 2}px`
      handle.style.top = `${hy - hh / 2}px`
      handle.style.width = `${hw}px`
      handle.style.height = `${hh}px`
      handle.style.cursor = cursor
      handle.setAttribute('data-trans-dir', dir)
      handle.title = `Scale ${dir.toUpperCase()} (${exprText})`

      handle.addEventListener('mousedown', (e: MouseEvent) => {
        if (e.button !== 0) return
        e.stopPropagation()
        e.preventDefault()
        startTransformDrag(
          e.clientX,
          e.clientY,
          svg,
          rawDs,
          dir,
          xTransActive,
          yTransActive,
          effXMin,
          effXMax,
          effYMin,
          effYMax,
          plotW,
          plotH,
          margin
        )
      })

      handle.addEventListener(
        'touchstart',
        (e: TouchEvent) => {
          if (e.touches.length !== 1) return
          e.preventDefault()
          e.stopPropagation()
          startTransformDrag(
            e.touches[0].clientX,
            e.touches[0].clientY,
            svg,
            rawDs,
            dir,
            xTransActive,
            yTransActive,
            effXMin,
            effXMax,
            effYMin,
            effYMax,
            plotW,
            plotH,
            margin
          )
        },
        { passive: false }
      )

      ov.appendChild(handle)
    }

    if (yTransActive) {
      addHandle(boxLeft + boxW / 2, boxTop, 'top', 'h')
      addHandle(boxLeft + boxW / 2, boxTop + boxH, 'bottom', 'h')
    }
    if (xTransActive) {
      addHandle(boxLeft, boxTop + boxH / 2, 'left', 'v')
      addHandle(boxLeft + boxW, boxTop + boxH / 2, 'right', 'v')
    }
  }
}