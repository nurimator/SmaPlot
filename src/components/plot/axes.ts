import type { SmpAxisSpec } from '../../types.ts'
import { getLogAxisTicks, resolveAxisStep } from '../../utils/scale.ts'
import {
  axisLabelExponent,
  formatAxisValue,
  logDecadeExponent,
  readAxisLabelFormat,
  selectAxisLabelIndices,
} from '../../utils/axisLabels.ts'

import { createSVGElement, PX_PER_MM, ptToPx } from './svg.ts'
import { getLineDashArray } from './symbols.ts'
import type { PlotRenderContext } from './svg.ts'

type LabelRun = { text: string; sup?: boolean }

interface AxisLabelPlan {
  labels: Map<number, LabelRun[]>
  exponent: number
  showExponent: boolean
}

function planAxisLabels(
  spec: SmpAxisSpec | undefined,
  ticks: number[],
  min: number,
  max: number,
  isLog: boolean,
  skipZero: boolean
): AxisLabelPlan {
  const format = readAxisLabelFormat(spec)
  const decadeOnly = isLog && spec?.scaleType === 1
  const exponent = isLog ? 0 : axisLabelExponent(min, max, format)
  const counted = ticks.filter((v) => !(skipZero && v === 0))
  const picked = selectAxisLabelIndices(counted.length, format)
  const labels = new Map<number, LabelRun[]>()
  counted.forEach((v, index) => {
    if (!picked.has(index)) return
    if (decadeOnly) {
      const decade = logDecadeExponent(v)
      if (decade !== null) labels.set(v, [{ text: '10' }, { text: String(decade), sup: true }])
      return
    }
    labels.set(v, [{ text: formatAxisValue(v, format, exponent) }])
  })
  return { labels, exponent, showExponent: format.drawExponent && exponent !== 0 && !decadeOnly && labels.size > 0 }
}

function applyGridDash(path: SVGElement, style: string, widthPx: number, rawPitch: string | undefined): void {
  const pitchMm = parseFloat(rawPitch || '') / 100
  const dash = getLineDashArray(style, widthPx, (Number.isFinite(pitchMm) && pitchMm > 0 ? pitchMm : 3) * PX_PER_MM)
  if (dash !== 'none') path.setAttribute('stroke-dasharray', dash)
}

function setLabelRuns(el: SVGElement, runs: LabelRun[]): void {
  if (runs.length === 1 && !runs[0].sup) {
    el.textContent = runs[0].text
    return
  }
  el.textContent = ''
  for (const run of runs) {
    const span = createSVGElement('tspan')
    if (run.sup) {
      span.setAttribute('baseline-shift', 'super')
      span.setAttribute('font-size', '70%')
    }
    span.textContent = run.text
    el.appendChild(span)
  }
}

const LABEL_CHAR_EM: Record<string, number> = { '.': 0.25, ',': 0.25, '-': 0.333, '+': 0.564, ' ': 0.25 }

function planLabelWidth(plan: AxisLabelPlan, fontSize: number): number {
  let widest = 0
  plan.labels.forEach((runs) => {
    let em = 0
    for (const run of runs) {
      for (const ch of run.text) em += (LABEL_CHAR_EM[ch] ?? 0.5) * (run.sup ? 0.7 : 1)
    }
    widest = Math.max(widest, em)
  })
  return widest * fontSize
}

function exponentRuns(exponent: number): LabelRun[] {
  return [{ text: '[×10' }, { text: String(-exponent), sup: true }, { text: ']' }]
}

