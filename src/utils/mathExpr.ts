export type MathVar = 'x' | 'y'

export type CompiledMathExpr = (value: number, constants?: readonly number[]) => number

type Node = (value: number, constants: readonly number[]) => number

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'id'; name: string }
  | { kind: 'op'; op: string }

// tables
const CONSTANT_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']

const UNARY_FUNCTIONS: Record<string, (v: number) => number> = {
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  sqrt: Math.sqrt,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  abs: Math.abs,
  ceil: Math.ceil,
  floor: Math.floor,
  theta: (v) => (v < 0 ? 0 : 1),
}

const BINARY_FUNCTIONS: Record<string, (a: number, b: number) => number> = {
  pow: power,
}

function power(base: number, exponent: number): number {
  if (exponent === 0) return 1
  if (base === 0) return 0
  return Math.pow(base, exponent)
}

function divide(a: number, b: number): number {
  return b === 0 ? NaN : a / b
}

// tokenize
function tokenize(source: string): Token[] | null {
  const tokens: Token[] = []
  let i = 0
  while (i < source.length) {
    const ch = source[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(source.slice(i))
    if (num) {
      tokens.push({ kind: 'num', value: Number(num[0]) })
      i += num[0].length
      continue
    }
    const id = /^[a-z_][a-z0-9_]*/i.exec(source.slice(i))
    if (id) {
      tokens.push({ kind: 'id', name: id[0].toLowerCase() })
      i += id[0].length
      continue
    }
    if ('+-*/^(),'.includes(ch)) {
      tokens.push({ kind: 'op', op: ch })
      i++
      continue
    }
    return null
  }
  return tokens
}

// parse
class ParseError extends Error {}

function parse(tokens: Token[], varName: MathVar): Node {
  let pos = 0
  const peekOp = (op: string): boolean => {
    const t = tokens[pos]
    return t !== undefined && t.kind === 'op' && t.op === op
  }
  const expectOp = (op: string): void => {
    if (!peekOp(op)) throw new ParseError(op)
    pos++
  }

  const parseExpr = (): Node => {
    let left = parseTerm()
    while (peekOp('+') || peekOp('-')) {
      const op = (tokens[pos++] as { op: string }).op
      const l = left
      const r = parseTerm()
      left = op === '+' ? (v, c) => l(v, c) + r(v, c) : (v, c) => l(v, c) - r(v, c)
    }
    return left
  }

  const parseTerm = (): Node => {
    let left = parsePower()
    while (peekOp('*') || peekOp('/')) {
      const op = (tokens[pos++] as { op: string }).op
      const l = left
      const r = parsePower()
      left = op === '*' ? (v, c) => l(v, c) * r(v, c) : (v, c) => divide(l(v, c), r(v, c))
    }
    return left
  }

  const parsePower = (): Node => {
    const base = parseUnary()
    if (!peekOp('^')) return base
    pos++
    const exponent = parsePower()
    return (v, c) => power(base(v, c), exponent(v, c))
  }

  const parseUnary = (): Node => {
    if (peekOp('+')) {
      pos++
      return parsePrimary()
    }
    if (peekOp('-')) {
      pos++
      const operand = parsePrimary()
      return (v, c) => -operand(v, c)
    }
    return parsePrimary()
  }

  const parseArgs = (): Node[] => {
    expectOp('(')
    const args = [parseExpr()]
    while (peekOp(',')) {
      pos++
      args.push(parseExpr())
    }
    expectOp(')')
    return args
  }

  const parsePrimary = (): Node => {
    const t = tokens[pos]
    if (!t) throw new ParseError('eof')
    if (t.kind === 'num') {
      pos++
      const value = t.value
      return () => value
    }
    if (t.kind === 'op') {
      if (t.op !== '(') throw new ParseError(t.op)
      pos++
      const inner = parseExpr()
      expectOp(')')
      return inner
    }
    pos++
    const name = t.name
    const unary = UNARY_FUNCTIONS[name]
    if (unary) {
      const args = parseArgs()
      if (args.length !== 1) throw new ParseError(name)
      const arg = args[0]
      return (v, c) => unary(arg(v, c))
    }
    const binary = BINARY_FUNCTIONS[name]
    if (binary) {
      const args = parseArgs()
      if (args.length !== 2) throw new ParseError(name)
      const [a, b] = args
      return (v, c) => binary(a(v, c), b(v, c))
    }
    if (name === varName) return (v) => v
    if (name === 'pi') return () => Math.PI
    const constIndex = CONSTANT_NAMES.indexOf(name)
    if (constIndex >= 0) return (_v, c) => c[constIndex] ?? 0
    throw new ParseError(name)
  }

  const root = parseExpr()
  if (pos !== tokens.length) throw new ParseError('trailing')
  return root
}

// compile
const compileCache = new Map<string, CompiledMathExpr | null>()
const NO_CONSTANTS: readonly number[] = []

export function compileMathExpr(source: string, varName: MathVar): CompiledMathExpr | null {
  const key = `${varName}::${source}`
  const cached = compileCache.get(key)
  if (cached !== undefined) return cached
  let compiled: CompiledMathExpr | null = null
  const tokens = tokenize(source)
  if (tokens && tokens.length > 0) {
    try {
      const root = parse(tokens, varName)
      compiled = (value, constants) => root(value, constants || NO_CONSTANTS)
    } catch (err) {
      if (!(err instanceof ParseError)) throw err
    }
  }
  compileCache.set(key, compiled)
  return compiled
}
