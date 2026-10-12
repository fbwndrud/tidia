// Output rules: how the person wants a dictation shaped. A rule's `when` is a condition in
// words that the cleanup model judges; no `when` means always. Starter rules live here, so a
// later version can improve their wording; the store keeps only whether each is on.

export type RuleSource = 'starter' | 'user' | 'claude'
export type Rule = { id: string; text: string; when?: string; enabled: boolean; source: RuleSource }
export type Rules = { version: 1; rules: Rule[]; starters: Record<string, { enabled: boolean }> }
export type RuleInput = { text: string; when?: string }
export type RuleScope = 'global' | 'project'
export type Effective = Rule & { scope: RuleScope }

export const MAX_RULES = 30
const MAX_TEXT = 300
const MAX_WHEN = 200
const CONTROL = /[\u0000-\u001f\u007f]/

export const STARTER_RULES: readonly Rule[] = [
  { id: 'starter-bug', source: 'starter', enabled: false, when: 'the dictation reports a bug, an error or something not working', text: "Write it as short labeled lines in the dictation's language: what happens, steps to reproduce, what was expected, related files or messages. Use only what the speaker said: leave out a line they did not say, never infer one." },
  { id: 'starter-feature', source: 'starter', enabled: false, when: 'the dictation asks for a new feature or a change in behaviour', text: "Write it as short labeled lines in the dictation's language: the goal, the requirements, the constraints. Use only what the speaker said: leave out a line they did not say, never infer one." },
  { id: 'starter-review', source: 'starter', enabled: false, when: 'the dictation asks for a review', text: "Write it as two labeled lines in the dictation's language: what to review, what to look at." },
  { id: 'starter-steps', source: 'starter', enabled: false, when: 'the dictation lists several tasks or steps', text: "Number them in the order they should be done, keeping the speaker's order unless they said otherwise." },
  // The registers the tone setting offered before 0.1.21; polish is concise without them.
  { id: 'starter-polite', source: 'starter', enabled: false, text: "Write in a polite register, e.g. Korean 존댓말 (-요, -습니다) or Japanese です/ます, in the dictation's language." },
  { id: 'starter-casual', source: 'starter', enabled: false, text: "Write in a casual register, e.g. Korean 반말 or Japanese plain form, in the dictation's language." },
  { id: 'starter-as-spoken', source: 'starter', enabled: false, text: "Keep the speaker's own register and sentence endings: polite stays polite, casual stays casual." },
]
export const STARTER_IDS = new Set(STARTER_RULES.map(r => r.id))
// The register starters: at most one is on.
export const REGISTER_IDS: readonly string[] = ['starter-polite', 'starter-casual', 'starter-as-spoken']

export function emptyRules(): Rules {
  return { version: 1, rules: [], starters: {} }
}

export function isCurrentRules(value: unknown): boolean {
  return value !== null && typeof value === 'object' && (value as { version?: unknown }).version === 1
}

function clean(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const s = value.trim()
  if (s.length === 0 || s.length > max || CONTROL.test(s)) return null
  return s
}

export function ruleInput(text: unknown, when: unknown): RuleInput | null {
  const t = clean(text, MAX_TEXT)
  if (t === null) return null
  if (when === undefined || when === null || (typeof when === 'string' && when.trim() === '')) return { text: t }
  const w = clean(when, MAX_WHEN)
  return w === null ? null : { text: t, when: w }
}

