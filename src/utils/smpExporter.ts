import type { SmpAxisSpec, SmpLegendItem, SmpPlotDoc } from '../types.ts'
import { unicodeToSmp } from './smpSymbolMapper.ts'

export function hexToBgr(hex: string): number {
  if (!hex) return 0
  const cleanHex = hex.replace('#', '')
  if (cleanHex.length !== 6) return 0
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0
  return r | (g << 8) | (b << 16)
}

function formatDateTimestamp(): string {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`
}

function formatFloatSci(val: number): string {
  const str = val.toExponential(6)
  return str.replace(/e([+-])(\d)$/, 'e$10$2')
}

export function serializeSmpDoc(doc: SmpPlotDoc, isMultiDoc = false): string {
  const lines: string[] = []

  if (isMultiDoc && doc.name) {
    lines.push(`[${doc.name}]`)
  } else {
    lines.push(' Sma4Win ver. 1.8  SMP file')
    lines.push('')
    lines.push('1 1 215 279 0 0 0')
  }

  const datasets = doc.datasets || []
  lines.push(`${datasets.length}`)

  // Series Specs
  datasets.forEach((ds, idx) => {
    const cleanName = ds.name.replace(/^\d+\s+/, '').replace(/\.txt$/i, '')
    const specHeader = `[${idx + 1} ${cleanName}.txt]`
    lines.push(specHeader)
    lines.push(ds.filePath || `C:\\Sma4Win\\${cleanName}.txt`)
    lines.push('0 0 0 0 0 1 3787 0 -1 ')

    const bgrColor = hexToBgr(ds.options?.lineColor || ds.color || '#3b82f6')
    lines.push(`60 ${bgrColor} 300 0 0 0 0`)
    lines.push('1 0 300 0')
    lines.push('0 0 1 0 0 0 16777215 5')
    lines.push('0 1 0')
    lines.push(ds.options?.xExpr || 'x')
    lines.push(ds.options?.yExpr || 'y')
    lines.push('0 0 0 0 0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00')
    lines.push('1 40 0 300 1')
    lines.push('')
    lines.push('')
  })

  // GRAPH Section
  lines.push('[GRAPH]')
  const left = Math.round(doc.left || 5000)
  const top = Math.round(doc.top || 5000)
  const width = Math.round(doc.width || 10000)
  const height = Math.round(doc.height || 10000)
  lines.push(`${left} ${top} ${width} ${height}`)
  lines.push('100 1 0 0 1 0')
  lines.push('40 0 300 16777215')
  lines.push('')

  // AXIS Sections
  const formatAxis = (idx: number, axis?: SmpAxisSpec, defaultMin = 0, defaultMax = 100, defaultStep = 20) => {
    lines.push(`[AXIS-${idx}]`)
    const minStr = formatFloatSci(axis?.min ?? defaultMin)
    const maxStr = formatFloatSci(axis?.max ?? defaultMax)
    const stepStr = formatFloatSci(axis?.step ?? defaultStep)
    const subDivs = axis?.subDivs || 5
    lines.push(`${minStr} ${maxStr} ${stepStr} 0 0 10000 -1 -1 0 1 0 0 1 ${subDivs} 5 1.000000e+00 1`)

    const showTicks = axis?.showTicks !== false ? 1 : 0
    const insideTicks = axis?.insideTicks !== false ? 1 : 0
    const showLabels = axis?.showLabels !== false ? 1 : 0

    if (idx === 0) {
      lines.push(`2 0 1 ${showTicks} ${insideTicks} ${showLabels} 0 100 0 300 100 0`)
    } else if (idx === 1) {
      lines.push(`5 0 1 ${showTicks} ${insideTicks} ${showLabels} -100 0 0 1200 100 0`)
    } else if (idx === 2) {
      lines.push(`2 0 1 ${showTicks} ${insideTicks} ${showLabels} 0 -100 0 900 100 0`)
    } else {
      lines.push(`5 0 1 ${showTicks} ${insideTicks} ${showLabels} 100 0 0 0 100 0`)
    }

    const weight = (axis?.fontWeight || 400) >= 600 ? 700 : 400
    const startVal = idx === 0 ? '-2000' : '-2400'
    const extraVal = (idx === 0 || idx === 1) ? '162 3 2 1 18' : '0 0 0 2 18'
    lines.push(`${startVal} 0 0 0 ${weight} 0 0 0 ${extraVal}`)
    lines.push(axis?.fontFamily || 'Times New Roman')
    lines.push('1 0 300 40 0 300 2')
    lines.push('1 0 150 40 0 300 3')
    lines.push('')
  }

  formatAxis(0, doc.axisX, 0, 100, 20)
  formatAxis(1, doc.axisY, 0, 100, 20)
  formatAxis(2, doc.axisTop, 0, 100, 20)
  formatAxis(3, doc.axisRight, 0, 100, 20)

  // LEGEND Section
  const legendItems: SmpLegendItem[] = [...(doc.legendItems || [])]
  if (legendItems.length === 0) {
    if (doc.xLabel) {
      legendItems.push({
        type: 'text',
        text: doc.xLabel,
        rawText: doc.xLabel,
        xNorm: 2400,
        yNorm: 11400,
        rotation: 0,
        fontFamily: 'cambria',
        fontSize: 12,
        fontWeight: 400,
      })
    }
    if (doc.yLabel) {
      legendItems.push({
        type: 'text',
        text: doc.yLabel,
        rawText: doc.yLabel,
        xNorm: -400,
        yNorm: 5000,
        rotation: -90,
        fontFamily: 'cambria',
        fontSize: 12,
        fontWeight: 400,
      })
    }
    if (datasets.length > 0) {
      const legendBoxText = datasets
        .map((ds, i) => `%0${i + 1}E${ds.name.replace(/^\d+\s+/, '').replace(/\.txt$/i, '')}`)
        .join('\\n')
      legendItems.push({
        type: 'text',
        text: legendBoxText,
        rawText: legendBoxText,
        xNorm: 300,
        yNorm: 700,
        rotation: 0,
        fontFamily: 'cambria',
        fontSize: 12,
        fontWeight: 400,
      })
    }
  }

  lines.push('[LEGEND]')
  lines.push(`${legendItems.length}`)

  legendItems.forEach((item) => {
    if (item.type === 'annotation' || item.x2Norm !== undefined) {
      lines.push('0')
      if (item.rawLine) {
        lines.push(item.rawLine)
      } else {
        const x1Str = formatFloatSci(item.xNorm)
        const y1Str = formatFloatSci(item.yNorm)
        const x2Str = formatFloatSci(item.x2Norm ?? 0)
        const y2Str = formatFloatSci(item.y2Norm ?? 0)
        lines.push(`${x1Str} ${y1Str} ${x2Str} ${y2Str} 0 0 40 50 0 0 300 2 16777215 0 0 1 30 100 0`)
      }
      lines.push('')
    } else {
      lines.push('8')
      lines.push(`${Math.round(item.xNorm)} ${Math.round(item.yNorm)} 0 1 0 0`)
      lines.push(unicodeToSmp(item.rawText || item.text).replace(/\n/g, '\\n'))
      const rot = Math.round(item.rotation * 10)
      const weight = item.fontWeight >= 600 ? 700 : 400
      lines.push(`-1600 0 ${rot} ${-rot} ${weight} 0 0 0 0 3 2 1 18`)
      lines.push(item.fontFamily || 'cambria')
      lines.push(`-1600 0 ${rot} ${-rot} ${weight} 0 0 0 0 3 2 1 2`)
      lines.push('Merriweather Light')
      lines.push(`-1600 0 ${rot} ${-rot} ${weight} 0 0 0 2 3 2 1 18`)
      lines.push('Symbol')
      lines.push('')
    }
  })

  // OTHERS & MASKS Section
  lines.push('[OTHERS]')
  lines.push(' 2')
  lines.push('0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00 0.000000e+00')
  lines.push('-2400 0 0 0 400 1 0 0 2 3 2 1 18')
  lines.push('Symbol')
  lines.push('')
  lines.push('[MASKS]')
  lines.push(' 0')
  lines.push('0')
  lines.push('0')
  lines.push('')

  // DATA Section
  lines.push('[DATA]')
  const nowStamp = formatDateTimestamp()

  datasets.forEach((ds, idx) => {
    if (idx > 0) {
      lines.push('')
    }
    const cleanName = ds.name.replace(/^\d+\s+/, '').replace(/\.txt$/i, '')
    const header = `[${idx + 1} ${cleanName}.txt] ${nowStamp}`
    lines.push(header)

    const dataPairs: string[] = []

    if (ds.rawLines && ds.rawLines.length > 0) {
      ds.rawLines.forEach((row) => {
        dataPairs.push(row.length >= 2 ? `${row.join(' ')} ` : row.join(' '))
      })
    } else {
      const len = Math.min(ds.x?.length || 0, ds.y?.length || 0)
      for (let i = 0; i < len; i++) {
        dataPairs.push(`${ds.x[i]} ${ds.y[i]} `)
      }
    }

    if (dataPairs.length > 0) {
      for (let k = 0; k < dataPairs.length - 1; k++) {
        lines.push(dataPairs[k])
      }
      const lastLine = dataPairs[dataPairs.length - 1].trimEnd()
      lines.push(`${lastLine} [End of Data]`)
    } else {
      lines.push('[End of Data]')
    }
  })

  // Sma4Win desktop app requires Windows CRLF line endings (\r\n)
  return lines.join('\r\n')
}

export function serializeSmpProject(docs: SmpPlotDoc[]): string {
  if (docs.length === 0) return ''
  if (docs.length === 1) return serializeSmpDoc(docs[0], false)

  const chunks: string[] = [' Sma4Win ver. 1.8  SMP file', '', '1 1 215 279 0 0 0']
  docs.forEach((doc) => {
    chunks.push(serializeSmpDoc(doc, true))
  })
  return chunks.join('\r\n\r\n')
}

export function downloadFile(content: string, fileName: string, mimeType = 'text/plain'): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
