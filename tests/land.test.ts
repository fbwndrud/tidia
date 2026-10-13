import { test, expect } from 'claude-code/testing'
import { install, start, dictate, reply, BAND, enter } from './harness'

const PAUSE = { options: { polish_on: 'pause' } }
const ENTER = { options: { polish_on: 'enter' } }

// With polish_on pause (details off): the cleanup shows above the prompt when the speaking
// stops. The desktop draws a message from the prompt box, so an Enter that comes before the
// cleanup sends it and says so in a line of its own.
const FRAMES = ['이렇게', '이렇게 이제', '이렇게 이제 이제 이제 되는 건가', '이렇게 이제 이제 이제 되는 건가 어 되네 되네']
const RAW = FRAMES[3]!

test('while the cleanup is on its way the band says so, details off', PAUSE, async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')] })
  await start($)
  await dictate(h, FRAMES)
  h.hold = true
  await h.clock.advance(1000)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ text: /✨ Tidying…/ })).toBeDefined()
  await ui.unmount()
  h.release()
  await h.clock.advance(50)
  expect(h.draft).toBe(RAW)
})

test('on the desktop, an Enter before the cleanup lands sends it and shows it in the bubble', PAUSE, async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')] })
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.unmount()
  await dictate(h, FRAMES)
  h.hold = true
  await h.clock.advance(1000)
  const sent = $.prompt.submit(enter(h))
  h.release()
  await sent
  expect(h.submitted[0]?.text).toBe('이렇게 하면 되네.')
  // The bubble tells it, so no log row does.
  expect(h.logs.some(l => l.startsWith('→ '))).toBe(false)
  // The result went to the message: the emptied prompt stays empty.
  await h.clock.advance(500)
  expect(h.filled).toEqual([])
  expect(h.draft).toBe('')
})

test('the terminal shows the sent message itself: no line under it', PAUSE, async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')] })
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.unmount()
  await dictate(h, FRAMES)
  await $.prompt.submit(enter(h))
  expect(h.submitted[0]?.text).toBe('이렇게 하면 되네.')
  expect(h.logs.some(l => l.startsWith('→ '))).toBe(false)
})

test('a landed cleanup sent as it stands needs no line under it', PAUSE, async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')] })
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.unmount()
  await dictate(h, FRAMES)
  await h.clock.advance(1000)
  await $.prompt.submit(enter(h))
  expect(h.submitted[0]?.text).toBe('이렇게 하면 되네.')
  expect(h.submitted[0]?.context?.[0]).toContain(RAW)
  expect(h.logs.some(l => l.startsWith('→ '))).toBe(false)
})

test('a cleared prompt drops the landed cleanup: the next typed message carries no transcript', PAUSE, async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')] })
  await start($)
  await dictate(h, FRAMES)
  await h.clock.advance(1000)
  h.draft = ''
  await h.clock.advance(300)
  h.draft = 'hi'
  await $.prompt.submit(enter(h))
  expect(h.submitted[0]?.text).toBe('hi')
  expect(h.submitted[0]?.context).toBeUndefined()
})

test('a long notice line is cut', { options: { polish_on: 'enter' } }, async ($, on) => {
  const said = Array.from({ length: 40 }, (_, i) => `항목 ${i}번을 확인해 줘`).join(' ')
  const h = install(on, { replies: [reply(said)] })
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'vscode' })
  await ui.unmount()
  await dictate(h, ['음 항목', `음 ${said}`])
  await $.prompt.submit(enter(h))
  const line = h.logs.find(l => l.startsWith('→ '))
  expect(line?.endsWith('…')).toBe(true)
  expect(line!.length).toBeLessThan(350)
})

// Off the desktop, the log line says what the dictation became: auto's chosen layout, or the style the person chose.
async function sentLines($: Parameters<NonNullable<Parameters<typeof test>[2]>>[0], on: Parameters<NonNullable<Parameters<typeof test>[2]>>[1], answer: string, store?: Record<string, unknown>): Promise<string | undefined> {
  const h = install(on, { replies: [answer], ...(store ? { store } : {}) })
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'vscode' })
  await ui.unmount()
  await dictate(h, FRAMES)
  await $.prompt.submit(enter(h))
  // The sent line and the rows after it, one per line of the message.
  const at = h.logs.findIndex(l => l.startsWith('→ '))
  return at < 0 ? undefined : h.logs.slice(at).join('\n')
}

test('polish that chose a list says so', ENTER, async ($, on) => {
  expect(await sentLines($, on, reply('- 이렇게 해 줘.\n- 저렇게도 해 줘.'))).toBe('→ list: - 이렇게 해 줘.\n- 저렇게도 해 줘.')
})

test('minimal is named as it is', { options: { polish_on: 'enter', style: 'minimal' } }, async ($, on) => {
  expect(await sentLines($, on, reply('이렇게 하면 되네.'))).toBe('→ minimal: 이렇게 하면 되네.')
})

