import { test, expect } from './kit'
import { install, start, command, dictate, reply, enter } from './harness'
import { MAX_ENTRIES } from '../src/dict/dict'

// Each action lives on one of the three tools; an unknown one is tried on settings.
const toolFor = (action: unknown) => {
  const a = String(action)
  return a.startsWith('dict_') ? 'mcp__tidia__dictionary' : a.startsWith('rule_') ? 'mcp__tidia__rules' : 'mcp__tidia__settings'
}
const call = (input: Record<string, unknown>) => ({ tool: toolFor(input.action), ...input }) as never
const NOW = '2026-10-10T00:00:00.000Z'
const entry = (meant: string, heard?: string, source = 'manual') => ({ ...(heard ? { heard } : {}), meant, source, confirmations: 0, rejections: 0, uses: 0, lastSeen: NOW })
const DISMISSED = 'Not changed: the question was dismissed, or there was no one to ask.'
const result = async ($: { tool: { call: (a: never) => Promise<{ result?: unknown }> } }, input: Record<string, unknown>) => String((await $.tool.call(call(input))).result)

test('three tools are registered, one per job, all deferred', async ($, on) => {
  const h = install(on)
  await start($)
  expect(h.tools).toEqual([
    expect.objectContaining({ name: 'dictionary', isDeferred: true }),
    expect.objectContaining({ name: 'rules', isDeferred: true }),
    expect.objectContaining({ name: 'settings', isDeferred: true }),
  ])
})

test('an action sent to the wrong tool is refused with that tool\'s actions', async ($, on) => {
  install(on)
  await start($)
  const r = await $.tool.call({ tool: 'mcp__tidia__rules', action: 'dict_add', meant: 'Tailscale' } as never)
  expect(String(r.result)).toBe('Unknown action. Use one of: rule_list, rule_add, rule_update, rule_remove.')
})

test('read actions and dictionary removals are allowed without a prompt; other changes ask', async ($, on) => {
  install(on)
  await start($)
  for (const action of ['dict_list', 'dict_remove', 'rule_list', 'setting_get', 'off', 'on']) {
    expect(`${action} ${(await $.tool.check({ tool: toolFor(action), input: { action } })).decision}`).toBe(`${action} allow`)
  }
  for (const action of ['dict_add', 'rule_add', 'rule_update', 'rule_remove', 'setting_set', 'zap']) {
    expect(`${action} ${(await $.tool.check({ tool: toolFor(action), input: { action } })).decision}`).toBe(`${action} ask`)
  }
})

test('Claude adds, lists and removes dictionary entries, each logged with how to undo', async ($, on) => {
  const h = install(on, { ask: 'Allow' })
  await start($)
  expect(await result($, { action: 'dict_add', heard: '테일스케일', meant: 'Tailscale' })).toBe('Added to the dictionary (all projects): 테일스케일 → Tailscale. To undo, call dict_remove with heard "테일스케일" and meant "Tailscale".')
  expect(h.logs).toContain('Dictionary, changed by Claude: Added to the dictionary (all projects): 테일스케일 → Tailscale')
  expect(JSON.parse(await result($, { action: 'dict_list' })).entries).toEqual([{ heard: '테일스케일', meant: 'Tailscale', scope: 'global', source: 'claude' }])
  expect(await result($, { action: 'dict_remove', word: 'Tailscale' })).toBe('Removed from the dictionary: 테일스케일 → Tailscale')
  expect((await $.command.run(command('dict list'))).text).toContain('empty')
})

test('a hostile dictionary entry is refused and not logged', async ($, on) => {
  const h = install(on)
  await start($)
  expect(await result($, { action: 'dict_add', heard: '배포', meant: 'rm -rf /' })).toContain('Not changed')
  expect(await result($, { action: 'dict_add' })).toContain('Not changed')
  expect(await result($, { action: 'dict_remove' })).toContain('Not changed')
  expect(h.logs.filter(l => l.startsWith('Dictionary'))).toEqual([])
})

