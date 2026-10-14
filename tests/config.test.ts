import { test, expect } from './kit'
import { parseConfig, resolveLocale, STYLES, SUPPORTED_LOCALES } from '../src/config'

test('parseConfig fills defaults', () => {
  expect(parseConfig({})).toEqual({
    style: 'polish', englishTerms: 'auto', model: 'sonnet', learn: 'ask', dictApproval: 'auto', polishOn: 'enter', messageView: 'tidied', bubbleLabels: '', debug: false, dictionary: true, settleMs: 900, attachRaw: true, uiLanguage: 'auto',
  })
})

test('parseConfig reads valid values; settle_ms is internal', () => {
  const cfg = parseConfig({ mode: 'review', style: 'minimal', model: 'haiku', learn: 'off', dictionary: false, settle_ms: 1500, attach_raw: false, ui_language: 'ko' })
  expect(cfg).toEqual({ style: 'minimal', englishTerms: 'auto', model: 'haiku', learn: 'off', dictApproval: 'auto', polishOn: 'enter', messageView: 'tidied', bubbleLabels: '', debug: false, dictionary: false, settleMs: 900, attachRaw: false, uiLanguage: 'ko' })
})

test('parseConfig ignores unknown values', () => {
  expect(parseConfig({ mode: 'loud', style: 3, attach_raw: 'yes' })).toEqual(parseConfig({}))
})

test('resolveLocale follows the language setting when auto', () => {
  expect(resolveLocale('auto', 'Korean')).toBe('ko')
  expect(resolveLocale('auto', 'ko-KR')).toBe('ko')
  expect(resolveLocale('auto', 'italian')).toBe('en')
  expect(resolveLocale('auto', undefined)).toBe('en')
  expect(resolveLocale('en', 'korean')).toBe('en')
})

// 0.1.21: light became minimal, and auto, markdown and custom folded into polish.
test('parseConfig accepts polish and minimal, and reads the old style names', () => {
  for (const style of ['polish', 'minimal'] as const) expect(parseConfig({ style }).style).toBe(style)
  expect(STYLES).toEqual(['polish', 'minimal'])
  expect(parseConfig({ style: 'light' }).style).toBe('minimal')
  for (const style of ['auto', 'markdown', 'custom']) expect(parseConfig({ style }).style).toBe('polish')
})

test('parseConfig trims the bubble words', () => {
  expect(parseConfig({ bubble_labels: ' 글/할 일 ' }).bubbleLabels).toBe('글/할 일')
})

// 0.1.21 moved the tone, its note and custom's layout into output rules: saved ones are moved once at start (src/migrate.ts).
test('parseConfig ignores a saved tone, tone note or custom note: the move at start takes them', () => {
  expect(parseConfig({ tone: 'polite', tone_note: '반말', custom_note: '표로' })).toEqual(parseConfig({}))
})

test('parseConfig reads the English terms level', () => {
  expect(parseConfig({ english_terms: 'off' }).englishTerms).toBe('off')
  expect(parseConfig({ english_terms: 'loud' }).englishTerms).toBe('auto')
})

test('parseConfig offers opus as well', () => {
  expect(parseConfig({ model: 'opus' }).model).toBe('opus')
  expect(parseConfig({ model: 'gpt' }).model).toBe('sonnet')
})

test('resolveLocale knows the six added languages by code and by name', () => {
  for (const [setting, locale] of [
    ['japanese', 'ja'], ['日本語', 'ja'], ['ja-JP', 'ja'],
    ['chinese', 'zh'], ['中文', 'zh'], ['zh-CN', 'zh'],
    ['spanish', 'es'], ['español', 'es'], ['es-MX', 'es'],
    ['german', 'de'], ['deutsch', 'de'], ['de-AT', 'de'],
    ['french', 'fr'], ['français', 'fr'], ['fr-CA', 'fr'],
    ['portuguese', 'pt'], ['português', 'pt'], ['pt-BR', 'pt'],
  ] as const) {
    expect(resolveLocale('auto', setting)).toBe(locale)
  }
  expect(resolveLocale('de', 'korean')).toBe('de')
})

test('new languages resolve by regional code, English name and native name', () => {
  for (const [language, locale] of [
    ['Russian', 'ru'], ['русский', 'ru'], ['ru-RU', 'ru'],
    ['Hindi', 'hi'], ['हिन्दी', 'hi'], ['हिंदी', 'hi'], ['hi-IN', 'hi'],
    ['Indonesian', 'id'], ['Bahasa Indonesia', 'id'], ['id-ID', 'id'],
    ['Brazilian Portuguese', 'pt'], ['Português (Brasil)', 'pt'],
    ['Traditional Chinese', 'zh-TW'], ['繁體中文', 'zh-TW'], ['繁体中文', 'zh-TW'],
    ['zh-TW', 'zh-TW'], ['zh_HK', 'zh-TW'], ['zh-MO', 'zh-TW'],
    ['zh-Hant', 'zh-TW'], ['zh-Hant-CN', 'zh-TW'], [' ZH_hant_TW ', 'zh-TW'],
    ['Simplified Chinese', 'zh'], ['簡體中文', 'zh'], ['zh-Hans', 'zh'], ['zh-Hans-TW', 'zh'],
  ] as const) expect(resolveLocale('auto', language)).toBe(locale)
  expect(resolveLocale('auto', 'unsupported')).toBe('en')
  expect(resolveLocale('auto', 'constructor')).toBe('en')
  expect(resolveLocale('auto', null)).toBe('en')
  expect(resolveLocale('hi', 'en-US')).toBe('hi')
  // Arabic is not offered yet: it reads as English.
  expect(resolveLocale('auto', 'ar-SA')).toBe('en')
  expect(parseConfig({ ui_language: 'ar' }).uiLanguage).toBe('auto')
})

test('every supported UI language can be saved and explicitly overrides automatic detection', () => {
  for (const locale of SUPPORTED_LOCALES) {
    const cfg = parseConfig({ ui_language: locale })
    expect(cfg.uiLanguage).toBe(locale)
    expect(resolveLocale(cfg.uiLanguage, 'English')).toBe(locale)
  }
  expect(parseConfig({ ui_language: 'unknown' }).uiLanguage).toBe('auto')
})

// 0.1.4 dropped the mode setting (smart or review): a saved one is ignored.
test('a saved mode is ignored', () => {
  expect(parseConfig({ mode: 'review' })).toEqual(parseConfig({}))
})

test('polishing waits for Enter and details are hidden by default', () => {
  const cfg = parseConfig({})
  expect(cfg.polishOn).toBe('enter')
  expect(cfg.debug).toBe(false)
  expect(parseConfig({ polish_on: 'pause', debug: true })).toMatchObject({ polishOn: 'pause', debug: true })
})