test('the label is in the person\'s own words where bubble_labels gives them', { options: { polish_on: 'enter', style: 'minimal', bubble_labels: '//그대로' } }, async ($, on) => {
  expect(await sentLines($, on, reply('이렇게 하면 되네.'))).toBe('→ 그대로: 이렇게 하면 되네.')
})

test('an output rule with a condition that the cleanup applied is told', ENTER, async ($, on) => {
  const store = { 'rules:global': { version: 1, rules: [{ id: 'g1', text: 'Number the steps.', when: 'there are several steps', enabled: true, source: 'user' }] } }
  const answer = JSON.stringify({ text: '1. 이렇게 해 줘.\n2. 저렇게도 해 줘.', fixes: [], rules: [1] })
  expect(await sentLines($, on, answer, store)).toBe('→ list · rules applied: 1. 이렇게 해 줘.\n2. 저렇게도 해 줘.')
})

// An always-on rule (a register, say) is the person's standing choice: telling it on every message is noise.
test('an always-on rule goes untold', ENTER, async ($, on) => {
  const store = { 'rules:global': { version: 1, rules: [{ id: 'g1', text: 'Write in a polite register.', enabled: true, source: 'user' }] } }
  const answer = JSON.stringify({ text: '이렇게 하면 되네.', fixes: [], rules: [1] })
  expect(await sentLines($, on, answer, store)).toBe('→ tidied: 이렇게 하면 되네.')
})

test('the line follows the interface language', { options: { polish_on: 'enter', ui_language: 'ko' } }, async ($, on) => {
  expect(await sentLines($, on, reply('- 이렇게 해 줘.\n- 저렇게도 해 줘.'))).toBe('→ 목록화: - 이렇게 해 줘.\n- 저렇게도 해 줘.')
})

// A log row draws its line breaks as spaces: a list would read as one run-on line.
test('each line of a tidied list is a row of its own', ENTER, async ($, on) => {
  const h = install(on, { replies: [reply('다시 테스트합니다.\n- 지금 버전을 알려 줘.\n\n- 음성 채팅이 어렵다.')] })
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'vscode' })
  await ui.unmount()
  await dictate(h, ['음 다시', '음 다시 테스트합니다 어 지금 버전을 알려 줘 그리고 음성 채팅이 어렵다'])
  await $.prompt.submit(enter(h))
  const at = h.logs.findIndex(l => l.startsWith('→ '))
  expect(h.logs.slice(at)).toEqual(['→ list: 다시 테스트합니다.', '- 지금 버전을 알려 줘.', '- 음성 채팅이 어렵다.'])
  expect(h.submitted[0]?.text).toBe('다시 테스트합니다.\n- 지금 버전을 알려 줘.\n\n- 음성 채팅이 어렵다.')
})

// A new session's first message can go before the band draws and tells the surface: Tidia asks the
// engine, and keeps the note in $.store, which outlasts a resume (desktop, 2026-10-12).
test('a first message on the desktop, before the band draws, keeps its bubble note', { options: { polish_on: 'enter', ui_language: 'ko' } }, async ($, on) => {
  const h = install(on, { replies: [reply('다시 한번 테스트. 진행해 봅시다.')], surfaces: ['desktop'] })
  await start($)
  await dictate(h, ['다시 한번더', '다시 한번더 테스트 다시 한번더 테스트 자 진행해봅시다'])
  await $.prompt.submit(enter(h))
  expect(h.stored('sent-notes')).toEqual([{ said: '다시 한번더 테스트 다시 한번더 테스트 자 진행해봅시다', sent: '다시 한번 테스트. 진행해 봅시다.', mode: '간결화', session: 'session-1' }])
  expect(h.logs.some(l => l.startsWith('→ '))).toBe(false)
})

// The desktop tells the cleanup in the person's own bubble (src/ui/bubble.ts), so no log row does.
test('a cleanup at Enter on the desktop writes no log row', ENTER, async ($, on) => {
  const h = install(on, { replies: [reply('다시 테스트합니다.\n- 지금 버전을 알려 줘.')] })
  await start($)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.unmount()
  await dictate(h, ['음 다시', '음 다시 테스트합니다 어 지금 버전을 알려 줘'])
  await $.prompt.submit(enter(h))
  expect(h.submitted[0]?.text).toBe('다시 테스트합니다.\n- 지금 버전을 알려 줘.')
  expect(h.logs.some(l => l.startsWith('→ '))).toBe(false)
})

const row = (text: string, kind = 'sdk', surface: 'desktop' | 'terminal' = 'desktop') => ({ plugin: 'tidia', surface, component: 'UserMessage' as const, props: { text, origin: { kind }, isExpanded: true } })

test('the desktop row for a tidied message shows only the message sent by default; a row from a peer is left', { options: { polish_on: 'enter', ui_language: 'ko' } }, async ($, on) => {
  const h = install(on, { replies: [reply('다시 한번 테스트.')], surfaces: ['desktop'] })
  await start($)
  await dictate(h, ['다시 한번더', '다시 한번더 테스트 다시 한번더 테스트'])
  await $.prompt.submit(enter(h))
  await (await $.ui.mount(row('다시 한번더 테스트 다시 한번더 테스트') as never)).unmount()
  expect(h.rendered.at(-1)?.props.text).toBe('다시 한번 테스트.')
  await (await $.ui.mount(row('다시 한번더 테스트 다시 한번더 테스트', 'peer') as never)).unmount()
  expect(h.rendered.at(-1)?.props.text).toBe('다시 한번더 테스트 다시 한번더 테스트')
})

