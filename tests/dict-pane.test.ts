import { test, expect } from './kit'
import { install, start, command, pane } from './harness'

const NOW = '2026-10-10T00:00:00.000Z'
const STORE = {
  'dict:global': {
    version: 1,
    entries: [{ heard: '테일스케일', meant: 'Tailscale', source: 'manual', confirmations: 0, rejections: 0, uses: 0, lastSeen: NOW }],
    rejected: [],
    candidates: [{ heard: '쿠버네티스', meant: 'Kubernetes', count: 1, lastSeen: NOW }],
  },
}
const entriesOf = (v: unknown) => (v as { entries: Array<{ meant: string; source: string }> }).entries.map(e => `${e.meant}:${e.source}`)

test('/tidia dict opens the dictionary pane with entries and once-corrected words', async ($, on) => {
  const h = install(on, { store: STORE })
  await start($)
  const r = await $.command.run(command('dict'))
  expect(r.text).toBeUndefined()
  expect(h.opened).toEqual(['voice-dict'])
  const ui = await $.ui.mount(pane('voice-dict'))
  expect(await ui.find({ type: 'Text', text: /테일스케일 → Tailscale/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /쿠버네티스 → Kubernetes/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Corrected once/ })).toBeDefined()
  await ui.unmount()
})

test('the pane puts the keyboard in its add field when it opens', async ($, on) => {
  install(on, { store: STORE })
  await start($)
  await $.command.run(command('dict'))
  const ui = await $.ui.mount(pane('voice-dict'))
  const field = await ui.find({ type: 'Input', key: 'add' })
  expect(field?.props.autoFocus).toBe(true)
  await ui.unmount()
})

test('row buttons come before the text so a long entry cannot push them out of a narrow pane', async ($, on) => {
  install(on, { store: STORE })
  await start($)
  await $.command.run(command('dict'))
  const ui = await $.ui.mount(pane('voice-dict'))
  for (const key of ['row-global:테일스케일=Tailscale', 'candidate-쿠버네티스=Kubernetes']) {
    const row = await ui.find({ type: 'Box', key })
    const kinds = (row?.children ?? []).map(c => (c as { type: string }).type)
    expect(`${key} ${kinds.join(',')}`).toMatch(/ (Button,)+Text$/)
  }
  const text = await ui.find({ type: 'Text', text: /테일스케일 → Tailscale/ })
  expect(text?.props.wrap).toBe('truncate-end')
  await ui.unmount()
})

test('the pane adds through its input, removes a row, approves and dismisses corrections', async ($, on) => {
  const h = install(on, { store: STORE })
  await start($)
  await $.command.run(command('dict'))
  const ui = await $.ui.mount(pane('voice-dict'))
  await ui.input({ key: 'add', text: '보이스 플래시 = Voice Polish' })
  expect(await ui.find({ type: 'Text', text: /Added to the dictionary \(all projects\): 보이스 플래시 → Voice Polish/ })).toBeDefined()
  await ui.press({ key: 'approve-쿠버네티스=Kubernetes' })
  expect(entriesOf(h.stored('dict:global'))).toEqual(['Tailscale:manual', 'Voice Polish:manual', 'Kubernetes:learned'])
  await ui.press({ key: 'remove-global:테일스케일=Tailscale' })
  expect(entriesOf(h.stored('dict:global'))).toEqual(['Voice Polish:manual', 'Kubernetes:learned'])
  await ui.unmount()
})

test('dismissing a once-corrected word keeps it from being learned', async ($, on) => {
  const h = install(on, { store: STORE })
  await start($)
  await $.command.run(command('dict'))
  const ui = await $.ui.mount(pane('voice-dict'))
  await ui.press({ key: 'dismiss-쿠버네티스=Kubernetes' })
  const d = h.stored('dict:global') as { candidates: unknown[]; rejected: unknown[] }
  expect(d.candidates).toEqual([])
  expect(d.rejected).toEqual([{ heard: '쿠버네티스', meant: 'Kubernetes' }])
  await ui.press({ key: 'close' })
  expect(h.opened).toEqual([])
  await ui.unmount()
})

test('a pane that cannot be placed falls back to the text list', async ($, on) => {
  install(on, { store: STORE, paneRefused: 'too narrow' })
  await start($)
  expect((await $.command.run(command('dict'))).text).toContain('테일스케일 → Tailscale · all projects')
})

test('the pane lists rules with On/Off and Remove for own rules only', async ($, on) => {
  const h = install(on, { store: { 'rules:global': { version: 1, rules: [{ id: 'g1', text: 'Use bullet points', enabled: true, source: 'user' }], starters: {} } } })
  await start($)
  await $.command.run(command('dict'))
  const ui = await $.ui.mount(pane('voice-dict'))
  expect(await ui.find({ type: 'Text', text: /Rules \(8\)/ })).toBeDefined()
  expect(await ui.find({ key: 'rule-remove-g1' })).toBeDefined()
  expect(await ui.find({ key: 'rule-remove-starter-bug' })).toBeUndefined()
  await ui.press({ key: 'rule-toggle-starter-bug' })
  await h.clock.advance(50)
  expect(h.stored('rules:global')).toMatchObject({ starters: { 'starter-bug': { enabled: true } } })
  await ui.press({ key: 'rule-remove-g1' })
  await h.clock.advance(50)
  expect((h.stored('rules:global') as { rules: unknown[] }).rules).toEqual([])
  await ui.unmount()
})
