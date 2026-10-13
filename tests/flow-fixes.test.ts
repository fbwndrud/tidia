import { test, expect } from 'claude-code/testing'
import { install, start, dictate, reply, enter, edit } from './harness'

const PAUSE = { options: { polish_on: 'pause' } }
const ENTER = { options: { polish_on: 'enter' } }
const FRAMES = ['이렇게', '이렇게 이제', '이렇게 이제 이제 이제 되는 건가', '이렇게 이제 이제 이제 되는 건가 어 되네 되네']
const RAW = FRAMES[3]!

// Enter empties the box before prompt.submit runs; a poll in between must not take that for Esc.
test('a poll that sees the box emptied by Enter does not lose the dictation', ENTER, async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')] })
  await start($)
  await dictate(h, FRAMES)
  h.draft = ''
  await h.clock.advance(250)
  await $.prompt.submit({ text: RAW, wait: false, origin: { kind: 'composer' as const } })
  expect(h.submitted[0]?.text).toBe('이렇게 하면 되네.')
})

test('a slash command or bash line is never tidied', ENTER, async ($, on) => {
  const h = install(on, { replies: [reply('정리됨.')] })
  await start($)
  await dictate(h, FRAMES.map(f => `/review ${f}`))
  await $.prompt.submit(enter(h))
  expect(h.submitted[0]?.text).toBe(`/review ${RAW}`)
  expect(h.modelCalls).toBe(0)
})
test('a previewed cleanup sent as it stands keeps the raw-wins note', PAUSE, async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')] })
  await start($)
  await dictate(h, FRAMES)
  await h.clock.advance(1000)
  await $.prompt.submit(enter(h))
  expect(h.submitted[0]?.context?.[0]).toContain('this raw transcript is what the user said')
})
// /clear starts a new conversation: a polish of the old one must not land in it.
test('/clear drops a polish on its way and the dictation it was for', { options: { polish_on: 'pause' } }, async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')] })
  on('classic.SessionStart', () => ({}))
  await start($)
  h.hold = true
  await dictate(h, FRAMES)
  await h.clock.advance(1000)
  await $.classic.SessionStart({ source: 'clear' } as never)
  h.release()
  await h.clock.advance(500)
  expect(h.filled).toEqual([])
  expect(h.draft).toBe(RAW)
})

test('a pause polish that found nothing to change is not asked again at Enter', PAUSE, async ($, on) => {
  const h = install(on, { replies: [reply(RAW)] })
  await start($)
  await dictate(h, FRAMES)
  await h.clock.advance(1000)
  expect(h.modelCalls).toBe(1)
  await $.prompt.submit(enter(h))
  expect(h.modelCalls).toBe(1)
  expect(h.submitted[0]?.text).toBe(RAW)
})

test('a prompt emptied by an edit drops the landed cleanup: a message typed next carries no transcript', PAUSE, async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')] })
  await start($)
  await dictate(h, FRAMES)
  await h.clock.advance(1000)
  const landed = h.draft
  await edit($, { origin: { kind: 'composer' }, key: { key: 'u', ctrl: true }, text: landed, cursor: landed.length, start: 0, end: landed.length, inputText: '' })
  await edit($, { origin: { kind: 'composer' }, key: { key: 'h' }, text: '', cursor: 0, start: 0, end: 0, inputText: 'hi' })
  await $.prompt.submit(enter(h))
  expect(h.submitted[0]?.text).toBe('hi')
  expect(h.submitted[0]?.context).toBeUndefined()
})
