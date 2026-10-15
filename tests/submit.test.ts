import { test, expect } from './kit'
import { install, start, dictate, reply, BAND, enter, edit } from './harness'
import { promptPrint } from '../src/recall'

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

// Manual check 5, 2026-10-13: ↑ puts a past prompt in the box in one change, which tap mode took
// for a transcript that landed at once, so Enter sent the recalled prompt tidied.
const RECALLED = 'refactor the parser module please'

test('tap mode: a recalled prompt sent before in this session is sent as it is', async ($, on) => {
  const h = install(on, { replies: [reply('Refactor the parser module.')], voice: { mode: 'tap' } })
  await start($)
  await edit($, { origin: { kind: 'composer' }, key: { key: 'e' }, text: '', cursor: 0, start: 0, end: 0, inputText: RECALLED })
  await $.prompt.submit(enter(h))
  h.draft = RECALLED
  await h.clock.advance(600)
  await $.prompt.submit(enter(h))
  expect(h.submitted[1]?.text).toBe(RECALLED)
  expect(h.modelCalls).toBe(0)
})

test('tap mode: a prompt sent in an earlier session and recalled is sent as it is', async ($, on) => {
  const h = install(on, { replies: [reply('Refactor the parser module.')], voice: { mode: 'tap' }, store: { 'sent-prints': [promptPrint(RECALLED)] } })
  await start($)
  h.draft = RECALLED
  await h.clock.advance(600)
  await $.prompt.submit(enter(h))
  expect(h.submitted[0]?.text).toBe(RECALLED)
  expect(h.modelCalls).toBe(0)
})

test('tap mode: a dictation that matches no sent prompt is still tidied', async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')], voice: { mode: 'tap' }, store: { 'sent-prints': [promptPrint(RECALLED)] } })
  await start($)
  await dictate(h, [RAW])
  await $.prompt.submit(enter(h))
  expect(h.submitted[0]?.text).toBe('이렇게 하면 되네.')
})

// Demo recording, 2026-10-14: macOS `say` read the same sentence each take and speech recognition
// wrote the same transcript, so the second take matched the first one's print and went out raw.
// The voice puts the transcript in and sends it before a poll sees it; ↑ and Enter are two key
// presses, and the poll sees what ↑ put in.
test('tap mode: the same words dictated again are tidied again', async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.'), reply('이렇게 하면 되네.')], voice: { mode: 'tap' } })
  await start($)
  await dictate(h, [RAW])
  await $.prompt.submit(enter(h))
  await h.clock.advance(1000)
  await $.prompt.submit(enter(h, RAW))
  expect(h.submitted[1]?.text).toBe('이렇게 하면 되네.')
})

// Demo recording, 2026-10-14: takes where Claude Code showed "Voice: processing…" for longer went
// out raw. A transcript that lands in one piece and stays past the settle time ended as a dropped
// offer, and the send that followed found no dictation.
test('tap mode: a transcript that waited in the prompt before the voice sent it is tidied', async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')], voice: { mode: 'tap' } })
  await start($)
  await dictate(h, [RAW])
  await h.clock.advance(2000)
  await $.prompt.submit(enter(h))
  expect(h.submitted[0]?.text).toBe('이렇게 하면 되네.')
})

test('tap mode: a prompt recalled and sent after a while is sent as it is', async ($, on) => {
  const h = install(on, { replies: [reply('Refactor the parser module.')], voice: { mode: 'tap' }, store: { 'sent-prints': [promptPrint(RECALLED)] } })
  await start($)
  h.draft = RECALLED
  await h.clock.advance(2000)
  await $.prompt.submit(enter(h))
  expect(h.submitted[0]?.text).toBe(RECALLED)
  expect(h.modelCalls).toBe(0)
})

test('tap mode: a typed prompt left a while is sent as it is', async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')], voice: { mode: 'tap' } })
  await start($)
  await edit($, { origin: { kind: 'composer' }, key: { key: 'e' }, text: '', cursor: 0, start: 0, end: 0, inputText: RAW })
  await h.clock.advance(2000)
  await $.prompt.submit(enter(h))
  expect(h.submitted[0]?.text).toBe(RAW)
  expect(h.modelCalls).toBe(0)
})

// Demo repro, 2026-10-14: while listening, Claude Code showed "And", heard in the silence before a
// Chinese sentence; the final transcript replaced it and was sent "as typed" because the text
// around the dictation had changed.
test('tap mode: a final transcript that replaced a word shown while listening is tidied', async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')], voice: { mode: 'tap' } })
  await start($)
  await dictate(h, ['And'])
  await h.clock.advance(2000)
  await $.prompt.submit(enter(h, RAW))
  expect(h.submitted[0]?.text).toBe('이렇게 하면 되네.')
})

