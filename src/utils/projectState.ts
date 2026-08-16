let currentProjectFileName = 'FTIR.SMP'

export function getCurrentProjectFileName(): string {
  return currentProjectFileName
}

export function setCurrentProjectFileName(name: string): void {
  currentProjectFileName = name
}