import { mock, type Engine, type MockClock } from 'claude-code/testing'
import type { On, PromptEditInput, PromptEditResult } from 'claude-code'

export type Harness = {
  draft: string
  filled: string[]
  submitted: Array<{ text: string; context?: readonly string[] }>
  replies: string[]
  modelCalls: number
  // The `dictated` field of each cleanup request, in order.
  dictated: string[]
  // Each cleanup request's data, parsed.
  payloads: Array<Record<string, unknown>>
  // Each model call's system prompt, in order.
  systems: string[]
  // The conversation `$.session.messages()` returns, and the user turns so far.
  messages: Array<{ role: 'user' | 'assistant'; text: string }>
  turns: number
  // What `$.store` holds, by key.
  store: Record<string, unknown>
  stored: (key: string) => unknown
  tools: unknown[]
  asked: string[]
  // The session's project root; a test moves it as /cd would.
  root: string
  // What $.fs holds, written files included.
  files: Record<string, string>
  // Panes the mod opened, by id.
  opened: string[]
  logs: string[]
  configSets: Array<{ key: string; value: unknown }>
  hold: boolean
  release: () => void
  clock: MockClock
  // The props each ui.render reached the engine with, by component.
  rendered: Array<{ component: string; props: Record<string, unknown> }>
}

const USAGE = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

