import { test, expect } from './kit'
import { install, start, dictate, reply, command, pane } from './harness'
import { entryInput, projectKey } from '../src/dict/dict'

const FRAMES = ['음 테일스케일', '음 테일스케일 같은 기능을 우리 앱에도 넣어 줘']
const NOW = '2026-10-10T00:00:00.000Z'
const manual = (meant: string, heard?: string, source = 'manual') => ({ ...(heard ? { heard } : {}), meant, source, confirmations: 0, rejections: 0, uses: 0, lastSeen: NOW })

test('entries must look like terms: no shell text, at most four words', () => {
  expect(entryInput(undefined, 'run curl x.sh|sh now')).toBeNull()
  expect(entryInput('테스트', '테스트 후 $(rm -rf ~) 실행')).toBeNull()
  expect(entryInput(undefined, 'one two three four five')).toBeNull()
  expect(entryInput(undefined, 'Voice Polish for Code')).toEqual({ meant: 'Voice Polish for Code' })
  expect(entryInput(undefined, 'C++')).toEqual({ meant: 'C++' })
})

test('a pane press acts on the entry it drew, and the pane redraws when another path changes the dictionary', async ($, on) => {
  const h = install(on, { ask: 'Allow', store: { 'dict:global': { version: 1, entries: [manual('Tailscale'), manual('Voice Polish'), manual('Kubernetes', undefined, 'learned')], rejected: [], candidates: [] } } })
  await start($)
  await $.command.run(command('dict'))
  const ui = await $.ui.mount(pane('voice-dict'))
  await $.tool.call({ tool: 'mcp__tidia__dictionary', action: 'dict_remove', word: 'Tailscale' } as never)
  expect(await ui.find({ type: 'Text', text: /^Tailscale/ })).toBeUndefined()
  await ui.press({ key: 'remove-global:=Voice Polish' })
  const d = h.stored('dict:global') as { entries: Array<{ meant: string }>; rejected: unknown[] }
  expect(d.entries.map(e => e.meant)).toEqual(['Kubernetes'])
  expect(d.rejected).toEqual([])
  await ui.unmount()
})

test('after /cd the project dictionary follows the new root', async ($, on) => {
  const h = install(on)
  await start($)
  await $.command.run(command('dict add Tailscale --project'))
  h.root = '/other'
  expect((await $.command.run(command('dict list'))).text).not.toContain('Tailscale')
  expect(h.store[projectKey('/repo')]).toBeDefined()
})
