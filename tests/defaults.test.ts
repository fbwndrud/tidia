import { test, expect } from 'claude-code/testing'
import { install, start, dictate, reply, BAND, enter } from './harness'

// Out of the box: tidy once at Enter, in a concise tone, with the band and transcript quiet but for
// the wait. polish_on pause tidies when the speaking stops and shows the result above the prompt.
const PAUSE = { options: { polish_on: 'pause' } }
const FRAMES = ['이렇게', '이렇게 이제', '이렇게 이제 이제 이제 되는 건가', '이렇게 이제 이제 이제 되는 건가 어 되네 되네']
const RAW = FRAMES[3]!

test('with polish_on pause a pause shows the tidied dictation above the prompt', PAUSE, async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')] })
  await start($)
  await dictate(h, FRAMES)
  await h.clock.advance(1000)
  expect(h.modelCalls).toBe(1)
  expect(h.draft).toBe(RAW)
  await $.prompt.submit(enter(h))
  expect(h.modelCalls).toBe(1)
  expect(h.submitted[0]?.text).toBe('이렇게 하면 되네.')
  expect(h.submitted[0]?.context?.[0]).toContain(RAW)
})

test('out of the box a pause makes no model call; Enter tidies the dictation once', async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')] })
  await start($)
  await dictate(h, FRAMES)
  await h.clock.advance(3000)
  expect(h.modelCalls).toBe(0)
  await $.prompt.submit(enter(h))
  expect(h.modelCalls).toBe(1)
  expect(h.submitted[0]?.text).toBe('이렇게 하면 되네.')
  expect(h.submitted[0]?.context?.[0]).toContain(RAW)
})

test('dictating across pauses is tidied whole at Enter', async ($, on) => {
  const h = install(on, { replies: [reply('첫 문장이야. 두 번째 문장도 있어.')] })
  await start($)
  await dictate(h, ['음 첫', '음 첫 문장이야 어'])
  await h.clock.advance(2000)
  await dictate(h, ['음 첫 문장이야 어 그리고', '음 첫 문장이야 어 그리고 음 두 번째 문장도 있어'])
  await h.clock.advance(2000)
  await $.prompt.submit(enter(h))
  expect(h.dictated).toEqual(['음 첫 문장이야 어 그리고 음 두 번째 문장도 있어'])
  expect(h.submitted[0]?.text).toBe('첫 문장이야. 두 번째 문장도 있어.')
})

// A start too short to polish, a pause, then the rest: Enter tidies all of it, the start included.
test('a short start before a pause is tidied with the rest at Enter', async ($, on) => {
  const h = install(on, { replies: [reply('마크다운 형식으로 보내는 거.')] })
  await start($)
  await dictate(h, ['그러면은', '그러면은 어'])
  await h.clock.advance(2000)
  await dictate(h, ['그러면은 어 마크다운 형식으로', '그러면은 어 마크다운 형식으로 보내는 거'])
  await $.prompt.submit(enter(h))
  expect(h.dictated).toEqual(['그러면은 어 마크다운 형식으로 보내는 거'])
  expect(h.submitted[0]?.text).toBe('마크다운 형식으로 보내는 거.')
})

// The hook's budget runs through a $.clock wait, so Enter's own cleanup must not race one.
test('Enter waits for its own cleanup as long as the model takes', async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')] })
  await start($)
  await dictate(h, FRAMES)
  h.hold = true
  const sent = $.prompt.submit(enter(h))
  await h.clock.advance(25_000)
  h.release()
  await sent
  expect(h.submitted[0]?.text).toBe('이렇게 하면 되네.')
})

test("Enter's wait says the send waits for the cleanup", async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')] })
  await start($)
  await dictate(h, FRAMES)
  h.hold = true
  const sent = $.prompt.submit(enter(h))
  await h.clock.advance(100)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ text: /✨ Sends once tidied/ })).toBeDefined()
  await ui.unmount()
  h.release()
  await sent
  expect(h.submitted[0]?.text).toBe('이렇게 하면 되네.')
})

test('polishing at each pause shows the preview with details off', PAUSE, async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')] })
  await start($)
  await dictate(h, FRAMES)
  await h.clock.advance(1000)
  expect(h.modelCalls).toBe(1)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ key: 'apply' })).toBeUndefined()
  expect(await ui.find({ text: /이렇게 하면 되네\./ })).toBeDefined()
  await ui.unmount()
  await $.prompt.submit(enter(h))
  expect(h.submitted[0]?.text).toBe('이렇게 하면 되네.')
})

test('a tidied send leaves no notice in the transcript', async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')] })
  await start($)
  await dictate(h, FRAMES)
  await $.prompt.submit(enter(h))
  expect(h.submitted[0]?.text).toBe('이렇게 하면 되네.')
  expect(h.logs).not.toContain('Sent the tidied dictation')
})

test('with details on, a send that goes out untidied says why', { options: { debug: true } }, async ($, on) => {
  const h = install(on, { modelThrows: true })
  await start($)
  await dictate(h, FRAMES)
  await $.prompt.submit(enter(h))
  expect(h.submitted[0]?.text).toBe(RAW)
  expect(h.logs.some(l => l.startsWith('tidia: sent as typed'))).toBe(true)
})

// 0.1.21: a register is a starter rule the person turns on.
test('a register starter reaches the cleanup as an always-on rule', { options: {} }, async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')], store: { 'rules:global': { version: 1, rules: [], starters: { 'starter-polite': { enabled: true } } } } })
  await start($)
  await dictate(h, FRAMES)
  await $.prompt.submit(enter(h))
  expect(h.systems[0]).toContain('Rule 1 (always): Write in a polite register')
})

test('the style is polish by default and sends the output rules', { options: {} }, async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')], store: { 'rules:global': { version: 1, rules: [{ id: 'g1', text: 'Number the steps.', enabled: true, source: 'user' }] } } })
  await start($)
  await dictate(h, FRAMES)
  await $.prompt.submit(enter(h))
  expect(h.systems[0]).toContain("write each as its own line starting with '- '")
  expect(h.systems[0]).toContain('Number the steps.')
})

// A style saved before 0.1.5 is no longer an option: the engine reads it as the default.
test('a style saved before 0.1.5 runs as auto', { options: { style: 'prompt' } }, async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')] })
  await start($)
  await dictate(h, FRAMES)
  await $.prompt.submit(enter(h))
  expect(h.systems[0]).toContain("write each as its own line starting with '- '")
})