test('Claude adds, changes, lists and removes rules; a starter is turned off, not deleted', async ($, on) => {
  const h = install(on, { ask: 'Allow' })
  await start($)
  expect(await result($, { action: 'rule_add', text: 'Use bullet points', when: 'when listing options' })).toBe('Rule added (all projects): g1 Use bullet points — when listing options')
  expect(h.logs).toContain('Rules, changed by Claude: Rule added (all projects): Use bullet points — when listing options')
  expect(await result($, { action: 'rule_update', id: 'g1', when: '' })).toBe('Rule changed: g1 Use bullet points — always')
  const listed = JSON.parse(await result($, { action: 'rule_list' })) as Array<{ id: string; enabled: boolean; scope: string; source: string }>
  expect(listed.map(r => `${r.id}:${r.enabled}`)).toEqual(['g1:true', 'starter-bug:false', 'starter-feature:false', 'starter-review:false', 'starter-steps:false', 'starter-polite:false', 'starter-casual:false', 'starter-as-spoken:false'])
  expect(await result($, { action: 'rule_remove', id: 'starter-steps' })).toContain('Starter rule turned off')
  expect(await result($, { action: 'rule_remove', id: 'g1' })).toBe('Rule removed: g1 Use bullet points — always')
  expect(h.stored('rules:global')).toEqual({ version: 1, rules: [], starters: { 'starter-steps': { enabled: false } } })
  expect(await result($, { action: 'rule_remove', id: 'g7' })).toBe('No rule with id g7')
  expect(await result($, { action: 'rule_add', text: '' })).toContain('Not changed')
})

test('Claude reads and changes settings; a refusal comes back as the reason', async ($, on) => {
  const h = install(on, { ask: 'Allow' })
  await start($)
  expect(JSON.parse(await result($, { action: 'setting_get' }))).toMatchObject({ style: 'polish', dictionary: 'on' })
  expect(await result($, { action: 'setting_set', key: 'style', value: 'minimal' })).toBe('Set style to minimal. Tidia reloads with it.')
  expect(h.configSets).toEqual([{ key: 'tidia.style', value: 'minimal' }])
  expect(h.logs).toContain('Settings, changed by Claude: Set style to minimal. Tidia reloads with it.')
  expect(await result($, { action: 'setting_set', key: 'style', value: 'loud' })).toContain('style takes')
})

test('a setting the engine refuses is reported and not logged', { }, async ($, on) => {
  const h = install(on, { configDeny: 'no /config row', ask: 'Allow' })
  await start($)
  expect(await result($, { action: 'setting_set', key: 'style', value: 'minimal' })).toContain('no /config row')
  expect(h.logs.filter(l => l.startsWith('Settings'))).toEqual([])
})

test('Claude turns polishing off and on for the session', async ($, on) => {
  const h = install(on)
  await start($)
  expect(await result($, { action: 'off' })).toBe('Tidia is off for this session.')
  expect((await $.command.run(command(''))).text).toContain('off')
  expect(await result($, { action: 'on' })).toBe('Tidia is on.')
  expect(h.logs).toContain('Tidia, changed by Claude: Tidia is off for this session.')
})

test('a rule or setting change asks the person first; dismissed, nothing changes', async ($, on) => {
  const h = install(on)
  await start($)
  expect(await result($, { action: 'rule_add', text: 'Use bullet points' })).toBe(DISMISSED)
  expect(await result($, { action: 'setting_set', key: 'style', value: 'minimal' })).toBe(DISMISSED)
  expect(h.asked).toEqual([
    'Claude wants to change Tidia: rule_add · text: "Use bullet points". Allow it? A rule goes into every cleanup of your dictation.',
    'Claude wants to change Tidia: setting_set · key: "style" · value: "minimal". Allow it?',
  ])
  expect(h.stored('rules:global')).toBeUndefined()
  expect(h.configSets).toEqual([])
  expect(h.logs.filter(l => l.startsWith('Rules') || l.startsWith('Settings'))).toEqual([])
})

test('a change the person declines is refused', async ($, on) => {
  const h = install(on, { ask: "Don't allow" })
  await start($)
  expect(await result($, { action: 'rule_remove', id: 'starter-bug' })).toBe('Not changed: the user did not allow it.')
  expect(h.stored('rules:global')).toBeUndefined()
})

test('an engine deny is refused with its reason', async ($, on) => {
  const h = install(on, { check: { decision: 'deny', reason: 'blocked by a deny rule' } })
  await start($)
  expect(await result($, { action: 'rule_update', id: 'starter-bug', enabled: false })).toBe('Not changed: blocked by a deny rule')
  expect(h.asked).toEqual([])
  expect(h.stored('rules:global')).toBeUndefined()
})

test('an engine allow runs the change without a question', async ($, on) => {
  const h = install(on, { check: { decision: 'allow' } })
  await start($)
  expect(await result($, { action: 'setting_set', key: 'style', value: 'minimal' })).toContain('Set style to minimal')
  expect(h.asked).toEqual([])
})

