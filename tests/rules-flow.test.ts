import { test, expect } from './kit'
import { install, start, dictate, reply, enter } from './harness'

const FRAMES = ['로그인 버튼 누르면', '로그인 버튼 누르면 화면이 하얗게 돼', '로그인 버튼 누르면 화면이 하얗게 돼 새로고침하면 돌아오고 원래는 대시보드가 떠야 돼']
const BUG_ON = { 'rules:global': { version: 1, rules: [], starters: { 'starter-bug': { enabled: true } } } }

test('the cleanup gets the starter rules and the stored ones, project first', async ($, on) => {
  const h = install(on, {
    replies: [reply('정리됨 문장 하나 둘 셋')],
    store: {
      'rules:global': { version: 1, rules: [{ id: 'g1', text: 'Use bullet points', enabled: true, source: 'user' }], starters: { 'starter-bug': { enabled: true } } },
    },
  })
  await start($)
  await dictate(h, FRAMES)
  await h.clock.advance(1000)
  const s = h.systems[0]!
  expect(s).toContain('Rule 1 (always): Use bullet points')
  expect(s).toContain('Rule 2 (only when the dictation reports a bug')
  expect(s).not.toContain('asks for a review')
})

test('minimal sends no rules', { options: { style: 'minimal' } }, async ($, on) => {
  const h = install(on, { replies: [reply('로그인 버튼 누르면 화면이 하얗게 돼.')] })
  await start($)
  await dictate(h, FRAMES)
  await h.clock.advance(1000)
  expect(h.systems[0]).not.toContain('Output rules')
})

// A rule changes the layout, not how much the cleanup may add: the style keeps its limits,
// and only the line labels are layout.
test('a reply that applied a rule keeps the style limits, labels aside', async ($, on) => {
  const shaped = '- 증상: 로그인 버튼을 누르면 화면이 하얗게 돼.\n- 재현 방법: 새로고침하면 돌아와.\n- 기대 동작: 원래는 대시보드가 떠야 돼.'
  const h = install(on, { replies: [JSON.stringify({ text: shaped, fixes: [], rules: [1] })], store: BUG_ON })
  await start($)
  await dictate(h, FRAMES)
  await h.clock.advance(1000)
  await $.prompt.submit(enter(h))
  expect(h.submitted[0]?.text).toBe(shaped)
})

// Over the polish style's limits: unspoken words a rule did not spell out.
test('a reply that applied a rule may not add more than the style allows', async ($, on) => {
  const shaped = '- 증상: 로그인 버튼 누르면 화면이 하얗게 돼.\n- 기대: 새로고침하면 돌아오고 원래는 대시보드가 떠야 돼.\n- 추가: 결제 페이지와 설정 화면과 프로필 화면과 알림 화면도 전부 같이 확인하고 단위 테스트와 통합 테스트까지 꼭 추가해 줘.'
  const h = install(on, { replies: [JSON.stringify({ text: shaped, fixes: [], rules: [1] })], store: BUG_ON })
  await start($)
  await dictate(h, FRAMES)
  await h.clock.advance(1000)
  await $.prompt.submit(enter(h))
  expect(h.submitted[0]?.text).toBe(FRAMES[2])
})
