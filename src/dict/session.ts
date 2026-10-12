const RECENT = 10
const MAX_TERMS = 100
// Identifiers the conversation just used, which a dictation is likely to name.
const PATTERNS = [
  /\b([A-Za-z_][\w-]+\.[A-Za-z][A-Za-z0-9]{0,5})\b/g, // file names: register.ts, plugin.json
  /\b([a-z]+[A-Z][A-Za-z0-9]*)\b/g, // camelCase
  /\b([A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*)\b/g, // PascalCase with an inner capital
  /\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g, // snake_case
  /\b([a-z][a-z0-9]*(?:-[a-z0-9]+){2,})\b/g, // kebab-case of three or more parts
  /`([^`\s]{3,60})`/g, // inline code
]

// The identifier-shaped words of one text, in pattern order, repeats kept.
export function termsIn(text: string): string[] {
  const out: string[] = []
  for (const re of PATTERNS) for (const match of text.matchAll(re)) out.push(match[1]!)
  return out
}

export function sessionTerms(messages: ReadonlyArray<{ text: string }>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of messages.slice(-RECENT).reverse()) {
    for (const re of PATTERNS) {
      for (const match of m.text.matchAll(re)) {
        const term = match[1]!
        const key = term.toLowerCase()
        if (term.length < 3 || seen.has(key)) continue
        seen.add(key)
        out.push(term)
      }
    }
  }
  return out.slice(0, MAX_TERMS)
}
