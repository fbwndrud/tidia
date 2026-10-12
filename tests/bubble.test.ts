import { test, expect } from './kit'
import { bubbleText, customLabels, parseNotes, sentRowText, withNote, storable, SENT_NOTES, NOTE_STORE_CHARS } from '../src/ui/bubble'

const NOTE = { said: '음 다시 테스트 어 버전 알려 줘', sent: '다시 테스트.\n\n- 버전을 알려 줘.', mode: 'list' }
const ROW = { text: NOTE.said }

test('full shows what was said, what it became and the lines sent', () => {
  expect(bubbleText(NOTE, 'full')).toBe('음 다시 테스트 어 버전 알려 줘\n\n→ list\n다시 테스트.\n- 버전을 알려 줘.')
})

test('labeled leaves what was said out; tidied shows only the lines sent', () => {
  expect(bubbleText(NOTE, 'labeled')).toBe('→ list\n다시 테스트.\n- 버전을 알려 줘.')
  expect(bubbleText(NOTE, 'tidied')).toBe('다시 테스트.\n- 버전을 알려 줘.')
})

test('only a row that carries a prompt tidied at Enter is rewritten', () => {
  expect(sentRowText([NOTE], ROW, 'full')).toBe(bubbleText(NOTE, 'full'))
  expect(sentRowText([NOTE], { text: 'typed by hand' }, 'full')).toBeNull()
  expect(sentRowText(null, ROW, 'full')).toBeNull()
})

// The terminal, and the desktop back from another session, draw the row from the message sent.
test('a row that holds the message sent finds its note by it', () => {
  expect(sentRowText([NOTE], { text: `${NOTE.sent}\n` }, 'labeled')).toBe(bubbleText(NOTE, 'labeled'))
})

test('parseNotes keeps only well-formed notes', () => {
  expect(parseNotes([NOTE, { said: 'x' }, null, 3])).toEqual([NOTE])
  expect(parseNotes(undefined)).toEqual([])
})

test('bubble_labels sets the words in order prose/list/minimal; an empty part keeps the default', () => {
  expect(customLabels('글/할 일/그대로/남는 말')).toEqual({ prose: '글', list: '할 일', minimal: '그대로' })
  expect(customLabels('/할 일')).toEqual({ list: '할 일' })
  expect(customLabels('')).toEqual({})
})

test('a note from another session is not drawn in this one; an old note without one still is', () => {
  const row = { text: 'hello there', session: 'b' }
  const note = { said: 'hello there', sent: 'Hello there.', mode: 'tidied' }
  expect(sentRowText([{ ...note, session: 'a' }], row, 'labeled')).toBeNull()
  expect(sentRowText([{ ...note, session: 'b' }], row, 'labeled')).not.toBeNull()
  expect(sentRowText([note], row, 'labeled')).not.toBeNull()
})

test('withNote replaces the same prompt in the same session only, and keeps at most SENT_NOTES', () => {
  const n = (said: string, session: string) => ({ said, sent: said.toUpperCase(), mode: 'list', session })
  expect(withNote([n('a', 's1'), n('a', 's2')], n('a', 's1'))).toEqual([n('a', 's1'), n('a', 's2')])
  const many = Array.from({ length: SENT_NOTES }, (_, i) => n(`w${i}`, 's'))
  const after = withNote(many, n('new', 's'))
  expect(after).toHaveLength(SENT_NOTES)
  expect(after[0]).toEqual(n('new', 's'))
  expect(storable({ said: 'x'.repeat(NOTE_STORE_CHARS), sent: 'y', mode: '' })).toBe(false)
})
