import { test, expect } from './kit'
import { harvest, looksSecret, parseTerms, refineRequest, transcriptPrompts } from '../src/dict/build'

test('transcriptPrompts keeps the person\'s own prompts only', () => {
  const jsonl = [
    JSON.stringify({ type: 'user', cwd: '/repo', message: { role: 'user', content: '테일스케일 같은 기능 넣어 줘' } }),
    JSON.stringify({ type: 'user', cwd: '/repo/sub', message: { role: 'user', content: [{ type: 'text', text: 'Tailscale 문서 봐 줘' }, { type: 'tool_result', content: 'secret output' }] } }),
    JSON.stringify({ type: 'user', cwd: '/repo-other', message: { role: 'user', content: 'other project prompt' } }),
    JSON.stringify({ type: 'user', isMeta: true, message: { role: 'user', content: 'meta note' } }),
    JSON.stringify({ type: 'user', message: { role: 'user', content: '<command-name>/tidia</command-name>' } }),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'answer' }] } }),
    'not json',
  ].join('\n')
  expect(transcriptPrompts(jsonl, '/repo')).toEqual(['테일스케일 같은 기능 넣어 줘', 'Tailscale 문서 봐 줘'])
})

test('harvest counts identifiers and Latin words inside other-language prompts', () => {
  const texts = ['Tailscale 같은 기능', 'Tailscale 문서에서 useEffect 봐 줘', 'Tailscale랑 useEffect 비교', 'register.ts 고쳐 줘', 'fix the bug in the parser please']
  expect(harvest(texts, 2)).toEqual([{ term: 'Tailscale', count: 3 }, { term: 'useEffect', count: 2 }])
  expect(harvest(['Install it. Then run Tailscale from Docker.', 'We ship Tailscale with Docker. Docker is fine.'], 2)).toEqual([{ term: 'Tailscale', count: 2 }, { term: 'Docker', count: 2 }])
})

test('refineRequest sends only candidate words; parseTerms keeps only candidates the model returned', () => {
  const req = refineRequest(['Tailscale', 'useEffect', 'please'])
  expect(JSON.parse(req.prompt)).toEqual({ candidates: ['Tailscale', 'useEffect', 'please'] })
  expect(req.system).toContain('{"terms"')
  expect(parseTerms('Sure: {"terms": ["Tailscale", "Invented", "useEffect", "Tailscale"]}', ['Tailscale', 'useEffect', 'please'])).toEqual(['Tailscale', 'useEffect'])
  expect(parseTerms('nope', ['Tailscale'])).toBeNull()
})

import { install, start, command, pane, reply as cleanReply } from './harness'
const README = '# voice-polish-mod\nTailscale style cleanup. See `register.ts`. Tailscale Tailscale'
const PROMPT = (text: string, cwd = '/repo') => JSON.stringify({ type: 'user', cwd, message: { role: 'user', content: text } })
const TRANSCRIPT = [PROMPT('Kubernetes 배포 확인해 줘'), PROMPT('Kubernetes 설정 봐 줘'), PROMPT('Kubernetes 로그 줘')].join('\n')
const termsReply = (terms: string[]) => JSON.stringify({ terms })
void cleanReply

test('/tidia dict build asks first; repo only reads no conversations and proposes what the model kept', async ($, on) => {
  const h = install(on, {
    ask: 'Repo only',
    files: { '/repo/package.json': '{"name":"voice-polish-mod"}', '/repo/README.md': README, '/repo/hooks/register.ts': '', '/home/me/.claude/projects/-repo/a.jsonl': TRANSCRIPT },
    git: 'main\nfeat/voice-polish-core\n',
    replies: [termsReply(['voice-polish-mod', 'Tailscale'])],
  })
  await start($)
  const r = await $.command.run(command('dict build'))
  expect(h.asked).toEqual(['Find words for the dictionary in this project?'])
  const sent = JSON.parse(String(h.payloads[0] ? JSON.stringify(h.payloads[0]) : '{}')) as { candidates: string[] }
  expect(sent.candidates).toContain('voice-polish-mod')
  expect(sent.candidates).toContain('Tailscale')
  expect(sent.candidates).not.toContain('Kubernetes')
  expect(r.text).toBeUndefined()
  const ui = await $.ui.mount(pane('voice-dict'))
  expect(await ui.find({ type: 'Text', text: /Found in this project/ })).toBeDefined()
  await ui.press({ key: 'propose-all' })
  await ui.unmount()
  const project = Object.entries(h.store).find(([k]) => k.startsWith('dict:project:'))?.[1] as { entries: Array<{ meant: string; source: string }> }
  expect(project.entries.map(e => `${e.meant}:${e.source}`)).toEqual(['voice-polish-mod:bootstrap', 'Tailscale:bootstrap'])
})

