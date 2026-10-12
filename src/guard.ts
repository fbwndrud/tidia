import type { Fix } from './cleaner'
import type { Style } from './config'
import { letterScript, scriptFamily } from './language'
import { unmergedWords, words } from './tokens'

export type GuardResult = { ok: true } | { ok: false; reason: 'empty' | 'length' | 'script' | 'overlap' | 'added' | 'negation' | 'answer' }

// Polish rewrites and drops chit-chat, so it may shrink a dictation a lot; minimal keeps the
// spoken words but drops what a correction takes back. `added`: words the cleanup may add beyond
// the spoken ones (punctuation aside), at least the floor or this share of the cleaned words.
const LIMITS: Record<Style, { ratio: [number, number]; overlap: number; added: { share: number; floor: number } }> = {
  polish: { ratio: [0.15, 1.8], overlap: 0.4, added: { share: 0.4, floor: 3 } },
  minimal: { ratio: [0.25, 1.4], overlap: 0.5, added: { share: 0.25, floor: 1 } },
}

// Japanese and Chinese mix Han and kana freely, so they count as one writing system here.
function scriptOf(ch: string): string | null {
  const s = letterScript(ch)
  return s === 'kana' || s === 'han' ? 'cjk' : s
}

// Each script's share of the letters, or null under five letters.
function scriptShares(text: string): Map<string, number> | null {
  const counts = new Map<string, number>()
  let total = 0
  for (const ch of text) {
    const sc = scriptOf(ch)
    if (!sc) continue
    counts.set(sc, (counts.get(sc) ?? 0) + 1)
    total++
  }
  if (total < 5) return null
  for (const [sc, n] of counts) counts.set(sc, n / total)
  return counts
}

// A translation: a script that carried the original all but vanishes, or a script the
// original did not use takes a large share. Mixed speech that only loses fillers keeps both scripts.
function translated(original: string, cleaned: string): boolean {
  const so = scriptShares(original)
  const sc = scriptShares(cleaned)
  if (!so || !sc) return false
  for (const [s, share] of so) if (share >= 0.3 && (sc.get(s) ?? 0) < 0.1) return true
  // Latin is left out: restoring English terms in other speech adds it legitimately.
  for (const [s, share] of sc) if (s !== 'latin' && share >= 0.3 && (so.get(s) ?? 0) < 0.05) return true
  return false
}

// Accented Latin letters that neither the dictation nor a restored English term has: broken
// bytes from the model ("Reactのç’useState"), which must not reach the message.
const ACCENTED = /[^\p{ASCII}](?<=\p{Script=Latin})/u
function garbled(original: string, cleaned: string): boolean {
  return scriptFamily(original) !== 'latin' && !ACCENTED.test(original) && ACCENTED.test(cleaned)
}

const HANGUL = /^\p{Script=Hangul}/u

// Korean one-syllable endings, helper verbs and bound nouns that tidy spacing splits off or
// contracts ("고쳐 주고" -> "고쳐 줘", "해줘" -> "해 줘", "거" -> "게"). Words that change the
// meaning (안, 못, 다, 더, 꼭) are not here and still count.
const KOREAN_GRAMMAR = new Set(['줘', '봐', '해', '게', '거', '돼', '줄', '수', '것', '걸', '건', '데', '죠', '요', '야', '지'])

function commonPrefix(a: string, b: string): number {
  let n = 0
  while (n < a.length && n < b.length && a[n] === b[n]) n++
  return n
}

// Tidying a sentence changes word endings, not stems. Korean: two words of two or more
// syllables that start with the same syllable ("나오냐" -> "나와"). Alphabetic languages:
// words sharing a prefix of at least four letters and most of the shorter word
// ("funciona" -> "funcionaba", "работает" -> "работала"), which keeps "fix" -> "fixed" apart.
function sameStem(word: string, original: ReadonlySet<string>): boolean {
  const [first] = word
  if (!first) return false
  if (HANGUL.test(first)) {
    if (word.length < 2) return false
    for (const o of original) if (o.length >= 2 && o.startsWith(first)) return true
    return false
  }
  if (word.length < 4) return false
  for (const o of original) {
    if (commonPrefix(word, o) >= Math.max(4, Math.ceil(0.6 * Math.min(word.length, o.length)))) return true
  }
  return false
}

// The text's length for the ratio check: list markers, line breaks and punctuation are layout,
// not words. In non-Latin speech a restored English term is spelled in more letters than its
// phonetic syllables (리액트 -> React, 派森 -> Python), so a Latin letter counts as half.
function size(text: string, restoring: boolean): number {
  const bare = text.replace(/^\s*[-*•]\s+/gm, '').replace(/[\s\p{P}]+/gu, '')
  if (!restoring) return bare.length
  let n = 0
  for (const ch of bare) n += /\p{Script=Latin}/u.test(ch) ? 0.5 : 1
  return n
}

// A label of up to four words and 30 characters before a colon at the start of a line, with the
// line's text after it ("- 증상: …", "Expected: …").
const LABEL = /^([ \t]*(?:[-*•]|\d+[.)])?[ \t]*)([^\n:：]{1,30})[:：][ \t]*(?=\S)/gm

// Labels are layout only in a reply laid out over more lines than the dictation had.
function unlabeled(original: string, cleaned: string): string {
  const lines = (t: string) => t.split('\n').filter(l => l.trim() !== '').length
  if (lines(cleaned) <= lines(original)) return cleaned
  return cleaned.replace(LABEL, (m, lead: string, label: string) => (label.trim().split(/\s+/).length <= 4 ? lead : m))
}

