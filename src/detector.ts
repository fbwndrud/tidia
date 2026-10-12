import { findSegment } from './segment'
import { countWords } from './tokens'

export const MIN_WORDS = 3

export type Phase = 'idle' | 'candidate' | 'dictating'

export type DetectorState = {
  phase: Phase
  baseline: string
  last: string
  lastChangeAt: number
  growth: number
  segLen: number
  spaceSignal: boolean
}

export type DetectorEvent =
  | { type: 'poll'; text: string; at: number }
  | { type: 'edit'; text: string; at: number; isSpace: boolean }
  | { type: 'fill'; text: string }
  | { type: 'submit' }

export type DetectorEffect = { kind: 'settled' | 'offer'; baseline: string; text: string }

export type Step = { state: DetectorState; effect: DetectorEffect | null }

export function initial(text: string): DetectorState {
  return { phase: 'idle', baseline: text, last: text, lastChangeAt: 0, growth: 0, segLen: 0, spaceSignal: false }
}

export function step(s: DetectorState, ev: DetectorEvent, settleMs: number): Step {
  switch (ev.type) {
    case 'submit':
      return { state: initial(''), effect: null }
    case 'fill':
      return { state: initial(ev.text), effect: null }
    case 'edit':
      // Hold-to-talk types a few spaces during warmup; remember that a recording may follow.
      return { state: { ...initial(ev.text), spaceSignal: ev.isSpace }, effect: null }
    case 'poll':
      return poll(s, ev.text, ev.at, settleMs)
  }
}

function poll(s: DetectorState, text: string, at: number, settleMs: number): Step {
  if (text === s.last) {
    if (s.phase === 'idle' || at - s.lastChangeAt < settleMs) return { state: s, effect: null }
    const enough = countWords(findSegment(s.baseline, text).text) >= MIN_WORDS
    // Speech too short to polish at its first pause is still speech: what follows it continues it.
    if (!enough && s.phase === 'dictating') return { state: s, effect: null }
    const kind = s.phase === 'dictating' ? 'settled' : 'offer'
    return { state: initial(text), effect: enough ? { kind, baseline: s.baseline, text } : null }
  }
  if (s.phase === 'idle') {
    if (s.spaceSignal && isWarmupRemoval(s.last, text)) {
      return { state: { ...initial(text), phase: 'candidate', lastChangeAt: at, spaceSignal: true }, effect: null }
    }
    const segLen = findSegment(s.last, text).text.length
    return {
      state: { ...s, phase: 'candidate', baseline: s.last, last: text, lastChangeAt: at, growth: 1, segLen, spaceSignal: false },
      effect: null,
    }
  }
  // Esc puts back the draft from before the recording.
  if (text === s.baseline) return { state: initial(text), effect: null }
  const segLen = findSegment(s.baseline, text).text.length
  const growth = segLen > s.segLen ? s.growth + 1 : s.growth
  const dictating = s.phase === 'dictating' || growth >= 2 || (s.spaceSignal && growth >= 1)
  return {
    state: { ...s, phase: dictating ? 'dictating' : 'candidate', last: text, lastChangeAt: at, growth, segLen },
    effect: null,
  }
}

function isWarmupRemoval(before: string, after: string): boolean {
  return after.length < before.length && before.replace(/\s+/g, '') === after.replace(/\s+/g, '')
}
