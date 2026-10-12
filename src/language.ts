import type { EnglishTerms } from './config'
import { words } from './tokens'

// The writing system of one letter, or null for anything that is not a letter.
export function letterScript(ch: string): string | null {
  if (/\p{Script=Hangul}/u.test(ch)) return 'hangul'
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(ch)) return 'kana'
  if (/\p{Script=Han}/u.test(ch)) return 'han'
  if (/\p{Script=Latin}/u.test(ch)) return 'latin'
  if (/\p{Script=Cyrillic}/u.test(ch)) return 'cyrillic'
  if (/\p{Script=Greek}/u.test(ch)) return 'greek'
  if (/\p{Script=Devanagari}/u.test(ch)) return 'devanagari'
  if (/\p{Script=Thai}/u.test(ch)) return 'thai'
  if (/\p{Script=Arabic}/u.test(ch)) return 'arabic'
  if (/\p{Script=Hebrew}/u.test(ch)) return 'hebrew'
  return null
}

export function scriptCounts(text: string): { counts: Map<string, number>; total: number } {
  const counts = new Map<string, number>()
  let total = 0
  for (const ch of text) {
    const s = letterScript(ch)
    if (!s) continue
    counts.set(s, (counts.get(s) ?? 0) + 1)
    total++
  }
  return { counts, total }
}

export type ScriptFamily = 'hangul' | 'japanese' | 'chinese' | 'cyrillic' | 'latin' | 'other'

// The writing system a dictation is mostly in. Code and English terms mixed into other
// speech are Latin, so Latin wins only when other scripts carry under 30% of the letters.
export function scriptFamily(text: string): ScriptFamily {
  const { counts, total } = scriptCounts(text)
  const latin = counts.get('latin') ?? 0
  if (total === 0 || (total - latin) / total < 0.3) return 'latin'
  let best = ''
  let most = 0
  for (const [s, n] of counts) {
    if (s !== 'latin' && n > most) {
      best = s
      most = n
    }
  }
  if (best === 'hangul') return 'hangul'
  if (best === 'kana' || best === 'han') return (counts.get('kana') ?? 0) > 0 ? 'japanese' : 'chinese'
  if (best === 'cyrillic') return 'cyrillic'
  return 'other'
}

const ENGLISH_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'so', 'to', 'of', 'in', 'on', 'for', 'with', 'at', 'from',
  'is', 'are', 'was', 'be', 'it', 'this', 'that', 'i', 'you', 'we', 'my', 'me', 'can', 'could',
  'please', 'do', 'have', 'what', 'how', 'just', 'um', 'uh', 'like', 'if', 'then', 'there',
  'does', 'did', 'not', 'why', 'when', 'where', 'which', 'who', 'by', 'use', 'should', 'would',
  'will', 'your', 'our', 'they', 'them', 'has', 'had', 'were', 'been', 'into', 'about', 'also', 'too',
])

// Function words of the other common Latin-script languages that English never uses: they
// outweigh English look-alikes such as German "was" and "in".
const OTHER_WORDS = new Set([
  'der', 'die', 'das', 'und', 'ist', 'nicht', 'ich', 'du', 'mit', 'ein', 'eine', 'auf', 'für', 'wie', 'zwischen',
  'el', 'los', 'las', 'que', 'por', 'una', 'con', 'para', 'como', 'pero', 'cuando',
  'le', 'les', 'est', 'une', 'et', 'pas', 'je', 'avec', 'pour', 'dans', 'ne', 'pourquoi',
  'não', 'uma', 'com', 'você', 'isso', 'também',
])

export function isEnglish(text: string, language?: string): boolean {
  const ws = words(text)
  const english = ws.filter(w => ENGLISH_WORDS.has(w.norm)).length
  const other = ws.filter(w => OTHER_WORDS.has(w.norm)).length
  if (ws.length > 0 && english / ws.length >= 0.2 && english > other) return true
  const lang = (language ?? '').trim().toLowerCase()
  return lang === 'english' || lang === 'en' || lang.startsWith('en-') || lang.startsWith('en_')
}

// `auto`: phonetic scripts get every term back in English; Chinese writes terms by meaning,
// so only code; other Latin-script languages only fix code; English needs nothing.
export function resolveTerms(setting: EnglishTerms, text: string, language?: string): Exclude<EnglishTerms, 'auto'> {
  if (setting !== 'auto') return setting
  switch (scriptFamily(text)) {
    case 'chinese':
      return 'low'
    case 'latin':
      return isEnglish(text, language) ? 'off' : 'low'
    default:
      return 'high'
  }
}
