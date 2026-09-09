import { isMissingValue } from './types.ts'

function nextPow2(n: number): number {
  let p = 1
  while (p < n) p *= 2
  return Math.max(2, p)
}

export function fftForward(real: number[], imag: number[]): void {
  const n = real.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    while (j & bit) {
      j ^= bit
      bit >>= 1
    }
    j ^= bit
    if (i < j) {
      const tr = real[i]
      real[i] = real[j]
      real[j] = tr
      const ti = imag[i]
      imag[i] = imag[j]
      imag[j] = ti
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let j = 0; j < len / 2; j++) {
        const ur = real[i + j]
        const ui = imag[i + j]
        const vr = real[i + j + len / 2] * cr - imag[i + j + len / 2] * ci
        const vi = real[i + j + len / 2] * ci + imag[i + j + len / 2] * cr
        real[i + j] = ur + vr
        imag[i + j] = ui + vi
        real[i + j + len / 2] = ur - vr
        imag[i + j + len / 2] = ui - vi
        const nr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = nr
      }
    }
  }
}

export function fftInverse(real: number[], imag: number[]): void {
  const n = real.length
  for (let i = 0; i < n; i++) imag[i] = -imag[i]
  fftForward(real, imag)
  for (let i = 0; i < n; i++) {
    real[i] = real[i] / n
    imag[i] = -imag[i] / n
  }
}

export function fftMagnitude(real: number[], imag: number[]): number[] {
  return real.map((r, i) => Math.sqrt(r * r + imag[i] * imag[i]))
}

export function smoothFFT(y: number[], cutoff = 10): number[] {
  const vals: number[] = []
  const idx: number[] = []
  for (let i = 0; i < y.length; i++) {
    if (isMissingValue(y[i])) continue
    vals.push(y[i])
    idx.push(i)
  }
  if (vals.length < 4) return [...y]
  const n = vals.length
  const size = nextPow2(n)
  const real = new Array<number>(size).fill(0)
  const imag = new Array<number>(size).fill(0)
  const x0 = vals[0]
  const x1 = vals[n - 1]
  for (let i = 0; i < n; i++) {
    const trend = x0 + ((x1 - x0) * i) / (n - 1)
    real[i] = vals[i] - trend
  }
  fftForward(real, imag)
  const c = Math.max(1, Math.min(100, cutoff))
  for (let i = 0; i < size; i++) {
    const k = Math.min(i, size - i)
    const w = 1 - Math.pow((k * c) / size, 2)
    const win = w < 0 ? 0 : w
    real[i] *= win
    imag[i] *= win
  }
  fftInverse(real, imag)
  const out = [...y]
  for (let k = 0; k < n; k++) {
    const trend = x0 + ((x1 - x0) * k) / (n - 1)
    out[idx[k]] = real[k] + trend
  }
  return out
}

export function fftOfSignal(y: number[]): { freq: number[]; mag: number[] } {
  const vals = y.filter((v) => !isMissingValue(v))
  if (vals.length < 2) return { freq: [], mag: [] }
  const size = nextPow2(vals.length)
  const real = new Array<number>(size).fill(0)
  const imag = new Array<number>(size).fill(0)
  for (let i = 0; i < vals.length; i++) real[i] = vals[i]
  fftForward(real, imag)
  const freq: number[] = []
  const mag: number[] = []
  for (let i = 0; i < size / 2; i++) {
    freq.push(i / size)
    mag.push(Math.sqrt(real[i] * real[i] + imag[i] * imag[i]))
  }
  return { freq, mag }
}
