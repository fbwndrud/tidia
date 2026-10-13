import { test as kitTest, expect } from './kit'
import { install, start, dictate, reply, BAND, edit, type Harness, enter } from './harness'
import type { Engine } from 'claude-code/testing'

// These retype over the raw dictation, which polish_on enter leaves in the prompt until Enter.
const test: typeof kitTest = (name, ...rest: unknown[]) => {
  if (rest.length === 1) return kitTest(name, { options: { polish_on: 'enter' } }, rest[0] as never)
  const [opts, body] = rest as [{ options?: Record<string, unknown> }, never]
  return kitTest(name, { ...opts, options: { polish_on: 'enter', ...opts.options } }, body)
}
const FRAMES = ['음 테일스케일', '음 테일스케일 같은 기능을 넣어 줘']
const composer = (text: string) => ({ text, wait: false, origin: { kind: 'composer' as const } })
const entries = (h: Harness) => ((h.stored('dict:global') as { entries?: unknown[] } | undefined)?.entries ?? [])

// The person retypes one word of the dictation, then presses Enter.
async function retypeAndSend($: Engine, h: Harness, word: string, typed: string): Promise<void> {
  const at = h.draft.indexOf(word)
  await edit($, { origin: { kind: 'composer' }, key: { key: typed.at(-1)! }, text: h.draft, cursor: at + word.length, start: at, end: at + word.length, inputText: typed })
  await $.prompt.submit(enter(h))
  // Learning runs after the message is sent, not before it.
  await h.clock.advance(50)
}

async function dictateOnce($: Engine, h: Harness): Promise<void> {
  await dictate(h, FRAMES)
  await h.clock.advance(1000)
  await retypeAndSend($, h, '테일스케일', 'Tailscale')
}

test('a word retyped over a dictation is remembered once, without asking', async ($, on) => {
  const h = install(on, { replies: [reply('테일스케일 같은 기능을 넣어 줘.')] })
  await start($)
  await dictateOnce($, h)
  expect(h.submitted[0]?.text).toBe('음 Tailscale 같은 기능을 넣어 줘')
  expect(entries(h)).toEqual([])
  expect((h.stored('dict:global') as { candidates: unknown[] }).candidates).toMatchObject([{ heard: '테일스케일', meant: 'Tailscale', count: 1 }])
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ text: /테일스케일/ })).toBeUndefined()
  await ui.unmount()
})

test('the second identical correction adds it on its own', async ($, on) => {
  const h = install(on, { replies: [reply('a.'), reply('b.')] })
  await start($)
  await dictateOnce($, h)
  await dictateOnce($, h)
  expect(entries(h)).toMatchObject([{ heard: '테일스케일', meant: 'Tailscale', source: 'learned', confirmations: 2 }])
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Added to the dictionary: 테일스케일 → Tailscale/ })).toBeDefined()
  await ui.unmount()
})

test('learn off learns nothing', { options: { learn: 'off' } }, async ($, on) => {
  const h = install(on, { replies: [reply('a.')] })
  await start($)
  await dictateOnce($, h)
  expect(h.stored('dict:global')).toBeUndefined()
})

test('a content edit is not learned', async ($, on) => {
  const h = install(on, { replies: [reply('a.')] })
  await start($)
  await dictate(h, ['내일', '내일 배포해 줘 알겠지'])
  await h.clock.advance(1000)
  await retypeAndSend($, h, '내일', '모레')
  expect(h.stored('dict:global')).toBeUndefined()
})

test('after two corrections the next polish carries the learned pair', async ($, on) => {
  const h = install(on, { replies: [reply('a.'), reply('b.'), reply('c.')] })
  await start($)
  await dictateOnce($, h)
  await dictateOnce($, h)
  await dictate(h, FRAMES)
  await $.prompt.submit(enter(h))
  expect(h.payloads.at(-1)?.known_mishearings).toEqual([{ heard: '테일스케일', meant: 'Tailscale' }])
})

test('clearing the prompt drops the snapshot: an unrelated typed message learns nothing', async ($, on) => {
  const h = install(on, { replies: [reply('a.')] })
  await start($)
  await dictate(h, ['add a', 'add a test for the login page'])
  await h.clock.advance(1000)
  await edit($, { origin: { kind: 'composer' }, key: { key: 'u', ctrl: true }, text: h.draft, cursor: 0, start: 0, end: h.draft.length, inputText: '' })
  await edit($, { origin: { kind: 'composer' }, key: { key: 'x' }, text: '', cursor: 0, start: 0, end: 0, inputText: 'add a Text for the login page' })
  await $.prompt.submit(enter(h))
  await h.clock.advance(50)
  expect(h.stored('dict:global')).toBeUndefined()
})

test('a word deleted and dictated again is not learned as typed', async ($, on) => {
  const h = install(on, { replies: [reply('a.'), reply('b.')] })
  await start($)
  await dictate(h, FRAMES)
  await h.clock.advance(1000)
  const at = h.draft.indexOf('테일스케일')
  await edit($, { origin: { kind: 'composer' }, key: { key: 'Backspace' }, text: h.draft, cursor: at, start: at, end: at + 4, inputText: '' })
  const left = h.draft
  await dictate(h, [left.slice(0, at) + '타임 ' + left.slice(at), left.slice(0, at) + '타임리즈 ' + left.slice(at)])
  await h.clock.advance(1000)
  await $.prompt.submit(enter(h))
  await h.clock.advance(50)
  expect(h.stored('dict:global')).toBeUndefined()
})