const FRAMES = ['이렇게', '이렇게 이제', '이렇게 이제 이제 이제 되는 건가', '이렇게 이제 이제 이제 되는 건가 어 되네 되네']
const composer = (text: string) => ({ text, wait: false, origin: { kind: 'composer' as const } })

const TAILSCALE = ['음 테일스캐일', '음 테일스캐일 써서 이거 정리해 줘']

test('Claude adds a misheard word from a recent dictation without asking', async ($, on) => {
  const h = install(on, { replies: [reply('테일스캐일 써서 이거 정리해 줘.')] })
  await start($)
  await dictate(h, TAILSCALE)
  await $.prompt.submit(enter(h))
  expect(await result($, { action: 'dict_add', heard: '테일스캐일', meant: 'Tailscale' })).toContain('Added to the dictionary')
  expect(h.asked).toEqual([])
})

// A pair that does not sound alike can turn one ordinary word into another in every later message.
test('a dictated word paired with a spelling that does not sound like it asks first', async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')] })
  await start($)
  await dictate(h, FRAMES)
  await $.prompt.submit(enter(h))
  expect(await result($, { action: 'dict_add', heard: '되는 건가', meant: 'Tailscale' })).toBe(DISMISSED)
  expect(h.asked).toHaveLength(1)
})

test('an entry the person made stays theirs when Claude adds it again: removing it still asks', async ($, on) => {
  const h = install(on, { replies: [reply('테일스캐일 써서 이거 정리해 줘.')] })
  await start($)
  await $.command.run(command('dict add 테일스캐일 = Tailscale'))
  await dictate(h, TAILSCALE)
  await $.prompt.submit(enter(h))
  await result($, { action: 'dict_add', heard: '테일스캐일', meant: 'Tailscale' })
  expect((h.stored('dict:global') as { entries: Array<{ source: string }> }).entries[0]?.source).toBe('manual')
  expect(await result($, { action: 'dict_remove', heard: '테일스캐일', meant: 'Tailscale' })).toBe(DISMISSED)
})

// 0.1.21: a letter or two inside another word is not a word the person said.
test('a heard form inside another word, or too short, asks first', async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')] })
  await start($)
  await dictate(h, FRAMES)
  await $.prompt.submit(enter(h))
  expect(await result($, { action: 'dict_add', heard: '렇게', meant: 'Tailscale' })).toBe(DISMISSED)
  expect(await result($, { action: 'dict_add', heard: '이', meant: 'Tailscale' })).toBe(DISMISSED)
  expect(h.asked).toHaveLength(2)
})

test('dict_approval ask makes every dictionary change by Claude ask first', { options: { dict_approval: 'ask' } }, async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')] })
  await start($)
  await dictate(h, FRAMES)
  await $.prompt.submit(enter(h))
  expect(await result($, { action: 'dict_add', heard: '되는 건가', meant: 'Tailscale' })).toBe(DISMISSED)
  expect(await result($, { action: 'dict_remove', word: 'Tailscale' })).toBe(DISMISSED)
  expect(h.asked).toHaveLength(2)
})

// The person's own entries are theirs; what Claude or learning added, Claude may take back.
test('removing or changing an entry the person made asks; removing one Claude made does not', async ($, on) => {
  const entry = (meant: string, source: string, heard?: string) => ({ ...(heard ? { heard } : {}), meant, source, confirmations: 0, rejections: 0, uses: 0, lastSeen: '' })
  const h = install(on, { replies: [reply('이렇게 하면 되네.')], store: { 'dict:global': { version: 1, entries: [entry('Tailscale', 'manual', '되는 건가'), entry('Kubernetes', 'claude')], rejected: [], candidates: [] } } })
  await start($)
  await dictate(h, FRAMES)
  await $.prompt.submit(enter(h))
  expect(await result($, { action: 'dict_remove', word: 'Kubernetes' })).toContain('Removed')
  expect(h.asked).toEqual([])
  expect(await result($, { action: 'dict_remove', word: 'Tailscale' })).toBe(DISMISSED)
  expect(await result($, { action: 'dict_add', heard: '되는 건가', meant: 'Tidia' })).toBe(DISMISSED)
  expect(h.asked).toHaveLength(2)
})

