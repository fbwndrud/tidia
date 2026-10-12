import { test, expect } from './kit'
import { initial, step, type DetectorEvent, type DetectorEffect, type DetectorState } from '../src/detector'

function run(events: DetectorEvent[], from: DetectorState = initial('')): { state: DetectorState; effects: DetectorEffect[] } {
  let state = from
  const effects: DetectorEffect[] = []
  for (const ev of events) {
    const r = step(state, ev, 900)
    state = r.state
    if (r.effect) effects.push(r.effect)
  }
  return { state, effects }
}

const poll = (text: string, at: number): DetectorEvent => ({ type: 'poll', text, at })

// The frames the desktop microphone produced in the 2026-10-09 spike.
const DESKTOP = ['이렇게', '이렇게 이제', '이렇게 이제 이제 이제 되는 건가', '이렇게 이제 이제 이제 되는 건가 어 되네 되네']
const FINAL = DESKTOP[DESKTOP.length - 1]!

test('streaming dictation settles after the pause', () => {
  const frames = DESKTOP.map((text, i) => poll(text, 250 * (i + 1)))
  const { effects } = run([...frames, poll(FINAL, 1800), poll(FINAL, 1900)])
  expect(effects).toEqual([{ kind: 'settled', baseline: '', text: FINAL }])
})

test('nothing settles before the pause has passed', () => {
  const frames = DESKTOP.map((text, i) => poll(text, 250 * (i + 1)))
  expect(run([...frames, poll(FINAL, 1899)]).effects).toEqual([])
})

test('terminal hold-to-talk: warmup spaces, then streaming text', () => {
  const { effects } = run([
    { type: 'edit', text: ' ', at: 0, isSpace: true },
    { type: 'edit', text: '  ', at: 30, isSpace: true },
    poll('', 250),
    poll('야야야 테스트 중이야', 500),
    poll('야야야 테스트 중이야', 1400),
  ])
  expect(effects).toEqual([{ kind: 'settled', baseline: '', text: '야야야 테스트 중이야' }])
})

test('a single change becomes an offer, not a polish', () => {
  const { effects } = run([poll('the previous prompt I sent', 250), poll('the previous prompt I sent', 1200)])
  expect(effects).toEqual([{ kind: 'offer', baseline: '', text: 'the previous prompt I sent' }])
})

test('a short single change is ignored', () => {
  expect(run([poll('yes ok', 250), poll('yes ok', 1200)]).effects).toEqual([])
})

test('typing during dictation cancels it', () => {
  const { effects } = run([
    poll('one two', 250),
    poll('one two three four', 500),
    { type: 'edit', text: 'one two three four!', at: 600, isSpace: false },
    poll('one two three four!', 1600),
  ])
  expect(effects).toEqual([])
})

test('Esc restoring the draft cancels the dictation', () => {
  const { state, effects } = run([poll('a b', 250), poll('a b c d', 500), poll('', 750), poll('', 1700)])
  expect(effects).toEqual([])
  expect(state.phase).toBe('idle')
})

test('a fill resets the detector to the filled text', () => {
  const { state } = run([poll('a b', 250), poll('a b c d', 500), { type: 'fill', text: 'A b c d.' }])
  expect(state).toEqual(initial('A b c d.'))
})

test('dictation under three words never settles', () => {
  expect(run([poll('네', 250), poll('네 좋아', 500), poll('네 좋아', 1400)]).effects).toEqual([])
})

// "그러면은 어", a pause, then the rest: the short start was speech, not text the prompt held before.
test('a dictation too short to polish at its first pause keeps its baseline for the speech after it', () => {
  const { effects } = run([
    poll('그러면은', 250),
    poll('그러면은 어', 500),
    poll('그러면은 어', 1500),
    poll('그러면은 어', 2500),
    poll('그러면은 어 마크다운 형식으로', 3000),
    poll('그러면은 어 마크다운 형식으로 보내는 거', 3250),
    poll('그러면은 어 마크다운 형식으로 보내는 거', 4250),
  ])
  expect(effects).toEqual([{ kind: 'settled', baseline: '', text: '그러면은 어 마크다운 형식으로 보내는 거' }])
})
