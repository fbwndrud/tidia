import { test, expect } from './kit'
import { words, countWords } from '../src/tokens'

test('words splits on spaces and punctuation with offsets', () => {
  const w = words('hello, world')
  expect(w.map(x => x.text)).toEqual(['hello', 'world'])
  expect(w.map(x => x.start)).toEqual([0, 7])
  expect(w[1]?.end).toBe(12)
})

test('words keeps Korean words and mixed identifiers whole', () => {
  expect(words('이렇게 이제 되네.').map(x => x.text)).toEqual(['이렇게', '이제', '되네'])
  expect(words('useEffect를 고쳐줘').map(x => x.text)).toEqual(['useEffect를', '고쳐줘'])
})

test('countWords counts each Han and kana character as a word', () => {
  expect(countWords('今日は')).toBe(3)
  expect(countWords('  ')).toBe(0)
})

