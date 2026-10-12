import { test, expect } from './kit'
import { resolveTerms, scriptFamily } from '../src/language'

test('scriptFamily names the writing system a dictation is mostly in', () => {
  expect(scriptFamily('음 그러니까 useEffect 버그를 고쳐 줘')).toBe('hangul')
  expect(scriptFamily('今日はリアクトのバグを直す')).toBe('japanese')
  expect(scriptFamily('我们需要修复数据库的问题')).toBe('chinese')
  expect(scriptFamily('функция не работает')).toBe('cyrillic')
  expect(scriptFamily('la función no funciona')).toBe('latin')
  expect(scriptFamily('मेरा रिएक्ट ऐप टूट गया')).toBe('other')
})

test('auto picks the level by language; an explicit level stays', () => {
  expect(resolveTerms('auto', '음 리액트 버그 고쳐 줘')).toBe('high')
  expect(resolveTerms('auto', 'リアクトのバグを直して')).toBe('high')
  expect(resolveTerms('auto', '我们需要修复数据库的问题')).toBe('low')
  expect(resolveTerms('auto', 'ну реакт не работает')).toBe('high')
  expect(resolveTerms('auto', 'um so can you fix the bug in the login flow please')).toBe('off')
  expect(resolveTerms('auto', 'eh bueno la función no funciona cuando el usuario hace clic')).toBe('low')
  expect(resolveTerms('auto', 'React useEffect', 'english')).toBe('off')
  expect(resolveTerms('auto', 'React useEffect', 'en-US')).toBe('off')
  expect(resolveTerms('medium', 'um so can you fix the bug')).toBe('medium')
})

// Misdetections from the 2026-10-10 eval (en-g7, de-g4).
test('a short English question counts as English and German with "was" and "in" does not', () => {
  expect(resolveTerms('auto', 'what port does postgres use by default')).toBe('off')
  expect(resolveTerms('auto', 'was ist der Unterschied zwischen let und const in JavaScript')).toBe('low')
  expect(resolveTerms('auto', 'je ne sais pas pourquoi le test est lent')).toBe('low')
})
