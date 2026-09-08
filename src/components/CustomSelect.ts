import { createSVGElement } from './plot/svg.ts'
import { createSeriesSymbol, createArrowShapeSymbol } from './plot/symbols.ts'

interface OpenPopup {
  popup: HTMLElement
  button: HTMLElement
  select?: HTMLSelectElement
  input?: HTMLInputElement
  focusIndex: number
}

let openPopup: OpenPopup | null = null

function buildIconSvg(symbol: SVGElement | null): string {
  if (!symbol) return ''
  const svg = createSVGElement('svg')
  svg.setAttribute('viewBox', '0 0 12 12')
  svg.setAttribute('width', '14')
  svg.setAttribute('height', '14')
  svg.setAttribute('class', 'custom-select-symbol')
  svg.setAttribute('aria-hidden', 'true')
  svg.appendChild(symbol)
  return svg.outerHTML
}

function optionIconHtml(opt: HTMLOptionElement): string {
  if (opt.dataset.symbol === 'series') {
    return buildIconSvg(createSeriesSymbol(opt.value, 6, 6, 4.5, '#475569', '#ffffff'))
  }
  if (opt.dataset.symbol === 'arrow') {
    return buildIconSvg(createArrowShapeSymbol(opt.value))
  }
  return ''
}

function syncButtonText(select: HTMLSelectElement, button: HTMLButtonElement): void {
  const opt = select.options[select.selectedIndex]
  if (!opt) {
    button.textContent = ''
    return
  }
  const icon = optionIconHtml(opt)
  if (icon) {
    button.innerHTML = icon
  } else {
    button.textContent = opt.textContent || opt.value
  }
}

function buildPopupItems(select: HTMLSelectElement, popup: HTMLElement, currentValue?: string): void {
  popup.innerHTML = ''
  Array.from(select.options).forEach((opt, i) => {
    const item = document.createElement('div')
    item.className = 'custom-select-item'
    item.dataset.value = opt.value
    item.setAttribute('role', 'option')
    const icon = optionIconHtml(opt)
    if (icon) {
      item.innerHTML = icon
      const label = document.createElement('span')
      label.textContent = opt.textContent || opt.value
      item.appendChild(label)
    } else {
      item.textContent = opt.textContent || opt.value
    }
    const isSelected = currentValue !== undefined ? opt.value === currentValue : i === select.selectedIndex
    if (isSelected) {
      item.classList.add('selected')
      item.setAttribute('aria-selected', 'true')
    }
    popup.appendChild(item)
  })
}

function positionPopup(popup: HTMLElement, anchorEl: HTMLElement): void {
  const rect = anchorEl.getBoundingClientRect()
  const width = Math.max(rect.width, 90)
  popup.style.minWidth = `${width}px`
  const height = popup.offsetHeight
  let left = rect.left
  let top = rect.bottom + 4
  if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8)
  if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 4)
  popup.style.left = `${left}px`
  popup.style.top = `${top}px`
}

export function closeCustomSelect(): void {
  if (!openPopup) return
  openPopup.popup.classList.remove('open')
  openPopup.button.classList.remove('open')
  openPopup.button.setAttribute('aria-expanded', 'false')
  openPopup = null
}

function openCustomSelect(
  select: HTMLSelectElement,
  button: HTMLButtonElement,
  popup: HTMLElement
): void {
  closeCustomSelect()
  buildPopupItems(select, popup)
  popup.classList.add('open')
  positionPopup(popup, button)
  openPopup = { popup, button, select, focusIndex: select.selectedIndex }
  button.classList.add('open')
  button.setAttribute('aria-expanded', 'true')
}

function openCustomCombobox(
  input: HTMLInputElement,
  select: HTMLSelectElement,
  toggleBtn: HTMLButtonElement,
  combobox: HTMLElement,
  popup: HTMLElement
): void {
  closeCustomSelect()
  const curVal = input.value.trim()
  buildPopupItems(select, popup, curVal)
  popup.classList.add('open')
  positionPopup(popup, combobox)
  const items = Array.from(popup.querySelectorAll<HTMLElement>('.custom-select-item'))
  const selectedIdx = items.findIndex((it) => it.dataset.value === curVal)
  openPopup = { popup, button: toggleBtn, select, input, focusIndex: selectedIdx >= 0 ? selectedIdx : 0 }
  toggleBtn.classList.add('open')
  toggleBtn.setAttribute('aria-expanded', 'true')
  if (selectedIdx >= 0 && items[selectedIdx]) {
    items[selectedIdx].scrollIntoView({ block: 'nearest' })
  }
}

function commitValue(select: HTMLSelectElement, button: HTMLButtonElement, value: string): void {
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
  syncButtonText(select, button)
  closeCustomSelect()
}

function onPopupItemClick(item: HTMLElement): void {
  if (!openPopup) return
  const value = item.dataset.value || ''
  if (openPopup.input) {
    openPopup.input.value = value
    if (openPopup.select) openPopup.select.value = value
    openPopup.input.dispatchEvent(new Event('input', { bubbles: true }))
    openPopup.input.dispatchEvent(new Event('change', { bubbles: true }))
    closeCustomSelect()
  } else if (openPopup.select && openPopup.button instanceof HTMLButtonElement) {
    commitValue(openPopup.select, openPopup.button, value)
  }
}

