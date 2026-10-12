export type Token = { text: string; norm: string; start: number; end: number }

// Han, kana and Thai are written without spaces, so each character counts as a word.
const SINGLE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u
const RUN = /[\p{L}\p{N}\p{M}_'’]+/gu

function token(text: string, start: number): Token {
  return { text, norm: text.toLowerCase().replace(/’/g, "'"), start, end: start + text.length }
}

export function words(text: string): Token[] {
  const out: Token[] = []
  for (const match of text.matchAll(RUN)) {
    const base = match.index ?? 0
    let pending = ''
    let pendingStart = base
    let offset = 0
    for (const ch of match[0]) {
      const at = base + offset
      if (SINGLE.test(ch)) {
        if (pending) out.push(token(pending, pendingStart))
        pending = ''
        out.push(token(ch, at))
      } else {
        if (!pending) pendingStart = at
        pending += ch
      }
      offset += ch.length
    }
    if (pending) out.push(token(pending, pendingStart))
  }
  return out
}

export function countWords(text: string): number {
  return words(text).length
}

// The cleaned words, with a word that joins two or three neighbouring original words
// ("고쳐 줘" -> "고쳐줘", "useEffect 를" -> "useEffect를") split back into those words.
export function unmergedWords(original: string, cleaned: string): string[] {
  const o = words(original).map(w => w.norm)
  const known = new Set(o)
  const out: string[] = []
  for (const w of words(cleaned)) {
    if (known.has(w.norm)) {
      out.push(w.norm)
      continue
    }
    let parts: string[] | null = null
    for (let i = 0; i < o.length && !parts; i++) {
      if (o[i]! + (o[i + 1] ?? '') === w.norm && i + 1 < o.length) parts = [o[i]!, o[i + 1]!]
      else if (i + 2 < o.length && o[i]! + o[i + 1]! + o[i + 2]! === w.norm) parts = [o[i]!, o[i + 1]!, o[i + 2]!]
    }
    out.push(...(parts ?? [w.norm]))
  }
  return out
}
