export interface RecentFile {
  name: string
  content: string
  openedAt: number
}

const STORAGE_KEY = 'smaplot:recent-files'
const MAX_RECENT = 5

export function getRecentFiles(): RecentFile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (r): r is RecentFile =>
          !!r &&
          typeof (r as RecentFile).name === 'string' &&
          typeof (r as RecentFile).content === 'string'
      )
      .slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

export function addRecentFile(name: string, content: string): void {
  const existing = getRecentFiles().filter((r) => r.name !== name)
  const entry: RecentFile = { name, content, openedAt: Date.now() }
  const trimmed = [entry, ...existing].slice(0, MAX_RECENT)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // Quota exceeded (file too large): keep the newest full copy,
    // drop the content payloads of the rest so the list still works.
    try {
      const nameOnly = [
        entry,
        ...existing.slice(0, MAX_RECENT - 1).map((r) => ({ ...r, content: '' })),
      ]
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nameOnly))
    } catch {
      // Even that failed — ignore; the list simply won't persist.
    }
  }
}
