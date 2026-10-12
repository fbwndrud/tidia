import { test, expect } from './kit'
import { install, start, command } from './harness'

test('/tidia with no argument reports the status in the session language', { options: { ui_language: 'auto' } }, async ($, on) => {
  install(on, { language: 'korean' })
  await start($)
  const r = await $.command.run(command(''))
  expect(r.text).toBe('Tidia 켜짐 · 정리 시점: pause · 스타일: polish · 영어 용어: auto · 바꾸기: /tidia set <설정> <값> (목록: /tidia settings)')
})

test('/tidia with an unknown argument explains the usage', async ($, on) => {
  install(on)
  await start($)
  const r = await $.command.run(command('zap'))
  expect(r.text).toBe('Unknown option "zap". Use: /tidia on | off | settings | set <setting> <value> | dict | rules')
})

test('/tidia set changes a setting through /config', async ($, on) => {
  const h = install(on)
  await start($)
  const r = await $.command.run(command('set english low'))
  expect(h.configSets).toEqual([{ key: 'tidia.english_terms', value: 'low' }])
  expect(r.text).toBe('Set english_terms to low. Tidia reloads with it.')
})

test('/tidia set explains a bad value or setting', async ($, on) => {
  const h = install(on)
  await start($)
  expect((await $.command.run(command('set english loud'))).text).toBe('english_terms takes auto | off | low | medium | high')
  expect((await $.command.run(command('set settle_ms 900'))).text).toContain('Unknown setting "settle_ms"')
  expect((await $.command.run(command('set colour red'))).text).toContain('Unknown setting "colour"')
  expect(h.configSets).toEqual([])
})

test('/tidia set reports a refused change', async ($, on) => {
  install(on, { configDeny: 'locked by policy' })
  await start($)
  expect((await $.command.run(command('set style minimal'))).text).toBe('Could not change style: locked by policy')
})

test('/tidia settings lists every setting with its value and choices', async ($, on) => {
  install(on)
  await start($)
  const text = (await $.command.run(command('settings'))).text ?? ''
  for (const line of ['polish_on = pause', 'debug = on', 'style = polish', 'english_terms = auto', 'model = sonnet', 'learn = ask', 'dictionary = on', 'attach_raw = on', 'ui_language = auto']) {
    expect(text).toContain(line)
  }
  expect(text).not.toContain('settle_ms')
  expect(text).toContain('auto | off | low | medium | high')
})

test('/tidia rules lists the rules with their condition, scope and on/off', async ($, on) => {
  install(on, { store: { 'rules:global': { version: 1, rules: [{ id: 'g1', text: 'Use bullet points', enabled: true, source: 'claude' }], starters: { 'starter-review': { enabled: false } } } } })
  await start($)
  const text = (await $.command.run(command('rules'))).text ?? ''
  expect(text).toContain('Output rules, 8')
  expect(text).toContain('g1 · Use bullet points — always · all projects · by Claude · on')
  expect(text).toContain("starter-review · Write it as two labeled lines in the dictation's language: what to review, what to look at. — when the dictation asks for a review · all projects · starter · off")
})
