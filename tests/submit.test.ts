import { test, expect } from './kit'
import { install, start, dictate, reply, BAND, enter, edit } from './harness'

const FRAMES = ['이렇게', '이렇게 이제', '이렇게 이제 이제 이제 되는 건가', '이렇게 이제 이제 이제 되는 건가 어 되네 되네']
const RAW = FRAMES[3]!
const submitOf = (text: string) => ({ text, wait: false, origin: { kind: 'composer' as const } })

test('a polished prompt is sent with the raw transcript as context', async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')] })
  await start($)
  await dictate(h, FRAMES)
  await h.clock.advance(1000)
  await $.prompt.submit(enter(h))
  expect(h.submitted[0]?.text).toBe('이렇게 하면 되네.')
  expect(h.submitted[0]?.context?.[0]).toContain('[tidia]')
  expect(h.submitted[0]?.context?.[0]).toContain(RAW)
})

// The cleanup can flip meaning (2026-10-12: two spoken questions came out as "not A but B", 6 runs
// of 6), and no prompt line stopped it; the raw transcript is what the person said.
test('the raw transcript note says the raw wins where the meaning differs', async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')] })
  await start($)
  await dictate(h, FRAMES)
  await $.prompt.submit(enter(h))
  const note = h.submitted[0]?.context?.[0] ?? ''
  expect(note).toContain('this raw transcript is what the user said')
  expect(note.length).toBeLessThan(200 + RAW.length)
})

test('attach_raw off sends no context', { options: { attach_raw: false } }, async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')] })
  await start($)
  await dictate(h, FRAMES)
  await h.clock.advance(1000)
  await $.prompt.submit(enter(h))
  expect(h.submitted[0]?.context).toBeUndefined()
})

test('Enter during polishing waits for the result', async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')] })
  await start($)
  h.hold = true
  await dictate(h, FRAMES)
  await h.clock.advance(1000)
  const sent = $.prompt.submit(enter(h, RAW))
  await h.clock.advance(100)
  h.release()
  await sent
  await h.clock.advance(0)
  expect(h.submitted[0]?.text).toBe('이렇게 하면 되네.')
  // The result went out with the message; it must not land in the emptied prompt as well.
  expect(h.filled).toEqual([])
  expect(h.draft).toBe('')
})

test('Enter during polishing sends the original after the wait runs out', async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')] })
  await start($)
  h.hold = true
  await dictate(h, FRAMES)
  await h.clock.advance(1000)
  const sent = $.prompt.submit(enter(h, RAW))
  await h.clock.advance(8_100)
  await sent
  expect(h.submitted[0]?.text).toBe(RAW)
})

test('auto-submit straight out of dictation is polished before sending', async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')] })
  await start($)
  await dictate(h, FRAMES)
  await $.prompt.submit(enter(h, RAW))
  expect(h.submitted[0]?.text).toBe('이렇게 하면 되네.')
  expect(h.logs).toContain('Sent the tidied dictation')
})

test('a model that throws never blocks the submission', async ($, on) => {
  const h = install(on, { modelThrows: true })
  await start($)
  await dictate(h, FRAMES)
  await $.prompt.submit(enter(h, RAW))
  expect(h.submitted[0]?.text).toBe(RAW)
})

test('Enter waits for a slow polish well beyond three seconds', async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')] })
  await start($)
  h.hold = true
  await dictate(h, FRAMES)
  await h.clock.advance(1000)
  const sent = $.prompt.submit(enter(h, RAW))
  // Inside the 8 s a polish begun at a pause gets, under the hook's 10 s budget.
  await h.clock.advance(7000)
  h.release()
  await sent
  expect(h.submitted[0]?.text).toBe('이렇게 하면 되네.')
})

test('tap mode: a dictation the poll saw once is polished on its own submit', async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')], voice: { mode: 'tap' } })
  await start($)
  await dictate(h, [RAW])
  await $.prompt.submit(enter(h))
  expect(h.submitted[0]?.text).toBe('이렇게 하면 되네.')
})

test('tap mode: a final transcript the poll never saw is polished', async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')], voice: { mode: 'tap' } })
  await start($)
  await dictate(h, FRAMES.slice(0, 3))
  await $.prompt.submit(enter(h, RAW))
  expect(h.submitted[0]?.text).toBe('이렇게 하면 되네.')
  expect(h.submitted[0]?.context?.[0]).toContain(RAW)
})

