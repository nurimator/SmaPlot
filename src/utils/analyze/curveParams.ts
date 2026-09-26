export interface CurveParams {
  count: number
  analyzeType: number
  increment: number
  from: number
  to: number
  line: number
  width: number
  colorBgr: number
  pitch: number
  outrange: boolean
}

export const CURVE_DEFAULTS: CurveParams = {
  count: 101,
  analyzeType: 0,
  increment: 0,
  from: 0,
  to: 10,
  line: 1,
  width: 0.4,
  colorBgr: 0,
  pitch: 3,
  outrange: false,
}

function num(tok: string | undefined, fallback: number): number {
  if (tok === undefined || tok === '') return fallback
  const v = parseFloat(tok)
  return isNaN(v) ? fallback : v
}

export function parseCurveParams(zerosLine?: string, fixed5?: string): CurveParams {
  const z = (zerosLine || '').trim().split(/\s+/)
  const f = (fixed5 || '').trim().split(/\s+/)
  return {
    count: z.length >= 2 ? Math.max(2, Math.round(num(z[1], CURVE_DEFAULTS.count))) : CURVE_DEFAULTS.count,
    analyzeType: z.length >= 3 ? Math.round(num(z[2], 0)) : 0,
    increment: z.length >= 4 ? Math.round(num(z[3], 0)) : 0,
    from: z.length >= 5 ? num(z[4], CURVE_DEFAULTS.from) : CURVE_DEFAULTS.from,
    to: z.length >= 6 ? num(z[5], CURVE_DEFAULTS.to) : CURVE_DEFAULTS.to,
    line: f.length >= 1 ? Math.round(num(f[0], 1)) : 1,
    width: f.length >= 2 ? num(f[1], 40) / 100 : CURVE_DEFAULTS.width,
    colorBgr: f.length >= 3 ? Math.round(num(f[2], 0)) : 0,
    pitch: f.length >= 4 ? num(f[3], 300) / 100 : CURVE_DEFAULTS.pitch,
    outrange: z.length >= 9 ? z[8] === '1' : false,
  }
}

export function buildZerosLine(cp: CurveParams): string {
  const tail = cp.outrange ? '0 0 1' : '0 0 0'
  return `0 ${Math.max(2, Math.round(cp.count))} ${Math.round(cp.analyzeType)} ${Math.round(cp.increment)} ${cp.from} ${cp.to} ${tail}`
}

export function buildFixed5(cp: CurveParams, hadExtra: boolean): string {
  const base = `${Math.round(cp.line)} ${Math.round(cp.width * 100)} ${Math.round(cp.colorBgr)} ${Math.round(cp.pitch * 100)}`
  return hadExtra ? `${base} 1` : base
}

export function fixed5HasExtra(fixed5?: string): boolean {
  return (fixed5 || '').trim().split(/\s+/).filter((t) => t !== '').length >= 5
}

export function curveLineToName(code: number): string {
  switch (code) {
    case 2: return 'dash'
    case 3: return 'dotted'
    case 4: return 'dash_dot'
    case 5: return 'dash_dot_dot'
    case 6: return 'face'
    default: return 'solid'
  }
}

export function curveNameToCode(name: string): number {
  switch (name) {
    case 'dash':
    case 'dashed': return 2
    case 'dotted': return 3
    case 'dash_dot': return 4
    case 'dash_dot_dot': return 5
    case 'face': return 6
    default: return 1
  }
}

export function analyzeTypeName(type: number): string {
  switch (type) {
    case 1: return 'Exponential (ln y = a+bx)'
    case 2: return 'Logarithmic (y = a+b ln x)'
    case 3: return 'Power (ln y = a+b ln x)'
    case 4: return 'Polynomial degree 4'
    case 5: return 'Linear (a*x+b)'
    case 6: return 'General function'
    default: return 'Spline interpolation'
  }
}

export function isKnownCurveLine(code: number): boolean {
  return code >= 1 && code <= 6
}