// A negation or prohibition on a verb, per language. A cleanup that drops one ("지우지 말고 이름만
// 바꿔 줘" -> "지워 줘") or adds one says the opposite of what was said, and the word-share checks
// cannot see it: one word, gone. Spoken take-backs ("no wait", "actually no", "不对", "no espera")
// are left out, since the cleanup drops them by design, and so is Korean "되는지 안 되는지"
// ("whether or not"); with them out, 681 eval outputs in all
// eight languages showed no false refusal (2026-10-12).
const NEGATION = [
  /\b(?:not|never|don't|doesn't|didn't|won't|wouldn't|can't|cannot|couldn't|shouldn't|isn't|aren't|wasn't|weren't|haven't|hasn't|mustn't|dont|doesnt|didnt|cant|isnt|neither|nor|without)\b/i,
  /않|지 ?마|지 ?말|말고|(?<!잘)못|(?<!지 )없(?!애)|(?:^|(?<!지)\s)안(?=\s|돼)/,
  /ない|ません|なく|ずに/,
  /不(?!过|错|但|仅|对|是说)|(?<![特区分])别(?!的)|没|勿/,
  /\b(?:nicht|kein\w*|nie|niemals|ohne|weder)\b/i,
  /\b(?:pas|jamais|aucun\w*|sans)\b|\bn['’]/i,
  /\b(?:nunca|jamás|jamais|tampoco|ningún|ninguna|nenhum\w*|sin|sem)\b|\b(?:no|não)\s+(?!(?:espera|esperá|wait|mejor|melhor|perdón|perdão|digo|quiero|quero|sorry|make|i|actually|pera|ya|calma|momento|sé|sei|no|não)\b)\p{L}/iu,
]
const negated = (text: string) => NEGATION.some(r => r.test(text))

// A declared fix excuses its target as written, or with a short particle attached ("모드를" for
// 모두 -> 모드); a one-letter target excuses only itself.
function fixed(word: string, target: string): boolean {
  return word === target || (target.length >= 2 && word.startsWith(target) && word.length - target.length <= 2)
}

// `labels`: an output rule asked for labeled lines, so a line's leading label is layout and
// is not counted as an added word; what follows it is checked as usual, under the style's limits.
export function guard(original: string, cleaned: string, style: Style, fixes: readonly Fix[] = [], opts: { labels?: boolean } = {}): GuardResult {
  const o = original.trim()
  const c = (opts.labels ? unlabeled(o, cleaned.trim()) : cleaned).trim()
  if (!c) return { ok: false, reason: 'empty' }
  if (negated(o) !== negated(c)) return { ok: false, reason: 'negation' }
  // A word or two out of a whole sentence is an answer ("is this repo on pnpm or npm" -> "pnpm."),
  // not a cleanup; no eval cleanup came out that short.
  if (words(c).length < 3 && words(o).length >= 5) return { ok: false, reason: 'answer' }
  // A translation is named as one even when it also changed the length.
  if (translated(o, c)) return { ok: false, reason: 'script' }
  if (garbled(o, c)) return { ok: false, reason: 'script' }
  const restoring = scriptFamily(o) !== 'latin'
  const ratio = size(c, restoring) / Math.max(1, size(o, restoring))
  const [lo, hi] = LIMITS[style].ratio
  if (ratio < lo || ratio > hi) return { ok: false, reason: 'length' }
  const originalWords = new Set(words(o).map(w => w.norm))
  const fixTargets = fixes.flatMap(f => words(f.to).map(w => w.norm))
  // Restoring English terms in other speech adds Latin words that were spoken in another
  // script: they count neither as spoken nor as added. A full translation is the script check's.
  // Japanese hiragana are mostly particles and endings ("ください"), as Korean endings are: a
  // one-kana word is grammar, not content, and counts neither way. A new word that starts with a
  // digit is a spoken number written out ("이 점 일" -> 2.1, "시월" -> 10월) and counts neither
  // way either; identifiers with digits ("a0", "v2") stay words. Korean one-syllable grammar
  // words (KOREAN_GRAMMAR) count neither way, like the kana.
  const cleanedWords = unmergedWords(o, c).filter(w =>
    !(restoring && /^\p{Script=Latin}/u.test(w)) && !/^\p{Script=Hiragana}$/u.test(w) && !KOREAN_GRAMMAR.has(w) && !(/^\p{N}/u.test(w) && !originalWords.has(w)))
  // Under four content words a share is noise; the script and length checks still hold.
  if (cleanedWords.length >= 4) {
    const spoken = (w: string) => originalWords.has(w) || sameStem(w, originalWords)
    const shared = cleanedWords.filter(spoken).length
    if (shared / cleanedWords.length < LIMITS[style].overlap) return { ok: false, reason: 'overlap' }
    // A declared fix may add its target, also with a particle attached ("모드를" for 모두 -> 모드).
    const added = cleanedWords.filter(w => !spoken(w) && !fixTargets.some(f => fixed(w, f))).length
    const { share, floor } = LIMITS[style].added
    if (added > Math.max(floor, Math.floor(share * cleanedWords.length))) return { ok: false, reason: 'added' }
    // A whole line of words nobody said is a request or fact made up ("- Then delete the prod
    // database."), however few the other lines make it look.
    for (const line of c.split('\n')) {
      const lineWords = unmergedWords(o, line).filter(w => !(restoring && /^\p{Script=Latin}/u.test(w)) && !/^\p{Script=Hiragana}$/u.test(w) && !KOREAN_GRAMMAR.has(w) && !/^\p{N}/u.test(w))
      const fresh = lineWords.filter(w => !spoken(w) && !fixTargets.some(f => fixed(w, f))).length
      if (fresh >= 3 && fresh / lineWords.length >= 0.6) return { ok: false, reason: 'added' }
    }
  }
  return { ok: true }
}
