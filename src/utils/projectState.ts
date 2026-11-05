let currentProjectFileName = 'untitled.SMP'
let isUntitled = true
let savedDigest: string | null = null

export function getCurrentProjectFileName(): string {
  return currentProjectFileName
}

export function setCurrentProjectFileName(name: string): void {
  currentProjectFileName = name
  isUntitled = false
}

export function isProjectUntitled(): boolean {
  return isUntitled
}

export function setProjectUntitled(value: boolean): void {
  isUntitled = value
}

export function markProjectSaved(digest: string): void {
  savedDigest = digest
}

export function isProjectDirty(currentDigest: string): boolean {
  return savedDigest !== null && savedDigest !== currentDigest
}
