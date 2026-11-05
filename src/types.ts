export interface PlotVisualOptions {
  show?: boolean
  lineStyle?: string
  plotType?: string
  lineType?: string
  dotColor?: string
  paintColor?: string
  lineColor?: string
  size?: number
  width?: number
  pitch?: number
  brush?: string
  xTransCheck?: boolean
  xExpr?: string
  yTransCheck?: boolean
  yExpr?: string
  xColumn?: number
  yColumn?: number
  axisX?: 'x' | 'u'
  axisY?: 'y' | 'r'
}

export interface SmpUserFunction {
  flagsLine?: string
  expr: string
  derivs: string[]
  padBlanks?: number
}

export interface Dataset {
  name: string
  color: string
  x: number[]
  y: number[]
  yPlus?: number[]
  yMinus?: number[]
  rawContent?: string
  rawLines?: string[][]
  fileName?: string
  filePath?: string
  seriesId?: string
  dataId?: string
  dataFingerprint?: string
  seriesIndex?: number
  documentId?: string
  smpSourceVersion?: string
  smpSeriesName?: string
  smpSeriesSrcPath?: string
  smpDataName?: string
  smpDataHeaderRest?: string
  smpDataSeparator?: string
  smpDataRawText?: string[]
  smpDataEndLine?: string
  smpDataOrder?: number
  smpSeriesStylePrefix?: number
  smpSeriesStyleLine?: string
  smpSeriesCountLine?: string
  smpSeriesZerosLine?: string
  smpSeriesFixed5?: string
  smpSeriesFillLine?: string
  smpExprFlag?: string
  smpUserFunction?: SmpUserFunction
  derivedFrom?: string
  derivedKind?: string
  options?: PlotVisualOptions
}

export interface SmpFrameTitle {
  text: string
  fontFamily: string
  fontSize: number
  bold: boolean
  italic: boolean
  align: 'left' | 'center' | 'right'
  color: string
}

export interface SmpLegendItem {
  type?: 'text' | 'annotation'
  legendType?: number
  text: string
  rawText?: string
  xNorm: number
  yNorm: number
  rotation: number
  fontFamily: string
  fontFamilyRaw?: string
  font1Italic?: string
  font2Italic?: string
  font3Italic?: string
  legendOrder?: number
  fontFamily1?: string
  fontFamily2?: string
  optionFontFamily?: string
  symbolFontFamily?: string
  font1Tail?: string
  font2Tail?: string
  font3Tail?: string
  font2Size?: number
  font2Rotation?: number
  font2Weight?: number
  font2Style?: string
  font3Size?: number
  font3Rotation?: number
  font3Weight?: number
  font3Style?: string
  posTail?: string
  showBg?: boolean
  fontSize: number
  fontWeight: number
  fontStyle?: string
  color?: string
  align?: 'left' | 'center' | 'right'
  x2Norm?: number
  y2Norm?: number
  rawLine?: string
}

export interface SmpAxisSpec {
  min: number
  max: number
  step: number
  subDivs: number
  autoStep?: boolean
  logScale?: boolean
  scaleType?: number
  showTicks: boolean
  showSubTicks: boolean
  showLabels: boolean
  insideTicks: boolean

  // Major Tick Options
  majorIn?: boolean
  majorOut?: boolean
  majorLength?: number
  majorWidth?: number
  majorColor?: string
  majorStyle?: string

  // Minor Tick Options
  minorIn?: boolean
  minorOut?: boolean
  minorLength?: number
  minorWidth?: number
  minorColor?: string
  minorStyle?: string

  // Label Options
  fontFamily: string
  fontSize?: number
  fontWeight: number
  fontStyle?: string
  labelColor?: string
  shiftRight?: number
  shiftDown?: number
  addPlusSign?: boolean

  isSynced?: boolean

  // Native metadata preservation
  rawFixedTail?: string
  rawFormatSci?: boolean
  rawLine2Tail?: string
  rawFontExtra?: string
  rawFontItalic?: string
  rawMajorTickMid?: string
  rawMajorTickPad?: string
  rawMinorTickMid?: string
  rawMinorTickPad?: string
  charset?: number
  labelColorCode?: string
}

export interface SmpLineAnnotation {
  x1Norm: number
  y1Norm: number
  x2Norm: number
  y2Norm: number
  style?: string
  width?: number
  arrowhead?: number
  pitch?: number
  shape?: string
  spread?: number
  shut?: number
  unitX?: 'mm' | 'xa' | 'ua'
  unitY?: 'mm' | 'ya' | 'ra'
  color?: string
  thickness?: number
  faceColor?: string
  shadeDepth?: number
  shadeColor?: string
  roundX?: number
  roundY?: number
  arrowMode?: number
  annotationKind?: number
  kind?: number
  payloadKind?: number
  rawType?: string
  rawLineStr?: string
  rawTrail?: string
  legendOrder?: number
}

export interface SmpLegendRawObject {
  legendType: number
  lines: string[]
  legendOrder: number
}

export interface AnalyzeLastConfig {
  action: string
  srcName: string
  params: Record<string, number | string | boolean>
}

export interface SmpPlotDoc {
  name: string
  sourceVersion?: string
  nativeFormatVersion?: number
  pageSetupLine?: string
  headerLines?: string[]
  rawMarker?: string
  masksLines?: string[]
  legendRawObjects?: SmpLegendRawObject[]
  left: number
  top: number
  width: number
  height: number
  datasets: Dataset[]
  analyzeConstants?: number[]
  analyzeLastAction?: string
  analyzeLastConfig?: AnalyzeLastConfig
  axisX: SmpAxisSpec
  axisY: SmpAxisSpec
  axisTop?: SmpAxisSpec
  axisRight?: SmpAxisSpec
  syncWithU?: boolean
  syncWithR?: boolean
  legendItems: SmpLegendItem[]
  annotationLines?: SmpLineAnnotation[]
  frameTitle?: SmpFrameTitle
  othersZerosLine?: string
  othersSymbolLine?: string
  xLabel?: string
  yLabel?: string
  frameWidth?: number
  frameColor?: string
  frameBgColor?: string
  frameType?: number
  graphFixed1?: string
  graphFixed2?: string
  mergeZeroLabels?: boolean
}

export interface SmpMetadata {
  docs: SmpPlotDoc[]
  sourceVersion?: string
  nativeFormatVersion?: number
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
  initialItemPositions?: { xPx: number; yPx: number; x2Px?: number; y2Px?: number }[]
}


