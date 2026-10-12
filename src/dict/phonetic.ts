import { words } from '../tokens'

// Hangul to Latin letters (Revised Romanization, simplified), kana and Cyrillic likewise, so
// a phonetic transcription compares with the term it stands for ("테일스케일" ~ "Tailscale").
const INITIALS = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h']
const VOWELS = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i']
const FINALS = ['', 'g', 'kk', 'gs', 'n', 'nj', 'nh', 'd', 'l', 'lg', 'lm', 'lb', 'ls', 'lt', 'lp', 'lh', 'm', 'b', 'bs', 's', 'ss', 'ng', 'j', 'ch', 'k', 't', 'p', 'h']

const KANA = new Map<string, string>()
for (const [chars, roman] of [
  ['あいうえおぁぃぅぇぉっー', ''], ['か', 'ka'], ['き', 'ki'], ['く', 'ku'], ['け', 'ke'], ['こ', 'ko'],
  ['が', 'ga'], ['ぎ', 'gi'], ['ぐ', 'gu'], ['げ', 'ge'], ['ご', 'go'], ['さ', 'sa'], ['し', 'shi'], ['す', 'su'], ['せ', 'se'], ['そ', 'so'],
  ['ざ', 'za'], ['じぢ', 'ji'], ['ずづ', 'zu'], ['ぜ', 'ze'], ['ぞ', 'zo'], ['た', 'ta'], ['ち', 'chi'], ['つ', 'tsu'], ['て', 'te'], ['と', 'to'],
  ['だ', 'da'], ['で', 'de'], ['ど', 'do'], ['な', 'na'], ['に', 'ni'], ['ぬ', 'nu'], ['ね', 'ne'], ['の', 'no'],
  ['は', 'ha'], ['ひ', 'hi'], ['ふ', 'fu'], ['へ', 'he'], ['ほ', 'ho'], ['ば', 'ba'], ['び', 'bi'], ['ぶ', 'bu'], ['べ', 'be'], ['ぼ', 'bo'],
  ['ぱ', 'pa'], ['ぴ', 'pi'], ['ぷ', 'pu'], ['ぺ', 'pe'], ['ぽ', 'po'], ['ま', 'ma'], ['み', 'mi'], ['む', 'mu'], ['め', 'me'], ['も', 'mo'],
  ['やゃ', 'ya'], ['ゆゅ', 'yu'], ['よょ', 'yo'], ['ら', 'ra'], ['り', 'ri'], ['る', 'ru'], ['れ', 're'], ['ろ', 'ro'],
  ['わ', 'wa'], ['を', 'o'], ['ん', 'n'], ['ゔ', 'vu'],
] as const) {
  for (const ch of chars) KANA.set(ch, roman)
}
// Bare vowels keep their sound for romanize(); the skeleton drops vowels anyway.
for (const [ch, v] of [['あ', 'a'], ['い', 'i'], ['う', 'u'], ['え', 'e'], ['お', 'o'], ['ぁ', 'a'], ['ぃ', 'i'], ['ぅ', 'u'], ['ぇ', 'e'], ['ぉ', 'o']] as const) KANA.set(ch, v)

const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

function romanChar(ch: string): string {
  const code = ch.codePointAt(0) ?? 0
  if (code < 0x80) return ch.toLowerCase()
  if (code >= 0xac00 && code <= 0xd7a3) {
    const n = code - 0xac00
    return INITIALS[Math.floor(n / 588)]! + VOWELS[Math.floor((n % 588) / 28)]! + FINALS[n % 28]!
  }
  // Katakana sits 0x60 above the hiragana it sounds like.
  const kana = code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : ch
  const k = KANA.get(kana)
  if (k !== undefined) return k
  const lower = ch.toLowerCase()
  const c = CYRILLIC[lower]
  if (c !== undefined) return c
  return lower.normalize('NFD').replace(/\p{M}/gu, '')
}

export function romanize(text: string): string {
  let out = ''
  for (const ch of text) out += romanChar(ch)
  return out
}

const FOLD: Record<string, string> = { b: 'p', f: 'p', v: 'p', p: 'p', c: 'k', g: 'k', k: 'k', q: 'k', d: 't', t: 't', s: 's', z: 's', x: 's', r: 'l', l: 'l', j: 'j', m: 'm', n: 'n' }

// The consonants a word sounds with, folded into classes speech recognition confuses
// (r/l, p/b/f/v, k/g, t/d, s/z), vowels dropped: "테일스케일" -> "tlskl", "Tailscale" -> "tlskl".
// Letters of other scripts (Han) are kept as they are.
export function skeleton(text: string): string {
  const s = romanize(text)
  let out = ''
  // One pass, digraphs by lookahead: sch/sh -> s, ch/zh -> j, th -> t, ph -> p, ck/kh -> k,
  // ts -> s, ng -> n, and c before e/i/y -> s.
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!
    const nx = s[i + 1] ?? ''
    let f: string
    if (ch === 's' && nx === 'c' && s[i + 2] === 'h') {
      f = 's'
      i += 2
    } else if ((ch === 's' || ch === 't' || ch === 'p') && nx === 'h') {
      f = ch
      i++
    } else if ((ch === 'c' || ch === 'z') && nx === 'h') {
      f = 'j'
      i++
    } else if (ch === 'c' && (nx === 'e' || nx === 'i' || nx === 'y')) {
      f = 's'
    } else if ((ch === 'c' && nx === 'k') || (ch === 'k' && nx === 'h')) {
      f = 'k'
      i++
    } else if ((ch === 't' && nx === 's') || (ch === 'n' && nx === 'g')) {
      f = ch === 't' ? 's' : 'n'
      i++
    } else {
      f = ch.charCodeAt(0) < 0x80 ? FOLD[ch] ?? '' : /\p{L}/u.test(ch) ? ch : ''
    }
    if (f && !out.endsWith(f)) out += f
  }
  return out
}

