import { test, expect } from './kit'
import { install, start, dictate, reply, BAND, command, enter } from './harness'

// Pinned by the final whole-branch review.

const FRAMES = ['이렇게', '이렇게 이제', '이렇게 이제 이제 이제 되는 건가', '이렇게 이제 이제 이제 되는 건가 어 되네 되네']
const RAW = FRAMES[3]!
const composer = (text: string) => ({ text, wait: false, origin: { kind: 'composer' as const } })

test('a message that is not the person\'s own goes out untouched mid-dictation', async ($, on) => {
  const h = install(on, { replies: [reply('Peer says hello there friend.')] })
  await start($)
  await dictate(h, FRAMES)
  await $.prompt.submit({ text: 'peer says hello there my friend', wait: false, origin: { kind: 'task-notification' } })
  expect(h.submitted[0]?.text).toBe('peer says hello there my friend')
  expect(h.submitted[0]?.context).toBeUndefined()
  expect(h.modelCalls).toBe(0)
})

test('a message that is not the person\'s own keeps the polished version', async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')] })
  await start($)
  await dictate(h, FRAMES)
  await h.clock.advance(1000)
  await $.prompt.submit({ text: 'background task finished', wait: false, origin: { kind: 'task-notification' } })
  await $.prompt.submit(enter(h))
  expect(h.submitted[1]?.text).toBe('이렇게 하면 되네.')
})

test('a recalled prompt sent at once is not polished', async ($, on) => {
  const h = install(on, { replies: [reply('Refactor the parser module.')] })
  await start($)
  h.draft = 'refactor the parser module please'
  await h.clock.advance(250)
  await $.prompt.submit(enter(h))
  expect(h.submitted[0]?.text).toBe('refactor the parser module please')
  expect(h.modelCalls).toBe(0)
})

test('an expanded paste is sent as it is', async ($, on) => {
  const h = install(on, { replies: [reply('explain this error please.')] })
  await start($)
  await dictate(h, ['explain this', 'explain this error please now [Pasted text #1 +3 lines]'])
  const expanded = 'explain this error please now Error: boom\n  at a (x.ts:1)\n  at a (x.ts:1)\n  at b (y.ts:2)'
  await $.prompt.submit(enter(h, expanded))
  expect(h.submitted[0]?.text).toBe(expanded)
  expect(h.modelCalls).toBe(0)
})

test('a model call that throws shows the failure and then clears the band', async ($, on) => {
  const h = install(on, { modelThrows: true })
  await start($)
  await dictate(h, FRAMES)
  await h.clock.advance(1000)
  expect(h.draft).toBe(RAW)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /original kept/ })).toBeDefined()
  await h.clock.advance(5000)
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: /original kept/ })).toBeUndefined()
  await ui.unmount()
})

