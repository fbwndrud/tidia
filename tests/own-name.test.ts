import { test, expect } from './kit'
import { install, start, dictate, reply } from './harness'

// Speech recognition writes the product's name the way it sounds; the cleanup must know the
// spelling even with an empty dictionary, or "티디아 잠깐 꺼 줘" reaches Claude without the name.
test('the name said in Korean reaches the model as a mishearing of Tidia', async ($, on) => {
  const h = install(on, { replies: [reply('Tidia 잠깐 꺼 줘.')] })
  await start($)
  await dictate(h, ['음 티디아', '음 티디아 잠깐 꺼 줘'])
  await h.clock.advance(1000)
  expect(h.payloads[0]?.known_mishearings).toEqual([{ heard: '티디아', meant: 'Tidia' }])
})

// Speech recognition most often writes 티디아 as 피디아 or 피디야 (heard in live tests).
test('the name heard as 피디야 reaches the model as a mishearing of Tidia', async ($, on) => {
  const h = install(on, { replies: [reply('Tidia 잠깐 꺼 줘.')] })
  await start($)
  await dictate(h, ['피디야', '피디야 잠깐 꺼 줘'])
  await h.clock.advance(1000)
  expect(h.payloads[0]?.known_mishearings).toEqual([{ heard: '피디야', meant: 'Tidia' }])
})

test('the name is sent as a hint even with the dictionary off', { options: { dictionary: false } }, async ($, on) => {
  const h = install(on, { replies: [reply('ok')] })
  await start($)
  await dictate(h, ['음 ティディア', '음 ティディア をオフにして'])
  await h.clock.advance(1000)
  expect(h.payloads[0]?.known_mishearings).toEqual([{ heard: 'ティディア', meant: 'Tidia' }])
})

test('a dictation that does not say the name gets no name hint', async ($, on) => {
  const h = install(on, { replies: [reply('ok')] })
  await start($)
  await dictate(h, ['음 테일스케일', '음 테일스케일 같은 기능을 우리 앱에도 넣어 줘'])
  await h.clock.advance(1000)
  expect(h.payloads[0]?.known_mishearings).toEqual([])
  expect(h.payloads[0]?.preferred_terms).toEqual([])
})

test('an English dictation that sounds like the name gets it as a preferred term', async ($, on) => {
  const h = install(on, { replies: [reply('ok')] })
  await start($)
  await dictate(h, ['so tidia', 'so tidia turn off for now please'])
  await h.clock.advance(1000)
  expect(h.payloads[0]?.preferred_terms).toEqual(['Tidia'])
})