export function renderAxes(ctx: PlotRenderContext): void {
  const { svg, margin, plotW, plotH, scaleX, scaleY, sx, sy, smpDoc } = ctx

  const appendExponentLabel = (
    frag: DocumentFragment,
    plan: AxisLabelPlan,
    x: number,
    y: number,
    anchor: 'start' | 'end',
    baseline: 'hanging' | 'auto',
    fontSize: number,
    fontFamily: string,
    color: string
  ): void => {
    if (!plan.showExponent) return
    const label = createSVGElement('text')
    label.setAttribute('x', String(x))
    label.setAttribute('y', String(y))
    label.setAttribute('text-anchor', anchor)
    label.setAttribute('dominant-baseline', baseline)
    label.setAttribute('font-size', String(fontSize))
    label.setAttribute('font-family', fontFamily)
    label.setAttribute('fill', color)
    setLabelRuns(label, exponentRuns(plan.exponent))
    frag.appendChild(label)
  }
  const getMajorTicks = (minVal: number, maxVal: number, stepVal: number): number[] => {
    const ticks: number[] = []
    if (stepVal <= 0) return [minVal, maxVal]
    const isRev = minVal > maxVal
    const startB = isRev ? maxVal : minVal
    const endB = isRev ? minVal : maxVal
    let startT = Math.ceil(startB / stepVal) * stepVal
    if (Math.abs(startB) < 1e-9) startT = 0
    const eps = stepVal * 1e-6
    for (let v = startT; v <= endB + eps; v += stepVal) {
      const cleanV = parseFloat(v.toPrecision(12))
      if (cleanV >= startB - eps && cleanV <= endB + eps) {
        ticks.push(cleanV)
      }
    }
    return ticks
  }

  const getMinorTicks = (minVal: number, maxVal: number, stepVal: number, divs: number, majors: number[]): number[] => {
    const minors: number[] = []
    if (divs <= 1 || stepVal <= 0) return minors
    const isRev = minVal > maxVal
    const startB = isRev ? maxVal : minVal
    const endB = isRev ? minVal : maxVal
    const subStep = stepVal / divs
    let startSub = Math.ceil(startB / subStep) * subStep
    if (Math.abs(startB) < 1e-9) startSub = 0
    const eps = subStep * 1e-5
    for (let v = startSub; v <= endB + eps; v += subStep) {
      const cleanV = parseFloat(v.toPrecision(12))
      if (cleanV >= startB - eps && cleanV <= endB + eps) {
        const isMajor = majors.some((m) => Math.abs(m - cleanV) < eps)
        if (!isMajor) {
          minors.push(cleanV)
        }
      }
    }
    return minors
  }

  const getAxisTicks = (
    minVal: number,
    maxVal: number,
    stepVal: number,
    divs: number,
    logScale: boolean,
    showSubTicks: boolean
  ): { major: number[]; minor: number[] } => {
    if (logScale) return getLogAxisTicks(minVal, maxVal, showSubTicks, stepVal)
    const major = getMajorTicks(minVal, maxVal, stepVal)
    return {
      major,
      minor: showSubTicks ? getMinorTicks(minVal, maxVal, stepVal, divs, major) : [],
    }
  }

  // --- AXIS-0 (Bottom / X) ---

  const frameType = smpDoc?.frameType ?? 1
  const isSection = frameType === 0
  const isFramePlain = frameType === 2
  const isAxisMode = frameType === 3
  const suppressTopRight = isFramePlain || isAxisMode
  const subDivsX = ctx.autoSubDivsX !== null ? ctx.autoSubDivsX : smpDoc?.axisX.subDivs || 5
  const xTickValues = getAxisTicks(
    ctx.xMin,
    ctx.xMax,
    ctx.xStep,
    subDivsX,
    ctx.xValueScale.kind === 'log',
    smpDoc?.axisX.showSubTicks !== false
  )
  const xMajorTicks = xTickValues.major
  const xMinorTicks = xTickValues.minor

  const xFontFamily = smpDoc?.axisX.fontFamily || 'Times New Roman, Segoe UI, sans-serif'
  const xRenderFontSize = ptToPx(smpDoc?.axisX.fontSize || 24)
  const xFontWeight = smpDoc?.axisX.fontWeight || 400
  const xFontStyle = smpDoc?.axisX.fontStyle || 'regular'
  const xLabelColor = smpDoc?.axisX.labelColor || '#000000'
  const xShiftRight = (smpDoc?.axisX.shiftRight || 0) * scaleX
  const xShiftDown = (smpDoc?.axisX.shiftDown || 0) * scaleY

  const showXTicks = smpDoc?.axisX.showTicks !== false
  const showXLabels = showXTicks && (smpDoc?.axisX.showLabels !== false)

  const mergeZero = !!smpDoc?.mergeZeroLabels && ctx.xMin === 0 && ctx.yMin === 0 && showXLabels

  const xMajIn = smpDoc?.axisX.majorIn ?? (smpDoc?.axisX.insideTicks !== false)
  const xMajOut = smpDoc?.axisX.majorOut ?? false
  const xMajLen = smpDoc?.axisX.majorLength ?? 6
  const xMajW = Math.max(0.4, Number(((smpDoc?.axisX.majorWidth ?? 0.4) * scaleX).toFixed(2)))
  const xMajColor = smpDoc?.axisX.majorColor || '#000000'
  const xMajStyle = smpDoc?.axisX.majorStyle || 'solid'

  const xMinIn = smpDoc?.axisX.minorIn ?? (smpDoc?.axisX.insideTicks !== false)
  const xMinOut = smpDoc?.axisX.minorOut ?? false
  const xMinLen = smpDoc?.axisX.minorLength ?? 3
  const xMinW = Math.max(0.4, Number(((smpDoc?.axisX.minorWidth ?? 0.4) * scaleX).toFixed(2)))
  const xMinColor = smpDoc?.axisX.minorColor || '#000000'
  const xMinStyle = smpDoc?.axisX.minorStyle || 'solid'

  const bottomY = margin.t + plotH
  const topY = margin.t
  const zeroY = sy(0)
  const yLo = Math.min(ctx.yMin, ctx.yMax)
  const yHi = Math.max(ctx.yMin, ctx.yMax)
  const axisXBaseY = isAxisMode
    ? (yLo <= 0 && yHi >= 0 ? zeroY : yLo > 0 ? bottomY : topY)
    : bottomY

  let xTickPathD = ''
  let xSubTickPathD = ''
  const xLabelFrag = document.createDocumentFragment()

  if (showXTicks) {
    xMajorTicks.forEach((v) => {
      const px = sx(v)
      if (px >= margin.l - 0.5 && px <= margin.l + plotW + 0.5) {
        const bYStart = xMajOut ? axisXBaseY + xMajLen : axisXBaseY
        const bYEnd = isSection ? (xMajIn ? topY : axisXBaseY) : (xMajIn ? axisXBaseY - xMajLen : axisXBaseY)
        if (xMajIn || xMajOut) {
          xTickPathD += `M${px} ${bYStart}V${bYEnd}`
        }
      }
    })

    xMinorTicks.forEach((v) => {
      const px = sx(v)
      if (px >= margin.l - 0.5 && px <= margin.l + plotW + 0.5) {
        const bYStart = xMinOut ? axisXBaseY + xMinLen : axisXBaseY
        const bYEnd = isSection ? (xMinIn ? topY : axisXBaseY) : (xMinIn ? axisXBaseY - xMinLen : axisXBaseY)
        if (xMinIn || xMinOut) {
          xSubTickPathD += `M${px} ${bYStart}V${bYEnd}`
        }
      }
    })
  }

  const xPlan = planAxisLabels(smpDoc?.axisX, xMajorTicks, ctx.xMin, ctx.xMax, ctx.xValueScale.kind === 'log', mergeZero)
  if (showXLabels) {
    xMajorTicks.forEach((v) => {
      const runs = xPlan.labels.get(v)
      if (!runs) return
      const px = sx(v)
      if (px >= margin.l - 2 && px <= margin.l + plotW + 2) {
        const label = createSVGElement('text')
        label.setAttribute('x', String(px + xShiftRight))
        label.setAttribute('y', String(axisXBaseY + xShiftDown + xRenderFontSize))
        label.setAttribute('text-anchor', 'middle')
        label.setAttribute('dominant-baseline', 'text-after-edge')
        label.setAttribute('font-size', String(xRenderFontSize))
        label.setAttribute('font-family', xFontFamily)
        if (xFontStyle === 'italic') label.setAttribute('font-style', 'italic')
        if (xFontStyle === 'bold' || xFontWeight >= 600) label.setAttribute('font-weight', 'bold')
        label.setAttribute('fill', xLabelColor)
        setLabelRuns(label, runs)
        xLabelFrag.appendChild(label)
      }
    })
    appendExponentLabel(
      xLabelFrag, xPlan, margin.l + plotW + xShiftRight, axisXBaseY + xShiftDown + xRenderFontSize * 1.2,
      'end', 'hanging', xRenderFontSize, xFontFamily, xLabelColor
    )
  }

  if (xTickPathD) {
    const xTickPath = createSVGElement('path')
    xTickPath.setAttribute('d', xTickPathD)
    xTickPath.setAttribute('stroke', xMajColor)
    xTickPath.setAttribute('stroke-width', String(xMajW))
    xTickPath.setAttribute('stroke-linecap', 'butt')
    if (isSection) {
      applyGridDash(xTickPath, xMajStyle, xMajW, smpDoc?.axisX?.rawMajorTickMid)
    }
    xTickPath.setAttribute('fill', 'none')
    svg.appendChild(xTickPath)
  }
  if (xSubTickPathD) {
    const xSubTickPath = createSVGElement('path')
    xSubTickPath.setAttribute('d', xSubTickPathD)
    xSubTickPath.setAttribute('stroke', xMinColor)
    xSubTickPath.setAttribute('stroke-width', String(xMinW))
    xSubTickPath.setAttribute('stroke-linecap', 'butt')
    if (isSection) {
      applyGridDash(xSubTickPath, xMinStyle, xMinW, smpDoc?.axisX?.rawMinorTickMid)
    }
    xSubTickPath.setAttribute('fill', 'none')
    svg.appendChild(xSubTickPath)
  }
  svg.appendChild(xLabelFrag)

  // --- AXIS-2 (Top / U) ---
  const uSpec = smpDoc?.axisTop || smpDoc?.axisX
  let uMin = ctx.uMin
  let uMax = ctx.uMax
  let subDivsU = subDivsX
  let uTickValues = getAxisTicks(
    uMin,
    uMax,
    ctx.xStep,
    subDivsU,
    ctx.uValueScale.kind === 'log',
    uSpec?.showSubTicks !== false
  )
  let uMajorTicks = uTickValues.major
  let uMinorTicks = uTickValues.minor
  let showUTicks = suppressTopRight ? false : (smpDoc?.axisTop?.showTicks ?? showXTicks)
  let showULabels = false

  if (!suppressTopRight && !ctx.syncWithU && smpDoc?.axisTop) {
    uMin = smpDoc.axisTop.min ?? 0
    uMax = smpDoc.axisTop.max ?? 100
    const logScale = smpDoc.axisTop.logScale === true
    const stepResult = resolveAxisStep(
      uMin,
      uMax,
      Math.abs(smpDoc.axisTop.step || 0),
      smpDoc.axisTop.autoStep === true,
      logScale
    )
    subDivsU = stepResult.automatic ? stepResult.division : (smpDoc.axisTop.subDivs || 5)
    uTickValues = getAxisTicks(
      uMin,
      uMax,
      stepResult.increment,
      subDivsU,
      logScale,
      smpDoc.axisTop.showSubTicks !== false
    )
    uMajorTicks = uTickValues.major
    uMinorTicks = uTickValues.minor
    showUTicks = smpDoc.axisTop.showTicks !== false
    showULabels = showUTicks && (smpDoc.axisTop.showLabels !== false)
  }

  const su = ctx.uValueScale.valueToPixel

  const uFontFamily = uSpec?.fontFamily || xFontFamily
  const uRenderFontSize = ptToPx(uSpec?.fontSize || 24)
  const uFontWeight = uSpec?.fontWeight || 400
  const uFontStyle = uSpec?.fontStyle || 'regular'
  const uLabelColor = uSpec?.labelColor || '#000000'
  const uShiftRight = (uSpec?.shiftRight || 0) * scaleX
  const uShiftDown = (uSpec?.shiftDown || 0) * scaleY

  const uMajIn = uSpec?.majorIn ?? (uSpec?.insideTicks !== false)
  const uMajOut = uSpec?.majorOut ?? false
  const uMajLen = uSpec?.majorLength ?? 6
  const uMajW = Math.max(0.4, Number(((uSpec?.majorWidth ?? 0.4) * scaleX).toFixed(2)))
  const uMajColor = uSpec?.majorColor || '#000000'
  const uMajStyle = uSpec?.majorStyle || 'solid'

  const uMinIn = uSpec?.minorIn ?? (uSpec?.insideTicks !== false)
  const uMinOut = uSpec?.minorOut ?? false
  const uMinLen = uSpec?.minorLength ?? 3
  const uMinW = Math.max(0.4, Number(((uSpec?.minorWidth ?? 0.4) * scaleX).toFixed(2)))
  const uMinColor = uSpec?.minorColor || '#000000'
  const uMinStyle = uSpec?.minorStyle || 'solid'

  let uTickPathD = ''
  let uSubTickPathD = ''
  const uLabelFrag = document.createDocumentFragment()

  if (showUTicks) {
    uMajorTicks.forEach((v) => {
      const px = su(v)
      if (px >= margin.l - 0.5 && px <= margin.l + plotW + 0.5) {
        if (isSection && ctx.syncWithU) {
          if (uMajOut) {
            uTickPathD += `M${px} ${topY - uMajLen}V${topY}`
          }
        } else {
          const tYStart = uMajOut ? topY - uMajLen : topY
          const tYEnd = uMajIn ? topY + uMajLen : topY
          if (uMajIn || uMajOut) {
            uTickPathD += `M${px} ${tYStart}V${tYEnd}`
          }
        }
      }
    })

    uMinorTicks.forEach((v) => {
      const px = su(v)
      if (px >= margin.l - 0.5 && px <= margin.l + plotW + 0.5) {
        if (isSection && ctx.syncWithU) {
          if (uMinOut) {
            uSubTickPathD += `M${px} ${topY - uMinLen}V${topY}`
          }
        } else {
          const tYStart = uMinOut ? topY - uMinLen : topY
          const tYEnd = uMinIn ? topY + uMinLen : topY
          if (uMinIn || uMinOut) {
            uSubTickPathD += `M${px} ${tYStart}V${tYEnd}`
          }
        }
      }
    })
  }

  const uPlan = planAxisLabels(uSpec, uMajorTicks, uMin, uMax, ctx.uValueScale.kind === 'log', false)
  if (showULabels) {
    uMajorTicks.forEach((v) => {
      const runs = uPlan.labels.get(v)
      if (!runs) return
      const px = su(v)
      if (px >= margin.l - 2 && px <= margin.l + plotW + 2) {
        const label = createSVGElement('text')
        label.setAttribute('x', String(px + uShiftRight))
        label.setAttribute('y', String(topY + uShiftDown))
        label.setAttribute('text-anchor', 'middle')
        label.setAttribute('dominant-baseline', 'text-after-edge')
        label.setAttribute('font-size', String(uRenderFontSize))
        label.setAttribute('font-family', uFontFamily)
        if (uFontStyle === 'italic') label.setAttribute('font-style', 'italic')
        if (uFontStyle === 'bold' || uFontWeight >= 600) label.setAttribute('font-weight', 'bold')
        label.setAttribute('fill', uLabelColor)
        setLabelRuns(label, runs)
        uLabelFrag.appendChild(label)
      }
    })
    appendExponentLabel(
      uLabelFrag, uPlan, margin.l + plotW + uShiftRight, topY - 4 + uShiftDown - uRenderFontSize * 1.2,
      'end', 'auto', uRenderFontSize, uFontFamily, uLabelColor
    )
  }

  if (uTickPathD) {
    const uTickPath = createSVGElement('path')
    uTickPath.setAttribute('d', uTickPathD)
    uTickPath.setAttribute('stroke', uMajColor)
    uTickPath.setAttribute('stroke-width', String(uMajW))
    uTickPath.setAttribute('stroke-linecap', 'butt')
    if (isSection) {
      applyGridDash(uTickPath, uMajStyle, uMajW, uSpec?.rawMajorTickMid)
    }
    uTickPath.setAttribute('fill', 'none')
    svg.appendChild(uTickPath)
  }
  if (uSubTickPathD) {
    const uSubTickPath = createSVGElement('path')
    uSubTickPath.setAttribute('d', uSubTickPathD)
    uSubTickPath.setAttribute('stroke', uMinColor)
    uSubTickPath.setAttribute('stroke-width', String(uMinW))
    uSubTickPath.setAttribute('stroke-linecap', 'butt')
    if (isSection) {
      applyGridDash(uSubTickPath, uMinStyle, uMinW, uSpec?.rawMinorTickMid)
    }
    uSubTickPath.setAttribute('fill', 'none')
    svg.appendChild(uSubTickPath)
  }
  svg.appendChild(uLabelFrag)

  ctx.su = su
  ctx.uMin = uMin
  ctx.uMax = uMax

  // --- AXIS-1 (Left / Y) ---
  const subDivsY = ctx.autoSubDivsY !== null ? ctx.autoSubDivsY : smpDoc?.axisY.subDivs || 5
  const yTickValues = getAxisTicks(
    ctx.yMin,
    ctx.yMax,
    ctx.yStep,
    subDivsY,
    ctx.yValueScale.kind === 'log',
    smpDoc?.axisY.showSubTicks !== false
  )
  const yMajorTicks = yTickValues.major
  const yMinorTicks = yTickValues.minor

  const yFontFamily = smpDoc?.axisY.fontFamily || 'Times New Roman, Segoe UI, sans-serif'
  const yRenderFontSize = ptToPx(smpDoc?.axisY.fontSize || 24)
  const yFontWeight = smpDoc?.axisY.fontWeight || 400
  const yFontStyle = smpDoc?.axisY.fontStyle || 'regular'
  const yLabelColor = smpDoc?.axisY.labelColor || '#000000'
  const yShiftRight = (smpDoc?.axisY.shiftRight || 0) * scaleX
  const yShiftDown = (smpDoc?.axisY.shiftDown || 0) * scaleY

  const showYTicks = smpDoc?.axisY.showTicks !== false
  const showYLabels = showYTicks && (smpDoc?.axisY.showLabels !== false)

  const yMajIn = smpDoc?.axisY.majorIn ?? (smpDoc?.axisY.insideTicks !== false)
  const yMajOut = smpDoc?.axisY.majorOut ?? false
  const yMajLen = smpDoc?.axisY.majorLength ?? 6
  const yMajW = Math.max(0.4, Number(((smpDoc?.axisY.majorWidth ?? 0.4) * scaleX).toFixed(2)))
  const yMajColor = smpDoc?.axisY.majorColor || '#000000'
  const yMajStyle = smpDoc?.axisY.majorStyle || 'solid'

  const yMinIn = smpDoc?.axisY.minorIn ?? (smpDoc?.axisY.insideTicks !== false)
  const yMinOut = smpDoc?.axisY.minorOut ?? false
  const yMinLen = smpDoc?.axisY.minorLength ?? 3
  const yMinW = Math.max(0.4, Number(((smpDoc?.axisY.minorWidth ?? 0.4) * scaleX).toFixed(2)))
  const yMinColor = smpDoc?.axisY.minorColor || '#000000'
  const yMinStyle = smpDoc?.axisY.minorStyle || 'solid'

  const leftX = margin.l
  const rightX = margin.l + plotW
  const zeroX = sx(0)
  const xLo = Math.min(ctx.xMin, ctx.xMax)
  const xHi = Math.max(ctx.xMin, ctx.xMax)
  const axisYBaseX = isAxisMode
    ? (xLo <= 0 && xHi >= 0 ? zeroX : xLo > 0 ? leftX : rightX)
    : leftX

  let yTickPathD = ''
  let ySubTickPathD = ''
  const yLabelFrag = document.createDocumentFragment()

  if (showYTicks) {
    yMajorTicks.forEach((v) => {
      const py = sy(v)
      if (py >= margin.t - 0.5 && py <= margin.t + plotH + 0.5) {
        const lXStart = yMajOut ? axisYBaseX - yMajLen : axisYBaseX
        const lXEnd = isSection ? (yMajIn ? rightX : axisYBaseX) : (yMajIn ? axisYBaseX + yMajLen : axisYBaseX)
        if (yMajIn || yMajOut) {
          yTickPathD += `M${lXStart} ${py}H${lXEnd}`
        }
      }
    })

    yMinorTicks.forEach((v) => {
      const py = sy(v)
      if (py >= margin.t - 0.5 && py <= margin.t + plotH + 0.5) {
        const lXStart = yMinOut ? axisYBaseX - yMinLen : axisYBaseX
        const lXEnd = isSection ? (yMinIn ? rightX : axisYBaseX) : (yMinIn ? axisYBaseX + yMinLen : axisYBaseX)
        if (yMinIn || yMinOut) {
          ySubTickPathD += `M${lXStart} ${py}H${lXEnd}`
        }
      }
    })
  }

  const shareZero = !!smpDoc?.mergeZeroLabels && ctx.xMin === 0 && ctx.yMin === 0 && showXLabels
  const yPlan = planAxisLabels(smpDoc?.axisY, yMajorTicks, ctx.yMin, ctx.yMax, ctx.yValueScale.kind === 'log', shareZero)
  if (showYLabels) {
    yMajorTicks.forEach((v) => {
      const runs = yPlan.labels.get(v)
      if (!runs) return
      const py = sy(v)
      if (py >= margin.t - 2 && py <= margin.t + plotH + 2) {
        const label = createSVGElement('text')
        label.setAttribute('x', String(axisYBaseX + yShiftRight))
        label.setAttribute('y', String(py + yRenderFontSize / 2 + yShiftDown))
        label.setAttribute('text-anchor', 'end')
        label.setAttribute('dominant-baseline', 'text-after-edge')
        label.setAttribute('font-size', String(yRenderFontSize))
        label.setAttribute('font-family', yFontFamily)
        if (yFontStyle === 'italic') label.setAttribute('font-style', 'italic')
        if (yFontStyle === 'bold' || yFontWeight >= 600) label.setAttribute('font-weight', 'bold')
        label.setAttribute('fill', yLabelColor)
        setLabelRuns(label, runs)
        yLabelFrag.appendChild(label)
      }
    })
    appendExponentLabel(
      yLabelFrag, yPlan, axisYBaseX + yShiftRight - planLabelWidth(yPlan, yRenderFontSize) - yRenderFontSize * 0.15,
      topY + yRenderFontSize * 0.75 + yShiftDown, 'end', 'auto', yRenderFontSize, yFontFamily, yLabelColor
    )

    if (mergeZero) {
      const zLabel = createSVGElement('text')
      zLabel.setAttribute('x', String(axisYBaseX + yShiftRight))
      zLabel.setAttribute('y', String(axisXBaseY + xShiftDown + xRenderFontSize))
      zLabel.setAttribute('text-anchor', 'end')
      zLabel.setAttribute('dominant-baseline', 'text-after-edge')
      zLabel.setAttribute('font-size', String(yRenderFontSize))
      zLabel.setAttribute('font-family', yFontFamily)
      if (yFontStyle === 'italic') zLabel.setAttribute('font-style', 'italic')
      if (yFontStyle === 'bold' || yFontWeight >= 600) zLabel.setAttribute('font-weight', 'bold')
      zLabel.setAttribute('fill', yLabelColor)
      zLabel.textContent = formatAxisValue(0, readAxisLabelFormat(smpDoc?.axisY))
      yLabelFrag.appendChild(zLabel)
    }
  }

  if (yTickPathD) {
    const yTickPath = createSVGElement('path')
    yTickPath.setAttribute('d', yTickPathD)
    yTickPath.setAttribute('stroke', yMajColor)
    yTickPath.setAttribute('stroke-width', String(yMajW))
    yTickPath.setAttribute('stroke-linecap', 'butt')
    if (isSection) {
      applyGridDash(yTickPath, yMajStyle, yMajW, smpDoc?.axisY?.rawMajorTickMid)
    }
    yTickPath.setAttribute('fill', 'none')
    svg.appendChild(yTickPath)
  }
  if (ySubTickPathD) {
    const ySubTickPath = createSVGElement('path')
    ySubTickPath.setAttribute('d', ySubTickPathD)
    ySubTickPath.setAttribute('stroke', yMinColor)
    ySubTickPath.setAttribute('stroke-width', String(yMinW))
    ySubTickPath.setAttribute('stroke-linecap', 'butt')
    if (isSection) {
      applyGridDash(ySubTickPath, yMinStyle, yMinW, smpDoc?.axisY?.rawMinorTickMid)
    }
    ySubTickPath.setAttribute('fill', 'none')
    svg.appendChild(ySubTickPath)
  }
  svg.appendChild(yLabelFrag)

  // --- AXIS-3 (Right / R) ---
  const rSpec = smpDoc?.axisRight || smpDoc?.axisY
  let rMin = ctx.rMin
  let rMax = ctx.rMax
  let subDivsR = subDivsY
  let rTickValues = getAxisTicks(
    rMin,
    rMax,
    ctx.yStep,
    subDivsR,
    ctx.rValueScale.kind === 'log',
    rSpec?.showSubTicks !== false
  )
  let rMajorTicks = rTickValues.major
  let rMinorTicks = rTickValues.minor
  let showRTicks = suppressTopRight ? false : (smpDoc?.axisRight?.showTicks ?? showYTicks)
  let showRLabels = false

  if (!suppressTopRight && !ctx.syncWithR && smpDoc?.axisRight) {
    rMin = smpDoc.axisRight.min ?? 0
    rMax = smpDoc.axisRight.max ?? 100
    const logScale = smpDoc.axisRight.logScale === true
    const stepResult = resolveAxisStep(
      rMin,
      rMax,
      Math.abs(smpDoc.axisRight.step || 0),
      smpDoc.axisRight.autoStep === true,
      logScale
    )
    subDivsR = stepResult.automatic ? stepResult.division : (smpDoc.axisRight.subDivs || 5)
    rTickValues = getAxisTicks(
      rMin,
      rMax,
      stepResult.increment,
      subDivsR,
      logScale,
      smpDoc.axisRight.showSubTicks !== false
    )
    rMajorTicks = rTickValues.major
    rMinorTicks = rTickValues.minor
    showRTicks = smpDoc.axisRight.showTicks !== false
    showRLabels = showRTicks && (smpDoc.axisRight.showLabels !== false)
  }

  const sr = ctx.rValueScale.valueToPixel

  const rFontFamily = rSpec?.fontFamily || yFontFamily
  const rRenderFontSize = ptToPx(rSpec?.fontSize || 24)
  const rFontWeight = rSpec?.fontWeight || 400
  const rFontStyle = rSpec?.fontStyle || 'regular'
  const rLabelColor = rSpec?.labelColor || '#000000'
  const rShiftRight = (rSpec?.shiftRight || 0) * scaleX
  const rShiftDown = (rSpec?.shiftDown || 0) * scaleY

  const rMajIn = rSpec?.majorIn ?? (rSpec?.insideTicks !== false)
  const rMajOut = rSpec?.majorOut ?? false
  const rMajLen = rSpec?.majorLength ?? 6
  const rMajW = Math.max(0.4, Number(((rSpec?.majorWidth ?? 0.4) * scaleX).toFixed(2)))
  const rMajColor = rSpec?.majorColor || '#000000'
  const rMajStyle = rSpec?.majorStyle || 'solid'

  const rMinIn = rSpec?.minorIn ?? (rSpec?.insideTicks !== false)
  const rMinOut = rSpec?.minorOut ?? false
  const rMinLen = rSpec?.minorLength ?? 3
  const rMinW = Math.max(0.4, Number(((rSpec?.minorWidth ?? 0.4) * scaleX).toFixed(2)))
  const rMinColor = rSpec?.minorColor || '#000000'
  const rMinStyle = rSpec?.minorStyle || 'solid'

  let rTickPathD = ''
  let rSubTickPathD = ''
  const rLabelFrag = document.createDocumentFragment()

  if (showRTicks) {
    rMajorTicks.forEach((v) => {
      const py = sr(v)
      if (py >= margin.t - 0.5 && py <= margin.t + plotH + 0.5) {
        if (isSection && ctx.syncWithR) {
          if (rMajOut) {
            rTickPathD += `M${rightX} ${py}H${rightX + rMajLen}`
          }
        } else {
          const rXStart = rMajOut ? rightX + rMajLen : rightX
          const rXEnd = rMajIn ? rightX - rMajLen : rightX
          if (rMajIn || rMajOut) {
            rTickPathD += `M${rXStart} ${py}H${rXEnd}`
          }
        }
      }
    })

    rMinorTicks.forEach((v) => {
      const py = sr(v)
      if (py >= margin.t - 0.5 && py <= margin.t + plotH + 0.5) {
        if (isSection && ctx.syncWithR) {
          if (rMinOut) {
            rSubTickPathD += `M${rightX} ${py}H${rightX + rMinLen}`
          }
        } else {
          const rXStart = rMinOut ? rightX + rMinLen : rightX
          const rXEnd = rMinIn ? rightX - rMinLen : rightX
          if (rMinIn || rMinOut) {
            rSubTickPathD += `M${rXStart} ${py}H${rXEnd}`
          }
        }
      }
    })
  }

  const rPlan = planAxisLabels(rSpec, rMajorTicks, rMin, rMax, ctx.rValueScale.kind === 'log', false)
  if (showRLabels) {
    rMajorTicks.forEach((v) => {
      const runs = rPlan.labels.get(v)
      if (!runs) return
      const py = sr(v)
      if (py >= margin.t - 2 && py <= margin.t + plotH + 2) {
        const label = createSVGElement('text')
        label.setAttribute('x', String(rightX + rShiftRight))
        label.setAttribute('y', String(py + rRenderFontSize / 2 + rShiftDown))
        label.setAttribute('text-anchor', 'start')
        label.setAttribute('dominant-baseline', 'text-after-edge')
        label.setAttribute('font-size', String(rRenderFontSize))
        label.setAttribute('font-family', rFontFamily)
        if (rFontStyle === 'italic') label.setAttribute('font-style', 'italic')
        if (rFontStyle === 'bold' || rFontWeight >= 600) label.setAttribute('font-weight', 'bold')
        label.setAttribute('fill', rLabelColor)
        setLabelRuns(label, runs)
        rLabelFrag.appendChild(label)
      }
    })
    appendExponentLabel(
      rLabelFrag, rPlan, rightX + rShiftRight + planLabelWidth(rPlan, rRenderFontSize) + rRenderFontSize * 0.15,
      topY + rRenderFontSize * 0.75 + rShiftDown, 'start', 'auto', rRenderFontSize, rFontFamily, rLabelColor
    )
  }

  if (rTickPathD) {
    const rTickPath = createSVGElement('path')
    rTickPath.setAttribute('d', rTickPathD)
    rTickPath.setAttribute('stroke', rMajColor)
    rTickPath.setAttribute('stroke-width', String(rMajW))
    rTickPath.setAttribute('stroke-linecap', 'butt')
    if (isSection) {
      applyGridDash(rTickPath, rMajStyle, rMajW, rSpec?.rawMajorTickMid)
    }
    rTickPath.setAttribute('fill', 'none')
    svg.appendChild(rTickPath)
  }
  if (rSubTickPathD) {
    const rSubTickPath = createSVGElement('path')
    rSubTickPath.setAttribute('d', rSubTickPathD)
    rSubTickPath.setAttribute('stroke', rMinColor)
    rSubTickPath.setAttribute('stroke-width', String(rMinW))
    rSubTickPath.setAttribute('stroke-linecap', 'butt')
    if (isSection) {
      applyGridDash(rSubTickPath, rMinStyle, rMinW, rSpec?.rawMinorTickMid)
    }
    rSubTickPath.setAttribute('fill', 'none')
    svg.appendChild(rSubTickPath)
  }
  svg.appendChild(rLabelFrag)

  ctx.sr = sr
  ctx.rMin = rMin
  ctx.rMax = rMax
}

