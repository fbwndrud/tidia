import { test, expect } from './kit'
import { t, LOCALES } from '../src/i18n'
import { SUPPORTED_LOCALES } from '../src/config'

test('t returns the locale string', () => {
  expect(t('ko', 'failed')).toBe('정리 못 함 · 원문 그대로')
  expect(t('en', 'failed')).toBe('Not tidied, original kept')
})

test('t fills variables and leaves unknown ones visible', () => {
  expect(t('en', 'cmd_unknown', { arg: 'zap' })).toBe('Unknown option "zap". Use: /tidia on | off | settings | set <setting> <value> | dict | rules')
  expect(t('en', 'cmd_unknown')).toContain('{arg}')
})

test('every locale fills every message and keeps its variables', () => {
  const en = LOCALES.en
  for (const [locale, table] of Object.entries(LOCALES)) {
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect(typeof table[key]).toBe('string')
      expect(table[key].length).toBeGreaterThan(0)
      const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort()
      expect(`${locale}.${key} ${vars(table[key]).join(',')}`).toBe(`${locale}.${key} ${vars(en[key]).join(',')}`)
    }
  }
  expect(Object.keys(LOCALES).sort()).toEqual([...SUPPORTED_LOCALES].sort())
})

test('messages read in the added languages', () => {
  expect(t('ja', 'failed')).toBe('整えられませんでした · 原文のまま')
  expect(t('zh', 'failed')).toBe('未能整理 · 保留原文')
  expect(t('es', 'failed')).toBe('No se pudo pulir, se mantiene el original')
  expect(t('de', 'failed')).toBe('Nicht geglättet, Original bleibt')
  expect(t('fr', 'failed')).toBe('Pas mis au propre, original conservé')
  expect(t('pt', 'failed')).toBe('Não polido, original mantido')
  expect(t('zh-TW', 'failed')).toBe('無法整理 · 保留原文')
  expect(t('ru', 'failed')).toBe('Не удалось обработать, сохранён исходный текст')
  expect(t('hi', 'failed')).toBe('पाठ नहीं सँवारा जा सका, मूल पाठ रखा गया')
  expect(t('id', 'failed')).toBe('Gagal dirapikan, teks asli dipertahankan')
})

test('translations keep runnable command names', () => {
  const tokens = (s: string) => (s.match(/\/tidia(?: (?:dict|settings|set|rules|on|off|add|remove|list|build))*/g) ?? []).sort()
  for (const table of Object.values(LOCALES)) {
    for (const key of Object.keys(LOCALES.en) as Array<keyof typeof LOCALES.en>) {
      expect(tokens(table[key])).toEqual(tokens(LOCALES.en[key]))
    }
  }
})
