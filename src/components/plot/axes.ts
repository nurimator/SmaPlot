import { computeAutoStep, formatTick } from '../../utils/scale.ts'
import { createSVGElement } from './svg.ts'
import type { PlotRenderContext } from './svg.ts'

export function renderAxes(ctx: PlotRenderContext): void {
  const { svg, margin, plotW, plotH, scaleX, sx, sy, smpDoc } = ctx

  const formatLabel = (v: number, addPlus?: boolean): string => {
    const base = formatTick(v)
    if (addPlus && v > 0) return `+${base}`
    return base
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

  // --- AXIS-0 (Bottom / X) ---
  const subDivsX = ctx.autoSubDivsX !== null ? ctx.autoSubDivsX : smpDoc?.axisX.subDivs || 5
  const xMajorTicks = getMajorTicks(ctx.xMin, ctx.xMax, ctx.xStep)
  const xMinorTicks = getMinorTicks(ctx.xMin, ctx.xMax, ctx.xStep, subDivsX, xMajorTicks)

  const xFontFamily = smpDoc?.axisX.fontFamily || 'Times New Roman, Inter, sans-serif'
  const xRenderFontSize = Math.max(7, Math.round((smpDoc?.axisX.fontSize || 24) * 0.72))
  const xFontWeight = smpDoc?.axisX.fontWeight || 400
  const xFontStyle = smpDoc?.axisX.fontStyle || 'regular'
  const xLabelColor = smpDoc?.axisX.labelColor || '#000000'
  const xShiftRight = smpDoc?.axisX.shiftRight || 0
  const xShiftDown = smpDoc?.axisX.shiftDown || 0

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

  let xTickPathD = ''
  let xSubTickPathD = ''
  const xLabelFrag = document.createDocumentFragment()

  if (showXTicks) {
    xMajorTicks.forEach((v) => {
      const px = sx(v)
      if (px > margin.l + 0.5 && px < margin.l + plotW - 0.5) {
        const bYStart = xMajOut ? bottomY + xMajLen : bottomY
        const bYEnd = xMajIn ? bottomY - xMajLen : bottomY
        if (xMajIn || xMajOut) {
          xTickPathD += `M${px} ${bYStart}V${bYEnd}`
        }
      }
    })

    xMinorTicks.forEach((v) => {
      const px = sx(v)
      if (px > margin.l + 0.5 && px < margin.l + plotW - 0.5) {
        const bYStart = xMinOut ? bottomY + xMinLen : bottomY
        const bYEnd = xMinIn ? bottomY - xMinLen : bottomY
        if (xMinIn || xMinOut) {
          xSubTickPathD += `M${px} ${bYStart}V${bYEnd}`
        }
      }
    })
  }

  if (showXLabels) {
    xMajorTicks.forEach((v) => {
      if (mergeZero && v === 0) return
      const px = sx(v)
      if (px >= margin.l - 2 && px <= margin.l + plotW + 2) {
        const label = createSVGElement('text')
        label.setAttribute('x', String(px + xShiftRight))
        label.setAttribute('y', String(bottomY + 1 + xShiftDown))
        label.setAttribute('text-anchor', 'middle')
        label.setAttribute('dominant-baseline', 'hanging')
        label.setAttribute('font-size', String(xRenderFontSize))
        label.setAttribute('font-family', xFontFamily)
        if (xFontStyle === 'italic') label.setAttribute('font-style', 'italic')
        if (xFontStyle === 'bold' || xFontWeight >= 600) label.setAttribute('font-weight', 'bold')
        label.setAttribute('fill', xLabelColor)
        label.textContent = formatLabel(v, smpDoc?.axisX.addPlusSign)
        xLabelFrag.appendChild(label)
      }
    })
  }

  if (xTickPathD) {
    const xTickPath = createSVGElement('path')
    xTickPath.setAttribute('d', xTickPathD)
    xTickPath.setAttribute('stroke', xMajColor)
    xTickPath.setAttribute('stroke-width', String(xMajW))
    xTickPath.setAttribute('stroke-linecap', 'butt')
    if (xMajStyle === 'dashed') xTickPath.setAttribute('stroke-dasharray', '4 4')
    else if (xMajStyle === 'dotted') xTickPath.setAttribute('stroke-dasharray', '2 2')
    xTickPath.setAttribute('fill', 'none')
    svg.appendChild(xTickPath)
  }
  if (xSubTickPathD) {
    const xSubTickPath = createSVGElement('path')
    xSubTickPath.setAttribute('d', xSubTickPathD)
    xSubTickPath.setAttribute('stroke', xMinColor)
    xSubTickPath.setAttribute('stroke-width', String(xMinW))
    xSubTickPath.setAttribute('stroke-linecap', 'butt')
    if (xMinStyle === 'dashed') xSubTickPath.setAttribute('stroke-dasharray', '4 4')
    else if (xMinStyle === 'dotted') xSubTickPath.setAttribute('stroke-dasharray', '2 2')
    xSubTickPath.setAttribute('fill', 'none')
    svg.appendChild(xSubTickPath)
  }
  svg.appendChild(xLabelFrag)

  // --- AXIS-2 (Top / U) ---
  const uSpec = smpDoc?.axisTop || smpDoc?.axisX
  let uMin = ctx.xMin
  let uMax = ctx.xMax
  let uStep = ctx.xStep
  let subDivsU = subDivsX
  let uMajorTicks = xMajorTicks
  let uMinorTicks = xMinorTicks
  let showUTicks = smpDoc?.axisTop?.showTicks ?? showXTicks
  let showULabels = false

  if (!ctx.syncWithU && smpDoc?.axisTop) {
    uMin = smpDoc.axisTop.min ?? 0
    uMax = smpDoc.axisTop.max ?? 100
    uStep = Math.abs(smpDoc.axisTop.step || 0)
    let autoSubDivsU: number | null = null
    if (smpDoc.axisTop.autoStep || uStep <= 0) {
      const autoU = computeAutoStep(uMin, uMax)
      uStep = autoU.increment
      autoSubDivsU = autoU.division
    }
    subDivsU = autoSubDivsU !== null ? autoSubDivsU : (smpDoc.axisTop.subDivs || 5)
    uMajorTicks = getMajorTicks(uMin, uMax, uStep)
    uMinorTicks = getMinorTicks(uMin, uMax, uStep, subDivsU, uMajorTicks)
    showUTicks = smpDoc.axisTop.showTicks !== false
    showULabels = showUTicks && (smpDoc.axisTop.showLabels !== false)
  }

  const su = (v: number) => margin.l + ((v - uMin) / (uMax - uMin)) * plotW

  const uFontFamily = uSpec?.fontFamily || xFontFamily
  const uRenderFontSize = Math.max(7, Math.round((uSpec?.fontSize || 24) * 0.72))
  const uFontWeight = uSpec?.fontWeight || 400
  const uFontStyle = uSpec?.fontStyle || 'regular'
  const uLabelColor = uSpec?.labelColor || '#000000'
  const uShiftRight = uSpec?.shiftRight || 0
  const uShiftDown = uSpec?.shiftDown || 0

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
      if (px > margin.l + 0.5 && px < margin.l + plotW - 0.5) {
        const tYStart = uMajOut ? topY - uMajLen : topY
        const tYEnd = uMajIn ? topY + uMajLen : topY
        if (uMajIn || uMajOut) {
          uTickPathD += `M${px} ${tYStart}V${tYEnd}`
        }
      }
    })

    uMinorTicks.forEach((v) => {
      const px = su(v)
      if (px > margin.l + 0.5 && px < margin.l + plotW - 0.5) {
        const tYStart = uMinOut ? topY - uMinLen : topY
        const tYEnd = uMinIn ? topY + uMinLen : topY
        if (uMinIn || uMinOut) {
          uSubTickPathD += `M${px} ${tYStart}V${tYEnd}`
        }
      }
    })
  }

  if (showULabels) {
    uMajorTicks.forEach((v) => {
      const px = su(v)
      if (px >= margin.l - 2 && px <= margin.l + plotW + 2) {
        const label = createSVGElement('text')
        label.setAttribute('x', String(px + uShiftRight))
        label.setAttribute('y', String(topY - 4 + uShiftDown))
        label.setAttribute('text-anchor', 'middle')
        label.setAttribute('dominant-baseline', 'auto')
        label.setAttribute('font-size', String(uRenderFontSize))
        label.setAttribute('font-family', uFontFamily)
        if (uFontStyle === 'italic') label.setAttribute('font-style', 'italic')
        if (uFontStyle === 'bold' || uFontWeight >= 600) label.setAttribute('font-weight', 'bold')
        label.setAttribute('fill', uLabelColor)
        label.textContent = formatLabel(v, uSpec?.addPlusSign)
        uLabelFrag.appendChild(label)
      }
    })
  }

  if (uTickPathD) {
    const uTickPath = createSVGElement('path')
    uTickPath.setAttribute('d', uTickPathD)
    uTickPath.setAttribute('stroke', uMajColor)
    uTickPath.setAttribute('stroke-width', String(uMajW))
    uTickPath.setAttribute('stroke-linecap', 'butt')
    if (uMajStyle === 'dashed') uTickPath.setAttribute('stroke-dasharray', '4 4')
    else if (uMajStyle === 'dotted') uTickPath.setAttribute('stroke-dasharray', '2 2')
    uTickPath.setAttribute('fill', 'none')
    svg.appendChild(uTickPath)
  }
  if (uSubTickPathD) {
    const uSubTickPath = createSVGElement('path')
    uSubTickPath.setAttribute('d', uSubTickPathD)
    uSubTickPath.setAttribute('stroke', uMinColor)
    uSubTickPath.setAttribute('stroke-width', String(uMinW))
    uSubTickPath.setAttribute('stroke-linecap', 'butt')
    if (uMinStyle === 'dashed') uSubTickPath.setAttribute('stroke-dasharray', '4 4')
    else if (uMinStyle === 'dotted') uSubTickPath.setAttribute('stroke-dasharray', '2 2')
    uSubTickPath.setAttribute('fill', 'none')
    svg.appendChild(uSubTickPath)
  }
  svg.appendChild(uLabelFrag)

  ctx.su = su
  ctx.uMin = uMin
  ctx.uMax = uMax

  // --- AXIS-1 (Left / Y) ---
  const subDivsY = ctx.autoSubDivsY !== null ? ctx.autoSubDivsY : smpDoc?.axisY.subDivs || 5
  const yMajorTicks = getMajorTicks(ctx.yMin, ctx.yMax, ctx.yStep)
  const yMinorTicks = getMinorTicks(ctx.yMin, ctx.yMax, ctx.yStep, subDivsY, yMajorTicks)

  const yFontFamily = smpDoc?.axisY.fontFamily || 'Times New Roman, Inter, sans-serif'
  const yRenderFontSize = Math.max(7, Math.round((smpDoc?.axisY.fontSize || 24) * 0.72))
  const yFontWeight = smpDoc?.axisY.fontWeight || 400
  const yFontStyle = smpDoc?.axisY.fontStyle || 'regular'
  const yLabelColor = smpDoc?.axisY.labelColor || '#000000'
  const yShiftRight = smpDoc?.axisY.shiftRight || 0
  const yShiftDown = smpDoc?.axisY.shiftDown || 0

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

  let yTickPathD = ''
  let ySubTickPathD = ''
  const yLabelFrag = document.createDocumentFragment()

  if (showYTicks) {
    yMajorTicks.forEach((v) => {
      const py = sy(v)
      if (py > margin.t + 0.5 && py < margin.t + plotH - 0.5) {
        const lXStart = yMajOut ? leftX - yMajLen : leftX
        const lXEnd = yMajIn ? leftX + yMajLen : leftX
        if (yMajIn || yMajOut) {
          yTickPathD += `M${lXStart} ${py}H${lXEnd}`
        }
      }
    })

    yMinorTicks.forEach((v) => {
      const py = sy(v)
      if (py > margin.t + 0.5 && py < margin.t + plotH - 0.5) {
        const lXStart = yMinOut ? leftX - yMinLen : leftX
        const lXEnd = yMinIn ? leftX + yMinLen : leftX
        if (yMinIn || yMinOut) {
          ySubTickPathD += `M${lXStart} ${py}H${lXEnd}`
        }
      }
    })
  }

  if (showYLabels) {
    const shareZero = !!smpDoc?.mergeZeroLabels && ctx.xMin === 0 && ctx.yMin === 0 && showXLabels
    yMajorTicks.forEach((v) => {
      if (shareZero && v === 0) return
      const py = sy(v)
      if (py >= margin.t - 2 && py <= margin.t + plotH + 2) {
        const label = createSVGElement('text')
        label.setAttribute('x', String(leftX - 1 + yShiftRight))
        label.setAttribute('y', String(py + Math.round(yRenderFontSize * 0.35) + yShiftDown))
        label.setAttribute('text-anchor', 'end')
        label.setAttribute('font-size', String(yRenderFontSize))
        label.setAttribute('font-family', yFontFamily)
        if (yFontStyle === 'italic') label.setAttribute('font-style', 'italic')
        if (yFontStyle === 'bold' || yFontWeight >= 600) label.setAttribute('font-weight', 'bold')
        label.setAttribute('fill', yLabelColor)
        label.textContent = formatLabel(v, smpDoc?.axisY.addPlusSign)
        yLabelFrag.appendChild(label)
      }
    })

    if (mergeZero) {
      const zLabel = createSVGElement('text')
      zLabel.setAttribute('x', String(leftX - 1 + yShiftRight))
      zLabel.setAttribute('y', String(bottomY + 1 + xShiftDown))
      zLabel.setAttribute('text-anchor', 'end')
      zLabel.setAttribute('dominant-baseline', 'hanging')
      zLabel.setAttribute('font-size', String(yRenderFontSize))
      zLabel.setAttribute('font-family', yFontFamily)
      if (yFontStyle === 'italic') zLabel.setAttribute('font-style', 'italic')
      if (yFontStyle === 'bold' || yFontWeight >= 600) zLabel.setAttribute('font-weight', 'bold')
      zLabel.setAttribute('fill', yLabelColor)
      zLabel.textContent = formatLabel(0, smpDoc?.axisY.addPlusSign)
      yLabelFrag.appendChild(zLabel)
    }
  }

  if (yTickPathD) {
    const yTickPath = createSVGElement('path')
    yTickPath.setAttribute('d', yTickPathD)
    yTickPath.setAttribute('stroke', yMajColor)
    yTickPath.setAttribute('stroke-width', String(yMajW))
    yTickPath.setAttribute('stroke-linecap', 'butt')
    if (yMajStyle === 'dashed') yTickPath.setAttribute('stroke-dasharray', '4 4')
    else if (yMajStyle === 'dotted') yTickPath.setAttribute('stroke-dasharray', '2 2')
    yTickPath.setAttribute('fill', 'none')
    svg.appendChild(yTickPath)
  }
  if (ySubTickPathD) {
    const ySubTickPath = createSVGElement('path')
    ySubTickPath.setAttribute('d', ySubTickPathD)
    ySubTickPath.setAttribute('stroke', yMinColor)
    ySubTickPath.setAttribute('stroke-width', String(yMinW))
    ySubTickPath.setAttribute('stroke-linecap', 'butt')
    if (yMinStyle === 'dashed') ySubTickPath.setAttribute('stroke-dasharray', '4 4')
    else if (yMinStyle === 'dotted') ySubTickPath.setAttribute('stroke-dasharray', '2 2')
    ySubTickPath.setAttribute('fill', 'none')
    svg.appendChild(ySubTickPath)
  }
  svg.appendChild(yLabelFrag)

  // --- AXIS-3 (Right / R) ---
  const rSpec = smpDoc?.axisRight || smpDoc?.axisY
  let rMin = ctx.yMin
  let rMax = ctx.yMax
  let rStep = ctx.yStep
  let subDivsR = subDivsY
  let rMajorTicks = yMajorTicks
  let rMinorTicks = yMinorTicks
  let showRTicks = smpDoc?.axisRight?.showTicks ?? showYTicks
  let showRLabels = false

  if (!ctx.syncWithR && smpDoc?.axisRight) {
    rMin = smpDoc.axisRight.min ?? 0
    rMax = smpDoc.axisRight.max ?? 100
    rStep = Math.abs(smpDoc.axisRight.step || 0)
    let autoSubDivsR: number | null = null
    if (smpDoc.axisRight.autoStep || rStep <= 0) {
      const autoR = computeAutoStep(rMin, rMax)
      rStep = autoR.increment
      autoSubDivsR = autoR.division
    }
    subDivsR = autoSubDivsR !== null ? autoSubDivsR : (smpDoc.axisRight.subDivs || 5)
    rMajorTicks = getMajorTicks(rMin, rMax, rStep)
    rMinorTicks = getMinorTicks(rMin, rMax, rStep, subDivsR, rMajorTicks)
    showRTicks = smpDoc.axisRight.showTicks !== false
    showRLabels = showRTicks && (smpDoc.axisRight.showLabels !== false)
  }

  const sr = (v: number) => margin.t + plotH - ((v - rMin) / (rMax - rMin)) * plotH

  const rFontFamily = rSpec?.fontFamily || yFontFamily
  const rRenderFontSize = Math.max(7, Math.round((rSpec?.fontSize || 24) * 0.72))
  const rFontWeight = rSpec?.fontWeight || 400
  const rFontStyle = rSpec?.fontStyle || 'regular'
  const rLabelColor = rSpec?.labelColor || '#000000'
  const rShiftRight = rSpec?.shiftRight || 0
  const rShiftDown = rSpec?.shiftDown || 0

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
      if (py > margin.t + 0.5 && py < margin.t + plotH - 0.5) {
        const rXStart = rMajOut ? rightX + rMajLen : rightX
        const rXEnd = rMajIn ? rightX - rMajLen : rightX
        if (rMajIn || rMajOut) {
          rTickPathD += `M${rXStart} ${py}H${rXEnd}`
        }
      }
    })

    rMinorTicks.forEach((v) => {
      const py = sr(v)
      if (py > margin.t + 0.5 && py < margin.t + plotH - 0.5) {
        const rXStart = rMinOut ? rightX + rMinLen : rightX
        const rXEnd = rMinIn ? rightX - rMinLen : rightX
        if (rMinIn || rMinOut) {
          rSubTickPathD += `M${rXStart} ${py}H${rXEnd}`
        }
      }
    })
  }

  if (showRLabels) {
    rMajorTicks.forEach((v) => {
      const py = sr(v)
      if (py >= margin.t - 2 && py <= margin.t + plotH + 2) {
        const label = createSVGElement('text')
        label.setAttribute('x', String(rightX + 4 + rShiftRight))
        label.setAttribute('y', String(py + Math.round(rRenderFontSize * 0.35) + rShiftDown))
        label.setAttribute('text-anchor', 'start')
        label.setAttribute('font-size', String(rRenderFontSize))
        label.setAttribute('font-family', rFontFamily)
        if (rFontStyle === 'italic') label.setAttribute('font-style', 'italic')
        if (rFontStyle === 'bold' || rFontWeight >= 600) label.setAttribute('font-weight', 'bold')
        label.setAttribute('fill', rLabelColor)
        label.textContent = formatLabel(v, rSpec?.addPlusSign)
        rLabelFrag.appendChild(label)
      }
    })
  }

  if (rTickPathD) {
    const rTickPath = createSVGElement('path')
    rTickPath.setAttribute('d', rTickPathD)
    rTickPath.setAttribute('stroke', rMajColor)
    rTickPath.setAttribute('stroke-width', String(rMajW))
    rTickPath.setAttribute('stroke-linecap', 'butt')
    if (rMajStyle === 'dashed') rTickPath.setAttribute('stroke-dasharray', '4 4')
    else if (rMajStyle === 'dotted') rTickPath.setAttribute('stroke-dasharray', '2 2')
    rTickPath.setAttribute('fill', 'none')
    svg.appendChild(rTickPath)
  }
  if (rSubTickPathD) {
    const rSubTickPath = createSVGElement('path')
    rSubTickPath.setAttribute('d', rSubTickPathD)
    rSubTickPath.setAttribute('stroke', rMinColor)
    rSubTickPath.setAttribute('stroke-width', String(rMinW))
    rSubTickPath.setAttribute('stroke-linecap', 'butt')
    if (rMinStyle === 'dashed') rSubTickPath.setAttribute('stroke-dasharray', '4 4')
    else if (rMinStyle === 'dotted') rSubTickPath.setAttribute('stroke-dasharray', '2 2')
    rSubTickPath.setAttribute('fill', 'none')
    svg.appendChild(rSubTickPath)
  }
  svg.appendChild(rLabelFrag)

  ctx.sr = sr
  ctx.rMin = rMin
  ctx.rMax = rMax
}

