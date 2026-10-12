import type { Elements, RenderElement } from 'claude-code'
import type { Locale } from '../config'
import { t } from '../i18n'

// The terminal's and the desktop's tables take the same props for these elements.
export type PaneEls = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button' | 'Input'>

// `key` names what the row shows (scope, heard form, meaning), never its position, so a press
// after the dictionary changed still acts on the entry it drew.
export type PaneRow = { key: string; text: string }
// A rule row: `key` is `rule:<id>`; starter rules turn on and off but are not removed.
export type PaneRule = { key: string; text: string; enabled: boolean; removable: boolean }
export type PaneModel = { entries: PaneRow[]; candidates: PaneRow[]; proposals: PaneRow[]; rules: PaneRule[]; more: number; message: string | null }

export type PaneActions = {
  add: (text: string) => void
  remove: (key: string) => void
  approve: (key: string) => void
  dismiss: (key: string) => void
  propose: (key: string) => void
  proposeAll: () => void
  skipProposals: () => void
  toggleRule: (key: string) => void
  removeRule: (key: string) => void
  close: () => void
}

// The dictionary pane: an input to add or edit, the entries with Remove, and the words
// corrected once with Add and Never.
export function renderDictPane(els: PaneEls, model: PaneModel, locale: Locale, act: PaneActions): RenderElement {
  const { Box, Text, Button, Input } = els
  // Buttons lead each row and the text gives way, so a long entry never pushes them out of a narrow pane.
  const line = (text: string) => Text({ wrap: 'truncate-end', children: [text] })
  const rows: RenderElement[] = [
    Input({ key: 'add', autoFocus: true, label: t(locale, 'pane_add_label'), placeholder: t(locale, 'pane_add_hint'), submitLabel: t(locale, 'pane_add_label'), onSubmit: value => act.add(value) }),
  ]
  if (model.message) rows.push(Text({ dimColor: true, children: [model.message] }))
  if (model.proposals.length > 0) {
    rows.push(Text({ bold: true, children: [t(locale, 'pane_proposals')] }))
    rows.push(Box({
      key: 'proposal-actions',
      flexDirection: 'row',
      columnGap: 2,
      children: [
        Button({ key: 'propose-all', label: t(locale, 'pane_add_all'), plain: true, variant: 'primary', onPress: act.proposeAll }),
        Button({ key: 'propose-skip', label: t(locale, 'pane_skip_all'), plain: true, dimColor: true, onPress: act.skipProposals }),
      ],
    }))
    for (const p of model.proposals) {
      rows.push(Box({
        key: `proposal-${p.key}`,
        flexDirection: 'row',
        columnGap: 2,
        children: [Button({ key: `proposal-add-${p.key}`, label: t(locale, 'learn_add'), plain: true, onPress: () => act.propose(p.key) }), line(p.text)],
      }))
    }
  }
  rows.push(Text({ bold: true, children: [t(locale, 'pane_entries', { count: String(model.entries.length + model.more) })] }))
  for (const r of model.entries) {
    rows.push(Box({
      key: `row-${r.key}`,
      flexDirection: 'row',
      columnGap: 2,
      children: [Button({ key: `remove-${r.key}`, label: t(locale, 'pane_remove'), plain: true, dimColor: true, onPress: () => act.remove(r.key) }), line(r.text)],
    }))
  }
  if (model.more > 0) rows.push(Text({ dimColor: true, children: [t(locale, 'pane_more', { count: String(model.more) })] }))
  if (model.candidates.length > 0) {
    rows.push(Text({ bold: true, children: [t(locale, 'pane_candidates')] }))
    for (const c of model.candidates) {
      rows.push(Box({
        key: `candidate-${c.key}`,
        flexDirection: 'row',
        columnGap: 2,
        children: [
          Button({ key: `approve-${c.key}`, label: t(locale, 'learn_add'), plain: true, onPress: () => act.approve(c.key) }),
          Button({ key: `dismiss-${c.key}`, label: t(locale, 'pane_dismiss'), plain: true, dimColor: true, onPress: () => act.dismiss(c.key) }),
          line(c.text),
        ],
      }))
    }
  }
  rows.push(Text({ bold: true, children: [t(locale, 'pane_rules', { count: String(model.rules.length) })] }))
  for (const r of model.rules) {
    const id = r.key.slice('rule:'.length)
    rows.push(Box({
      key: `row-${r.key}`,
      flexDirection: 'row',
      columnGap: 2,
      children: [
        Button({ key: `rule-toggle-${id}`, label: t(locale, r.enabled ? 'pane_rule_turn_off' : 'pane_rule_turn_on'), plain: true, onPress: () => act.toggleRule(r.key) }),
        ...(r.removable ? [Button({ key: `rule-remove-${id}`, label: t(locale, 'pane_remove'), plain: true, dimColor: true, onPress: () => act.removeRule(r.key) })] : []),
        line(r.enabled ? r.text : `${r.text} · ${t(locale, 'rule_off')}`),
      ],
    }))
  }
  rows.push(Button({ key: 'close', label: t(locale, 'pane_close'), hotkey: 'q', plain: true, dimColor: true, role: 'dismiss', onPress: act.close }))
  return Box({ key: 'dict-pane', flexDirection: 'column', rowGap: 0, children: rows })
}