test('autoSubmit: a dictation added after typed text is polished, the typed text kept', async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')], voice: { autoSubmit: true } })
  await start($)
  await edit($, { origin: { kind: 'composer' }, key: { key: ' ' }, text: '', cursor: 0, start: 0, end: 0, inputText: '메모: ' })
  await dictate(h, [`메모: ${RAW}`])
  await $.prompt.submit(enter(h))
  expect(h.submitted[0]?.text).toBe('메모: 이렇게 하면 되네.')
})

// Hold mode without autoSubmit: a single change sent at once is a recalled prompt, not speech.
test('hold mode: one unseen change sent at once is left alone', async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')] })
  await start($)
  await dictate(h, [RAW])
  await $.prompt.submit(enter(h))
  expect(h.submitted[0]?.text).toBe(RAW)
})

test('tap mode: a paste typed into the prompt is sent as it is', async ($, on) => {
  const h = install(on, { replies: [reply('explain this error please.')], voice: { mode: 'tap' } })
  await start($)
  const box = 'explain this error please now [Pasted text #1 +3 lines]'
  await edit($, { origin: { kind: 'composer' }, text: '', cursor: 0, start: 0, end: 0, inputText: box })
  const expanded = 'explain this error please now Error: boom\n  at a (x.ts:1)\n  at b (y.ts:2)'
  await $.prompt.submit(enter(h, expanded))
  expect(h.submitted[0]?.text).toBe(expanded)
  expect(h.modelCalls).toBe(0)
})

// Demo recording, 2026-10-11: a pause mid-dictation started a polish of the half-said text; tap
// mode then sent the whole and polished it, and the replaced polish, failing as it ended, put
// "Not polished, original kept" on the band over a message that went out polished.
test('a polish replaced by the send does not show its failure', async ($, on) => {
  const h = install(on, { replies: ['not json', reply('이렇게 하면 되네.')], voice: { mode: 'tap' } })
  await start($)
  h.hold = true
  await dictate(h, FRAMES.slice(0, 3))
  await h.clock.advance(1000)
  const sent = $.prompt.submit(enter(h, RAW))
  await h.clock.advance(10)
  expect(h.modelCalls).toBe(2)
  // The replaced polish ends, failing, while the send still waits for its own.
  h.release()
  await h.clock.advance(10)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Not polished/ })).toBeUndefined()
  await ui.unmount()
  h.release()
  await sent
  expect(h.submitted[0]?.text).toBe('이렇게 하면 되네.')
})

// "버그 얘기할 때는 증상, 재현 방법, 기대 결과 순서로 정리해 줘" was read as a request about Claude's
// own replies (live check V16, 2026-10-11): the note says such a request is a Tidia rule.

// What Claude does with the notes is said once per session, not in every dictated message.
const SESSION_GUIDE = async ($: Parameters<NonNullable<Parameters<typeof test>[2]>>[0]) => ((await $.classic.SessionStart({ source: 'startup' } as never)) as { additionalContext?: string[] }).additionalContext?.join('\n') ?? ''

test('the session guide asks Claude to add a misheard word it is sure of, says a request about dictated messages is a rule, and that the raw wins', async ($, on) => {
  install(on)
  on('classic.SessionStart', () => ({}))
  await start($)
  const guide = await SESSION_GUIDE($)
  expect(guide).toContain('mcp__tidia__dictionary')
  expect(guide).toContain('dict_add')
  expect(guide).toContain('how their own dictated messages should be written')
  expect(guide).toContain('rule_add')
  expect(guide).toContain('the transcript is what the user said')
  expect(guide).toContain('a tidied question can read as a statement')
})

test('with the dictionary off the session guide does not ask Claude to learn words', { options: { dictionary: false } }, async ($, on) => {
  install(on)
  on('classic.SessionStart', () => ({}))
  await start($)
  const guide = await SESSION_GUIDE($)
  expect(guide).not.toContain('dict_add')
  expect(guide).toContain('rule_add')
})

test('the per-message note carries no instructions to call Tidia tools', async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')] })
  await start($)
  await dictate(h, FRAMES)
  await $.prompt.submit(enter(h))
  expect(h.submitted[0]?.context?.[0]).not.toContain('dict_add')
  expect(h.submitted[0]?.context?.[0]).not.toContain('rule_add')
})
