import { test, expect } from './kit'
import { install, start, dictate, reply, command } from './harness'
import { projectKey } from '../src/dict/dict'

const FRAMES = ['음 테일스케일', '음 테일스케일 같은 기능을 우리 앱에도 넣어 줘']
const ENTRY = { heard: '테일스케일', meant: 'Tailscale', source: 'manual', confirmations: 0, rejections: 0, uses: 0, lastSeen: '2026-10-10T00:00:00.000Z' }

test('stored entries reach the model as hints', async ($, on) => {
  const h = install(on, { replies: [reply('Tailscale 같은 기능을 우리 앱에도 넣어 줘.')], store: { 'dict:global': { version: 1, entries: [ENTRY], rejected: [] } } })
  await start($)
  await dictate(h, FRAMES)
  await h.clock.advance(1000)
  expect(h.payloads[0]?.known_mishearings).toEqual([{ heard: '테일스케일', meant: 'Tailscale' }])
})

test('project entries load from the project key', async ($, on) => {
  const h = install(on, { replies: [reply('ok')], store: { [projectKey('/repo')]: { version: 1, entries: [{ ...ENTRY, heard: undefined, meant: 'Voice Polish' }], rejected: [] } } })
  await start($)
  await dictate(h, FRAMES)
  await h.clock.advance(1000)
  expect(h.payloads[0]?.preferred_terms).toEqual(['Voice Polish'])
})

test('/tidia dict add stores an entry and the next polish uses it', async ($, on) => {
  const h = install(on, { replies: [reply('ok')] })
  await start($)
  expect((await $.command.run(command('dict add 테일스케일 = Tailscale'))).text).toBe('Added to the dictionary (all projects): 테일스케일 → Tailscale')
  expect((await $.command.run(command('dict add 테일스케일 = TailScale'))).text).toBe('Updated in the dictionary (all projects): 테일스케일 → TailScale')
  expect((await $.command.run(command('dict add Voice Polish --project'))).text).toBe('Added to the dictionary (this project): Voice Polish')
  await dictate(h, FRAMES)
  await h.clock.advance(1000)
  expect(h.payloads[0]?.known_mishearings).toEqual([{ heard: '테일스케일', meant: 'TailScale' }])
  expect(h.payloads[0]?.preferred_terms).toEqual(['Voice Polish'])
  expect(h.stored('dict:global')).toMatchObject({ version: 1, entries: [{ heard: '테일스케일', meant: 'TailScale', source: 'manual' }] })
})

test('/tidia dict lists, removes and explains', async ($, on) => {
  install(on)
  await start($)
  expect((await $.command.run(command('dict list'))).text).toContain('The voice dictionary is empty')
  await $.command.run(command('dict add 테일스케일 = Tailscale'))
  const list = (await $.command.run(command('dict list'))).text ?? ''
  expect(list).toContain('Voice dictionary, 1 entries')
  expect(list).toContain('테일스케일 → Tailscale · all projects')
  expect((await $.command.run(command('dict remove tailscale'))).text).toBe('Removed from the dictionary: 테일스케일 → Tailscale')
  expect((await $.command.run(command('dict remove tailscale'))).text).toBe('No dictionary entry for "tailscale"')
  expect((await $.command.run(command('dict add'))).text).toBe('Use: /tidia dict [list] | add <word> | add <heard> = <meant> [--project] | remove <word> | build')
  expect((await $.command.run(command('dict zap'))).text).toBe('Use: /tidia dict [list] | add <word> | add <heard> = <meant> [--project] | remove <word> | build')
})

test('a store that will not save reports it and keeps nothing', async ($, on) => {
  install(on, { storeFails: 'store full' })
  await start($)
  expect((await $.command.run(command('dict add Tailscale'))).text).toBe('Could not save the dictionary: store full')
  expect((await $.command.run(command('dict list'))).text).toContain('The voice dictionary is empty')
})

test('identifiers from the conversation reach the model when they sound close', async ($, on) => {
  const h = install(on, { replies: [reply('ok')], messages: [{ role: 'assistant', text: 'I changed forgetDictation in register.ts' }] })
  await start($)
  await dictate(h, ['레지스터 티에스', '레지스터 티에스 파일 다시 열어 줘'])
  await h.clock.advance(1000)
  expect(h.payloads[0]?.preferred_terms).toEqual(['register.ts'])
})

test('/tidia dict speaks the session language', { options: { ui_language: 'ko' } }, async ($, on) => {
  install(on)
  await start($)
  expect((await $.command.run(command('dict add 테일스케일 = Tailscale'))).text).toBe('사전에 추가(모든 프로젝트): 테일스케일 → Tailscale')
})

const meants = (v: unknown) => (v as { entries: Array<{ meant: string }> }).entries.map(e => e.meant)

test('a change keeps what another session stored meanwhile', async ($, on) => {
  const h = install(on)
  await start($)
  h.store['dict:global'] = { version: 1, entries: [{ meant: 'Tailscale', source: 'manual', confirmations: 0, rejections: 0, uses: 0, lastSeen: '2026-10-10T00:00:00.000Z' }], rejected: [] }
  await $.command.run(command('dict add Kubernetes'))
  expect(meants(h.stored('dict:global'))).toEqual(['Tailscale', 'Kubernetes'])
  expect((await $.command.run(command('dict list'))).text).toContain('Tailscale · all projects')
})

test('a stored dictionary this version cannot read is never overwritten', async ($, on) => {
  const later = { version: 2, entries: [{ term: 'Tailscale' }] }
  const h = install(on, { store: { 'dict:global': later } })
  await start($)
  expect((await $.command.run(command('dict add Kubernetes'))).text).toBe('The stored dictionary was written by another version of Tidia and cannot be read, so it was left as it is.')
  expect(h.stored('dict:global')).toEqual(later)
})

test('a store that cannot be read refuses changes instead of writing over it', async ($, on) => {
  const h = install(on, { storeReadFails: 'denied by policy' })
  await start($)
  expect((await $.command.run(command('dict add Kubernetes'))).text).toBe('Could not save the dictionary: denied by policy')
  expect(h.stored('dict:global')).toBeUndefined()
})

test('two changes at once both land', async ($, on) => {
  const h = install(on)
  await start($)
  await Promise.all([$.command.run(command('dict add Tailscale')), $.command.run(command('dict add Kubernetes'))])
  expect(meants(h.stored('dict:global')).sort()).toEqual(['Kubernetes', 'Tailscale'])
})

test('dictionary off sends no hints and learns nothing, and /tidia dict still manages entries', { options: { dictionary: false } }, async ($, on) => {
  const h = install(on, {
    replies: [reply('Tailscale 같은 기능을 우리 앱에도 넣어 줘.')],
    store: { 'dict:global': { version: 1, entries: [ENTRY], rejected: [] } },
    messages: [{ role: 'assistant', text: 'I changed register.ts' }],
  })
  await start($)
  await dictate(h, FRAMES)
  await h.clock.advance(1000)
  expect(h.payloads[0]?.known_mishearings).toEqual([])
  expect(h.payloads[0]?.preferred_terms).toEqual([])
  expect((await $.command.run(command('dict list'))).text).toContain('테일스케일 → Tailscale')
})