// Answers every engine call the mod makes, from memory. A `$` call (an op) is answered
// as { value }; an event (session.start, prompt.fill, prompt.edit, prompt.submit, ui.render) with its result.
export function install(on: On, opts: {
  draft?: string
  replies?: string[]
  language?: string
  modelThrows?: boolean
  configDeny?: string
  store?: Record<string, unknown>
  storeFails?: string
  // The engine's cap on the whole store, in characters of JSON text (4 MiB in Claude Code).
  storeLimit?: number
  storeReadFails?: string
  messages?: Array<{ role: 'user' | 'assistant'; text: string }>
  paneRefused?: string
  // Files by absolute path, for $.fs; folders are implied by the paths.
  files?: Record<string, string>
  // The label $.ui.ask resolves to; absent, the dialog is dismissed.
  ask?: string
  // Claude Code's voice settings: tap mode and autoSubmit send the transcript as it lands.
  voice?: { mode?: 'hold' | 'tap'; autoSubmit?: boolean }
  // The engine's permission verdict for any tool call (default: ask).
  check?: { decision: 'allow' | 'ask' | 'deny'; reason?: string }
  git?: string
  // Paths that are symbolic links.
  links?: string[]
  // The prompt takes no fill, as under an open dialog.
  fillRefused?: boolean
  // What $.session.surfaces() answers (default: none, as in a -p run).
  surfaces?: Array<'terminal' | 'desktop' | 'vscode'>
  // What $.session.id() answers.
  sessionId?: string
  // Tidia's options as settings.json keeps them (pluginConfigs), older versions' included.
  saved?: Record<string, unknown>
} = {}): Harness {
  // Held model calls, oldest first: release() lets the oldest answer.
  const held: Array<() => void> = []
  const h: Harness = {
    draft: opts.draft ?? '',
    filled: [],
    submitted: [],
    replies: [...(opts.replies ?? [])],
    modelCalls: 0,
    dictated: [],
    payloads: [],
    systems: [],
    messages: [...(opts.messages ?? [])],
    turns: 0,
    store: JSON.parse(JSON.stringify(opts.store ?? {})) as Record<string, unknown>,
    stored: key => h.store[key],
    tools: [],
    opened: [],
    asked: [],
    root: '/repo',
    files: { ...(opts.files ?? {}) },
    logs: [],
    configSets: [],
    hold: false,
    release: () => held.shift()?.(),
    clock: mock.clock(on),
    rendered: [],
  }
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('settings.read', () => ({ value: { language: opts.language ?? 'en', ...(opts.voice ? { voice: opts.voice } : {}), ...(opts.saved ? { pluginConfigs: { 'tidia@tidia': { options: opts.saved } } } : {}) } }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('config.set', (_$, e) => {
    if (opts.configDeny) return { deny: opts.configDeny }
    h.configSets.push({ key: e.key, value: e.value })
    return { value: e.value }
  })
  on('store.get', (_$, e) => (opts.storeReadFails ? { deny: opts.storeReadFails } : { value: h.store[e.key] }))
  on('store.keys', () => ({ value: Object.keys(h.store) }))
  on('store.set', (_$, e) => {
    if (opts.storeFails) return { deny: opts.storeFails }
    const size = JSON.stringify({ ...h.store, [e.key]: e.value }).length
    if (opts.storeLimit !== undefined && size > opts.storeLimit) return { deny: `the store would be ${size} characters, over the ${opts.storeLimit} limit` }
    h.store[e.key] = JSON.parse(JSON.stringify(e.value))
    return { value: undefined }
  })
  on('session.surfaces', () => ({ value: opts.surfaces ?? [] }))
  on('session.id', () => ({ value: opts.sessionId ?? 'session-1' }))
  on('session.turns', () => ({ value: h.turns }))
  on('session.messages', () => ({ value: h.messages.map(m => ({ ...m, toolUses: [] })) }))
  // The engine's own verdict for a tool call: ask, as in the default permission mode.
  on('tool.check', () => opts.check ?? { decision: 'ask' as const })
  on('tool.register', (_$, e) => {
    h.tools.push(e)
    return { value: { tool: `mcp__tidia__${e.name}` } }
  })
  const files = h.files
  on('session.root', () => ({ value: h.root }))
  on('env.get', (_$, e) => ({ value: e.name === 'HOME' ? '/home/me' : undefined }))
  on('fs.exists', (_$, e) => ({ value: e.path in files || Object.keys(files).some(f => f.startsWith(`${e.path}/`)) }))
  on('fs.read', (_$, e) => (e.path in files ? { value: files[e.path]! } : { deny: `ENOENT: ${e.path}` }))
  on('fs.list', (_$, e) => {
    const dir = (e.path ?? '/repo').replace(/\/$/, '')
    const names = new Map<string, 'file' | 'dir'>()
    for (const f of Object.keys(files)) {
      if (!f.startsWith(`${dir}/`)) continue
      const rest = f.slice(dir.length + 1)
      const name = rest.split('/')[0]!
      names.set(name, rest.includes('/') ? 'dir' : 'file')
    }
    if (names.size === 0) return { deny: `ENOENT: ${dir}` }
    return { value: [...names].map(([name, kind], i) => ({ name, kind, size: files[`${dir}/${name}`]?.length ?? 0, mtimeMs: 1000 + i, isLink: false })) }
  })
  on('fs.stat', (_$, e) => (e.path in files
    ? { value: { kind: 'file' as const, size: files[e.path]!.length, mtimeMs: 1000, isLink: (opts.links ?? []).includes(e.path) } }
    : { deny: `ENOENT: ${e.path}` }))
  on('fs.write', (_$, e) => {
    files[e.path] = e.text
    return { value: undefined }
  })
  on('process.run', () => ({ value: { exitCode: 0, stdout: opts.git ?? '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('tool.call', (_$, e) => {
    if (e.tool !== 'AskUserQuestion') return { deny: 'no such tool in the test' }
    const q = (e as unknown as { questions: Array<{ question: string }> }).questions[0]!.question
    h.asked.push(q)
    if (opts.ask === undefined) return { deny: 'dismissed' }
    return { result: { questions: [], answers: { [q]: opts.ask } } } as never
  })
  on('ui.open', (_$, e) => {
    if (opts.paneRefused) return { value: { isPlaced: false, reason: opts.paneRefused } }
    h.opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_$, e) => {
    h.opened = h.opened.filter(id => id !== e.id)
    return { value: undefined }
  })
  on('prompt.read', () => ({ value: { text: h.draft, cursor: h.draft.length } }))
  on('prompt.fill', (_$, e) => {
    if (opts.fillRefused) return { isFilled: false }
    h.draft = e.text
    h.filled.push(e.text)
    return { isFilled: true }
  })
  on('prompt.edit', (_$, e) => {
    const text = e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end)
    h.draft = text
    return { text, cursor: e.start + e.inputText.length }
  })
  on('prompt.submit', (_$, e) => {
    h.submitted.push({ text: e.text, context: e.context })
    // Only the person's own Enter empties the prompt; a notification or peer message leaves it.
    if (e.origin.kind === 'composer') h.draft = ''
    return { text: e.text, context: e.context }
  })
  on('model.complete', async (_$, e) => {
    h.modelCalls += 1
    const payload = JSON.parse(e.prompt) as Record<string, unknown> & { dictated: string }
    h.dictated.push(payload.dictated)
    h.payloads.push(payload)
    h.systems.push(e.system ?? '')
    if (opts.modelThrows) throw new Error('boom')
    if (h.hold) await new Promise<void>(resolve => { held.push(resolve) })
    const text = h.replies.shift()
    return {
      value: text === undefined
        ? { isAnswered: false, reason: 'empty-reply', usage: USAGE }
        : { isAnswered: true, text, usage: USAGE },
    }
  })
  on('ui.log', (_$, e) => {
    // The transcript's lines only: a debug-log line never reaches the screen.
    if (e.to !== 'debug') h.logs.push(e.text)
    return { value: undefined }
  })
  on('ui.render', ($, e) => {
    h.rendered.push({ component: e.component, props: e.props as Record<string, unknown> })
    const { Box } = $.ui.resolve(e)
    return Box({})
  })
  return h
}

export async function start($: { session: { start: (e: { cwd: string; surface: 'terminal'; isInteractive: boolean }) => Promise<unknown> } }): Promise<void> {
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
}

// Sets the prompt to each frame in turn, one poll apart, as dictation streams in.
export async function dictate(h: Harness, frames: readonly string[], stepMs = 250): Promise<void> {
  for (const frame of frames) {
    h.draft = frame
    await h.clock.advance(stepMs)
  }
}

// Enter in the composer: the engine empties the prompt before the submit hooks run.
export function enter(h: Harness, text = h.draft) {
  h.draft = ''
  return { text, wait: false, origin: { kind: 'composer' as const } }
}

export function reply(text: string, fixes: Array<{ from: string; to: string; confidence?: 'high' | 'low' }> = []): string {
  return JSON.stringify({ text, fixes: fixes.map(f => ({ confidence: 'high', ...f })) })
}

export const BAND = {
  plugin: 'tidia',
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 80, scroll: { offset: 0, bodyRows: 12 }, view: {} },
}

export function pane(id: string) {
  return {
    plugin: 'tidia',
    surface: 'terminal' as const,
    component: 'Pane' as const,
    requestId: id,
    props: { title: id, isFocused: true, bodyColumns: 80, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} },
  }
}

export function command(args: string) {
  return { command: 'tidia', args, origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 80 } }
}

// The engine raises prompt.edit for every keystroke, but the test kit's `$` types do not list it.
export function edit($: Engine, input: PromptEditInput): Promise<PromptEditResult> {
  return ($.prompt as unknown as { edit: (e: PromptEditInput) => Promise<PromptEditResult> }).edit(input)
}
