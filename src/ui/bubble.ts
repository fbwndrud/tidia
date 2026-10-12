import type { SentNote } from '../../types'
import type { MessageView } from '../config'

export type LabelKind = 'prose' | 'list' | 'minimal'
const LABEL_KINDS: readonly LabelKind[] = ['prose', 'list', 'minimal']

// The person's own words for what Tidia did, 'prose/list/minimal' (bubble_labels); a part left
// empty, or missing, keeps the interface language's word.
export function customLabels(setting: string): Partial<Record<LabelKind, string>> {
  const parts = setting.split('/').map(p => p.trim())
  const labels: Partial<Record<LabelKind, string>> = {}
  LABEL_KINDS.forEach((kind, i) => {
    const word = parts[i]
    if (word) labels[kind] = word
  })
  return labels
}

// The text of the person's row for a message tidied at Enter: the message sent, under what Tidia
// did (labeled), under what they said (full). The engine draws it in its own row, so the desktop
// bubble keeps its time, copy, rewind and fork controls; a tree of the mod's own drew without them
// (desktop, 2026-10-11).
export function bubbleText(note: SentNote, view: MessageView): string {
  const sent = note.sent.split('\n').filter(l => l.trim() !== '').join('\n')
  if (view === 'tidied') return sent
  const labeled = `→ ${note.mode}\n${sent}`
  return view === 'full' ? `${note.said}\n\n${labeled}` : labeled
}

// The text the person's row shows: the cleanup's, when the row carries a prompt Tidia tidied at
// Enter; null keeps the engine's own. The desktop draws a live row from the prompt as dictated and
// the terminal from the message sent; a row drawn again from the transcript holds the message sent.
// Every session shares the notes, so a row only takes one sent in its own session.
export function sentRowText(notes: readonly SentNote[] | null, row: { text: string; session?: string | null }, view: MessageView): string | null {
  const text = row.text.trim()
  const ours = (n: SentNote) => n.session === undefined || row.session == null || n.session === row.session
  const note = notes?.find(n => ours(n) && (n.said.trim() === text || n.sent.trim() === text))
  return note ? bubbleText(note, view) : null
}

// The notes kept in $.store; anything malformed is dropped.
export function parseNotes(value: unknown): SentNote[] {
  if (!Array.isArray(value)) return []
  return value.filter((n): n is SentNote => n !== null && typeof n === 'object' && typeof n.said === 'string' && typeof n.sent === 'string' && typeof n.mode === 'string' && (n.session === undefined || typeof n.session === 'string'))
}

// A message this long is drawn from the state while the session lasts, not kept in the store.
export const NOTE_STORE_CHARS = 4000
export const SENT_NOTES = 50

// The notes with one put first: one for the same prompt in the same session is replaced.
export function withNote(notes: readonly SentNote[], note: SentNote): SentNote[] {
  return [note, ...notes.filter(n => !(n.said === note.said && n.session === note.session))].slice(0, SENT_NOTES)
}

export const storable = (n: SentNote) => n.said.length + n.sent.length <= NOTE_STORE_CHARS
