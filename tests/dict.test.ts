import { test, expect } from './kit'
import { emptyDict, entryInput, MAX_REJECTED, parseAddArgs, parseDict, pickHints, projectKey, removeWord, saidIn, upsert, type Dict } from '../src/dict/dict'
import { sessionTerms } from '../src/dict/session'

const NOW = '2026-10-10T00:00:00.000Z'
const LATER = '2026-10-11T00:00:00.000Z'

test('parseDict reads a stored dictionary and drops anything malformed', () => {
  expect(parseDict(undefined)).toEqual(emptyDict())
  expect(parseDict({ version: 2, entries: [] })).toEqual(emptyDict())
  expect(parseDict('junk')).toEqual(emptyDict())
  const d = parseDict({ version: 1, entries: [{ meant: 'Tailscale', source: 'manual', confirmations: 0, rejections: 0, uses: 0, lastSeen: NOW }, { meant: 3 }, null], rejected: [{ heard: 'a', meant: 'b' }, 7] })
  expect(d.entries.map(e => e.meant)).toEqual(['Tailscale'])
  expect(d.rejected).toEqual([{ heard: 'a', meant: 'b' }])
})

test('entryInput and parseAddArgs read a term or a heard = meant pair', () => {
  expect(entryInput(undefined, ' Tailscale ')).toEqual({ meant: 'Tailscale' })
  expect(entryInput('테일스케일', 'Tailscale')).toEqual({ heard: '테일스케일', meant: 'Tailscale' })
  expect(entryInput('Tailscale', 'tailscale')).toBeNull()
  expect(entryInput(undefined, '')).toBeNull()
  expect(entryInput(undefined, 'x'.repeat(81))).toBeNull()
  expect(parseAddArgs('Tailscale')).toEqual({ input: { meant: 'Tailscale' }, scope: 'global' })
  expect(parseAddArgs('보이스 플래시 = Voice Polish --project')).toEqual({ input: { heard: '보이스 플래시', meant: 'Voice Polish' }, scope: 'project' })
  expect(parseAddArgs('테일스케일 -> Tailscale')).toEqual({ input: { heard: '테일스케일', meant: 'Tailscale' }, scope: 'global' })
  expect(parseAddArgs('   ')).toBeNull()
})

test('upsert adds, then updates the entry with the same heard form', () => {
  const a = upsert(emptyDict(), { heard: '테일스케일', meant: 'Tailscan' }, 'manual', NOW)
  expect(a.change).toBe('added')
  const b = upsert(a.dict, { heard: '테일스케일', meant: 'Tailscale' }, 'manual', LATER)
  expect(b.change).toBe('updated')
  expect(b.dict.entries).toEqual([{ heard: '테일스케일', meant: 'Tailscale', source: 'manual', confirmations: 0, rejections: 0, uses: 0, lastSeen: LATER }])
  expect(upsert(b.dict, { meant: 'Tailscale' }, 'manual', NOW).change).toBe('added')
})

test('upsert refuses past the per-scope cap', () => {
  let d: Dict = emptyDict()
  d = { ...d, entries: Array.from({ length: 2000 }, (_, i) => ({ meant: `term${i}`, source: 'manual' as const, confirmations: 0, rejections: 0, uses: 0, lastSeen: NOW })) }
  expect(upsert(d, { meant: 'one more' }, 'manual', NOW).change).toBe('full')
  expect(upsert(d, { meant: 'term5' }, 'manual', NOW).change).toBe('updated')
})

test('removeWord removes by heard or meant, case-insensitively', () => {
  const d = upsert(upsert(emptyDict(), { heard: '테일스케일', meant: 'Tailscale' }, 'manual', NOW).dict, { meant: 'Voice Polish' }, 'manual', NOW).dict
  expect(removeWord(d, 'tailscale').removed.map(e => e.meant)).toEqual(['Tailscale'])
  expect(removeWord(d, '테일스케일').dict.entries.map(e => e.meant)).toEqual(['Voice Polish'])
  expect(removeWord(d, 'nothing').removed).toEqual([])
})

test('projectKey is stable per folder', () => {
  expect(projectKey('/repo')).toBe(projectKey('/repo'))
  expect(projectKey('/repo')).not.toBe(projectKey('/other'))
  expect(projectKey('/repo')).toMatch(/^dict:project:[0-9a-f]{8}$/)
})

test('pickHints sends a small dictionary whole, project before global on the same heard form', () => {
  const global = upsert(upsert(emptyDict(), { heard: '테일스케일', meant: 'Tailscan' }, 'manual', LATER).dict, { meant: 'Voice Polish' }, 'manual', NOW).dict
  const project = upsert(emptyDict(), { heard: '테일스케일', meant: 'Tailscale' }, 'manual', NOW).dict
  const hints = pickHints({ global, project }, [], '로그인 고쳐 줘')
  expect(hints).toEqual({ terms: ['Voice Polish'], pairs: [{ heard: '테일스케일', meant: 'Tailscale' }] })
})