export function initCustomSelects(scope: ParentNode = document): void {
  let globalListenersBound = false
  const selects = scope.querySelectorAll<HTMLSelectElement>('select.form-select')
  selects.forEach((select) => {
    if (select.dataset.customSelect === '1') return
    select.dataset.customSelect = '1'

    const button = document.createElement('button')
    button.type = 'button'
    button.className = `${select.className} custom-select-button`
    button.setAttribute('role', 'combobox')
    button.setAttribute('aria-haspopup', 'listbox')
    button.setAttribute('aria-expanded', 'false')
    if (select.title) button.title = select.title
    if (select.disabled) button.disabled = true
    syncButtonText(select, button)
    select.style.display = 'none'
    select.parentElement?.insertBefore(button, select)

    const popup = document.createElement('div')
    popup.className = 'custom-select-popup'
    popup.setAttribute('role', 'listbox')
    document.body.appendChild(popup)

    button.addEventListener('click', () => {
      if (openPopup && openPopup.button === button) {
        closeCustomSelect()
      } else {
        openCustomSelect(select, button, popup)
      }
    })

    button.addEventListener('keydown', (e: KeyboardEvent) => {
      const cur = openPopup
      if (!cur || cur.button !== button) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openCustomSelect(select, button, popup)
        }
        return
      }
      const items = Array.from(popup.querySelectorAll<HTMLElement>('.custom-select-item'))
      if (items.length === 0) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const dir = e.key === 'ArrowDown' ? 1 : -1
        let idx = cur.focusIndex
        if (idx < 0) idx = dir === 1 ? -1 : 0
        idx = Math.min(items.length - 1, Math.max(0, idx + dir))
        cur.focusIndex = idx
        items.forEach((it, i) => {
          it.classList.toggle('active', i === idx)
        })
        items[idx].scrollIntoView({ block: 'nearest' })
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        const idx = cur.focusIndex
        if (idx >= 0 && idx < items.length) onPopupItemClick(items[idx])
      } else if (e.key === 'Escape') {
        e.preventDefault()
        closeCustomSelect()
      }
    })

    popup.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault()
      const item = (e.target as HTMLElement).closest<HTMLElement>('.custom-select-item')
      if (item) onPopupItemClick(item)
    })

    const nativeValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')
    if (nativeValue?.get && nativeValue.set) {
      Object.defineProperty(select, 'value', {
        configurable: true,
        get: () => nativeValue.get!.call(select),
        set: (v: string) => {
          nativeValue.set!.call(select, v)
          syncButtonText(select, button)
        },
      })
    }

    const observer = new MutationObserver(() => syncButtonText(select, button))
    observer.observe(select, { childList: true })

    if (!globalListenersBound) {
      globalListenersBound = true
      document.addEventListener('mousedown', (e: MouseEvent) => {
        if (!openPopup) return
        const target = e.target as Node
        if (
          !openPopup.popup.contains(target) &&
          !openPopup.button.contains(target) &&
          !(openPopup.input && openPopup.input.contains(target))
        ) {
          closeCustomSelect()
        }
      })
      document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') closeCustomSelect()
      })
      document.addEventListener('scroll', (e: Event) => {
        if (!openPopup) return
        const target = e.target as Node | null
        if (target && openPopup.popup.contains(target)) return
        closeCustomSelect()
      }, true)
      window.addEventListener('resize', () => closeCustomSelect())
      window.addEventListener('blur', () => closeCustomSelect())
    }
  })

  initCustomComboboxes(scope)
}

export function initCustomComboboxes(scope: ParentNode = document): void {
  const combos = scope.querySelectorAll<HTMLElement>('.custom-combobox')
  combos.forEach((combobox) => {
    if (combobox.dataset.customCombobox === '1') return
    combobox.dataset.customCombobox = '1'

    const input = combobox.querySelector<HTMLInputElement>('.custom-combobox-input')
    const select = combobox.querySelector<HTMLSelectElement>('.custom-combobox-select')
    if (!input || !select) return

    select.style.display = 'none'

    const toggleBtn = document.createElement('button')
    toggleBtn.type = 'button'
    toggleBtn.className = 'custom-combobox-toggle'
    toggleBtn.setAttribute('tabindex', '-1')
    toggleBtn.setAttribute('aria-label', 'Toggle options')
    combobox.appendChild(toggleBtn)

    const popup = document.createElement('div')
    popup.className = 'custom-select-popup'
    popup.setAttribute('role', 'listbox')
    document.body.appendChild(popup)

    toggleBtn.addEventListener('click', (e: MouseEvent) => {
      e.preventDefault()
      if (openPopup && openPopup.popup === popup) {
        closeCustomSelect()
      } else {
        openCustomCombobox(input, select, toggleBtn, combobox, popup)
      }
    })

    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' && (e.altKey || !openPopup)) {
        e.preventDefault()
        openCustomCombobox(input, select, toggleBtn, combobox, popup)
        return
      }
      if (!openPopup || openPopup.popup !== popup) return

      const items = Array.from(popup.querySelectorAll<HTMLElement>('.custom-select-item'))
      if (items.length === 0) return

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const dir = e.key === 'ArrowDown' ? 1 : -1
        let idx = openPopup.focusIndex
        if (idx < 0) idx = dir === 1 ? -1 : 0
        idx = Math.min(items.length - 1, Math.max(0, idx + dir))
        openPopup.focusIndex = idx
        items.forEach((it, i) => {
          it.classList.toggle('active', i === idx)
        })
        items[idx].scrollIntoView({ block: 'nearest' })
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const idx = openPopup.focusIndex
        if (idx >= 0 && idx < items.length) onPopupItemClick(items[idx])
      } else if (e.key === 'Escape') {
        e.preventDefault()
        closeCustomSelect()
      }
    })

    popup.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault()
      const item = (e.target as HTMLElement).closest<HTMLElement>('.custom-select-item')
      if (item) onPopupItemClick(item)
    })
  })
}