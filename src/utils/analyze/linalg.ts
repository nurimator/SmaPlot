export function solveLinearSystem(mat: number[][], rhs: number[]): number[] | null {
  const n = rhs.length
  if (n === 0) return []
  const a = mat.map((row, i) => [...row, rhs[i]])
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r][col]) > Math.abs(a[piv][col])) piv = r
    }
    if (Math.abs(a[piv][col]) < 1e-12) return null
    const tmp = a[col]
    a[col] = a[piv]
    a[piv] = tmp
    const div = a[col][col]
    for (let c = col; c <= n; c++) a[col][c] /= div
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = a[r][col]
      if (f === 0) continue
      for (let c = col; c <= n; c++) a[r][c] -= f * a[col][c]
    }
  }
  return a.map((row) => row[n])
}
