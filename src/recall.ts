// ↑ puts a past prompt back in the box in one change, with no edit to see, the way tap mode lands a
// transcript. A prompt the person sent before is a recalled one. Only a fingerprint of each sent
// prompt is kept, never its words.

export const RECALL_DEPTH = 200

// FNV-1a over the trimmed text: 32 bits, enough to tell a recalled prompt from new speech.
export function promptPrint(text: string): number {
  let h = 0x811c9dc5
  for (const ch of text.trim()) {
    h ^= ch.codePointAt(0)!
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

export function parsePrints(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((n): n is number => Number.isInteger(n)).slice(0, RECALL_DEPTH) : []
}

// The prints with the new ones first, each once, at most RECALL_DEPTH.
export function withPrints(prints: readonly number[], texts: readonly string[]): number[] {
  const added = [...new Set(texts.filter(t => t.trim() !== '').map(promptPrint))]
  return [...added, ...prints.filter(p => !added.includes(p))].slice(0, RECALL_DEPTH)
}