// The question's chip holds 12 characters: a translated title would be cut ("Voice dictio").
test('the dictionary build question names Tidia in its chip', async ($, on) => {
  const h = install(on, { ask: 'Repo only', files: { '/repo/README.md': README }, replies: [termsReply(['Tailscale'])] })
  await start($)
  await $.command.run(command('dict build'))
  expect(h.askedHeaders).toEqual(['Tidia'])
})

test('with consent, past conversations of this project add the words the person says', async ($, on) => {
  const h = install(on, {
    ask: 'Repo and past conversations',
    files: { '/repo/README.md': 'nothing here', '/home/me/.claude/projects/-repo/a.jsonl': TRANSCRIPT },
    replies: [termsReply(['Kubernetes'])],
  })
  await start($)
  await $.command.run(command('dict build'))
  expect((h.payloads[0] as { candidates: string[] }).candidates).toContain('Kubernetes')
})

test('a dismissed question builds nothing', async ($, on) => {
  const h = install(on, { files: { '/repo/README.md': README } })
  await start($)
  expect((await $.command.run(command('dict build'))).text).toBe('Dictionary build cancelled.')
  expect(h.modelCalls).toBe(0)
})

test('harvest never proposes secrets or long tokens', () => {
  // Built at run time, so the source holds nothing a secret scanner reads as a token.
  const key = ['sk', 'ant', 'api03', 'abcdefghij1234567890'].join('-')
  const gh = ['ghp', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'].join('_')
  const texts = [1, 2, 3].map(() => `이 키 ${key} 랑 ${gh} 쓰고 Tailscale 켜 줘`)
  expect(harvest(texts, 3).map(c => c.term)).toEqual(['Tailscale'])
})

test('a README that is a link is not read: it can point out of the project', async ($, on) => {
  const h = install(on, {
    ask: 'Repo only',
    files: { '/repo/README.md': README, '/repo/CLAUDE.md': README.replaceAll('Tailscale', 'Gemmascale') },
    links: ['/repo/README.md'],
    replies: [termsReply(['Gemmascale'])],
  })
  await start($)
  await $.command.run(command('dict build'))
  const candidates = (h.payloads[0] as { candidates: string[] }).candidates
  expect(candidates).toContain('Gemmascale')
  expect(candidates).not.toContain('Tailscale')
})

test('a key-like run of mixed case and digits is never a candidate', () => {
  expect(looksSecret('aB3dE5fG7hJ9kL1mN')).toBe(true)
  expect(looksSecret('x'.repeat(40))).toBe(true)
  expect(looksSecret('useEffect')).toBe(false)
  expect(looksSecret('voice-polish-mod')).toBe(false)
  expect(looksSecret('Base64Encoder')).toBe(false)
})

test('passwords, keys and tokens in prompts are never candidates', () => {
  for (const s of ['sk_live_51HxYzAbCdEf', 'hunter2pass', 'Tr0ub4dor', 'db_password_prod_x9', 'glpat-abcdefghij', 'eyJhbGciOiJIUzI1NiJ9', 'MY_API_KEY']) expect({ s, secret: looksSecret(s) }).toEqual({ s, secret: true })
  for (const s of ['compass', 'passport', 'TokenService', 'es2023', 'h264', 'i18n', 'k8s']) expect({ s, secret: looksSecret(s) }).toEqual({ s, secret: false })
})

test("when the model does not sift the candidates, only the project's own names are proposed, never words from past prompts", async ($, on) => {
  const h = install(on, {
    ask: 'Repo and past conversations',
    files: { '/repo/README.md': README, '/home/me/.claude/projects/-repo/a.jsonl': TRANSCRIPT },
  })
  await start($)
  await $.command.run(command('dict build'))
  const ui = await $.ui.mount(pane('voice-dict'))
  expect(await ui.find({ type: 'Text', text: /Tailscale/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Kubernetes/ })).toBeUndefined()
  await ui.unmount()
})
