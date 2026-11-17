import { makeDraggable } from '../utils/draggable.ts'
import { getDocConstants, resolveAnalyzeSvg, setDocConstants } from './AnalyzeOps.ts'
import { updatePlotVisual } from './plot/index.ts'

let currentSvg: SVGSVGElement | null = null
const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']

function q<T extends HTMLElement>(overlay: HTMLElement, sel: string): T | null {
  return overlay.querySelector<T>(sel)
}

function readInputs(overlay: HTMLElement): number[] {
  const out: number[] = []
  for (let i = 0; i < 9; i++) {
    const el = q<HTMLInputElement>(overlay, `#constantInput${i}`)
    const v = el ? parseFloat(el.value) : NaN
    out.push(isNaN(v) ? 0 : v)
  }
  return out
}

function writeInputs(overlay: HTMLElement, values: number[]): void {
  for (let i = 0; i < 9; i++) {
    const el = q<HTMLInputElement>(overlay, `#constantInput${i}`)
    if (el) el.value = String(values[i] ?? 0)
  }
}

function buildInputs(overlay: HTMLElement): void {
  const host = q<HTMLElement>(overlay, '#constantInputs')
  if (!host || host.children.length > 0) return
  for (let i = 0; i < 9; i++) {
    const wrap = document.createElement('div')
    wrap.style.display = 'flex'
    wrap.style.alignItems = 'center'
    wrap.style.gap = '4px'
    const label = document.createElement('span')
    label.textContent = `${LETTERS[i]}=`
    label.style.fontSize = '13px'
    label.style.minWidth = '18px'
    const input = document.createElement('input')
    input.type = 'number'
    input.step = 'any'
    input.id = `constantInput${i}`
    input.className = 'form-input-num'
    input.style.width = '100%'
    wrap.appendChild(label)
    wrap.appendChild(input)
    host.appendChild(wrap)
  }
}

function formatConstants(values: number[]): string {
  return values.map((v, i) => `${LETTERS[i]}=${v}`).join('\n')
}

function parseConstants(text: string): number[] | null {
  const out = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  let found = false
  for (const line of text.split(/\r?\n/)) {
    const m = line.trim().match(/^([a-i])\s*=\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/)
    if (m) {
      const idx = LETTERS.indexOf(m[1])
      const v = parseFloat(m[2])
      if (idx >= 0 && !isNaN(v)) {
        out[idx] = v
        found = true
      }
    }
  }
  return found ? out : null
}

export function initConstantDialog(overlayEl: HTMLElement): void {
  const dialogEl = overlayEl.querySelector<HTMLElement>('#constantDialog')
  const headerEl = overlayEl.querySelector<HTMLElement>('.dialog-header')
  if (dialogEl && headerEl) makeDraggable(dialogEl, headerEl)

  buildInputs(overlayEl)

  q<HTMLButtonElement>(overlayEl, '#constantOkBtn')?.addEventListener('click', () => {
    if (currentSvg) {
      setDocConstants(currentSvg, readInputs(overlayEl))
      updatePlotVisual(currentSvg)
    }
    hideConstantDialog(overlayEl)
  })
  q<HTMLButtonElement>(overlayEl, '#constantCancelBtn')?.addEventListener('click', () => hideConstantDialog(overlayEl))
  q<HTMLButtonElement>(overlayEl, '#closeConstantDialogBtn')?.addEventListener('click', () => hideConstantDialog(overlayEl))
  q<HTMLButtonElement>(overlayEl, '#constantCopyBtn')?.addEventListener('click', () => {
    const text = formatConstants(readInputs(overlayEl))
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(text).catch(() => {})
    }
  })
  q<HTMLButtonElement>(overlayEl, '#constantPasteBtn')?.addEventListener('click', () => {
    if (!navigator.clipboard) return
    void navigator.clipboard.readText().then((text) => {
      const parsed = parseConstants(text)
      if (parsed) writeInputs(overlayEl, parsed)
    }).catch(() => {})
  })
  overlayEl.addEventListener('mousedown', (e) => {
    if (e.target === overlayEl) hideConstantDialog(overlayEl)
  })
}

export function showConstantDialog(overlayEl: HTMLElement, svg?: SVGSVGElement | null): void {
  currentSvg = svg && document.body.contains(svg) ? svg : resolveAnalyzeSvg()
  if (!currentSvg) return
  buildInputs(overlayEl)
  writeInputs(overlayEl, getDocConstants(currentSvg))
  overlayEl.style.display = ''
}

export function hideConstantDialog(overlayEl: HTMLElement): void {
  overlayEl.style.display = 'none'
}
