
export type BandView =
  | { kind: 'polishing'; id: number }
  | { kind: 'failed'; id: number }
  | { kind: 'ready'; id: number; text: string }
  | { kind: 'sending'; id: number }
  | { kind: 'learned'; id: number; heard?: string; meant: string }

// A message tidied at Enter, for its desktop bubble: the prompt as dictated (what the bubble
// carries live), the message sent (what it carries when drawn again from the transcript), what it
// became ("list", "list · rules applied"), and the session it was sent in.
export type SentNote = { said: string; sent: string; mode: string; session?: string }

// What outlives a reload of the mod's code: /tidia off, and the person's recent messages.
export type SessionKeep = { enabled: boolean; said: Array<{ text: string; raw: string | null }> }

// The arguments of the mod's own tools (dictionary, rules, settings), as the model passes them (flat, beside `tool`).
export type TidiaToolInput = {
  action: 'dict_list' | 'dict_add' | 'dict_remove' | 'rule_list' | 'rule_add' | 'rule_update' | 'rule_remove' | 'setting_get' | 'setting_set' | 'off' | 'on'
  heard?: string
  meant?: string
  word?: string
  scope?: 'global' | 'project'
  id?: string
  text?: string
  when?: string
  enabled?: boolean
  key?: string
  value?: string
}

declare module 'claude-code' {
  interface PluginState {
    'tidia': { view: BandView | null; dictPane: { version: number; message: string | null } | null; sent: SentNote[] | null; session: SessionKeep | null }
  }
  interface McpToolInputs {
    'mcp__tidia__dictionary': TidiaToolInput
    'mcp__tidia__rules': TidiaToolInput
    'mcp__tidia__settings': TidiaToolInput
  }
}
