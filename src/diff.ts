import { words, type Token } from './tokens'


export type Aligned = { op: 'eq' | 'del' | 'ins'; a?: Token; b?: Token }

// Above this many table cells the LCS is skipped: a dictation that long is shown as replaced.
const MAX_CELLS = 250_000

function align(x: Token[], y: Token[]): Aligned[] {
  if (x.length * y.length > MAX_CELLS) {
    return [...x.map(a => ({ op: 'del' as const, a })), ...y.map(b => ({ op: 'ins' as const, b }))]
  }
  const n = x.length
  const m = y.length
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i]![j] = x[i]!.norm === y[j]!.norm ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!)
    }
  }
  const out: Aligned[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (x[i]!.norm === y[j]!.norm) out.push({ op: 'eq', a: x[i++], b: y[j++] })
    else if (L[i + 1]![j]! >= L[i]![j + 1]!) out.push({ op: 'del', a: x[i++] })
    else out.push({ op: 'ins', b: y[j++] })
  }
  while (i < n) out.push({ op: 'del', a: x[i++] })
  while (j < m) out.push({ op: 'ins', b: y[j++] })
  return out
}

// Each word of `a` and `b` paired up: kept, deleted from `a`, or inserted from `b`, with positions.
export function alignWords(a: string, b: string): Aligned[] {
  return align(words(a), words(b))
}
