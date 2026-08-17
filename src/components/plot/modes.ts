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