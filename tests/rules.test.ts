import { test, expect } from './kit'
import { addRule, effectiveRules, emptyRules, isCurrentRules, MAX_RULES, parseRules, removeRule, ruleInput, ruleLines, showRule, STARTER_RULES, updateRule } from '../src/rules'

// A first dictation should come out as spoken, not reshaped: the person turns a starter on.
test('the starter rules are off until turned on; the shape ones are conditional, the registers always', () => {
  expect(STARTER_RULES.map(r => r.id)).toEqual(['starter-bug', 'starter-feature', 'starter-review', 'starter-steps', 'starter-polite', 'starter-casual', 'starter-as-spoken'])
  expect(ruleLines(effectiveRules(emptyRules(), emptyRules()))).toEqual([])
  const on = updateRule(emptyRules(), 'starter-bug', { enabled: true })!
  expect(on.rule.enabled).toBe(true)
  expect(ruleLines(effectiveRules(on.rules, emptyRules()))).toHaveLength(1)
  for (const r of STARTER_RULES) {
    expect(r.enabled).toBe(false)
    expect(r.source).toBe('starter')
    expect(`${r.id} ${typeof r.when}`).toBe(`${r.id} ${r.id.startsWith('starter-') && ['polite', 'casual', 'as-spoken'].some(x => r.id.endsWith(x)) ? 'undefined' : 'string'}`)
  }
})

test('ruleInput takes a rule of 1-300 characters and an optional condition of 1-200', () => {
  expect(ruleInput(' Number the steps ', undefined)).toEqual({ text: 'Number the steps' })
  expect(ruleInput('Number the steps', ' when listing tasks ')).toEqual({ text: 'Number the steps', when: 'when listing tasks' })
  expect(ruleInput('', undefined)).toBeNull()
  expect(ruleInput('x'.repeat(301), undefined)).toBeNull()
  expect(ruleInput('ok', 'y'.repeat(201))).toBeNull()
  expect(ruleInput('bad\u0007rule', undefined)).toBeNull()
  expect(ruleInput(3, undefined)).toBeNull()
  expect(ruleInput('ok', '')).toEqual({ text: 'ok' })
})

test('addRule gives scope-prefixed ids and stops at the limit', () => {
  let r = emptyRules()
  const a = addRule(r, 'global', { text: 'Use bullet points' }, 'user')
  if ('full' in a) throw new Error('full')
  expect(a.rule).toEqual({ id: 'g1', text: 'Use bullet points', enabled: true, source: 'user' })
  r = a.rules
  const b = addRule(r, 'global', { text: 'Be brief', when: 'when it is a question' }, 'claude')
  if ('full' in b) throw new Error('full')
  expect(b.rule.id).toBe('g2')
  const p = addRule(emptyRules(), 'project', { text: 'x' }, 'user')
  if ('full' in p) throw new Error('full')
  expect(p.rule.id).toBe('p1')
  let many = emptyRules()
  for (let i = 0; i < MAX_RULES; i++) {
    const next = addRule(many, 'global', { text: `rule ${i}` }, 'user')
    if ('full' in next) throw new Error('full early')
    many = next.rules
  }
  expect(addRule(many, 'global', { text: 'one more' }, 'user')).toEqual({ full: true })
})

test('updateRule changes text, condition and on/off; a starter only turns on or off', () => {
  const a = addRule(emptyRules(), 'global', { text: 'Use bullets', when: 'always?' }, 'user')
  if ('full' in a) throw new Error('full')
  const u = updateRule(a.rules, 'g1', { text: 'Use numbered lists', when: null, enabled: false })
  expect(u?.rule).toEqual({ id: 'g1', text: 'Use numbered lists', enabled: false, source: 'user' })
  const s = updateRule(emptyRules(), 'starter-bug', { enabled: false })
  expect(s?.rules.starters).toEqual({ 'starter-bug': { enabled: false } })
  expect(s?.rule.enabled).toBe(false)
  expect(updateRule(emptyRules(), 'starter-bug', { text: 'changed' })).toBeNull()
  expect(updateRule(emptyRules(), 'g9', { enabled: false })).toBeNull()
})

