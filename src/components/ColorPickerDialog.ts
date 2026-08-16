import { makeDraggable } from '../utils/draggable.ts'

export interface ColorPickerOptions {
  initialColor: string
  onSelect?: (color: string) => void
  onChange?: (color: string) => void
  onCancel?: () => void
}

// 48 standard Basic Colors from Windows Palette (8 columns x 6 rows)
export const BASIC_COLORS: string[] = [
  '#FF8080', '#FFFF80', '#80FF80', '#00FF80', '#80FFFF', '#0080FF', '#FF80C0', '#FF80FF',
  '#FF0000', '#FFFF00', '#80FF00', '#00FF40', '#00FFFF', '#0080C0', '#8080C0', '#FF00FF',
  '#804040', '#FF8040', '#00FF00', '#008080', '#004080', '#8080FF', '#800040', '#FF0080',
  '#800000', '#FF6600', '#008000', '#008040', '#0000FF', '#000080', '#800080', '#8000FF',
  '#400000', '#804000', '#004000', '#004040', '#000040', '#000080', '#400040', '#400080',
  '#000000', '#808000', '#808040', '#808080', '#408080', '#C0C0C0', '#400040', '#FFFFFF',
]

const CUSTOM_COLORS_KEY = 'smaplot:custom-colors'

function loadCustomColors(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_COLORS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length === 16) {
        return parsed
      }
    }
  } catch {
    // ignore
  }
  return Array(16).fill('#FFFFFF')
}

function saveCustomColors(colors: string[]): void {
  try {
    localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(colors))
  } catch {
    // ignore
  }
}

// Color conversion math (HSV <-> RGB <-> Hex)
export function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  h = ((h % 360) + 360) % 360
  s = Math.max(0, Math.min(1, s))
  v = Math.max(0, Math.min(1, v))
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r1 = 0
  let g1 = 0
  let b1 = 0
  if (h < 60) {
    r1 = c
    g1 = x
    b1 = 0
  } else if (h < 120) {
    r1 = x
    g1 = c
    b1 = 0
  } else if (h < 180) {
    r1 = 0
    g1 = c
    b1 = x
  } else if (h < 240) {
    r1 = 0
    g1 = x
    b1 = c
  } else if (h < 300) {
    r1 = x
    g1 = 0
    b1 = c
  } else {
    r1 = c
    g1 = 0
    b1 = x
  }
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  }
}

export function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  const s = max === 0 ? 0 : d / max
  const v = max

  if (d !== 0) {
    if (max === r) {
      h = ((g - b) / d) % 6
    } else if (max === g) {
      h = (b - r) / d + 2
    } else {
      h = (r - g) / d + 4
    }
    h = Math.round(h * 60)
    if (h < 0) h += 360
  }
  return { h, s, v }
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  hex = hex.trim().replace(/^#/, '')
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (hex.length !== 6) return null
  const num = parseInt(hex, 16)
  if (isNaN(num)) return null
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  }
}

let activeOptions: ColorPickerOptions | null = null
let currentHue = 0 // 0..360
let currentSat = 1 // 0..1
let currentVal = 1 // 0..1
let initialHex = '#000000'
let customColors: string[] = loadCustomColors()
let selectedCustomSlotIndex = 0

let isDraggingSb = false
let isDraggingHue = false

export function hideColorPickerDialog(overlayEl: HTMLElement): void {
  overlayEl.style.display = 'none'
  activeOptions = null
}

