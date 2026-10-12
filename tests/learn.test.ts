import { test, expect } from './kit'
import { emptyDict, parseDict, removeWord, upsert, MAX_ENTRIES, type Dict } from '../src/dict/dict'
import { acceptOffer, corrections, learnFrom, rejectLearned } from '../src/dict/learn'

const NOW = '2026-10-10T00:00:00.000Z'
const LATER = '2026-10-11T00:00:00.000Z'
const all = (s: string) => ({ start: 0, end: s.length })
const PAIR = { heard: '테일스케일', meant: 'Tailscale' }

test('corrections finds a misheard word the person retyped, without its particle', () => {
  const before = '음 테일스케일를 우리 앱에 넣어 줘'
  expect(corrections(before, '음 Tailscale를 우리 앱에 넣어 줘', all(before))).toEqual([PAIR])
  const b2 = '어 보이스 플래시 설정이 안 돼'
  expect(corrections(b2, '어 Voice Polish 설정이 안 돼', all(b2))).toEqual([{ heard: '보이스 플래시', meant: 'Voice Polish' }])
})

test('corrections skips content edits, appends, long rewrites and text outside the dictation', () => {
  const before = '내일 배포해 줘'
  expect(corrections(before, '모레 배포해 줘', all(before))).toEqual([])
  expect(corrections(before, '내일 배포해 줘 그리고 알려 줘', all(before))).toEqual([])
  const long = '이 부분은 전부 다시 써야 할 것 같아'
  expect(corrections(long, '이 부분은 새 모듈로 옮기고 테스트를 붙여 줘', all(long))).toEqual([])
  const typed = '테일스케일 문서 '
  const both = `${typed}테일스케일 넣어 줘`
  expect(corrections(both, `Tailscale 문서 테일스케일 넣어 줘`, { start: typed.length, end: both.length })).toEqual([])
})

test('learnFrom offers first, adds on the second identical correction, then confirms', () => {
  const a = learnFrom(emptyDict(), PAIR, NOW)
  expect(a.outcome).toBe('offer')
  expect(a.dict.candidates).toEqual([{ ...PAIR, count: 1, lastSeen: NOW }])
  expect(a.dict.entries).toEqual([])
  const b = learnFrom(a.dict, PAIR, LATER)
  expect(b.outcome).toBe('added')
  expect(b.dict.candidates).toEqual([])
  expect(b.dict.entries).toEqual([{ ...PAIR, source: 'learned', confirmations: 2, rejections: 0, uses: 0, lastSeen: LATER }])
  const c = learnFrom(b.dict, PAIR, LATER)
  expect(c.outcome).toBe('confirmed')
  expect(c.dict.entries[0]?.confirmations).toBe(3)
})

test('acceptOffer adds a candidate at once', () => {
  const a = learnFrom(emptyDict(), PAIR, NOW)
  const r = acceptOffer(a.dict, PAIR, LATER)
  expect(r.outcome).toBe('added')
  expect(r.dict.candidates).toEqual([])
  expect(r.dict.entries).toMatchObject([{ ...PAIR, source: 'learned', confirmations: 1 }])
})

test('learning never overrides a manual entry and never brings back a rejected one', () => {
  const manual = upsert(emptyDict(), { heard: '테일스케일', meant: 'Tailscan' }, 'manual', NOW).dict
  expect(learnFrom(manual, PAIR, NOW).outcome).toBe('ignored')
  const learned = acceptOffer(learnFrom(emptyDict(), PAIR, NOW).dict, PAIR, NOW).dict
  const rejected = rejectLearned(learned, PAIR)
  expect(rejected.entries).toEqual([])
  expect(rejected.rejected).toEqual([PAIR])
  expect(learnFrom(rejected, PAIR, LATER).outcome).toBe('ignored')
  expect(upsert(rejected, PAIR, 'manual', LATER).change).toBe('added')
})

test('removing a learned entry rejects it; removing a manual one does not', () => {
  const learned = acceptOffer(learnFrom(emptyDict(), PAIR, NOW).dict, PAIR, NOW).dict
  expect(removeWord(learned, 'Tailscale').dict.rejected).toEqual([PAIR])
  const manual = upsert(emptyDict(), PAIR, 'manual', NOW).dict
  expect(removeWord(manual, 'Tailscale').dict.rejected).toEqual([])
})

test('a full dictionary evicts the least used, oldest learned entry, never a manual one', () => {
  const base = (source: 'manual' | 'learned', i: number, uses = 0, lastSeen = NOW) => ({ meant: `T${i}`, source, confirmations: 0, rejections: 0, uses, lastSeen })
  const manualOnly: Dict = { ...emptyDict(), entries: Array.from({ length: MAX_ENTRIES }, (_, i) => base('manual', i)) }
  expect(upsert(manualOnly, { meant: 'new' }, 'manual', NOW).change).toBe('full')
  expect(learnFrom(learnFrom(manualOnly, PAIR, NOW).dict, PAIR, NOW).outcome).toBe('ignored')
  const entries = Array.from({ length: MAX_ENTRIES }, (_, i) => base('manual', i))
  entries[5] = base('learned', 5, 3, NOW)
  entries[7] = base('learned', 7, 0, LATER)
  entries[9] = base('learned', 9, 0, NOW)
  const r = upsert({ ...emptyDict(), entries }, { meant: 'new' }, 'manual', LATER)
  expect(r.change).toBe('added')
  expect(r.dict.entries.map(e => e.meant)).not.toContain('T9')
  expect(r.dict.entries).toHaveLength(MAX_ENTRIES)
})

test('parseDict reads candidates and rejected terms', () => {
  const d = parseDict({ version: 1, entries: [], rejected: [{ meant: 'Tailscale' }, { heard: 'a', meant: 'b' }], candidates: [{ meant: 'Tailscale', count: 1, lastSeen: NOW }, { meant: 3 }] })
  expect(d.rejected).toEqual([{ meant: 'Tailscale' }, { heard: 'a', meant: 'b' }])
  expect(d.candidates).toEqual([{ meant: 'Tailscale', count: 1, lastSeen: NOW }])
  expect(parseDict({ version: 1, entries: [] }).candidates).toEqual([])
})

test('corrections skips grammar, tense, spacing and ordinary-word edits', () => {
  const pairs: Array<[string, string]> = [
    ['I want to fix it', 'I wanted to fix it'],
    ['we need a test', 'we needed a test'],
    ['run the test', 'ran the test'],
    ['add a test here', 'add a text here'],
    ['the list is long', 'the last is long'],
    ['open the login page', 'open the logging path'],
    ['한번 고쳐 줘', '한 번 고쳐 줘'],
    ['이거 고쳐줘 빨리', '이거 고쳐 줘 빨리'],
  ]
  for (const [before, after] of pairs) expect(`${before} -> ${JSON.stringify(corrections(before, after, all(before)))}`).toBe(`${before} -> []`)
})

test('corrections still learns names, identifiers and same-script mishearings', () => {
  const b1 = 'can we build tail scale for the terminal'
  expect(corrections(b1, 'can we build Tailscale for the terminal', all(b1))).toEqual([{ heard: 'tail scale', meant: 'Tailscale' }])
  const b2 = 'convert it to type script please'
  expect(corrections(b2, 'convert it to TypeScript please', all(b2))).toEqual([{ heard: 'type script', meant: 'TypeScript' }])
  const b3 = '이 파일 모두 설정을 바꿔 줘'
  expect(corrections(b3, '이 파일 모드 설정을 바꿔 줘', all(b3))).toEqual([{ heard: '모두', meant: '모드' }])
})
