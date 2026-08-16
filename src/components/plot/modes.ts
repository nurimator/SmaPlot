// Trimming mode (toolbar "Trimming" toggle). While active, the left-drag marquee
// selection is suspended and left-drag on a plot's graph area instead defines a
// trim rectangle that re-scopes the plot's X/Y axis start & end (zooming data in).
let trimmingMode = false

export function isTrimmingMode(): boolean {
  return trimmingMode
}

export function setTrimmingMode(on: boolean): void {
  trimmingMode = on
}

let readValueMode = false

export function isReadValueMode(): boolean {
  return readValueMode
}

export function setReadValueMode(on: boolean): void {
  readValueMode = on
}