export function initColorPickerDialog(overlayEl: HTMLElement): void {
  const dialogEl = overlayEl.querySelector<HTMLElement>('#colorPickerDialog')
  const headerEl = overlayEl.querySelector<HTMLElement>('.dialog-header')
  if (dialogEl && headerEl) {
    makeDraggable(dialogEl, headerEl)
  }

  const basicGridEl = overlayEl.querySelector<HTMLElement>('#colorBasicGrid')
  const customGridEl = overlayEl.querySelector<HTMLElement>('#colorCustomGrid')
  const sbBoxEl = overlayEl.querySelector<HTMLElement>('#colorSbBox')
  const sbHandleEl = overlayEl.querySelector<HTMLElement>('#colorSbHandle')
  const hueBarEl = overlayEl.querySelector<HTMLElement>('#colorHueBar')
  const hueHandleEl = overlayEl.querySelector<HTMLElement>('#colorHueHandle')

  const previewCurrentEl = overlayEl.querySelector<HTMLElement>('#colorPreviewCurrent')
  const previewInitialEl = overlayEl.querySelector<HTMLElement>('#colorPreviewInitial')

  const hexInput = overlayEl.querySelector<HTMLInputElement>('#colorHexInput')
  const rInput = overlayEl.querySelector<HTMLInputElement>('#colorRInput')
  const gInput = overlayEl.querySelector<HTMLInputElement>('#colorGInput')
  const bInput = overlayEl.querySelector<HTMLInputElement>('#colorBInput')
  const hInput = overlayEl.querySelector<HTMLInputElement>('#colorHInput')
  const sInput = overlayEl.querySelector<HTMLInputElement>('#colorSInput')
  const vInput = overlayEl.querySelector<HTMLInputElement>('#colorVInput')

  const okBtn = overlayEl.querySelector<HTMLButtonElement>('#colorOkBtn')
  const cancelBtn = overlayEl.querySelector<HTMLButtonElement>('#colorCancelBtn')
  const closeBtn = overlayEl.querySelector<HTMLButtonElement>('#closeColorPickerBtn')
  const addCustomBtn = overlayEl.querySelector<HTMLButtonElement>('#colorAddCustomBtn')

  // Render Basic Colors Grid
  if (basicGridEl) {
    basicGridEl.innerHTML = ''
    BASIC_COLORS.forEach((color) => {
      const swatch = document.createElement('div')
      swatch.className = 'color-swatch-box'
      swatch.style.backgroundColor = color
      swatch.title = color
      swatch.setAttribute('data-color', color)
      swatch.addEventListener('click', () => {
        applyColorFromHex(color)
      })
      basicGridEl.appendChild(swatch)
    })
  }

  // Render Custom Colors Grid
  const renderCustomGrid = () => {
    if (!customGridEl) return
    customGridEl.innerHTML = ''
    customColors.forEach((color, idx) => {
      const swatch = document.createElement('div')
      swatch.className = `color-swatch-box${idx === selectedCustomSlotIndex ? ' selected-slot' : ''}`
      swatch.style.backgroundColor = color
      swatch.title = `Custom color ${idx + 1}: ${color}`
      swatch.setAttribute('data-color', color)
      swatch.addEventListener('click', () => {
        selectedCustomSlotIndex = idx
        renderCustomGrid()
        applyColorFromHex(color)
      })
      customGridEl.appendChild(swatch)
    })
  }
  renderCustomGrid()

  // Update UI Elements with Current Color State
  const updateUI = (source?: string) => {
    const rgb = hsvToRgb(currentHue, currentSat, currentVal)
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b)

    // Update Saturation/Brightness Box background Hue
    if (sbBoxEl) {
      sbBoxEl.style.backgroundColor = `hsl(${currentHue}, 100%, 50%)`
    }

    // Update Saturation/Brightness Handle Position
    if (sbHandleEl && sbBoxEl) {
      const rect = sbBoxEl.getBoundingClientRect()
      const boxW = rect.width || 180
      const boxH = rect.height || 180
      const x = Math.max(0, Math.min(boxW, currentSat * boxW))
      const y = Math.max(0, Math.min(boxH, (1 - currentVal) * boxH))
      sbHandleEl.style.left = `${x}px`
      sbHandleEl.style.top = `${y}px`
    }

    // Update Hue Handle Position
    if (hueHandleEl && hueBarEl) {
      const rect = hueBarEl.getBoundingClientRect()
      const barH = rect.height || 180
      const y = Math.max(0, Math.min(barH, (currentHue / 360) * barH))
      hueHandleEl.style.top = `${y}px`
    }

    // Previews
    if (previewCurrentEl) {
      previewCurrentEl.style.backgroundColor = hex
    }
    if (previewInitialEl) {
      previewInitialEl.style.backgroundColor = initialHex
    }

    // Input fields
    if (source !== 'hex' && hexInput) {
      hexInput.value = hex
    }
    if (source !== 'rgb') {
      if (rInput) rInput.value = String(rgb.r)
      if (gInput) gInput.value = String(rgb.g)
      if (bInput) bInput.value = String(rgb.b)
    }
    if (source !== 'hsv') {
      if (hInput) hInput.value = String(Math.round(currentHue))
      if (sInput) sInput.value = String(Math.round(currentSat * 100))
      if (vInput) vInput.value = String(Math.round(currentVal * 100))
    }

    // Trigger live onChange if provided
    if (activeOptions?.onChange) {
      activeOptions.onChange(hex)
    }
  }

  const applyColorFromHex = (hex: string) => {
    const rgb = hexToRgb(hex)
    if (!rgb) return
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b)
    currentHue = hsv.h
    currentSat = hsv.s
    currentVal = hsv.v
    updateUI()
  }

  // Handle SB Box Dragging
  const handleSbEvent = (e: MouseEvent | TouchEvent) => {
    if (!sbBoxEl) return
    const rect = sbBoxEl.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY

    const x = Math.max(0, Math.min(rect.width, clientX - rect.left))
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top))

    currentSat = rect.width > 0 ? x / rect.width : 0
    currentVal = rect.height > 0 ? 1 - y / rect.height : 0

    updateUI('sb')
  }

  sbBoxEl?.addEventListener('mousedown', (e) => {
    e.preventDefault()
    isDraggingSb = true
    handleSbEvent(e)
  })

  // Handle Hue Bar Dragging
  const handleHueEvent = (e: MouseEvent | TouchEvent) => {
    if (!hueBarEl) return
    const rect = hueBarEl.getBoundingClientRect()
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY

    const y = Math.max(0, Math.min(rect.height, clientY - rect.top))
    currentHue = rect.height > 0 ? (y / rect.height) * 360 : 0
    if (currentHue >= 360) currentHue = 359.9

    updateUI('hue')
  }

  hueBarEl?.addEventListener('mousedown', (e) => {
    e.preventDefault()
    isDraggingHue = true
    handleHueEvent(e)
  })

  window.addEventListener('mousemove', (e) => {
    if (isDraggingSb) {
      e.preventDefault()
      handleSbEvent(e)
    } else if (isDraggingHue) {
      e.preventDefault()
      handleHueEvent(e)
    }
  })

  window.addEventListener('mouseup', () => {
    isDraggingSb = false
    isDraggingHue = false
  })

  // Hex Input Listener
  hexInput?.addEventListener('input', () => {
    let val = hexInput.value.trim()
    if (!val.startsWith('#')) val = '#' + val
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
      const rgb = hexToRgb(val)
      if (rgb) {
        const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b)
        currentHue = hsv.h
        currentSat = hsv.s
        currentVal = hsv.v
        updateUI('hex')
      }
    }
  })

  // RGB Input Listeners
  const onRgbInput = () => {
    const r = Math.max(0, Math.min(255, parseInt(rInput?.value || '0', 10) || 0))
    const g = Math.max(0, Math.min(255, parseInt(gInput?.value || '0', 10) || 0))
    const b = Math.max(0, Math.min(255, parseInt(bInput?.value || '0', 10) || 0))
    const hsv = rgbToHsv(r, g, b)
    currentHue = hsv.h
    currentSat = hsv.s
    currentVal = hsv.v
    updateUI('rgb')
  }
  rInput?.addEventListener('input', onRgbInput)
  gInput?.addEventListener('input', onRgbInput)
  bInput?.addEventListener('input', onRgbInput)

  // HSV Input Listeners
  const onHsvInput = () => {
    const h = Math.max(0, Math.min(360, parseFloat(hInput?.value || '0') || 0))
    const s = Math.max(0, Math.min(100, parseFloat(sInput?.value || '0') || 0)) / 100
    const v = Math.max(0, Math.min(100, parseFloat(vInput?.value || '0') || 0)) / 100
    currentHue = h >= 360 ? 359.9 : h
    currentSat = s
    currentVal = v
    updateUI('hsv')
  }
  hInput?.addEventListener('input', onHsvInput)
  sInput?.addEventListener('input', onHsvInput)
  vInput?.addEventListener('input', onHsvInput)

  // Add to Custom Colors button
  addCustomBtn?.addEventListener('click', () => {
    const rgb = hsvToRgb(currentHue, currentSat, currentVal)
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b)
    customColors[selectedCustomSlotIndex] = hex
    saveCustomColors(customColors)
    selectedCustomSlotIndex = (selectedCustomSlotIndex + 1) % 16
    renderCustomGrid()
  })

  // Actions: OK, Cancel, Close
  const closeDialog = () => {
    hideColorPickerDialog(overlayEl)
  }

  okBtn?.addEventListener('click', () => {
    const rgb = hsvToRgb(currentHue, currentSat, currentVal)
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b)
    if (activeOptions?.onSelect) {
      activeOptions.onSelect(hex)
    }
    closeDialog()
  })

  cancelBtn?.addEventListener('click', () => {
    if (activeOptions?.onCancel) {
      activeOptions.onCancel()
    }
    closeDialog()
  })

  closeBtn?.addEventListener('click', () => {
    if (activeOptions?.onCancel) {
      activeOptions.onCancel()
    }
    closeDialog()
  })

  // Global helper for opening Color Picker
  ;(window as unknown as { openColorPickerModal?: typeof openColorPicker }).openColorPickerModal = (
    options: ColorPickerOptions
  ) => {
    activeOptions = options
    initialHex = options.initialColor || '#000000'
    const rgb = hexToRgb(initialHex) || { r: 0, g: 0, b: 0 }
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b)
    currentHue = hsv.h
    currentSat = hsv.s
    currentVal = hsv.v

    overlayEl.style.display = 'flex'
    renderCustomGrid()
    requestAnimationFrame(() => {
      updateUI()
    })
  }

  // Hook all existing and future color-picker-box inputs automatically!
  initGlobalColorInputIntercept()
}