test('removeRule deletes own rules and turns a starter off', () => {
  const a = addRule(emptyRules(), 'global', { text: 'Use bullets' }, 'user')
  if ('full' in a) throw new Error('full')
  const r = removeRule(a.rules, 'g1')
  expect(r?.rules.rules).toEqual([])
  expect(r?.turnedOff).toBe(false)
  const s = removeRule(emptyRules(), 'starter-steps')
  expect(s?.turnedOff).toBe(true)
  expect(s?.rules.starters['starter-steps']).toEqual({ enabled: false })
  expect(removeRule(emptyRules(), 'nope')).toBeNull()
})

test('parseRules keeps valid rules and overrides and drops the rest', () => {
  expect(isCurrentRules({ version: 1, rules: [], starters: {} })).toBe(true)
  expect(isCurrentRules({ version: 2, rules: [] })).toBe(false)
  const parsed = parseRules({
    version: 1,
    rules: [{ id: 'g1', text: 'ok', enabled: true, source: 'user' }, { id: 'g2', text: '', enabled: true, source: 'user' }, { nope: 1 }],
    starters: { 'starter-bug': { enabled: false }, 'starter-unknown': { enabled: false }, 'starter-steps': { enabled: 'no' } },
  })
  expect(parsed.rules.map(r => r.id)).toEqual(['g1'])
  expect(parsed.starters).toEqual({ 'starter-bug': { enabled: false } })
  expect(parseRules(undefined)).toEqual(emptyRules())
})

test('effectiveRules orders project, global, starters and applies overrides; ruleLines numbers the enabled ones', () => {
  const g = addRule(emptyRules(), 'global', { text: 'Use bullets' }, 'user')
  const p = addRule(emptyRules(), 'project', { text: 'Mention the ticket', when: 'when a ticket number is said' }, 'user')
  if ('full' in g || 'full' in p) throw new Error('full')
  const on = ['starter-bug', 'starter-feature', 'starter-steps'].reduce((r, id) => updateRule(r, id, { enabled: true })!.rules, g.rules)
  const eff = effectiveRules(on, p.rules)
  expect(eff.map(r => `${r.scope}:${r.id}:${r.enabled}`)).toEqual([
    'project:p1:true', 'global:g1:true',
    'global:starter-bug:true', 'global:starter-feature:true', 'global:starter-review:false', 'global:starter-steps:true',
    'global:starter-polite:false', 'global:starter-casual:false', 'global:starter-as-spoken:false',
  ])
  const lines = ruleLines(eff)
  expect(lines[0]).toBe('Rule 1 (only when a ticket number is said): Mention the ticket')
  expect(lines[1]).toBe('Rule 2 (always): Use bullets')
  expect(lines).toHaveLength(5)
  expect(showRule(eff[0]!)).toBe('Mention the ticket — when a ticket number is said')
  expect(showRule(eff[1]!)).toBe('Use bullets — always')
})

// Eval 2026-10-10 (C16): "order it as" left a bug report as running sentences.
test('the starter bug, feature and review rules ask for labeled lines', () => {
  for (const id of ['starter-bug', 'starter-feature', 'starter-review']) {
    expect(`${id} ${STARTER_RULES.find(r => r.id === id)!.text}`).toContain('labeled lines')
  }
})

test('turning on one register starter turns the other two off', () => {
  let r = updateRule(emptyRules(), 'starter-polite', { enabled: true })!.rules
  r = updateRule(r, 'starter-casual', { enabled: true })!.rules
  expect(r.starters['starter-casual']?.enabled).toBe(true)
  expect(r.starters['starter-polite']?.enabled).toBe(false)
  expect(r.starters['starter-as-spoken']?.enabled).toBe(false)
  r = updateRule(r, 'starter-casual', { enabled: false })!.rules
  expect(r.starters['starter-polite']?.enabled).toBe(false)
})