test('tap mode: a final transcript that replaced a long interim shown while listening is tidied', async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')], voice: { mode: 'tap' } })
  await start($)
  await dictate(h, ['wait for the game'])
  await h.clock.advance(2000)
  await $.prompt.submit(enter(h, RAW))
  expect(h.submitted[0]?.text).toBe('이렇게 하면 되네.')
})

test('tap mode: speech added after a typed word keeps the word as typed', async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')], voice: { mode: 'tap' } })
  await start($)
  await edit($, { origin: { kind: 'composer' }, key: { key: 'x' }, text: '', cursor: 0, start: 0, end: 0, inputText: '메모: ' })
  await h.clock.advance(2000)
  await $.prompt.submit(enter(h, `메모: ${RAW}`))
  expect(h.submitted[0]?.text).toBe('메모: 이렇게 하면 되네.')
})

// 2026-10-16: since tap mode tidies a prompt that lands in one change, prompts Claude offered went
// out tidied too. A probe showed a suggestion taken with Tab raises no prompt.edit or prompt.fill,
// and the desktop's next-step box sends a reply button's message (wrap_up's `actions`) as the
// person's own Enter.
const SUGGESTED = 'Commit the parser changes and push them to main'

test('tap mode: a prompt suggestion taken with Tab is sent as it is', async ($, on) => {
  const h = install(on, { replies: [reply('Commit the parser changes and push to main.')], voice: { mode: 'tap' } })
  await start($)
  await $.prompt.suggest({ text: SUGGESTED, origin: { kind: 'suggestion' } })
  h.draft = SUGGESTED
  await h.clock.advance(600)
  await $.prompt.submit(enter(h))
  expect(h.submitted[0]?.text).toBe(SUGGESTED)
  expect(h.submitted[0]?.context).toBeUndefined()
  expect(h.modelCalls).toBe(0)
})

test('tap mode: a prompt suggestion sent before a poll saw it is sent as it is', async ($, on) => {
  const h = install(on, { replies: [reply('Commit the parser changes and push to main.')], voice: { mode: 'tap' } })
  await start($)
  await $.prompt.suggest({ text: SUGGESTED, origin: { kind: 'suggestion' } })
  await $.prompt.submit(enter(h, SUGGESTED))
  expect(h.submitted[0]?.text).toBe(SUGGESTED)
  expect(h.modelCalls).toBe(0)
})

const BUTTON = 'JSON 키 받았어. 확인하고 옮겨줘.'
const offered = (message: string) => [
  { role: 'user' as const, text: '키 탭 열어줘' },
  {
    role: 'assistant' as const,
    text: '',
    toolUses: [{ tool_use_id: 't1', tool: 'mcp__ccd_turn__wrap_up', input: { recap: '키 탭을 열어둠.', ask: 'JSON 키를 받았나요?', actions: [{ label: '받음, 옮겨줘', message }] } }],
  },
  { role: 'user' as const, text: '', toolResults: [{ tool_use_id: 't1', text: 'ok', isError: false }] },
  { role: 'assistant' as const, text: '키를 받으면 알려주세요.' },
]

test("tap mode: a reply button's message from Claude's last turn is sent as it is", async ($, on) => {
  const h = install(on, { replies: [reply('JSON 키 받았어. 확인하고 옮겨 줘.')], voice: { mode: 'tap' }, messages: offered(BUTTON) })
  await start($)
  await $.prompt.submit(enter(h, BUTTON))
  expect(h.submitted[0]?.text).toBe(BUTTON)
  expect(h.modelCalls).toBe(0)
})

test('tap mode: a dictation is tidied when the last turn offered other words', async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')], voice: { mode: 'tap' }, messages: offered(BUTTON) })
  await start($)
  await $.prompt.suggest({ text: SUGGESTED, origin: { kind: 'suggestion' } })
  await $.prompt.submit(enter(h, RAW))
  expect(h.submitted[0]?.text).toBe('이렇게 하면 되네.')
})

test('tap mode: words an earlier turn offered are tidied when dictated', async ($, on) => {
  const later = [...offered(RAW), { role: 'user' as const, text: '다음' }, { role: 'assistant' as const, text: '네.' }]
  const h = install(on, { replies: [reply('이렇게 하면 되네.')], voice: { mode: 'tap' }, messages: later })
  await start($)
  await $.prompt.submit(enter(h, RAW))
  expect(h.submitted[0]?.text).toBe('이렇게 하면 되네.')
})

test('tap mode: speech added after a suggestion taken with Tab is tidied, the suggestion kept', async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')], voice: { mode: 'tap' } })
  await start($)
  await $.prompt.suggest({ text: SUGGESTED, origin: { kind: 'suggestion' } })
  h.draft = SUGGESTED
  await h.clock.advance(2000)
  await $.prompt.submit(enter(h, `${SUGGESTED} ${RAW}`))
  expect(h.submitted[0]?.text).toBe(`${SUGGESTED} 이렇게 하면 되네.`)
})
