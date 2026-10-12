import { closenessIn, prepare } from './phonetic'

// claude: added by Claude, on its own or with the person's yes.
export type Source = 'manual' | 'claude' | 'learned' | 'bootstrap'
export type Scope = 'global' | 'project'
export type Entry = { heard?: string; meant: string; source: Source; confirmations: number; rejections: number; uses: number; lastSeen: string }
// A correction seen once and not yet added: the second identical one adds it.
export type Candidate = { heard?: string; meant: string; count: number; lastSeen: string }
// `rejected`: learned entries the person removed, never learned again.
export type Dict = { version: 1; entries: Entry[]; rejected: EntryInput[]; candidates: Candidate[] }
export type EntryInput = { heard?: string; meant: string }
export type Pair = { heard: string; meant: string }
export type Hints = { terms: string[]; pairs: Pair[] }

export const GLOBAL_KEY = 'dict:global'
export const MAX_ENTRIES = 2000
export const MAX_HINTS = 20
// How close a dictated run must sound to an entry for a large dictionary to send it.
const MATCH_THRESHOLD = 0.6
export const MAX_LEN = 80
const SOURCES: readonly Source[] = ['manual', 'claude', 'learned', 'bootstrap']
// The removed learned entries kept so they are not learned again: the newest this many.
export const MAX_REJECTED = 500

export function emptyDict(): Dict {
  return { version: 1, entries: [], rejected: [], candidates: [] }
}

// FNV-1a, so a project's key does not spell out its path.
export function projectKey(cwd: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < cwd.length; i++) {
    h ^= cwd.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `dict:project:${h.toString(16).padStart(8, '0')}`
}

