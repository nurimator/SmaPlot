import type { SmpAxisSpec, SmpPlotDoc } from '../types.ts'

export interface SmpFeatureReport {
  preserved: string[]
  unreadable: string[]
}

const UNREAD_VERSIONS = new Set(['1.0', '1.1', '1.2', '1.5', '1.6'])

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

function tokens(line: string | undefined): string[] {
  return (line || '').trim().split(/\s+/).filter(Boolean)
}

function axisList(doc: SmpPlotDoc): SmpAxisSpec[] {
  return [doc.axisX, doc.axisY, doc.axisTop, doc.axisRight].filter((a): a is SmpAxisSpec => !!a)
}

export function describeSmpFeatures(docs: SmpPlotDoc[]): SmpFeatureReport {
  let masks = 0
  let dots = 0
  let inverseAxes = 0
  let partialAxes = 0
  let labelFormulas = 0
  let extendedSeries = 0
  let convertedSeries = 0
  const versions = new Set<string>()

  for (const doc of docs) {
    masks += Math.max(0, parseInt(tokens(doc.masksLines?.[0])[0] || '0', 10) || 0)
    dots += (doc.legendRawObjects || []).filter((obj) => obj.legendType === 9).length
    for (const axis of axisList(doc)) {
      if (axis.scaleType === 2 || axis.scaleType === 4) inverseAxes++
      const tail = tokens(axis.rawFixedTail)
      if (tail.length >= 14 && (tail[1] !== '0' || tail[2] !== '10000')) partialAxes++
      if (tokens(axis.rawLine2Tail)[1] === '1') labelFormulas++
    }
    for (const ds of doc.datasets || []) {
      const kind = parseInt(tokens(ds.smpSeriesCountLine)[0] || '0', 10)
      if (kind === 8 || kind === 9) extendedSeries++
      const converter = parseInt(tokens(ds.smpExprFlag)[2] || '0', 10)
      if (converter > 0) convertedSeries++
    }
    const version = doc.sourceVersion
    if (version && UNREAD_VERSIONS.has(version)) versions.add(version)
  }

  const preserved: string[] = []
  if (masks > 0) preserved.push(plural(masks, 'data mask', 'data masks'))
  if (dots > 0) preserved.push(plural(dots, 'dot object', 'dot objects'))
  if (inverseAxes > 0) preserved.push(`${plural(inverseAxes, 'inverse axis', 'inverse axes')} (drawn linear)`)
  if (partialAxes > 0) preserved.push(plural(partialAxes, 'partial-range axis', 'partial-range axes'))

  const unreadable: string[] = []
  if (labelFormulas > 0) unreadable.push(plural(labelFormulas, 'axis label formula', 'axis label formulas'))
  if (extendedSeries > 0) unreadable.push(plural(extendedSeries, 'extension-DLL series', 'extension-DLL series'))
  if (convertedSeries > 0) unreadable.push(plural(convertedSeries, 'series read through a file converter', 'series read through a file converter'))
  for (const version of versions) unreadable.push(`version ${version} file layout`)

  return { preserved, unreadable }
}
