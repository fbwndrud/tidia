// polish: rewritten concisely, one point as plain sentences, several as Markdown, with the output
// rules (wording, register and layout all live there since 0.1.21). minimal: fillers dropped, the
// speaker's own words kept as plain sentences; no rules.
export type Style = 'polish' | 'minimal'
export type Locale = 'en' | 'ko' | 'ja' | 'zh' | 'es' | 'de' | 'fr' | 'pt'
// How far phonetically transcribed English terms go back to English spelling, like an effort level.
export type EnglishTerms = 'auto' | 'off' | 'low' | 'medium' | 'high'
// ask: offer a corrected word for the dictionary, add it the second time. off: never learn.
export type Learn = 'ask' | 'off'
// auto: Claude keeps the dictionary for a word the person said, and says what it changed. ask: every
// dictionary change Claude makes asks first.
export type DictApproval = 'auto' | 'ask'
// enter: polish once, when the message is sent (the fewest model calls). pause: polish when the
// speaking stops and put the result in the prompt, so what the person sees is what Enter sends.
export type PolishOn = 'enter' | 'pause'
// How a message tidied at Enter shows in the conversation: the text sent alone, with what Tidia
// did above it, or with what was said above both.
export type MessageView = 'tidied' | 'labeled' | 'full'

export type Config = {
  style: Style
  englishTerms: EnglishTerms
  model: 'sonnet' | 'haiku' | 'opus'
  learn: Learn
  dictApproval: DictApproval
  polishOn: PolishOn
  messageView: MessageView
  // The bubble's words for what Tidia did, 'prose/list/minimal'; a part left empty keeps its default.
  bubbleLabels: string
  // Show what Tidia does: previews, changes, notices and why a send went out untidied.
  debug: boolean
  // Dictionary entries and the conversation's identifiers as hints, and learning; off polishes without them.
  dictionary: boolean
  settleMs: number
  attachRaw: boolean
  uiLanguage: Locale | 'auto'
}

export const STYLES: readonly Style[] = ['polish', 'minimal']
export const ENGLISH_TERMS: readonly EnglishTerms[] = ['auto', 'off', 'low', 'medium', 'high']
// sonnet by default: haiku is faster but dropped requests in the 2026-10-10 eval.
export const MODELS: readonly Config['model'][] = ['sonnet', 'haiku', 'opus']
export const LEARN_MODES: readonly Learn[] = ['ask', 'off']
export const DICT_APPROVALS: readonly DictApproval[] = ['auto', 'ask']
export const POLISH_ON: readonly PolishOn[] = ['enter', 'pause']
export const MESSAGE_VIEWS: readonly MessageView[] = ['tidied', 'labeled', 'full']
export const BUBBLE_LABELS_CHARS = 80
export const UI_LANGUAGES: readonly Config['uiLanguage'][] = ['auto', 'en', 'ko', 'ja', 'zh', 'es', 'de', 'fr', 'pt']

export const DEFAULTS: Config = {
  style: 'polish',
  englishTerms: 'auto',
  model: 'sonnet',
  learn: 'ask',
  dictApproval: 'auto',
  // enter again since 0.1.7: a pause in speech is not the end of the message, and the person's row
  // shows what a cleanup at Enter sent (message_view).
  polishOn: 'enter',
  messageView: 'tidied',
  bubbleLabels: '',
  debug: false,
  dictionary: true,
  settleMs: 900,
  attachRaw: true,
  uiLanguage: 'auto',
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

export function parseConfig(options: Record<string, unknown>): Config {
  return {
    // 0.1.21 renamed light to minimal and folded auto and custom into polish; any other saved
    // value (prompt, clean, markdown) reads as polish too.
    style: options.style === 'light' ? 'minimal' : pick(options.style, STYLES, DEFAULTS.style),
    englishTerms: pick(options.english_terms, ENGLISH_TERMS, DEFAULTS.englishTerms),
    model: pick(options.model, MODELS, DEFAULTS.model),
    learn: pick(options.learn, LEARN_MODES, DEFAULTS.learn),
    dictApproval: pick(options.dict_approval, DICT_APPROVALS, DEFAULTS.dictApproval),
    polishOn: pick(options.polish_on, POLISH_ON, DEFAULTS.polishOn),
    messageView: pick(options.message_view, MESSAGE_VIEWS, DEFAULTS.messageView),
    bubbleLabels: typeof options.bubble_labels === 'string' ? options.bubble_labels.trim().slice(0, BUBBLE_LABELS_CHARS) : DEFAULTS.bubbleLabels,
    debug: typeof options.debug === 'boolean' ? options.debug : DEFAULTS.debug,
    // How long the prompt must stay still after dictation before it is polished; internal since 0.1.
    settleMs: DEFAULTS.settleMs,
    attachRaw: typeof options.attach_raw === 'boolean' ? options.attach_raw : DEFAULTS.attachRaw,
    dictionary: typeof options.dictionary === 'boolean' ? options.dictionary : DEFAULTS.dictionary,
    uiLanguage: pick(options.ui_language, UI_LANGUAGES, DEFAULTS.uiLanguage),
  }
}

// Claude Code's `language` setting takes a BCP 47 code or a language name.
const LANGUAGE_NAMES: Record<string, Locale> = {
  en: 'en', english: 'en',
  ko: 'ko', korean: 'ko', '한국어': 'ko',
  ja: 'ja', japanese: 'ja', '日本語': 'ja',
  zh: 'zh', chinese: 'zh', '中文': 'zh', '简体中文': 'zh', '繁體中文': 'zh',
  es: 'es', spanish: 'es', 'español': 'es', espanol: 'es',
  de: 'de', german: 'de', deutsch: 'de',
  fr: 'fr', french: 'fr', 'français': 'fr', francais: 'fr',
  pt: 'pt', portuguese: 'pt', 'português': 'pt', portugues: 'pt',
}

export function resolveLocale(setting: Config['uiLanguage'], language: unknown): Locale {
  if (setting !== 'auto') return setting
  if (typeof language !== 'string') return 'en'
  const key = language.trim().toLowerCase().split(/[-_]/)[0] ?? ''
  return LANGUAGE_NAMES[key] ?? 'en'
}
