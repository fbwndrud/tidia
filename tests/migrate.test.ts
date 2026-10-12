import { test, expect } from './kit'
import { install, start } from './harness'
import { migrate, savedOptions } from '../src/migrate'
import { emptyRules } from '../src/rules'

test('savedOptions finds Tidia under any marketplace, and nothing else', () => {
  expect(savedOptions({ pluginConfigs: { 'tidia@tidia': { options: { tone: 'polite' } } } })).toEqual({ tone: 'polite' })
  expect(savedOptions({ pluginConfigs: { 'tidia-probe@inline': { options: { tone: 'polite' } } } })).toBeNull()
  expect(savedOptions({})).toBeNull()
  expect(savedOptions(null)).toBeNull()
})

test('an old tone becomes its register starter, and the notes become rules', () => {
  const m = migrate({ style: 'custom', tone: 'polite', tone_note: '존댓말로 짧게', custom_note: '항목마다 줄바꿈' }, emptyRules())!
  expect(m.config).toEqual([])
  expect(m.rules.starters['starter-polite']?.enabled).toBe(true)
  expect(m.rules.rules.map(r => r.text)).toEqual(['존댓말로 짧게', '항목마다 줄바꿈'])
  expect(m.rules.rules.every(r => r.source === 'user')).toBe(true)
})

test('light becomes minimal and takes no tone; concise and defaults move nothing', () => {
  const m = migrate({ style: 'light', tone: 'casual', tone_note: 'x' }, emptyRules())!
  expect(m.config).toEqual([{ key: 'style', value: 'minimal' }])
  expect(m.rules).toEqual(emptyRules())
  expect(migrate({ style: 'polish', tone: 'concise', tone_note: '' }, emptyRules())).toBeNull()
  expect(migrate({ style: 'auto', custom_note: 'ignored outside custom' }, emptyRules())).toBeNull()
})

test('markdown becomes a Markdown layout rule; a rule already there is not added twice', () => {
  const once = migrate({ style: 'markdown' }, emptyRules())!
  expect(once.rules.rules).toHaveLength(1)
  expect(migrate({ style: 'markdown' }, once.rules)).toBeNull()
})

test('the first start after an upgrade moves the old settings once and says so', async ($, on) => {
  const h = install(on, { saved: { style: 'light', tone: 'polite' } })
  await start($)
  expect(h.configSets).toEqual([{ key: 'tidia.style', value: 'minimal' }])
  expect(h.logs.some(l => l.includes('style light → minimal'))).toBe(true)
  expect(h.stored('migrated')).toBe(2)
  await start($)
  expect(h.configSets).toHaveLength(1)
})

test('an old tone lands in the global rules', async ($, on) => {
  const h = install(on, { saved: { style: 'auto', tone: 'casual', tone_note: '반말로' } })
  await start($)
  const rules = h.stored('rules:global') as { starters: Record<string, { enabled: boolean }>; rules: Array<{ text: string }> }
  expect(rules.starters['starter-casual']?.enabled).toBe(true)
  expect(rules.rules.map(r => r.text)).toEqual(['반말로'])
})

test('a fresh install marks the move done without a word', async ($, on) => {
  const h = install(on)
  await start($)
  expect(h.stored('migrated')).toBe(2)
  expect(h.logs).toEqual([])
})

test('step 2 moves show_raw to message_view, also for an install that did step 1', () => {
  expect(migrate({ show_raw: 'show' }, emptyRules(), 1)?.config).toEqual([{ key: 'message_view', value: 'full' }])
  expect(migrate({ show_raw: 'hide', tone: 'polite' }, emptyRules(), 1)).toEqual({ rules: emptyRules(), config: [{ key: 'message_view', value: 'labeled' }], moved: ['show_raw hide → message_view labeled'] })
  expect(migrate({ show_raw: 'show' }, emptyRules(), 2)).toBeNull()
})

test('a start after step 1 runs step 2 only', async ($, on) => {
  const h = install(on, { saved: { show_raw: 'hide', tone: 'polite' }, store: { migrated: 1 } })
  await start($)
  expect(h.configSets).toEqual([{ key: 'tidia.message_view', value: 'labeled' }])
  expect(h.stored('rules:global')).toBeUndefined()
  expect(h.stored('migrated')).toBe(2)
})
