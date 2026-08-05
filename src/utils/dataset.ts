import type { Dataset } from '../types.ts'

export async function loadDataset(path: string): Promise<Dataset> {
  const res = await fetch(path)
  const text = await res.text()
  const x: number[] = []
  const y: number[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    const parts = line.split(/\s+/)
    if (parts.length >= 2) {
      x.push(parseFloat(parts[0]))
      y.push(parseFloat(parts[1]))
    }
  }
  const fileName = path.split('/').pop()?.replace('.txt', '') || 'Dataset'
  let name = fileName
  let color = '#000'
  if (fileName.includes('Cobalt') || fileName.includes('CoFe')) {
    name = 'CoFeO'
    color = '#ef4444'
  }
  if (fileName.includes('BiVO') || fileName.includes('BiVOTiO')) {
    name = 'BiVOTiO'
    color = '#10b981'
  }
  return { name, color, x, y }
}