function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]!
}

const MAX_SPAN = 8
// Runs longer than this are not indexed; a term's skeleton is far shorter.
const MAX_RUN = 16

// How many letters a run may differ from a term's skeleton, by the skeleton's length: a short
// skeleton matches too many words unless it matches exactly.
function allowed(len: number): number {
  return len <= 3 ? 0 : len <= 5 ? 1 : 2
}

// `s` and every string it becomes with up to `depth` letters deleted.
function deletions(s: string, depth: number, out = new Set<string>()): Set<string> {
  out.add(s)
  if (depth > 0) for (let i = 0; i < s.length; i++) deletions(s.slice(0, i) + s.slice(i + 1), depth - 1, out)
  return out
}

export type Prepared = { lower: string; index: Map<string, Set<string>> }

// The dictation, indexed once for every term one polish compares it with: each run of up to
// eight words (kana and Han count one per character) by its skeleton and the strings that
// skeleton becomes with one or two letters deleted. Two skeletons within k edits share such a string.
export function prepare(dictated: string): Prepared {
  const ws = words(dictated).map(w => ({ skel: skeleton(w.text), chars: [...w.text].length }))
  // A run of several words starts and ends on a word that carries a sound of its own: "the"
  // and "a" glued to their neighbours sound like anything. Kana and Han count one per character.
  const anchors = ws.map(w => w.chars === 1 || w.skel.length >= 2)
  const index = new Map<string, Set<string>>()
  const seen = new Set<string>()
  for (let i = 0; i < ws.length; i++) {
    let run = ''
    for (let j = i; j < ws.length && j < i + MAX_SPAN; j++) {
      run += ws[j]!.skel
      if (run.length > MAX_RUN) break
      if (j > i && !(anchors[i] && anchors[j])) continue
      if (run.length < 2 || seen.has(run)) continue
      seen.add(run)
      for (const v of deletions(run, Math.min(2, run.length - 2))) {
        let runs = index.get(v)
        if (!runs) index.set(v, (runs = new Set()))
        runs.add(run)
      }
    }
  }
  return { lower: dictated.toLowerCase(), index }
}

const ALNUM = /[a-z0-9]/

// The term written out in the dictation. A Latin term must stand as its own word ("AI" is not
// in "again"); speech in other scripts attaches particles to it ("Tailscale를").
function mentions(lower: string, target: string): boolean {
  const t = target.trim().toLowerCase()
  if (t === '') return false
  for (let at = lower.indexOf(t); at >= 0; at = lower.indexOf(t, at + 1)) {
    const before = lower[at - 1] ?? ''
    const after = lower[at + t.length] ?? ''
    const free = (outside: string, inside: string) => !(ALNUM.test(outside) && ALNUM.test(inside))
    if (free(before, t[0]!) && free(after, t[t.length - 1]!)) return true
  }
  return false
}

// How closely some run of words in the dictation sounds like `target`, 0..1; 0 when no run
// is within the edits its length allows.
// One polish compares the dictation with every entry; the entries rarely change between polishes.
const skeletons = new Map<string, string>()

function skeletonOf(term: string): string {
  let s = skeletons.get(term)
  if (s === undefined) {
    if (skeletons.size >= 20_000) skeletons.clear()
    skeletons.set(term, (s = skeleton(term)))
  }
  return s
}

export function closenessIn(p: Prepared, target: string): number {
  if (mentions(p.lower, target)) return 1
  const t = skeletonOf(target)
  if (t.length < 2 || t.length > MAX_RUN) return 0
  const k = allowed(t.length)
  let best = 0
  for (const v of deletions(t, k)) {
    for (const run of p.index.get(v) ?? []) {
      // Recognition confuses consonants more than it drops them: a short term needs a run of
      // its own length ("테일스케일" ~ "Tailscale"), a longer one may differ by a letter.
      if (Math.abs(run.length - t.length) > Math.floor(k / 2)) continue
      const d = distance(run, t)
      if (d <= k) best = Math.max(best, 1 - d / Math.max(run.length, t.length))
    }
  }
  return best
}

// How alike a heard word and a spelling sound, for a pair Claude adds without asking: closeness,
// or the share of consonant pairs their skeletons have in common, which also scores a short name
// ("티디아" ~ "Tidia") and a spelling recognition split ("유즈 이펙트" ~ "useEffect").
export function alike(heard: string, meant: string): number {
  const pairs = (s: string) => {
    const k = `^${s}`
    return Array.from({ length: k.length - 1 }, (_, i) => k.slice(i, i + 2))
  }
  const a = pairs(skeleton(heard))
  const b = pairs(skeleton(meant))
  const rest = [...b]
  let shared = 0
  for (const p of a) {
    const at = rest.indexOf(p)
    if (at >= 0) {
      shared++
      rest.splice(at, 1)
    }
  }
  const dice = a.length + b.length === 0 ? 0 : (2 * shared) / (a.length + b.length)
  return Math.max(closeness(heard, meant), dice)
}

export function closeness(dictated: string, target: string): number {
  return closenessIn(prepare(dictated), target)
}
