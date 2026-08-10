export function updateStatusFile(container: HTMLElement, fileName: string, active: boolean): void {
  const fileTextEl = container.querySelector('#statusFileText')
  const dotEl = container.querySelector('.status-dot')

  if (fileTextEl) {
    fileTextEl.textContent = fileName
  }
  if (dotEl) {
    if (active) {
      dotEl.classList.remove('status-dot-idle')
    } else {
      dotEl.classList.add('status-dot-idle')
    }
  }
}

export function updateStatusCoords(container: HTMLElement, x: number, y: number): void {
  const coordsEl = container.querySelector('#statusCoordsText')
  if (coordsEl) {
    coordsEl.textContent = `(${Math.round(x)}, ${Math.round(y)})`
  }
}
