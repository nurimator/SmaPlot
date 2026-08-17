import { createSVGElement } from './plot/svg.ts'
import { createSeriesSymbol, createArrowShapeSymbol } from './plot/symbols.ts'

interface OpenPopup {
  popup: HTMLElement
  button: HTMLButtonElement
  select: HTMLSelectElement
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

function buildPopupItems(select: HTMLSelectElement, popup: HTMLElement): void {
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
    if (i === select.selectedIndex) {
      item.classList.add('selected')
      item.setAttribute('aria-selected', 'true')
    }
    popup.appendChild(item)
  })
}

function positionPopup(popup: HTMLElement, button: HTMLButtonElement): void {
  const rect = button.getBoundingClientRect()
  const width = Math.max(rect.width, 160)
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

function commitValue(select: HTMLSelectElement, button: HTMLButtonElement, value: string): void {
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
  syncButtonText(select, button)
  closeCustomSelect()
}

function onPopupItemClick(item: HTMLElement): void {
  if (!openPopup) return
  const value = item.dataset.value || ''
  commitValue(openPopup.select, openPopup.button, value)
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
        if (!openPopup.popup.contains(target) && !openPopup.button.contains(target)) {
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
}