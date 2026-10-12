import { BUBBLE_LABELS_CHARS, DICT_APPROVALS, ENGLISH_TERMS, LEARN_MODES, MODELS, MESSAGE_VIEWS, POLISH_ON, STYLES, UI_LANGUAGES, type Config } from './config'

// The userConfig fields `/tidia set` changes, by their manifest names, with short aliases.
export type Setting =
  | { key: string; aliases: readonly string[]; kind: 'choice'; options: readonly string[] }
  | { key: string; aliases: readonly string[]; kind: 'boolean' }
  // Free words, the rest of the line; `none` clears them.
  | { key: string; aliases: readonly string[]; kind: 'text'; max: number }

export const SETTINGS: readonly Setting[] = [
  { key: 'style', aliases: [], kind: 'choice', options: STYLES },
  { key: 'english_terms', aliases: ['english', 'terms'], kind: 'choice', options: ENGLISH_TERMS },
  { key: 'model', aliases: [], kind: 'choice', options: MODELS },
  { key: 'learn', aliases: [], kind: 'choice', options: LEARN_MODES },
  { key: 'dict_approval', aliases: ['approval'], kind: 'choice', options: DICT_APPROVALS },
  { key: 'polish_on', aliases: ['when'], kind: 'choice', options: POLISH_ON },
  { key: 'message_view', aliases: ['view', 'bubble', 'show_raw'], kind: 'choice', options: MESSAGE_VIEWS },
  { key: 'bubble_labels', aliases: ['labels'], kind: 'text', max: BUBBLE_LABELS_CHARS },
  { key: 'debug', aliases: ['details'], kind: 'boolean' },
  { key: 'dictionary', aliases: ['dict'], kind: 'boolean' },
  { key: 'attach_raw', aliases: ['raw'], kind: 'boolean' },
  { key: 'ui_language', aliases: ['language', 'lang'], kind: 'choice', options: UI_LANGUAGES },
]

export type SetValue = string | number | boolean
export type SetParse =
  | { ok: true; key: string; value: SetValue }
  | { ok: false; error: 'usage' }
  | { ok: false; error: 'key' | 'value'; key: string }

const SWITCH: Record<string, boolean> = { on: true, true: true, yes: true, off: false, false: false, no: false }

export function findSetting(name: string): Setting | undefined {
  const n = name.toLowerCase()
  return SETTINGS.find(s => s.key === n || s.aliases.includes(n))
}

export function parseSet(args: string): SetParse {
  const [name, raw, ...rest] = args.trim().split(/\s+/).filter(Boolean)
  if (!name || raw === undefined) return { ok: false, error: 'usage' }
  const setting = findSetting(name)
  if (!setting) return { ok: false, error: 'key', key: name }
  const bad = { ok: false as const, error: 'value' as const, key: setting.key }
  if (setting.kind === 'text') {
    const text = args.trim().slice(name.length).trim()
    if (text.toLowerCase() === 'none') return { ok: true, key: setting.key, value: '' }
    return text.length <= setting.max ? { ok: true, key: setting.key, value: text } : bad
  }
  if (rest.length > 0) return { ok: false, error: 'usage' }
  const v = raw.toLowerCase()
  switch (setting.kind) {
    case 'choice':
      return setting.options.includes(v) ? { ok: true, key: setting.key, value: v } : bad
    case 'boolean':
      return v in SWITCH ? { ok: true, key: setting.key, value: SWITCH[v]! } : bad
  }
}

export function showValue(value: SetValue): string {
  return typeof value === 'boolean' ? (value ? 'on' : 'off') : String(value)
}

// The current value of each setting, by its manifest name.
export function currentValues(cfg: Config): Record<string, SetValue> {
  return {
    style: cfg.style,
    english_terms: cfg.englishTerms,
    model: cfg.model,
    learn: cfg.learn,
    dict_approval: cfg.dictApproval,
    polish_on: cfg.polishOn,
    message_view: cfg.messageView,
    bubble_labels: cfg.bubbleLabels,
    debug: cfg.debug,
    dictionary: cfg.dictionary,
    attach_raw: cfg.attachRaw,
    ui_language: cfg.uiLanguage,
  }
}