test('pickHints sends only close entries from a large dictionary, then close session terms', () => {
  let global = emptyDict()
  for (let i = 0; i < 30; i++) global = upsert(global, { meant: `Mmmmm${i}` }, 'manual', NOW).dict
  global = upsert(global, { heard: '테일스케일', meant: 'Tailscale' }, 'manual', NOW).dict
  const hints = pickHints({ global, project: emptyDict() }, ['register.ts', 'Kubernetes'], '음 테일스케일 기능이랑 레지스터 티에스 파일')
  expect(hints.pairs).toEqual([{ heard: '테일스케일', meant: 'Tailscale' }])
  expect(hints.terms).toEqual(['register.ts'])
})

test('sessionTerms collects identifiers and file names, newest message first', () => {
  const terms = sessionTerms([
    { text: 'Look at `buildRequest` in src/cleaner.ts' },
    { text: 'register.ts에서 forgetDictation 호출이 빠졌어요. voice-polish-mod 와 english_terms 확인' },
  ])
  expect(terms).toEqual(['register.ts', 'forgetDictation', 'english_terms', 'voice-polish-mod', 'cleaner.ts', 'buildRequest'])
})

test('pickHints stays quick at the cap: 4,000 entries against a 300-word dictation', () => {
  let global = emptyDict()
  let project = emptyDict()
  for (let i = 0; i < 2000; i++) {
    global = { ...global, entries: [...global.entries, { meant: `Termword${i}x`, source: 'manual', confirmations: 0, rejections: 0, uses: 0, lastSeen: NOW }] }
    project = { ...project, entries: [...project.entries, { heard: `들린말${i}`, meant: `Meant${i}`, source: 'manual', confirmations: 0, rejections: 0, uses: 0, lastSeen: NOW }] }
  }
  const dictated = Array.from({ length: 300 }, (_, i) => ['로그인', '페이지를', '다시', '고쳐', '줘', '테일스케일'][i % 6]).join(' ')
  // Generous bounds: test files run in parallel. Before the dictation was indexed once this took 15 s.
  let started = performance.now()
  pickHints({ global, project }, [], dictated)
  expect(performance.now() - started).toBeLessThan(1500)
  // The entries' skeletons are kept, so the next polish of a new dictation is quicker.
  started = performance.now()
  pickHints({ global, project }, [], dictated.replace(/로그인/g, '회원가입'))
  expect(performance.now() - started).toBeLessThan(600)
})

// Claude adds entries without a prompt, so text it read elsewhere must not get a command in.
test('entryInput refuses command flags and paths', () => {
  expect(entryInput('배포', 'rm -rf /')).toBeNull()
  expect(entryInput(undefined, '--force')).toBeNull()
  expect(entryInput(undefined, '~/secrets')).toBeNull()
  expect(entryInput(undefined, '/etc/passwd')).toBeNull()
  expect(entryInput('닷 엔브', '.env')).toEqual({ heard: '닷 엔브', meant: '.env' })
  expect(entryInput(undefined, 'Voice-Polish')).toEqual({ meant: 'Voice-Polish' })
})

test('saidIn finds a whole word or the start of one, not a letter or two inside another', () => {
  expect(saidIn('음 테일스케일가 좋아', '테일스케일')).toBe(true)
  expect(saidIn('use Tailscale now', 'tailscale')).toBe(true)
  expect(saidIn('이렇게 하면 되네', '렇게')).toBe(false)
  expect(saidIn('이렇게 하면 되네', '이')).toBe(false)
  expect(saidIn('the staging box', 'stag')).toBe(true)
  expect(saidIn('backstage', 'stage')).toBe(false)
})

test('a removed learned entry is rejected once, and the rejected list keeps the newest MAX_REJECTED', () => {
  const learned = (meant: string) => ({ meant, source: 'learned' as const, confirmations: 0, rejections: 0, uses: 0, lastSeen: '' })
  const d = removeWord({ ...emptyDict(), entries: [learned('Tailscale')], rejected: [{ meant: 'Tailscale' }] }, 'Tailscale').dict
  expect(d.rejected).toEqual([{ meant: 'Tailscale' }])
  const many = { ...emptyDict(), entries: [learned('New')], rejected: Array.from({ length: MAX_REJECTED }, (_, i) => ({ meant: `w${i}` })) }
  const after = removeWord(many, 'New').dict.rejected
  expect(after).toHaveLength(MAX_REJECTED)
  expect(after.at(-1)).toEqual({ meant: 'New' })
  expect(after[0]).toEqual({ meant: 'w1' })
})
