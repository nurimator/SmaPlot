export interface Dataset {
  name: string
  color: string
  x: number[]
  y: number[]
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