function parseRule(value: unknown): Rule | null {
  if (value === null || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (typeof v.id !== 'string' || !/^[gp]\d+$/.test(v.id)) return null
  const input = ruleInput(v.text, v.when)
  if (!input) return null
  const source: RuleSource = v.source === 'claude' ? 'claude' : 'user'
  return { id: v.id, ...input, enabled: v.enabled !== false, source }
}

export function parseRules(value: unknown): Rules {
  if (!isCurrentRules(value)) return emptyRules()
  const v = value as { rules?: unknown; starters?: unknown }
  const rules = Array.isArray(v.rules) ? v.rules.map(parseRule).filter((r): r is Rule => r !== null).slice(0, MAX_RULES) : []
  const starters: Rules['starters'] = {}
  if (v.starters && typeof v.starters === 'object') {
    for (const [id, o] of Object.entries(v.starters as Record<string, unknown>)) {
      const enabled = (o as { enabled?: unknown } | null)?.enabled
      if (STARTER_IDS.has(id) && typeof enabled === 'boolean') starters[id] = { enabled }
    }
  }
  return { version: 1, rules, starters }
}

export function addRule(r: Rules, scope: RuleScope, input: RuleInput, source: 'user' | 'claude'): { rules: Rules; rule: Rule } | { full: true } {
  if (r.rules.length >= MAX_RULES) return { full: true }
  const prefix = scope === 'global' ? 'g' : 'p'
  const next = 1 + Math.max(0, ...r.rules.map(x => Number(x.id.slice(1)) || 0))
  const rule: Rule = { id: `${prefix}${next}`, ...input, enabled: true, source }
  return { rules: { ...r, rules: [...r.rules, rule] }, rule }
}

function starter(r: Rules, id: string): Rule | null {
  const s = STARTER_RULES.find(x => x.id === id)
  return s ? { ...s, enabled: r.starters[id]?.enabled ?? s.enabled } : null
}

export function updateRule(r: Rules, id: string, change: { text?: string; when?: string | null; enabled?: boolean }): { rules: Rules; rule: Rule } | null {
  if (STARTER_IDS.has(id)) {
    // A starter's wording is ours; the person turns it on or off.
    if (change.text !== undefined || change.when !== undefined || change.enabled === undefined) return null
    const starters = { ...r.starters, [id]: { enabled: change.enabled } }
    // One register at a time: turning one on turns the others off.
    if (change.enabled && REGISTER_IDS.includes(id)) for (const other of REGISTER_IDS) if (other !== id) starters[other] = { enabled: false }
    const rules = { ...r, starters }
    return { rules, rule: starter(rules, id)! }
  }
  const old = r.rules.find(x => x.id === id)
  if (!old) return null
  const { when: _drop, ...base } = old
  const when = change.when === null ? undefined : change.when ?? old.when
  const rule: Rule = { ...base, ...(change.text !== undefined ? { text: change.text } : {}), ...(when !== undefined ? { when } : {}), enabled: change.enabled ?? old.enabled }
  return { rules: { ...r, rules: r.rules.map(x => (x.id === id ? rule : x)) }, rule }
}

export function removeRule(r: Rules, id: string): { rules: Rules; rule: Rule; turnedOff: boolean } | null {
  if (STARTER_IDS.has(id)) {
    const u = updateRule(r, id, { enabled: false })!
    return { ...u, turnedOff: true }
  }
  const rule = r.rules.find(x => x.id === id)
  if (!rule) return null
  return { rules: { ...r, rules: r.rules.filter(x => x.id !== id) }, rule, turnedOff: false }
}

export function effectiveRules(global: Rules, project: Rules): Effective[] {
  return [
    ...project.rules.map(r => ({ ...r, scope: 'project' as const })),
    ...global.rules.map(r => ({ ...r, scope: 'global' as const })),
    ...STARTER_RULES.map(s => ({ ...starter(global, s.id)!, scope: 'global' as const })),
  ]
}

// A condition may be written with or without a leading "when"; it reads "only when …" either way.
const condition = (when: string) => when.replace(/^when\s+/i, '')

export function ruleLines(rules: readonly Effective[]): string[] {
  return rules.filter(r => r.enabled).map((r, i) => `Rule ${i + 1} (${r.when ? `only when ${condition(r.when)}` : 'always'}): ${r.text}`)
}

export function showRule(r: Rule): string {
  return `${r.text} — ${r.when ? `when ${condition(r.when)}` : 'always'}`
}
