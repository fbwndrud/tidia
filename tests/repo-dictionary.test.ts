import { test, expect } from './kit'
import { install, start, dictate, reply, command } from './harness'

// 0.1 reads no dictionary from the repository: a file someone else committed must not shape what
// the person sends. The old team file is left alone.
const TEAM = '/repo/.claude/tidia.dict.json'
const FRAMES = ['음 테일스케일', '음 테일스케일 같은 기능을 우리 앱에도 넣어 줘']

test('a dictionary file in the repo is not read', async ($, on) => {
  const h = install(on, { replies: [reply('ok')], files: { [TEAM]: JSON.stringify({ version: 1, entries: [{ heard: '테일스케일', meant: 'Tailscale' }] }) } })
  await start($)
  await dictate(h, FRAMES)
  await h.clock.advance(1000)
  expect(h.payloads[0]?.known_mishearings).toEqual([])
  expect((await $.command.run(command('dict list'))).text).not.toContain('Tailscale')
})

test('there is no dict export', async ($, on) => {
  const h = install(on)
  await start($)
  expect((await $.command.run(command('dict export'))).text).toContain('/tidia dict [list]')
  expect(h.files[TEAM]).toBeUndefined()
})
