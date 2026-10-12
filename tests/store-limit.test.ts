import { test, expect } from './kit'
import { install, start, command } from './harness'

const NOW = '2026-10-11T00:00:00.000Z'
const entry = (meant: string, source: string, lastSeen = NOW) => ({ meant, source, confirmations: 0, rejections: 0, uses: 0, lastSeen })
const dict = (entries: unknown[]) => ({ version: 1, entries, rejected: [], candidates: [] })
const meants = (d: unknown) => (d as { entries: Array<{ meant: string }> }).entries.map(e => e.meant)
const learned = (n: number, lastSeen: string) => Array.from({ length: n }, (_, i) => entry(`Learned${i}`, 'learned', lastSeen))

// Claude Code keeps every project's dictionary in one store of at most 4 MiB.
test('a full store makes room from the least recently used project, dropping learned words only', async ($, on) => {
  const store = {
    'dict:project:old': dict([...learned(40, '2025-01-01T00:00:00.000Z'), entry('TypedOld', 'manual', '2025-01-01T00:00:00.000Z')]),
    'dict:project:new': dict([...learned(40, '2026-09-01T00:00:00.000Z'), entry('TypedNew', 'manual', '2026-09-01T00:00:00.000Z')]),
  }
  const h = install(on, { store, storeLimit: JSON.stringify(store).length + 50 })
  await start($)
  expect((await $.command.run(command('dict add Gemma'))).text).toContain('Gemma')
  expect(meants(h.stored('dict:global'))).toEqual(['Gemma'])
  expect(meants(h.stored('dict:project:old'))).toEqual(['TypedOld'])
  expect(meants(h.stored('dict:project:new'))).toHaveLength(41)
})

test('a store full of typed words says what is full and what to do', async ($, on) => {
  const store = { 'dict:project:old': dict(Array.from({ length: 40 }, (_, i) => entry(`Typed${i}`, 'manual'))) }
  const h = install(on, { store, storeLimit: JSON.stringify(store).length + 50 })
  await start($)
  const text = (await $.command.run(command('dict add Gemma'))).text!
  expect(text).toContain("Tidia's storage is full")
  expect(text).not.toContain('$.store')
  expect(h.stored('dict:global')).toBeUndefined()
  expect(meants(h.stored('dict:project:old'))).toHaveLength(40)
})

test('an engine refusal reaches the person without the call it came from', async ($, on) => {
  install(on, { storeFails: 'the disk is read-only' })
  await start($)
  expect((await $.command.run(command('dict add Gemma'))).text).toBe('Could not save the dictionary: the disk is read-only')
})

test('a full store drops the bubble notes before any learned word', async ($, on) => {
  const store = {
    'sent-notes': Array.from({ length: 20 }, (_, i) => ({ said: `said ${i} `.repeat(10), sent: `sent ${i}`, mode: 'list' })),
    'dict:project:old': dict(learned(5, '2025-01-01T00:00:00.000Z')),
  }
  const h = install(on, { store, storeLimit: JSON.stringify(store).length + 50 })
  await start($)
  expect((await $.command.run(command('dict add Gemma'))).text).toContain('Gemma')
  expect(h.stored('sent-notes')).toEqual([])
  expect(meants(h.stored('dict:project:old'))).toHaveLength(5)
})
