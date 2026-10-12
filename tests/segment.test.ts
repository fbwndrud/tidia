import { test, expect } from './kit'
import { findSegment, replaceSegment } from '../src/segment'

test('findSegment returns everything for a fresh dictation', () => {
  expect(findSegment('', 'hello world')).toEqual({ start: 0, end: 11, text: 'hello world' })
})

test('findSegment keeps typed text before the dictation out', () => {
  expect(findSegment('Fix this: ', 'Fix this: 음 그러니까 버그')).toEqual({ start: 10, end: 19, text: '음 그러니까 버그' })
})

test('findSegment finds an insertion in the middle', () => {
  expect(findSegment('ab', 'aXYb')).toEqual({ start: 1, end: 3, text: 'XY' })
})

test('replaceSegment swaps only the segment', () => {
  const draft = 'Fix this: 음 그러니까 버그'
  expect(replaceSegment(draft, findSegment('Fix this: ', draft), '버그')).toBe('Fix this: 버그')
})
