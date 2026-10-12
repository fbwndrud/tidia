import { test, expect } from './kit'
import { parseSet } from '../src/settings'

test('parseSet reads a choice by its name or alias', () => {
  expect(parseSet('english low')).toEqual({ ok: true, key: 'english_terms', value: 'low' })
  expect(parseSet('english_terms HIGH')).toEqual({ ok: true, key: 'english_terms', value: 'high' })
  expect(parseSet('style minimal')).toEqual({ ok: true, key: 'style', value: 'minimal' })
  expect(parseSet('style light')).toEqual({ ok: false, error: 'value', key: 'style' })
  expect(parseSet('labels 글/할 일')).toEqual({ ok: true, key: 'bubble_labels', value: '글/할 일' })
})

test('parseSet reads switches', () => {
  expect(parseSet('raw off')).toEqual({ ok: true, key: 'attach_raw', value: false })
  expect(parseSet('attach_raw on')).toEqual({ ok: true, key: 'attach_raw', value: true })
})

test('parseSet explains what is wrong', () => {
  expect(parseSet('')).toEqual({ ok: false, error: 'usage' })
  expect(parseSet('colour red')).toEqual({ ok: false, error: 'key', key: 'colour' })
  expect(parseSet('english loud')).toEqual({ ok: false, error: 'value', key: 'english_terms' })
  // settle_ms is internal since 0.1.
  expect(parseSet('settle_ms 1200')).toEqual({ ok: false, error: 'key', key: 'settle_ms' })
})

test('learn is a setting with ask and off', () => {
  expect(parseSet('learn off')).toEqual({ ok: true, key: 'learn', value: 'off' })
  expect(parseSet('learn maybe')).toEqual({ ok: false, error: 'value', key: 'learn' })
})

test('polish_on, message_view and debug are settings', () => {
  expect(parseSet('polish_on pause')).toEqual({ ok: true, key: 'polish_on', value: 'pause' })
  expect(parseSet('message_view labeled')).toEqual({ ok: true, key: 'message_view', value: 'labeled' })
  expect(parseSet('bubble full')).toEqual({ ok: true, key: 'message_view', value: 'full' })
  expect(parseSet('message_view bright')).toEqual({ ok: false, error: 'value', key: 'message_view' })
  expect(parseSet('debug on')).toEqual({ ok: true, key: 'debug', value: true })
})

test('bubble_labels takes the rest of the line as free text, and none clears it', () => {
  expect(parseSet('labels none')).toEqual({ ok: true, key: 'bubble_labels', value: '' })
  expect(parseSet('bubble_labels')).toEqual({ ok: false, error: 'usage' })
  expect(parseSet(`bubble_labels ${'가'.repeat(81)}`)).toEqual({ ok: false, error: 'value', key: 'bubble_labels' })
})

// 0.1.21 moved them into output rules.
test('tone, tone_note and custom_note are gone', () => {
  for (const key of ['tone', 'tone_note', 'custom_note']) expect(parseSet(`${key} x`)).toEqual({ ok: false, error: 'key', key })
})

// 0.1.5 folded format into style.
test('style takes polish and minimal; format is gone', () => {
  expect(parseSet('style polish')).toEqual({ ok: true, key: 'style', value: 'polish' })
  expect(parseSet('style prompt')).toEqual({ ok: false, error: 'value', key: 'style' })
  expect(parseSet('format always')).toEqual({ ok: false, error: 'key', key: 'format' })
})