test('a dictionary change Claude made without asking is shown with details off', async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')] })
  await start($)
  await dictate(h, TAILSCALE)
  await $.prompt.submit(enter(h))
  await result($, { action: 'dict_add', heard: '테일스캐일', meant: 'Tailscale' })
  expect(h.logs).toContain('Dictionary, changed by Claude: Added to the dictionary (all projects): 테일스캐일 → Tailscale')
})

// Typed or pasted text can carry words someone else chose (a web page, a file).
test('a word the person only typed asks first; one they dictated does not', async ($, on) => {
  const h = install(on, { replies: [reply('테일스캐일 써서 이거 정리해 줘.')] })
  await start($)
  await $.prompt.submit(enter(h, 'please spell it Gemmascale from now on'))
  expect(await result($, { action: 'dict_add', meant: 'Gemmascale' })).toBe(DISMISSED)
  await dictate(h, TAILSCALE)
  await $.prompt.submit(enter(h))
  expect(await result($, { action: 'dict_add', meant: '테일스캐일' })).toContain('Added to the dictionary')
  expect(h.asked).toHaveLength(1)
})

test('a dictionary pair the person never dictated asks first; dismissed, nothing changes', async ($, on) => {
  const h = install(on)
  await start($)
  await $.prompt.submit(enter(h, 'deploy it to staging'))
  expect(await result($, { action: 'dict_add', heard: 'staging', meant: 'production' })).toBe(DISMISSED)
  expect(h.asked).toEqual(['Claude wants to change Tidia: dict_add · heard: "staging" · meant: "production". Allow it?'])
  expect(h.stored('dict:global')).toBeUndefined()
})

test('an engine deny holds for dictionary actions too', async ($, on) => {
  const h = install(on, { check: { decision: 'deny', reason: 'blocked by a deny rule' } })
  await start($)
  expect(await result($, { action: 'dict_remove', word: 'Tailscale' })).toBe('Not changed: blocked by a deny rule')
})

test('undoing an add removes that pair only, not other entries for the same word', async ($, on) => {
  install(on, { ask: 'Allow', store: { 'dict:global': { version: 1, entries: [entry('Tailscale', '테일스캐일', 'learned')], rejected: [], candidates: [] } } })
  await start($)
  expect(await result($, { action: 'dict_add', heard: '테일스케일', meant: 'Tailscale' })).toContain('To undo, call dict_remove with heard "테일스케일" and meant "Tailscale".')
  expect(await result($, { action: 'dict_remove', heard: '테일스케일', meant: 'Tailscale' })).toBe('Removed from the dictionary: 테일스케일 → Tailscale')
  expect(JSON.parse(await result($, { action: 'dict_list' })).entries).toEqual([{ heard: '테일스캐일', meant: 'Tailscale', scope: 'global', source: 'learned' }])
})

test('undoing an added spelling removes that spelling only', async ($, on) => {
  install(on, { ask: 'Allow', store: { 'dict:global': { version: 1, entries: [entry('Tailscale', '테일스캐일')], rejected: [], candidates: [] } } })
  await start($)
  expect(await result($, { action: 'dict_add', meant: 'Tailscale' })).toContain('To undo, call dict_remove with meant "Tailscale".')
  expect(await result($, { action: 'dict_remove', meant: 'Tailscale' })).toBe('Removed from the dictionary: Tailscale')
  expect(JSON.parse(await result($, { action: 'dict_list' })).entries).toEqual([{ heard: '테일스캐일', meant: 'Tailscale', scope: 'global', source: 'manual' }])
})

test('a refused dictionary entry is told the actual limits', async ($, on) => {
  install(on, { ask: 'Allow' })
  await start($)
  const why = await result($, { action: 'dict_add', meant: 'AT&T' })
  expect(why).toContain('Not changed')
  expect(why).toContain('at most 4 words')
  expect(why).toContain('&')
})

test('a full dictionary points Claude to dict_remove', async ($, on) => {
  install(on, { ask: 'Allow', store: { 'dict:global': { version: 1, entries: Array.from({ length: MAX_ENTRIES }, (_, i) => entry(`Term${i}`)), rejected: [], candidates: [] } } })
  await start($)
  expect(await result($, { action: 'dict_add', meant: 'Tailscale' })).toContain('dict_remove')
})