export function openColorPicker(options: ColorPickerOptions): void {
  const overlayEl = document.querySelector<HTMLElement>('#colorPickerOverlay')
  if (!overlayEl) return
  const fn = (window as unknown as { openColorPickerModal?: (opts: ColorPickerOptions) => void }).openColorPickerModal
  if (fn) {
    fn(options)
  }
}

/**
 * Intercept clicks on any `<input type="color">` or `.color-picker-box` across the application
 * so our custom color dialog seamlessly replaces the browser's native picker.
 */
export function initGlobalColorInputIntercept(): void {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (!target) return
    const input = target.closest<HTMLInputElement>('input[type="color"], .color-picker-box')
    if (!input) return

    // If it's an input inside our own color picker dialog, ignore
    if (input.closest('#colorPickerDialog')) return

    e.preventDefault()
    e.stopPropagation()

    const initialColor = input.value || '#000000'
    openColorPicker({
      initialColor,
      onChange: (liveHex) => {
        // live preview update
        if (input.value !== liveHex) {
          input.value = liveHex
          input.dispatchEvent(new Event('input', { bubbles: true }))
        }
      },
      onSelect: (chosenHex) => {
        input.value = chosenHex
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
      },
      onCancel: () => {
        if (input.value !== initialColor) {
          input.value = initialColor
          input.dispatchEvent(new Event('input', { bubbles: true }))
          input.dispatchEvent(new Event('change', { bubbles: true }))
        }
      },
    })
  })
}