const isStr = (v: unknown): v is string => typeof v === 'string'
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function parseEntry(v: unknown): Entry | null {
  if (v === null || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (!isStr(o.meant) || o.meant.trim() === '' || !SOURCES.includes(o.source as Source)) return null
  return {
    ...(isStr(o.heard) && o.heard.trim() !== '' ? { heard: o.heard } : {}),
    meant: o.meant,
    source: o.source as Source,
    confirmations: isNum(o.confirmations) ? o.confirmations : 0,
    rejections: isNum(o.rejections) ? o.rejections : 0,
    uses: isNum(o.uses) ? o.uses : 0,
    lastSeen: isStr(o.lastSeen) ? o.lastSeen : '',
  }
}

function parseInput(v: unknown): EntryInput | null {
  if (v === null || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (!isStr(o.meant)) return null
  return { ...(isStr(o.heard) ? { heard: o.heard } : {}), meant: o.meant }
}

function parseCandidate(v: unknown): Candidate | null {
  const input = parseInput(v)
  const o = v as Record<string, unknown>
  if (!input || !isNum(o.count)) return null
  return { ...input, count: o.count, lastSeen: isStr(o.lastSeen) ? o.lastSeen : '' }
}

// A stored value this version can read; parseDict reads anything else as empty.
export function isCurrentDict(value: unknown): boolean {
  return value !== null && typeof value === 'object' && (value as { version?: unknown }).version === 1
}

// A stored value as the mod reads it back: anything malformed or of another version is dropped.
export function parseDict(value: unknown): Dict {
  if (value === null || typeof value !== 'object') return emptyDict()
  const o = value as Record<string, unknown>
  if (o.version !== 1) return emptyDict()
  const entries = Array.isArray(o.entries) ? o.entries.map(parseEntry).filter((e): e is Entry => e !== null) : []
  const rejected = Array.isArray(o.rejected) ? o.rejected.map(parseInput).filter((r): r is EntryInput => r !== null) : []
  const candidates = Array.isArray(o.candidates) ? o.candidates.map(parseCandidate).filter((c): c is Candidate => c !== null) : []
  return { version: 1, entries, rejected, candidates }
}

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()

// A word or a short name: shell, markup and quoting characters make it something else, which a
// hint must never carry (the AI tool writes entries).
const NOT_A_TERM = /[|;&$`<>(){}\[\]"'\\\n\r\t]/
const MAX_TERM_WORDS = 4
// A word that starts like a command flag or a path ("-rf", "/etc", "~/x") is not a spelling.
const NOT_A_WORD = /^[-/~]/
const termShaped = (s: string): boolean => {
  const words = s.split(/\s+/)
  return !NOT_A_TERM.test(s) && words.length <= MAX_TERM_WORDS && !words.some(w => NOT_A_WORD.test(w))
}

export function entryInput(heard: unknown, meant: unknown): EntryInput | null {
  if (!isStr(meant)) return null
  const m = meant.trim()
  if (m === '' || m.length > MAX_LEN || !termShaped(m)) return null
  if (heard === undefined || heard === null || (isStr(heard) && heard.trim() === '')) return { meant: m }
  if (!isStr(heard)) return null
  const h = heard.trim()
  if (h.length > MAX_LEN || same(h, m) || !termShaped(h)) return null
  return { heard: h, meant: m }
}

// "/tidia dict add" arguments: `<word>` or `<heard> = <meant>` (also -> or →), with --project or --global anywhere.
export function parseAddArgs(text: string): { input: EntryInput; scope: Scope } | null {
  let rest = ` ${text} `
  let scope: Scope = 'global'
  const flag = rest.match(/\s--(project|global)(?=\s)/)
  if (flag) {
    scope = flag[1] as Scope
    rest = rest.slice(0, flag.index) + rest.slice((flag.index ?? 0) + flag[0].length)
  }
  const sep = rest.match(/=|->|→/)
  const input = sep ? entryInput(rest.slice(0, sep.index), rest.slice((sep.index ?? 0) + sep[0].length)) : entryInput(undefined, rest)
  return input ? { input, scope } : null
}

// The entry a new one replaces: the same heard form, or for a bare term, the same term.
export function sameKey(e: EntryInput, input: EntryInput): boolean {
  return input.heard !== undefined ? e.heard !== undefined && same(e.heard, input.heard) : e.heard === undefined && same(e.meant, input.meant)
}

// Whose an entry is: the person's own (typed, or approved in the pane, or learned from their
// corrections) outranks Claude's, so Claude adding it again never makes it Claude's to remove.
const RANK: Record<Source, number> = { manual: 3, learned: 2, bootstrap: 2, claude: 1 }

export function upsert(dict: Dict, input: EntryInput, source: Source, now: string): { dict: Dict; change: 'added' | 'updated' | 'full' } {
  const at = dict.entries.findIndex(e => sameKey(e, input))
  if (at >= 0) {
    const entries = [...dict.entries]
    const old = entries[at]!
    entries[at] = { ...old, ...input, source: RANK[old.source] > RANK[source] ? old.source : source, lastSeen: now }
    return { dict: { ...dict, entries }, change: 'updated' }
  }
  let kept = dict.entries
  if (kept.length >= MAX_ENTRIES) {
    const victim = evictable(kept)
    if (victim < 0) return { dict, change: 'full' }
    kept = kept.filter((_, i) => i !== victim)
  }
  const entry: Entry = { ...input, source, confirmations: 0, rejections: 0, uses: 0, lastSeen: now }
  return { dict: { ...dict, entries: [...kept, entry] }, change: 'added' }
}

// Over the cap, the learned or bootstrap entry used least, then seen longest ago, makes room;
// manual entries and Claude's are never dropped.
function evictable(entries: readonly Entry[]): number {
  let at = -1
  entries.forEach((e, i) => {
    if (e.source !== 'learned' && e.source !== 'bootstrap') return
    const best = entries[at]
    if (!best || e.uses < best.uses || (e.uses === best.uses && e.lastSeen < best.lastSeen)) at = i
  })
  return at
}

export function removeWord(dict: Dict, word: string): { dict: Dict; removed: Entry[] } {
  const hit = (e: Entry) => same(e.meant, word) || (e.heard !== undefined && same(e.heard, word))
  const removed = dict.entries.filter(hit)
  // A learned entry the person removes is not learned again.
  return { dict: { ...dict, entries: dict.entries.filter(e => !hit(e)), rejected: reject(dict.rejected, removed) }, removed }
}

// The learned entries among those removed join `rejected`, once each, the newest MAX_REJECTED kept.
function reject(rejected: readonly EntryInput[], removed: readonly Entry[]): EntryInput[] {
  const added = removed
    .filter(e => e.source === 'learned' || e.source === 'bootstrap')
    .map(e => ({ ...(e.heard !== undefined ? { heard: e.heard } : {}), meant: e.meant }))
  const kept = rejected.filter(r => !added.some(a => sameKey(r, a) && same(r.meant, a.meant)))
  return [...kept, ...added].slice(-MAX_REJECTED)
}

// Removes one entry exactly (its heard form or term, and its meaning); a learned one is rejected.
export function dropEntry(dict: Dict, entry: EntryInput): Dict {
  const hit = (e: Entry) => sameKey(e, entry) && same(e.meant, entry.meant)
  return { ...dict, entries: dict.entries.filter(e => !hit(e)), rejected: reject(dict.rejected, dict.entries.filter(hit)) }
}

// Whether `word` was said in `text`: as a whole word, or the start of one (Korean and Japanese put a
// particle right after a noun). A letter or two matches too much to count.
export function saidIn(text: string, word: string): boolean {
  const w = word.trim().toLowerCase()
  if ([...w].length < 2) return false
  const t = text.toLowerCase()
  for (let at = t.indexOf(w); at >= 0; at = t.indexOf(w, at + 1)) {
    if (at === 0 || !/[\p{L}\p{N}]/u.test(t[at - 1]!)) return true
  }
  return false
}

// The entries a removal would take: every one for a word, or one exactly.
export function removalTargets(dicts: Record<Scope, Dict>, target: { word: string } | { entry: EntryInput }): Entry[] {
  const all = [...dicts.project.entries, ...dicts.global.entries]
  if ('word' in target) return all.filter(e => same(e.meant, target.word) || (e.heard !== undefined && same(e.heard, target.word)))
  return all.filter(e => sameKey(e, target.entry) && same(e.meant, target.entry.meant))
}

export function showEntry(e: EntryInput): string {
  return e.heard !== undefined ? `${e.heard} → ${e.meant}` : e.meant
}

type Scoped = Entry & { scope: Scope }

// manual > learned > bootstrap; project before global; more confirmed; more recent.
function rank(a: Scoped, b: Scoped): number {
  return SOURCES.indexOf(a.source) - SOURCES.indexOf(b.source)
    || (a.scope === b.scope ? 0 : a.scope === 'project' ? -1 : 1)
    || (b.confirmations - b.rejections) - (a.confirmations - a.rejections)
    || b.lastSeen.localeCompare(a.lastSeen)
}

// The hints one polish sends: the whole dictionary while it fits, otherwise the entries that
// sound closest to the dictation; then the session's identifiers that sound close, in the room left.
export function pickHints(dicts: Record<Scope, Dict>, session: readonly string[], dictated: string): Hints {
  const spoken = prepare(dictated)
  const scoreOf = (e: Entry): number => Math.max(closenessIn(spoken, e.heard ?? e.meant), e.heard !== undefined ? closenessIn(spoken, e.meant) : 0)
  const seen = new Set<string>()
  const ranked = [
    ...dicts.project.entries.map(e => ({ ...e, scope: 'project' as const })),
    ...dicts.global.entries.map(e => ({ ...e, scope: 'global' as const })),
  ]
    .sort(rank).filter(e => {
    const key = e.heard !== undefined ? `h:${e.heard.toLowerCase()}` : `t:${e.meant.toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const chosen = ranked.length <= MAX_HINTS
    ? ranked
    : ranked
        .map(e => ({ e, score: scoreOf(e) }))
        .filter(x => x.score >= MATCH_THRESHOLD)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_HINTS)
        .map(x => x.e)
  const terms = chosen.filter(e => e.heard === undefined).map(e => e.meant)
  const pairs = chosen.filter(e => e.heard !== undefined).map(e => ({ heard: e.heard!, meant: e.meant }))
  const known = new Set([...terms, ...pairs.map(p => p.meant)].map(s => s.toLowerCase()))
  const extra = session
    .filter(s => !known.has(s.toLowerCase()))
    .map(s => ({ s, score: closenessIn(spoken, s) }))
    .filter(x => x.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_HINTS - chosen.length)
    .map(x => x.s)
  return { terms: [...terms, ...extra], pairs }
}

// The product's own name. Speech recognition writes it the way it sounds, so whenever a dictation
// says it the cleanup gets its spelling, with or without the person's dictionary.
export const OWN_NAME = 'Tidia'
const OWN_NAME_HEARD = ['티디아', '피디아', '피디야', 'ティディア']

export function withOwnName(hints: Hints, dictated: string): Hints {
  const heard = OWN_NAME_HEARD.filter(h => dictated.includes(h) && !hints.pairs.some(p => p.heard === h))
  const pairs = [...hints.pairs, ...heard.map(h => ({ heard: h, meant: OWN_NAME }))]
  const known = [...hints.terms, ...pairs.map(p => p.meant)].some(s => s.toLowerCase() === OWN_NAME.toLowerCase())
  const sounds = !known && closenessIn(prepare(dictated), OWN_NAME) >= MATCH_THRESHOLD
  return { terms: sounds ? [...hints.terms, OWN_NAME] : hints.terms, pairs }
}

const entryKey = (e: EntryInput): string => (e.heard !== undefined ? `h:${e.heard.trim().toLowerCase()}` : `t:${e.meant.trim().toLowerCase()}`)

// What changed from `base` to `next`, applied again to `current`: another Claude Code session may
// have written the dictionary in between, and the store has no lock.
export function rebase(current: Dict, base: Dict, next: Dict): Dict {
  const was = new Map(base.entries.map(e => [entryKey(e), JSON.stringify(e)]))
  const now = new Map(next.entries.map(e => [entryKey(e), e]))
  const changed = new Map(next.entries.filter(e => was.get(entryKey(e)) !== JSON.stringify(e)).map(e => [entryKey(e), e]))
  const gone = new Set([...was.keys()].filter(k => !now.has(k)))
  const seen = new Set<string>()
  const entries = current.entries.flatMap(e => {
    const k = entryKey(e)
    seen.add(k)
    if (gone.has(k)) return []
    return [changed.get(k) ?? e]
  })
  entries.push(...[...changed].filter(([k]) => !seen.has(k)).map(([, e]) => e))
  const list = <T>(cur: readonly T[], b: readonly T[], n: readonly T[]): T[] => {
    const before = new Set(b.map(x => JSON.stringify(x)))
    const after = new Set(n.map(x => JSON.stringify(x)))
    const kept = cur.filter(x => !before.has(JSON.stringify(x)) || after.has(JSON.stringify(x)))
    const have = new Set(kept.map(x => JSON.stringify(x)))
    return [...kept, ...n.filter(x => !before.has(JSON.stringify(x)) && !have.has(JSON.stringify(x)))]
  }
  return { ...current, entries, rejected: list(current.rejected, base.rejected, next.rejected), candidates: list(current.candidates, base.candidates, next.candidates) }
}
