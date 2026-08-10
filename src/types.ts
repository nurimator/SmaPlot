import type { PlotVisualOptions } from './components/Plot.ts'

export interface Dataset {
  name: string
  color: string
  x: number[]
  y: number[]
  rawContent?: string
  rawLines?: string[][]
  fileName?: string
  filePath?: string
  options?: PlotVisualOptions
}

export interface SmpLegendItem {
  text: string
  xNorm: number
  yNorm: number
  rotation: number
  fontFamily: string
  fontSize: number
  fontWeight: number
}

export interface SmpAxisSpec {
  min: number
  max: number
  step: number
  subDivs: number
  showTicks: boolean
  showSubTicks: boolean
  showLabels: boolean
  insideTicks: boolean
  fontFamily: string
  fontWeight: number
}

export interface SmpLineAnnotation {
  x1Norm: number
  y1Norm: number
  x2Norm: number
  y2Norm: number
  style?: string
  width?: number
}

export interface SmpPlotDoc {
  name: string
  left: number
  top: number
  width: number
  height: number
  datasets: Dataset[]
  axisX: SmpAxisSpec
  axisY: SmpAxisSpec
  axisTop?: SmpAxisSpec
  axisRight?: SmpAxisSpec
  legendItems: SmpLegendItem[]
  annotationLines?: SmpLineAnnotation[]
  xLabel?: string
  yLabel?: string
}

export interface SmpMetadata {
  docs: SmpPlotDoc[]
  // Legacy flat properties for single plot backwards compatibility
  xMin?: number
  xMax?: number
  xStep?: number
  yMin?: number
  yMax?: number
  yStep?: number
  xLabel?: string
  yLabel?: string
  annotations?: { text: string; x: number; y: number }[]
  guideLines?: { x1: number; y1: number; x2: number; y2: number }[]
}


export interface NiceScaleResult {
  min: number
  max: number
  step: number
}

export interface ActiveDrag {
  svg: SVGSVGElement
  dir: string
  startX: number
  startY: number
  startLeft: number
  startTop: number
  startWidth: number
  startHeight: number
}

