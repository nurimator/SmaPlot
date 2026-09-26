import type { SmpLegendItem } from '../../types.ts'
import { measureSmpText, tokenizeSmpText } from '../../utils/smpSymbolMapper.ts'
import type { SmpTextOptions } from '../../utils/smpSymbolMapper.ts'

export type LegendTextAnchor = 'start' | 'middle' | 'end'

interface LegendFontMetadata {
  fontFamily1?: string
  fontFamily2?: string
  font2Size?: number
  font2Weight?: number
  font2Style?: string
}

export function getLegendTextOptions(
  item: SmpLegendItem,
  fontSize: number,
  color: string
): SmpTextOptions {
  const metadata = item as SmpLegendItem & LegendFontMetadata
  const mainFont = metadata.fontFamily1 || item.fontFamily || 'Times New Roman, serif'
  const secondaryFont = metadata.fontFamily2 || item.optionFontFamily || mainFont
  const symbolFont = item.symbolFontFamily || secondaryFont
  const secondaryFontSize =
    metadata.font2Size && metadata.font2Size > 0 ? metadata.font2Size * 0.72 : fontSize
  const mainWeight = item.fontWeight ?? 400
  const boldWeight = (item.fontStyle || '').toLowerCase().includes('bold')
    ? Math.max(mainWeight, 700)
    : mainWeight
  const secondaryBaseWeight = metadata.font2Weight ?? boldWeight
  const secondaryWeight = (metadata.font2Style || '').toLowerCase().includes('bold')
    ? Math.max(secondaryBaseWeight, 700)
    : secondaryBaseWeight
  return {
    fontSize,
    fontFamily: mainFont,
    secondaryFontFamily: secondaryFont,
    symbolFontFamily: symbolFont,
    secondaryFontSize,
    secondaryFontWeight: secondaryWeight,
    secondaryFontStyle: metadata.font2Style || item.fontStyle,
    color,
    fontWeight: boldWeight,
    fontStyle: item.fontStyle,
  }
}

export function getLegendTextAnchor(item: SmpLegendItem): LegendTextAnchor {
  if (item.align === 'center') return 'middle'
  if (item.align === 'right') return 'end'
  return 'start'
}

export function legendRenderFontSize(item: SmpLegendItem): number {
  return Math.max(6, Math.round((item.fontSize || 12) * 0.72))
}

export interface LegendTextMetrics {
  width: number
  height: number
  lineCount: number
}

// Measures a legend text item the same way renderSvgText does, so the selection overlay and the
// hit-test rectangle agree on where the item is. Deliberately has no minimum width: a previous
// Math.max(40, ...) floor made every short title claim a 44px rectangle regardless of its real
// size, so clicking well to the right of a small title selected it.
export function measureLegendItemText(item: SmpLegendItem): LegendTextMetrics {
  const fontSize = legendRenderFontSize(item)
  const raw = item.rawText || item.text || ''
  const lines = tokenizeSmpText(raw, getLegendTextOptions(item, fontSize, item.color || '#000000'))
  const metrics = measureSmpText(lines, fontSize)
  return {
    width: metrics.width,
    height: metrics.height,
    lineCount: lines.length,
  }
}
