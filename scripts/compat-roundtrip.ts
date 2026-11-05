import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseSmpContent } from '../src/utils/smpParser.ts'
import { serializeSmpDoc, serializeSmpProject } from '../src/utils/smpExporter.ts'
import type { SmpPlotDoc } from '../src/types.ts'

// usage: node scripts/compat-roundtrip.ts [dir...] [--verbose] [--skip=<regex>]

interface Row {
  file: string
  status: 'OK' | 'DIFF' | 'FAIL'
  diffs: number
  stable: boolean
  lines: string[]
}

const args = process.argv.slice(2)
const verbose = args.includes('--verbose')
const skipArg = args.find((a) => a.startsWith('--skip='))
const skip = skipArg ? new RegExp(skipArg.slice('--skip='.length), 'i') : null
const roots = args.filter((a) => !a.startsWith('--'))
if (roots.length === 0) roots.push('dummy-data')

const decoder = new TextDecoder('windows-1252')

function collect(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) collect(path, out)
    else if (/\.sm[pa]$/i.test(name)) out.push(path)
  }
}

function countLines(lines: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const l of lines) counts.set(l, (counts.get(l) || 0) + 1)
  return counts
}

function diffLines(a: string[], b: string[]): { total: number; lines: string[] } {
  const ca = countLines(a)
  const cb = countLines(b)
  const out: string[] = []
  let total = 0
  const show = (l: string): string => (l.length > 100 ? `${l.slice(0, 100)}...` : l)
  for (const [line, n] of ca) {
    const m = cb.get(line) || 0
    if (n > m) {
      out.push(`- IN  x${n - m}: ${show(line)}`)
      total += n - m
    }
  }
  for (const [line, m] of cb) {
    const n = ca.get(line) || 0
    if (m > n) {
      out.push(`+ OUT x${m - n}: ${show(line)}`)
      total += m - n
    }
  }
  return { total, lines: out }
}

function serialize(docs: SmpPlotDoc[]): string {
  return docs.length === 1 ? serializeSmpDoc(docs[0], false) : serializeSmpProject(docs)
}

const files: string[] = []
for (const root of roots) collect(root, files)

const rows: Row[] = []
for (const file of files.sort()) {
  const name = relative(process.cwd(), file)
  if (skip && skip.test(name)) continue
  const text = decoder.decode(readFileSync(file))
  try {
    const first = serialize(parseSmpContent(text, name).smpMeta.docs)
    const second = serialize(parseSmpContent(first, name).smpMeta.docs)
    const d = diffLines(text.split(/\r?\n/), first.split(/\r?\n/))
    rows.push({ file: name, status: d.total === 0 ? 'OK' : 'DIFF', diffs: d.total, stable: first === second, lines: d.lines })
  } catch (err) {
    rows.push({ file: name, status: 'FAIL', diffs: -1, stable: false, lines: [`threw: ${(err as Error).message}`] })
  }
}

let totalDiffs = 0
for (const r of rows) {
  if (r.diffs > 0) totalDiffs += r.diffs
  console.log(`${r.status.padEnd(4)} ${String(r.diffs).padStart(6)}  ${(r.stable ? 'stable' : 'UNSTABLE').padEnd(8)} ${r.file}`)
  if (verbose) for (const l of r.lines) console.log(`        ${l}`)
}

const changed = rows.filter((r) => r.status !== 'OK').length
const failed = rows.filter((r) => r.status === 'FAIL' || !r.stable).length
console.log('')
console.log(`${rows.length} file(s), ${changed} differ from source, ${totalDiffs} differing line(s), ${failed} failed/unstable`)
process.exitCode = failed > 0 ? 1 : 0
