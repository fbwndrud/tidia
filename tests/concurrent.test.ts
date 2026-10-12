import { test, expect } from './kit'
import { install, start, command } from './harness'
import { dropEntry, emptyDict, rebase, upsert, type Dict } from '../src/dict/dict'

const NOW = '2026-10-11T00:00:00.000Z'
const add = (d: Dict, meant: string, heard?: string) => upsert(d, { ...(heard ? { heard } : {}), meant }, 'manual', NOW).dict
const meants = (d: Dict) => d.entries.map(e => `${e.heard ?? ''}>${e.meant}`)

test('rebase applies our additions on top of what another session wrote', () => {
  const base = add(emptyDict(), 'Tailscale', '테일스캐일')
  const ours = add(base, 'Alpha')
  const theirs = add(base, 'Beta')
  expect(meants(rebase(theirs, base, ours))).toEqual(['테일스캐일>Tailscale', '>Beta', '>Alpha'])
})

test('rebase applies our removals and changes, and keeps what we did not touch', () => {
  const base = add(add(emptyDict(), 'Tailscale', '테일스캐일'), 'Tailscan', '테일스케일')
  const ours = add(dropEntry(base, { heard: '테일스캐일', meant: 'Tailscale' }), 'Tidia', '테일스케일')
  const theirs = add(base, 'Beta')
  expect(meants(rebase(theirs, base, ours))).toEqual(['테일스케일>Tidia', '>Beta'])
})

test('rebase changes nothing when our change is already there', () => {
  const base = emptyDict()
  const ours = add(base, 'Alpha')
  const later = add(ours, 'Beta')
  expect(rebase(later, base, ours)).toEqual(later)
})

test('rebase carries the rejected words we added', () => {
  const base = { ...emptyDict(), entries: [{ heard: '테일스캐일', meant: 'Tailscale', source: 'learned' as const, confirmations: 0, rejections: 0, uses: 0, lastSeen: NOW }] }
  const ours = dropEntry(base, { heard: '테일스캐일', meant: 'Tailscale' })
  const theirs = add(base, 'Beta')
  const merged = rebase(theirs, base, ours)
  expect(meants(merged)).toEqual(['>Beta'])
  expect(merged.rejected).toEqual([{ heard: '테일스캐일', meant: 'Tailscale' }])
})

// Two Claude Code sessions share the store, which has no lock: both read, both write, and the later
// write drops the other's change unless it is put back.
test('an entry another session overwrote is written again on top of theirs', async ($, on) => {
  const h = install(on)
  await start($)
  await $.command.run(command('dict add Alpha'))
  // The other session read the empty dictionary before our write and wrote after it.
  h.store['dict:global'] = add(emptyDict(), 'Beta')
  await h.clock.advance(10_000)
  expect(meants(h.stored('dict:global') as Dict)).toEqual(['>Beta', '>Alpha'])
})

test('a write no one else touched is left alone', async ($, on) => {
  const h = install(on)
  await start($)
  await $.command.run(command('dict add Alpha'))
  const written = JSON.stringify(h.stored('dict:global'))
  await h.clock.advance(10_000)
  expect(JSON.stringify(h.stored('dict:global'))).toBe(written)
})