test('a starter rule given more than enabled is told so, not that it is missing', async ($, on) => {
  const h = install(on, { ask: 'Allow' })
  await start($)
  expect(await result($, { action: 'rule_update', id: 'starter-bug', enabled: true, when: '' })).toBe('Not changed: starter-bug is a starter rule; it takes only enabled (true or false).')
  expect(await result($, { action: 'rule_update', id: 'starter-bug' })).toBe('Not changed: starter-bug is a starter rule; it takes only enabled (true or false).')
  expect(await result($, { action: 'rule_update', enabled: true })).toBe('Not changed: give the rule\'s id from rule_list.')
  expect(h.stored('rules:global')).toBeUndefined()
})

test('setting_set takes a boolean value, and a missing key gets a tool-shaped answer', async ($, on) => {
  const h = install(on, { ask: 'Allow' })
  await start($)
  expect(await result($, { action: 'setting_set', key: 'dictionary', value: false })).toContain('Set dictionary to off')
  expect(h.configSets).toEqual([{ key: 'tidia.dictionary', value: false }])
  const usage = await result($, { action: 'setting_set', value: 'minimal' })
  expect(usage).toContain('setting_set takes key and value')
  expect(usage).not.toContain('/tidia')
})

test('setting_get says whether cleaning is on for this session', async ($, on) => {
  install(on)
  await start($)
  expect(JSON.parse(await result($, { action: 'setting_get' }))).toMatchObject({ cleaning: 'on' })
  await result($, { action: 'off' })
  expect(JSON.parse(await result($, { action: 'setting_get' }))).toMatchObject({ cleaning: 'off' })
})

test('the description says which actions show the person a dialog, and that rules take a scope', async ($, on) => {
  const h = install(on)
  await start($)
  const [dictionary, rules, settings] = h.tools.map(t => String((t as { description: string }).description))
  expect(rules).toContain('rule_add, rule_update and rule_remove: They show the person a dialog')
  expect(settings).toContain('setting_set: They show the person a dialog')
  expect(dictionary).toContain('a pair whose misheard word they did not dictate recently or that does not sound like the spelling')
  for (const d of [dictionary, rules, settings]) expect(d).toContain('do not ask in chat first')
  expect(rules).toMatch(/rule_add[^.]*scope/)
})

test('an add that changed an entry is undone by putting the old one back', async ($, on) => {
  install(on, { ask: 'Allow', store: { 'dict:global': { version: 1, entries: [entry('Tailscan', '테일스캐일')], rejected: [], candidates: [] } } })
  await start($)
  expect(await result($, { action: 'dict_add', heard: '테일스캐일', meant: 'Tailscale' })).toContain('To undo, call dict_add with heard "테일스캐일" and meant "Tailscan".')
})

test('an add that was already in the dictionary has nothing to undo', async ($, on) => {
  install(on, { ask: 'Allow', store: { 'dict:global': { version: 1, entries: [entry('Tailscale', '테일스캐일')], rejected: [], candidates: [] } } })
  await start($)
  const r = await result($, { action: 'dict_add', heard: '테일스캐일', meant: 'Tailscale' })
  expect(r).toContain('It was already in the dictionary, so there is nothing to undo.')
  expect(r).not.toContain('dict_remove')
})

const many = (n: number) => ({ 'dict:global': { version: 1, entries: Array.from({ length: n }, (_, i) => entry(`Term${i}`)), rejected: [], candidates: [] } })

test('dict_list shows at most 100 entries with the total, and searches with word', async ($, on) => {
  install(on, { store: many(150) })
  await start($)
  const all = JSON.parse(await result($, { action: 'dict_list' }))
  expect(all.total).toBe(150)
  expect(all.entries).toHaveLength(100)
  expect(all.note).toContain('word')
  const found = JSON.parse(await result($, { action: 'dict_list', word: 'term14' }))
  expect(found.total).toBe(11)
  expect(found.entries.map((e: { meant: string }) => e.meant)).toEqual(['Term14', ...Array.from({ length: 10 }, (_, i) => `Term14${i}`)])
  expect(found.note).toBeUndefined()
})

test('/tidia dict list shows at most 200 rows and searches with a word', async ($, on) => {
  install(on, { store: many(250) })
  await start($)
  const rows = (await $.command.run(command('dict list'))).text!.split('\n')
  expect(rows).toHaveLength(1 + 200 + 1)
  expect(rows.at(-1)).toBe('…and 50 more. Search: /tidia dict list <word>')
  const found = (await $.command.run(command('dict list Term24'))).text!.split('\n')
  expect(found.slice(1).map(r => r.trim().split(' ')[0])).toEqual(['Term24', ...Array.from({ length: 10 }, (_, i) => `Term24${i}`)])
})
