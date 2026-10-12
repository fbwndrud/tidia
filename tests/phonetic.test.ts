import { test, expect } from './kit'
import { closeness, romanize, skeleton } from '../src/dict/phonetic'

test('romanize spells Hangul, kana and Cyrillic in Latin letters', () => {
  expect(romanize('테일스케일')).toBe('teilseukeil')
  expect(romanize('テイルスケール')).toBe('teirusukeru')
  expect(romanize('реакт')).toBe('reakt')
})

test('skeleton keeps folded consonants only', () => {
  expect(skeleton('테일스케일')).toBe('tlskl')
  expect(skeleton('Tailscale')).toBe('tlskl')
  expect(skeleton('voice polish')).toBe(skeleton('보이스 플래시'))
})

test('closeness finds a term spoken phonetically inside a dictation', () => {
  expect(closeness('음 테일스케일 같은 기능을 넣어 줘', 'Tailscale')).toBeGreaterThanOrEqual(0.6)
  expect(closeness('어 보이스 플래시 설정 화면', 'Voice Polish')).toBeGreaterThanOrEqual(0.8)
  expect(closeness('えっと、テイルスケールみたいな機能', 'Tailscale')).toBeGreaterThanOrEqual(0.6)
  expect(closeness('이 파일 모두 고쳐 줘', '모두')).toBe(1)
})

test('closeness stays low for unrelated words', () => {
  expect(closeness('로그인 페이지를 고쳐 줘', 'Tailscale')).toBeLessThan(0.6)
  expect(closeness('fix the login page', 'Kubernetes')).toBeLessThan(0.6)
})

test('closeness ignores short terms inside longer words and needs a close sound for short skeletons', () => {
  expect(closeness('please fix the login page again', 'AI')).toBe(0)
  expect(closeness('that looks good to me', 'Go')).toBe(0)
  expect(closeness('Tailscale를 써 보자', 'Tailscale')).toBe(1)
  const terms = ['React', 'Zod', 'Redis', 'Kafka', 'Jest', 'Vite', 'Docker', 'Prisma', 'Tailwind', 'Nginx', 'Kotlin', 'Swift', 'Rust', 'Deno', 'Bun', 'Vue', 'Svelte', 'Angular', 'Django', 'Flask', 'Rails', 'Laravel', 'Spring', 'GraphQL', 'Postgres', 'MongoDB', 'Terraform']
  const sent = 'please fix the login page again and rerun the tests before you push the branch'
  expect(terms.filter(t => closeness(sent, t) >= 0.6).length).toBeLessThanOrEqual(2)
  const ko = '로그인 페이지 다시 고치고 테스트 돌린 다음에 브랜치 올려 줘'
  expect(terms.filter(t => closeness(ko, t) >= 0.6).length).toBeLessThanOrEqual(2)
})
