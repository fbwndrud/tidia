import { alignWords } from '../diff'
import type { Token } from '../tokens'
import { MAX_LEN, sameKey, upsert, type Dict, type EntryInput, type Pair } from './dict'
import { scriptFamily } from '../language'
import { closeness } from './phonetic'

const MAX_WORDS = 3
// How alike the typed words must sound to the dictated ones for the edit to be a mishearing.
const SOUNDS_ALIKE = 0.6
const MAX_CANDIDATES = 200

const LATIN_END = /[A-Za-z0-9]$/
const ALL_LATIN = /^[\p{Script=Latin}\P{L}]*$/u

const bare = (s: string): string => s.replace(/\s+/g, '')

// Whether a typed replacement is an ordinary edit rather than a fix of a misheard word: spacing
// alone ("한번" -> "한 번"), an ending or tense ("want" -> "wanted", "고쳐" -> "고쳐서"), or, in a
// message written in Latin script, a change between ordinary words ("run" -> "ran", "test" -> "text").
// A name or identifier still counts there: a capital inside the word or where no sentence starts,
// a digit or . _ / - ("tail scale" -> "Tailscale", "type script" -> "TypeScript").
function ordinaryEdit(heard: string, meant: string, after: string, at: number): boolean {
  const h = bare(heard)
  const m = bare(meant)
  if (h.toLowerCase() === m.toLowerCase()) return h === m
  if (h.toLowerCase().startsWith(m.toLowerCase()) || m.toLowerCase().startsWith(h.toLowerCase())) return true
  if (scriptFamily(after) !== 'latin' || !ALL_LATIN.test(heard) || !ALL_LATIN.test(meant)) return false
  const sentenceStart = /(^|[.!?]\s+)$/.test(after.slice(0, at).trimEnd() === '' ? '' : after.slice(0, at))
  const named = /[0-9._/-]/.test(meant) || /.\p{Lu}/u.test(m) || (/^\p{Lu}/u.test(m) && !sentenceStart)
  return !named
}

// A particle typed after a restored Latin term stays out of the pair ("테일스케일를" -> "Tailscale를").
function dropParticle(heard: string, meant: string): [string, string] {
  let n = 0
  while (n < heard.length && n < meant.length && heard[heard.length - 1 - n] === meant[meant.length - 1 - n] && !/[A-Za-z0-9]/.test(meant[meant.length - 1 - n]!)) n++
  const m = meant.slice(0, meant.length - n).trimEnd()
  if (n === 0 || !LATIN_END.test(m)) return [heard, meant]
  return [heard.slice(0, heard.length - n).trimEnd(), m]
}

// The words the person typed over inside `region` of `before`: each run of up to three
// dictated words replaced by up to three that sound alike. Content edits sound different and are skipped.
export function corrections(before: string, after: string, region: { start: number; end: number }): Pair[] {
  const out: Pair[] = []
  const steps = alignWords(before, after)
  let i = 0
  while (i < steps.length) {
    if (steps[i]!.op === 'eq') {
      i++
      continue
    }
    const dels: Token[] = []
    const ins: Token[] = []
    while (i < steps.length && steps[i]!.op !== 'eq') {
      const s = steps[i++]!
      if (s.op === 'del') dels.push(s.a!)
      else ins.push(s.b!)
    }
    if (dels.length === 0 || ins.length === 0 || dels.length > MAX_WORDS || ins.length > MAX_WORDS) continue
    if (dels[0]!.start < region.start || dels[dels.length - 1]!.end > region.end) continue
    const [heard, meant] = dropParticle(before.slice(dels[0]!.start, dels[dels.length - 1]!.end), after.slice(ins[0]!.start, ins[ins.length - 1]!.end))
    if (heard === '' || meant === '' || heard.length > MAX_LEN || meant.length > MAX_LEN) continue
    if (heard.toLowerCase() === meant.toLowerCase() || !/\p{L}/u.test(meant)) continue
    if (ordinaryEdit(heard, meant, after, ins[0]!.start)) continue
    if (closeness(heard, meant) < SOUNDS_ALIKE) continue
    out.push({ heard, meant })
  }
  return out
}

const sameText = (a: string | undefined, b: string | undefined): boolean =>
  a === undefined || b === undefined ? a === b : a.trim().toLowerCase() === b.trim().toLowerCase()
const samePair = (x: EntryInput, y: EntryInput): boolean => sameText(x.heard, y.heard) && sameText(x.meant, y.meant)

export type LearnOutcome = 'offer' | 'added' | 'confirmed' | 'ignored'

function promote(dict: Dict, c: EntryInput, now: string, confirmations: number): { dict: Dict; outcome: 'added' | 'ignored' } {
  const candidates = dict.candidates.filter(x => !samePair(x, c))
  const r = upsert({ ...dict, candidates }, c, 'learned', now)
  if (r.change === 'full') return { dict: { ...dict, candidates }, outcome: 'ignored' }
  return { dict: { ...r.dict, entries: r.dict.entries.map(e => (sameKey(e, c) ? { ...e, confirmations } : e)) }, outcome: 'added' }
}

// One correction: offered the first time, added the second, confirmed after; ignored when the
// person rejected it, or a manual entry already says what the heard form means.
export function learnFrom(dict: Dict, c: EntryInput, now: string): { dict: Dict; outcome: LearnOutcome } {
  if (dict.rejected.some(r => samePair(r, c))) return { dict, outcome: 'ignored' }
  const existing = dict.entries.find(e => sameKey(e, c))
  if (existing) {
    if (existing.source === 'manual') return { dict, outcome: 'ignored' }
    if (sameText(existing.meant, c.meant)) {
      const entries = dict.entries.map(e => (e === existing ? { ...e, confirmations: e.confirmations + 1, lastSeen: now } : e))
      return { dict: { ...dict, entries }, outcome: 'confirmed' }
    }
  }
  const candidate = dict.candidates.find(x => samePair(x, c))
  if (!candidate) {
    const candidates = [...dict.candidates, { ...c, count: 1, lastSeen: now }].slice(-MAX_CANDIDATES)
    return { dict: { ...dict, candidates }, outcome: 'offer' }
  }
  return promote(dict, c, now, candidate.count + 1)
}

export function acceptOffer(dict: Dict, c: EntryInput, now: string): { dict: Dict; outcome: 'added' | 'ignored' } {
  if (dict.entries.some(e => sameKey(e, c) && e.source === 'manual')) return { dict, outcome: 'ignored' }
  return promote(dict, c, now, 1)
}

export function rejectLearned(dict: Dict, c: EntryInput): Dict {
  return {
    ...dict,
    entries: dict.entries.filter(e => !(sameKey(e, c) && sameText(e.meant, c.meant) && (e.source === 'learned' || e.source === 'bootstrap'))),
    candidates: dict.candidates.filter(x => !samePair(x, c)),
    rejected: dict.rejected.some(r => samePair(r, c)) ? dict.rejected : [...dict.rejected, { ...c }],
  }
}