test('notes kept in the store draw the bubble of a message sent before a restart, in its own session only', { options: { message_view: 'full' } }, async ($, on) => {
  const note = { said: '음 이거 확인', sent: '이거 확인해 줘.', mode: 'tidied', session: 'session-1' }
  const h = install(on, { surfaces: ['desktop'], store: { 'sent-notes': [note, { ...note, said: '다른 세션', session: 'other' }] } })
  await start($)
  await (await $.ui.mount(row('이거 확인해 줘.') as never)).unmount()
  expect(h.rendered.at(-1)?.props.text).toBe('음 이거 확인\n\n→ tidied\n이거 확인해 줘.')
  await (await $.ui.mount(row('다른 세션') as never)).unmount()
  expect(h.rendered.at(-1)?.props.text).toBe('다른 세션')
})

test('message_view full on the desktop shows what was said, what it became and the message sent', { options: { polish_on: 'enter', ui_language: 'ko', message_view: 'full' } }, async ($, on) => {
  const h = install(on, { replies: [reply('다시 한번 테스트.')], surfaces: ['desktop'] })
  await start($)
  await dictate(h, ['다시 한번더', '다시 한번더 테스트 다시 한번더 테스트'])
  await $.prompt.submit(enter(h))
  await (await $.ui.mount(row('다시 한번더 테스트 다시 한번더 테스트') as never)).unmount()
  expect(h.rendered.at(-1)?.props.text).toBe('다시 한번더 테스트 다시 한번더 테스트\n\n→ 간결화\n다시 한번 테스트.')
})

// The terminal draws the message sent (row-probe, 2026-10-12): the tidied view leaves it, the others add to it.
test('the terminal row is left as sent by default and shows what Tidia did with message_view labeled', { options: { polish_on: 'enter', ui_language: 'ko', message_view: 'labeled' } }, async ($, on) => {
  const h = install(on, { replies: [reply('다시 한번 테스트.')], surfaces: ['terminal'] })
  await start($)
  await dictate(h, ['다시 한번더', '다시 한번더 테스트 다시 한번더 테스트'])
  await $.prompt.submit(enter(h))
  await (await $.ui.mount(row('다시 한번 테스트.', 'composer', 'terminal') as never)).unmount()
  expect(h.rendered.at(-1)?.props.text).toBe('→ 간결화\n다시 한번 테스트.')
})

test('with the default view the terminal keeps no notes and redraws nothing', { options: { polish_on: 'enter', ui_language: 'ko' } }, async ($, on) => {
  const h = install(on, { replies: [reply('다시 한번 테스트.')], surfaces: ['terminal'] })
  await start($)
  await dictate(h, ['다시 한번더', '다시 한번더 테스트 다시 한번더 테스트'])
  await $.prompt.submit(enter(h))
  expect(h.stored('sent-notes')).toBeUndefined()
  await (await $.ui.mount(row('다시 한번 테스트.', 'composer', 'terminal') as never)).unmount()
  expect(h.rendered.at(-1)?.props.text).toBe('다시 한번 테스트.')
})

// Manual check S1, 2026-10-13: a fill at a pause stops the microphone, so what was said after the
// pause never reached the prompt. No surface says when a recording ends, so the cleanup only shows
// above the prompt, and Enter sends it.
test('pause: the cleanup shows above the prompt and the prompt keeps the dictation', PAUSE, async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.')] })
  await start($)
  await dictate(h, FRAMES)
  await h.clock.advance(1500)
  expect(h.draft).toBe(RAW)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ text: /이렇게 하면 되네\./ })).toBeDefined()
  await ui.unmount()
  await $.prompt.submit(enter(h))
  expect(h.submitted[0]?.text).toBe('이렇게 하면 되네.')
  expect(h.submitted[0]?.context?.[0]).toContain(RAW)
  expect(h.modelCalls).toBe(1)
})

test('pause: speech after the preview drops it and Enter tidies the whole dictation', PAUSE, async ($, on) => {
  const h = install(on, { replies: [reply('이렇게 하면 되네.'), reply('이렇게 하면 되네. 테스트도 돌려 줘.')] })
  await start($)
  await dictate(h, FRAMES)
  await h.clock.advance(1500)
  await dictate(h, [`${RAW} 그리고 테스트도`, `${RAW} 그리고 테스트도 돌려 줘`])
  expect(h.draft).toBe(`${RAW} 그리고 테스트도 돌려 줘`)
  await $.prompt.submit(enter(h))
  expect(h.submitted[0]?.text).toBe('이렇게 하면 되네. 테스트도 돌려 줘.')
})
