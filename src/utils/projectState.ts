let currentProjectFileName = 'untitled.SMP'
let isUntitled = true

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