import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderSurface } from 'claude-code'
import type { BandView, SentNote, SessionKeep } from '../types'
import { buildRequest, cleanTimeout, parseReply, type Cleaned } from '../src/cleaner'
import { parseConfig, resolveLocale, type Config, type Locale, type Style } from '../src/config'
import { initial, MIN_WORDS, step, type DetectorEvent, type DetectorState } from '../src/detector'
import { dropEntry, emptyDict, rebase, removalTargets, saidIn, sameKey, entryInput, GLOBAL_KEY, isCurrentDict, MAX_ENTRIES, parseAddArgs, parseDict, pickHints, projectKey, removeWord, showEntry, upsert, withOwnName, type Dict, type Entry, type EntryInput, type Scope, type Source } from '../src/dict/dict'
import { harvest, looksSecret, parseTerms, refineRequest, transcriptPrompts } from '../src/dict/build'
import { alike } from '../src/dict/phonetic'
import { addRule, effectiveRules, STARTER_IDS, emptyRules, isCurrentRules, MAX_RULES, parseRules, removeRule, ruleInput, ruleLines, showRule, updateRule, type Rule, type Rules, type RuleScope } from '../src/rules'
import { acceptOffer, corrections, learnFrom, rejectLearned } from '../src/dict/learn'
import { sessionTerms } from '../src/dict/session'
import { guard } from '../src/guard'
import { migrate, MIGRATED_KEY, MIGRATION_STEP, savedOptions } from '../src/migrate'
import { t, type Key } from '../src/i18n'
import { currentValues, findSetting, parseSet, SETTINGS, showValue, type Setting, type SetValue } from '../src/settings'
import { findSegment, replaceSegment, type Segment } from '../src/segment'
import { countWords, words } from '../src/tokens'
import { renderBand, type BandEls } from '../src/ui/band'
import { customLabels, parseNotes, sentRowText, storable, withNote, type LabelKind } from '../src/ui/bubble'
import { parsePrints, promptPrint, withPrints } from '../src/recall'
import { renderDictPane, type PaneEls, type PaneModel, type PaneRow } from '../src/ui/dictPane'

const view = atom({ plugin: 'tidia', key: 'view' } as const, null)
// Bumped after every change the dictionary pane shows, with the line it reports.
const paneState = atom({ plugin: 'tidia', key: 'dictPane' } as const, null)
// The messages tidied at Enter, newest first, that the desktop draws in the person's bubble.
const sentNotes = atom({ plugin: 'tidia', key: 'sent' } as const, null)
// $.state is gone after /resume (the desktop resumes a session it comes back to) and a restart, so
// the notes are kept in $.store too, and read from there while the state is empty.
const SENT_KEY = 'sent-notes'
let kept: SentNote[] = []
// Fingerprints of the prompts sent, newest first, so a prompt recalled with ↑ is not taken for speech.
const PRINTS_KEY = 'sent-prints'
let prints: number[] = []
// The session's id, for the notes; /clear, /resume and a fork change it.
let session: string | null | undefined
async function sessionId($: EngineInterface): Promise<string | null> {
  if (session === undefined) {
    try {
      session = await $.session.id()
    } catch {
      session = null
    }
  }
  return session
}
// A settings change reloads the mod's code and starts ctx over; /tidia off and the recent messages
// Claude's dictionary adds are checked against must outlive it.
const sessionKeep = atom({ plugin: 'tidia', key: 'session' } as const, null)
async function keepSession($: EngineInterface): Promise<void> {
  const keep: SessionKeep = { enabled: ctx.enabled, said: ctx.said }
  await update($, sessionKeep, () => keep)
}
const PANE_ID = 'voice-dict'
const PANE_ROWS = 100
// Where this project's transcripts are, from the SessionStart hook's input when it fired
// (with the project root it was for: after /cd it belongs to another project).
let transcriptAt: { dir: string; root: string } | null = null
// The project root the project dictionary was read for.
let rootSeen: string | null = null
// What each pane row stands for, by its key, as last drawn.
let paneRefs = new Map<string, { scope: Scope; entry: EntryInput }>()
// Words `/tidia dict build` found, waiting in the pane for the person to add or skip.
let proposals: string[] = []
const BUILD_FILES = 30
const BUILD_FILE_BYTES = 4_000_000
// A word must come up this often in past prompts to be proposed.
const BUILD_MIN_COUNT = 3
const IGNORED_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'src', 'lib', 'test', 'tests', 'docs', 'scripts', 'public', 'assets', 'vendor', 'tmp', 'coverage'])
const IGNORED_BRANCHES = new Set(['main', 'master', 'develop', 'dev', 'trunk', 'HEAD'])

const POLL_MS = 250
const FAILED_VISIBLE_MS = 4_000
// Enter is where a dictation's polish lands, so it waits for the model. Enter's own cleanup is bounded by the model call's
// limit: a $.clock wait would run down the hook's 10 s budget, so only a polish begun at a
// pause, which this hook does not own, is raced against one, inside that budget.
const SUBMIT_WAIT_MS = 20_000
const JOB_WAIT_MS = 8_000

// conditionalRule: an applied output rule had a condition, which the bubble tells; an always-on one
// (a register, say) is the person's standing choice and goes untold.
type Polished = { draft: string; segment: Segment; original: string; replacement: string; cleaned: Cleaned; style: Style; conditionalRule: boolean }
type Outcome = { ok: true; polished: Polished } | { ok: false }
type Job = { id: number; draft: string; done: Promise<Outcome> }

type Ctx = {
  cfg: Config
  locale: Locale
  // Claude Code's `language` setting, for `english_terms: auto` on Latin-script speech.
  language: string | undefined
  enabled: boolean
  det: DetectorState
  nextId: number
  job: Job | null
  // The polished version of the dictation in the prompt, sent on Enter (polish_on pause).
  ready: (Polished & { id: number }) | null
  // The prompt before the current dictation began: a dictation runs across pauses until it is
  // sent, typed over or replaced, and is polished whole.
  dictBase: string | null
  polling: boolean
  // Cuts the model call of a polish a newer one replaced.
  abort: AbortController | null
  // Identifiers from the conversation, as of the user turn they were read at.
  terms: { turns: number; list: string[] } | null
  // The prompt when the first keyboard edit ended a dictation, and the dictated part of it:
  // what the person retyped is compared with it at Enter.
  learnBase: { text: string; region: { start: number; end: number } } | null
  // The person's last messages and their raw dictations, newest first: Claude adds a dictionary
  // entry without asking only for a word the person said.
  said: Array<{ text: string; raw: string | null }>
  // The tidied dictation put in the prompt, and what was said: Enter sends the prompt as it
  // stands, with the raw transcript beside it.
  landed: { text: string; raw: string } | null
  // Where the prompt is drawn, from the band's renders. The desktop shows a message as the prompt
  // box held it, so a rewrite at Enter is told there in a line of its own.
  surface: RenderSurface | null
  // The person's Enters so far: a prompt filled after one is the next message's.
  sent: number
  // The dictation as it stood when a poll found the prompt emptied: Enter empties it before
  // prompt.submit runs, and the submit takes the dictation back from here.
  emptied: Dictation | null
  // The prompt a pause polish found nothing to change in, or failed on: Enter sends it as it is
  // rather than asking the model again.
  tried: string | null
  // A change the poll saw in one piece and that then stayed past the settle time, and the prompt
  // before it: not speech by itself, but tap mode and voice.autoSubmit send a transcript that
  // waited like this, or write the final one over a few words shown while listening.
  offered: { baseline: string; text: string } | null
}

type Dictation = Pick<Ctx, 'det' | 'dictBase' | 'ready' | 'landed' | 'learnBase' | 'tried' | 'offered'>

function fresh(cfg: Config, locale: Locale = 'en', enabled = true, language?: string): Ctx {
  return { cfg, locale, language, enabled, det: initial(''), nextId: 0, job: null, ready: null, dictBase: null, polling: false, abort: null, terms: null, learnBase: null, said: [], landed: null, surface: null, sent: 0, emptied: null, tried: null, offered: null }
}

let ctx: Ctx = fresh(parseConfig({}))

// The dictionaries outlive /clear: they are stored, the session terms are not.
const dicts: Record<Scope, Dict> & { projectKey: string } = { global: emptyDict(), project: emptyDict(), projectKey: projectKey('') }

// The output rules, per scope, as last read; the project's follow the session's root like the dictionary.
const rules: Record<RuleScope, Rules> = { global: emptyRules(), project: emptyRules() }
const GLOBAL_RULES_KEY = 'rules:global'
function rulesKey(scope: RuleScope): string {
  return scope === 'global' ? GLOBAL_RULES_KEY : dicts.projectKey.replace(/^dict:/, 'rules:')
}

function storeKey(scope: Scope): string {
  return scope === 'global' ? GLOBAL_KEY : dicts.projectKey
}

// The project dictionary and rules belong to the session's project root, which /cd moves: read
// them again for the new root before anything uses them.
async function syncRoot($: EngineInterface): Promise<string> {
  const root = await $.session.root()
  if (root !== rootSeen) {
    rootSeen = root
    dicts.projectKey = projectKey(root)
    try {
      dicts.project = parseDict(await $.store.get(dicts.projectKey))
    } catch {
      dicts.project = emptyDict()
    }
    try {
      rules.project = parseRules(await $.store.get(rulesKey('project')))
    } catch {
      rules.project = emptyRules()
    }
  }
  return root
}

async function loadDicts($: EngineInterface): Promise<void> {
  rootSeen = null
  await syncRoot($)
  try {
    dicts.global = parseDict(await $.store.get(GLOBAL_KEY))
  } catch (err) {
    $.ui.log(`tidia: could not read the dictionary (${message(err)})`, { to: 'debug' })
  }
  try {
    rules.global = parseRules(await $.store.get(GLOBAL_RULES_KEY))
  } catch (err) {
    $.ui.log(`tidia: could not read the rules (${message(err)})`, { to: 'debug' })
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// The engine names the call ("tidia: $.store.set: …"); the person needs only the reason.
function refusal(err: unknown): string {
  return message(err).replace(/^[\w@.-]+: \$\.[\w.]+: /, '')
}

// Claude Code keeps the mod's whole store, every project's dictionary and rules, in 4 MiB of JSON
// text. A write that would pass it makes room from the words learned in other projects, the least
// recently used project first; words someone typed are never dropped. Learned words come back.
const OVER_LIMIT = /over the \d+ limit/
const isLearned = (e: Entry) => e.source === 'learned' || e.source === 'bootstrap'

async function makeRoom($: EngineInterface, writing: string): Promise<boolean> {
  let keys: string[]
  try {
    keys = await $.store.keys()
  } catch {
    return false
  }
  // The bubble notes go before any word: they only redraw old bubbles.
  if (writing !== SENT_KEY && keys.includes(SENT_KEY)) {
    try {
      if (parseNotes(await $.store.get(SENT_KEY)).length > 0) {
        await $.store.set(SENT_KEY, [])
        return true
      }
    } catch {
      // On to the learned words.
    }
  }
  let oldest: { key: string; dict: Dict; last: string } | null = null
  for (const key of keys) {
    if (!key.startsWith('dict:project:') || key === writing || key === dicts.projectKey) continue
    let value: unknown
    try {
      value = await $.store.get(key)
    } catch {
      continue
    }
    if (value === undefined || !isCurrentDict(value)) continue
    const dict = parseDict(value)
    if (!dict.entries.some(isLearned)) continue
    const last = dict.entries.reduce((m, e) => (e.lastSeen > m ? e.lastSeen : m), '')
    if (!oldest || last < oldest.last) oldest = { key, dict, last }
  }
  if (!oldest) return false
  try {
    await $.store.set(oldest.key, { ...oldest.dict, entries: oldest.dict.entries.filter(e => !isLearned(e)) })
  } catch {
    return false
  }
  return true
}

// $.store.set, making room when the store is full; null, or why it could not.
async function storeSet($: EngineInterface, key: string, value: unknown): Promise<string | null> {
  for (;;) {
    try {
      await $.store.set(key, value)
      return null
    } catch (err) {
      const reason = refusal(err)
      if (!OVER_LIMIT.test(reason)) return reason
      if (!(await makeRoom($, key))) return t(ctx.locale, 'store_full')
    }
  }
}

type ScopeRead = { dict: Dict } | { refused: string } | { unreadable: true }

// What the store holds for a scope right now: every session shares the store, so a change
// starts from it, not from what this session read at start.
async function readScope($: EngineInterface, scope: Scope): Promise<ScopeRead> {
  if (scope === 'project') await syncRoot($)
  let value: unknown
  try {
    value = await $.store.get(storeKey(scope))
  } catch (err) {
    return { refused: refusal(err) }
  }
  if (value === undefined) return { dict: emptyDict() }
  // Another version's dictionary would read as empty here; writing over it would lose it.
  if (!isCurrentDict(value)) return { unreadable: true }
  const dict = parseDict(value)
  dicts[scope] = dict
  return { dict }
}

// Another Claude Code session writing the same dictionary at the same moment (the store has no
// lock) would drop this change: after the last write the dictionary is read back three times,
// further apart each time because a store read can show another session's write only later, and
// when someone else's write replaced it, everything this session changed since its first unchecked
// write is applied again on top of theirs.
const RECHECK_MS = [400, 1500, 5000]
type Pending = { base: Dict; next: Dict; timer: { cancel: () => void } }
const pending = new Map<string, Pending>()

function scheduleRecheck($: EngineInterface, key: string, scope: Scope, base: Dict, next: Dict, left: number): void {
  pending.get(key)?.timer.cancel()
  const p: Pending = { base, next, timer: { cancel: () => {} } }
  const ms = RECHECK_MS[RECHECK_MS.length - left] ?? 0
  p.timer = $.clock.after(ms + Math.random() * ms * 0.5, () => void recheck($, key, scope, p, left))
  pending.set(key, p)
}

async function recheck($: EngineInterface, key: string, scope: Scope, p: Pending, left: number): Promise<void> {
  await serially(async () => {
    if (pending.get(key) !== p) return
    pending.delete(key)
    let value: unknown
    try {
      value = await $.store.get(key)
    } catch {
      return
    }
    if (value === undefined || !isCurrentDict(value)) return
    const current = parseDict(value)
    const merged = rebase(current, p.base, p.next)
    if (JSON.stringify(merged) !== JSON.stringify(current)) {
      try {
        await $.store.set(key, merged)
      } catch {
        return
      }
      if (storeKey(scope) === key) dicts[scope] = merged
    }
    if (left > 1 && !pending.has(key)) scheduleRecheck($, key, scope, p.base, p.next, left - 1)
  })
}

async function saveDict($: EngineInterface, scope: Scope, next: Dict): Promise<string | null> {
  const key = storeKey(scope)
  const base = pending.get(key)?.base ?? dicts[scope]
  const reason = await storeSet($, key, next)
  if (reason !== null) return reason
  dicts[scope] = next
  scheduleRecheck($, key, scope, base, next, RECHECK_MS.length)
  // An open pane redraws on any change: the tool, learning and commands write too.
  await update($, paneState, v => (v === null ? v : { version: v.version + 1, message: v.message }))
  return null
}

let changing: Promise<unknown> = Promise.resolve()

// One change at a time: two in flight (a tool call and a command) would both start from the same read.
function serially<T>(work: () => Promise<T>): Promise<T> {
  const run = changing.then(work, work)
  changing = run.catch(() => undefined)
  return run
}

type RulesRead = { rules: Rules } | { refused: string } | { unreadable: true }

async function readRules($: EngineInterface, scope: RuleScope): Promise<RulesRead> {
  if (scope === 'project') await syncRoot($)
  let value: unknown
  try {
    value = await $.store.get(rulesKey(scope))
  } catch (err) {
    return { refused: refusal(err) }
  }
  if (value === undefined) return { rules: emptyRules() }
  // Another version's rules would read as empty here; writing over them would lose them.
  if (!isCurrentRules(value)) return { unreadable: true }
  rules[scope] = parseRules(value)
  return { rules: rules[scope] }
}

// Once per install: what an older version saved that this one has no field for (src/migrate.ts).
// The mark goes in before the style is set, since setting it reloads the mod.
async function migrateOld($: EngineInterface): Promise<void> {
  const mark = await $.store.get(MIGRATED_KEY)
  const done = typeof mark === 'number' ? mark : 0
  if (done >= MIGRATION_STEP) return
  const options = savedOptions(await $.settings.read())
  const m = options ? await serially(async () => {
    const cur = await readRules($, 'global')
    if (!('rules' in cur)) return 'retry' as const
    const m = migrate(options, cur.rules, done)
    if (m && m.rules !== cur.rules && (await saveRules($, 'global', m.rules)) !== null) return 'retry' as const
    return m
  }) : null
  if (m === 'retry') return
  await $.store.set(MIGRATED_KEY, MIGRATION_STEP)
  if (!m) return
  // Each change reloads the mod; the mark is already in, so the reload does not move them again.
  for (const c of m.config) await $.config.set({ key: `tidia.${c.key}`, value: c.value })
  told($, t(ctx.locale, 'migrated', { moved: m.moved.join(', ') }))
}

async function saveRules($: EngineInterface, scope: RuleScope, next: Rules): Promise<string | null> {
  const reason = await storeSet($, rulesKey(scope), next)
  if (reason !== null) return reason
  rules[scope] = next
  await update($, paneState, v => (v === null ? v : { version: v.version + 1, message: v.message }))
  return null
}

type RulesChange<T> = { ok: true; result: T } | { ok: false; reason: string }

// One read-modify-write of a scope's rules, in line with the dictionary's changes.
function changeRules<T>($: EngineInterface, scope: RuleScope, edit: (r: Rules) => { rules: Rules; result: T } | { fail: 'full' } | null): Promise<RulesChange<T>> {
  return serially(async (): Promise<RulesChange<T>> => {
    const read = await readRules($, scope)
    if ('refused' in read) return { ok: false, reason: read.refused }
    if ('unreadable' in read) return { ok: false, reason: 'unreadable' }
    const out = edit(read.rules)
    if (!out) return { ok: false, reason: 'missing' }
    if ('fail' in out) return { ok: false, reason: out.fail }
    const reason = await saveRules($, scope, out.rules)
    return reason === null ? { ok: true, result: out.result } : { ok: false, reason }
  })
}

type Failure = { kind: 'unsaved'; reason: string } | { kind: 'unreadable' }

function failure(read: ScopeRead): Failure | null {
  if ('refused' in read) return { kind: 'unsaved', reason: read.refused }
  if ('unreadable' in read) return { kind: 'unreadable' }
  return null
}

type AddResult = { kind: 'added' | 'updated' | 'full' } | Failure

async function addEntry($: EngineInterface, input: EntryInput, scope: Scope, source: Source = 'manual'): Promise<AddResult> {
  const now = new Date(await $.clock.now()).toISOString()
  return serially(async (): Promise<AddResult> => {
    const read = await readScope($, scope)
    if (!('dict' in read)) return failure(read)!
    const r = upsert(read.dict, input, source, now)
    if (r.change === 'full') return { kind: 'full' }
    const reason = await saveDict($, scope, r.dict)
    return reason === null ? { kind: r.change } : { kind: 'unsaved', reason }
  })
}

type RemoveResult = { kind: 'removed'; entries: Entry[] } | { kind: 'missing' } | Failure

// One entry exactly, in either scope: undoing an add must not take other entries for the same word.
async function removePair($: EngineInterface, input: EntryInput): Promise<RemoveResult> {
  return serially(async (): Promise<RemoveResult> => {
    const removed: Entry[] = []
    for (const scope of ['project', 'global'] as const) {
      const read = await readScope($, scope)
      if (!('dict' in read)) return failure(read)!
      const next = dropEntry(read.dict, input)
      if (next.entries.length === read.dict.entries.length) continue
      const reason = await saveDict($, scope, next)
      if (reason !== null) return { kind: 'unsaved', reason }
      removed.push(...read.dict.entries.filter(e => !next.entries.includes(e)))
    }
    return removed.length > 0 ? { kind: 'removed', entries: removed } : { kind: 'missing' }
  })
}

async function removeEntry($: EngineInterface, word: string): Promise<RemoveResult> {
  return serially(async (): Promise<RemoveResult> => {
    const removed: Entry[] = []
    for (const scope of ['project', 'global'] as const) {
      const read = await readScope($, scope)
      if (!('dict' in read)) return failure(read)!
      const r = removeWord(read.dict, word)
      if (r.removed.length === 0) continue
      const reason = await saveDict($, scope, r.dict)
      if (reason !== null) return { kind: 'unsaved', reason }
      removed.push(...r.removed)
    }
    return removed.length > 0 ? { kind: 'removed', entries: removed } : { kind: 'missing' }
  })
}

// Both scopes as the store holds them now, for a listing.
async function refresh($: EngineInterface): Promise<void> {
  await serially(async () => {
    await readScope($, 'project')
    await readScope($, 'global')
    await readRules($, 'project')
    await readRules($, 'global')
  })
}

function addText(L: Locale, r: AddResult, input: EntryInput, scope: Scope): string {
  if (r.kind === 'unsaved') return t(L, 'dict_unsaved', { reason: r.reason })
  if (r.kind === 'unreadable') return t(L, 'dict_unreadable')
  if (r.kind === 'full') return t(L, 'dict_full', { max: String(MAX_ENTRIES) })
  return t(L, r.kind === 'added' ? 'dict_added' : 'dict_updated', { entry: showEntry(input), scope: t(L, scope === 'global' ? 'scope_global' : 'scope_project') })
}

function removeText(L: Locale, r: RemoveResult, word: string): string {
  if (r.kind === 'unsaved') return t(L, 'dict_unsaved', { reason: r.reason })
  if (r.kind === 'unreadable') return t(L, 'dict_unreadable')
  if (r.kind === 'missing') return t(L, 'dict_missing', { entry: word })
  return t(L, 'dict_removed', { entry: r.entries.map(showEntry).join(', ') })
}

// A dictionary holds up to MAX_ENTRIES per scope: what is shown is cut, and a word searches it.
const LIST_ROWS = 200
const TOOL_LIST_MAX = 100

function matching(word: string): Array<{ e: Entry; scope: Scope }> {
  const w = word.trim().toLowerCase()
  return (['project', 'global'] as const)
    .flatMap(scope => dicts[scope].entries.map(e => ({ e, scope })))
    .filter(({ e }) => w === '' || e.meant.toLowerCase().includes(w) || (e.heard?.toLowerCase().includes(w) ?? false))
}

function listText(L: Locale, word = ''): string {
  const found = matching(word)
  if (found.length === 0) return word.trim() === '' ? t(L, 'dict_empty') : t(L, 'dict_missing', { entry: word.trim() })
  const rows = found.slice(0, LIST_ROWS).map(({ e, scope }) => `  ${showEntry(e)} · ${t(L, scope === 'global' ? 'scope_global' : 'scope_project')}`)
  const more = found.length - rows.length
  return [t(L, 'dict_head', { count: String(found.length) }), ...rows, ...(more > 0 ? [t(L, 'list_more', { count: String(more) })] : [])].join('\n')
}

async function dictCommand($: EngineInterface, L: Locale, args: string): Promise<string | null> {
  const verb = args.split(/\s+/, 1)[0] ?? ''
  const body = args.slice(verb.length).trim()
  switch (verb.toLowerCase()) {
    case '':
      // The pane, where the person has room; the text list otherwise.
      if (await openPane($, L)) return null
      return listText(L)
    case 'list':
      await refresh($)
      return listText(L, body)
    case 'build':
      return buildDictionary($, L)
    case 'add': {
      const r = parseAddArgs(body)
      if (!r) return t(L, 'dict_usage')
      return addText(L, await addEntry($, r.input, r.scope), r.input, r.scope)
    }
    case 'remove':
      return body === '' ? t(L, 'dict_usage') : removeText(L, await removeEntry($, body), body)
    default:
      return t(L, 'dict_usage')
  }
}

// One tool per job, so a call reads as what it does ("Tidia: dictionary") wherever it is shown.
const TOOL_PREFIX = 'mcp__tidia__'
const DICT_TOOL = 'mcp__tidia__dictionary'
const RULES_TOOL = 'mcp__tidia__rules'
// Dictionary entries are spelling hints that pass entryInput's term check, and the rest only
// read or stop polishing: no prompt for these. Rules and settings change what is sent.
const AUTO_ALLOWED: ReadonlySet<string> = new Set(['dict_list', 'dict_add', 'dict_remove', 'rule_list', 'setting_get', 'off', 'on'])
const SAID_DEPTH = 10
// How alike a misheard word and its spelling must sound for Claude to add the pair without asking:
// "staging" -> "production" asks, "유즈 이펙트" -> "useEffect" does not.
const SOUNDS_ALIKE = 0.5

// With dict_approval auto, Claude keeps the dictionary itself: it adds a pair only for a misheard
// word the person said in a recent dictation (a whole word, not a letter inside one) that sounds
// like the spelling it gives, or a spelling the person dictated. An entry that is not Claude's (the
// person typed it, approved it in the pane, or Tidia learned it from their corrections) is theirs:
// changing or removing it asks.
async function autoAllowed($: EngineInterface, input: Record<string, unknown>): Promise<boolean> {
  const action = typeof input.action === 'string' ? input.action : ''
  if (!AUTO_ALLOWED.has(action)) return false
  if (action !== 'dict_add' && action !== 'dict_remove') return true
  if (ctx.cfg.dictApproval === 'ask') return false
  await refresh($)
  const isMine = (e: Entry) => e.source !== 'claude'
  if (action === 'dict_remove') {
    const word = typeof input.word === 'string' ? input.word.trim() : ''
    const pair = word === '' ? entryInput(input.heard, input.meant) : null
    // A call dictAction refuses changes nothing either way.
    if (word === '' && !pair) return true
    return !removalTargets(dicts, pair ? { entry: pair } : { word }).some(isMine)
  }
  const entry = entryInput(input.heard, input.meant)
  if (!entry) return false
  const scope: Scope = input.scope === 'project' ? 'project' : 'global'
  if (dicts[scope].entries.some(e => sameKey(e, entry) && isMine(e) && e.meant !== entry.meant)) return false
  // Only what the person dictated: typed or pasted text can carry words someone else chose.
  const dictated = ctx.said.flatMap(m => (m.raw !== null ? [m.raw] : []))
  if (entry.heard !== undefined) return alike(entry.heard, entry.meant) >= SOUNDS_ALIKE && dictated.some(raw => saidIn(raw, entry.heard!))
  return dictated.some(raw => saidIn(raw, entry.meant))
}
const ACTIONS = ['dict_list', 'dict_add', 'dict_remove', 'rule_list', 'rule_add', 'rule_update', 'rule_remove', 'setting_get', 'setting_set', 'off', 'on']

function settingChoices(s: Setting): string {
  return s.kind === 'choice' ? s.options.join('|') : s.kind === 'text' ? `free text up to ${s.max} characters, none to clear` : 'on|off'
}

const ASKS = 'They show the person a dialog where they allow or decline the change: call the action and do not ask in chat first.'

const TOOL_SPECS = [
  {
    name: 'dictionary',
    actions: ['dict_list', 'dict_add', 'dict_remove'],
    description: [
      "Tidia's voice dictionary: spellings the cleanup of the person's voice dictation uses. The person speaks rather than types, so they change it by asking you.",
      "dict_add with meant, or heard + meant for a word speech recognition gets wrong; scope global (default) or project. Add one by yourself, without asking, when you are sure a dictated word was misheard (the raw transcript or the person's own correction shows it), then tell the person in one short line. dict_remove takes word. dict_list lists them.",
      "Some changes show the person a dialog where they allow or decline them (a pair whose misheard word they did not dictate recently or that does not sound like the spelling, a word they did not dictate, changing or removing an entry you did not add, and every change when they chose to be asked): call the action and do not ask in chat first. dict_list runs at once.",
    ].join(' '),
    properties: {
      heard: { type: 'string', description: 'What speech recognition writes, for a mishearing.' },
      meant: { type: 'string', description: 'The right spelling.' },
      word: { type: 'string', description: 'dict_list: a word to search for (the list shows at most 100 entries). dict_remove: a word whose every entry is removed; to undo one dict_add, pass its heard and meant instead.' },
      scope: { type: 'string', enum: ['global', 'project'], description: 'dict_add: all projects (global, the default) or this project only.' },
    },
  },
  {
    name: 'rules',
    actions: ['rule_list', 'rule_add', 'rule_update', 'rule_remove'],
    description: [
      "Tidia's output rules: how the person wants their dictated messages shaped, e.g. text \"Number the steps\", when \"the dictation lists several tasks\". Without when, a rule always applies. Rules shape wording, register and layout; they never add content.",
      'Add a rule when the person asks; when they keep asking for the same shape, offer it by calling rule_add. rule_add takes scope global (default) or project. Starter rules (bug reports, feature requests, reviews, task lists, and a polite, casual or as-spoken register) are off until the person asks for one: turn it on with rule_update enabled true, off with enabled false; they cannot be reworded.',
      `rule_add, rule_update and rule_remove: ${ASKS} rule_list runs at once.`,
    ].join(' '),
    properties: {
      id: { type: 'string', description: 'A rule id from rule_list.' },
      text: { type: 'string', description: 'What the rule does.' },
      when: { type: 'string', description: 'When the rule applies, in words; empty for always.' },
      enabled: { type: 'boolean', description: 'rule_update: turn the rule on (true) or off (false); the only field a starter rule takes.' },
      scope: { type: 'string', enum: ['global', 'project'], description: 'rule_add: all projects (global, the default) or this project only.' },
    },
  },
  {
    name: 'settings',
    actions: ['setting_get', 'setting_set', 'off', 'on'],
    description: [
      "Tidia's settings for cleaning up the person's voice dictation. The person speaks rather than types, so they change them by asking you.",
      `setting_get reads them; setting_set with key and value changes one: ${SETTINGS.map(s => `${s.key} = ${settingChoices(s)}`).join('; ')}; they are saved.`,
      'off / on stop or resume cleaning for this session only; setting_get reports it as cleaning.',
      `setting_set: ${ASKS} The other actions run at once.`,
    ].join(' '),
    properties: {
      key: { type: 'string', description: 'setting_set: the setting name.' },
      value: { type: 'string', description: "setting_set: the new value, one of the setting's choices." },
    },
  },
] as const

const toolOf = (action: string) => TOOL_SPECS.find(spec => (spec.actions as readonly string[]).includes(action))

function toolRegistration(spec: (typeof TOOL_SPECS)[number]) {
  return {
    name: spec.name,
    description: spec.description,
    inputSchema: {
      type: 'object',
      properties: { action: { type: 'string', enum: [...spec.actions], description: 'What to do; see the description.' }, ...spec.properties },
      required: ['action'],
    },
    isDeferred: true,
  }
}

const scopeName = (L: Locale, s: Scope) => t(L, s === 'global' ? 'scope_global' : 'scope_project')
const ruleScope = (id: string): RuleScope => (id.startsWith('p') ? 'project' : 'global')

function ruleFailure(L: Locale, reason: string, id: string): string {
  if (reason === 'missing') return t(L, 'rule_missing', { id })
  if (reason === 'full') return t(L, 'rule_full', { max: String(MAX_RULES) })
  if (reason === 'unreadable') return t(L, 'dict_unreadable')
  return t(L, 'rule_unsaved', { reason })
}

async function dictAction($: EngineInterface, action: string, args: Record<string, unknown>): Promise<string> {
  if (action === 'dict_list') {
    await refresh($)
    const found = matching(typeof args.word === 'string' ? args.word : '')
    // Cut to the most recently used: a full dictionary would be some 100,000 tokens.
    const shown = found.length <= TOOL_LIST_MAX ? found : [...found].sort((a, b) => b.e.lastSeen.localeCompare(a.e.lastSeen)).slice(0, TOOL_LIST_MAX)
    return JSON.stringify({
      total: found.length,
      entries: shown.map(({ e, scope }) => ({ ...(e.heard !== undefined ? { heard: e.heard } : {}), meant: e.meant, scope, source: e.source })),
      ...(found.length > shown.length ? { note: `The ${TOOL_LIST_MAX} most recently used of ${found.length}; pass word to search them all.` } : {}),
    })
  }
  if (action === 'dict_add') {
    const entry = entryInput(args.heard, args.meant)
    if (!entry) return 'Not changed: "meant" and "heard" must each be a word or short name of 1 to 80 characters and at most 4 words, without any of \' " ( ) [ ] { } & | ; < > $ ` \\ and with no word starting with - / or ~; "heard", when given, must differ from "meant".'
    const scope: Scope = args.scope === 'project' ? 'project' : 'global'
    // What the add replaces decides its undo: removing the pair would take the old entry with it.
    await refresh($)
    const before = dicts[scope].entries.find(e => sameKey(e, entry))
    const r = await addEntry($, entry, scope, 'claude')
    if (r.kind === 'full') return `Not changed: the dictionary holds ${MAX_ENTRIES} entries, its limit. Remove some with dict_remove first.`
    if (r.kind !== 'added' && r.kind !== 'updated') return addText('en', r, entry, scope)
    told($, t(ctx.locale, 'dict_by_ai', { change: addText(ctx.locale, r, entry, scope) }))
    const done = addText('en', r, entry, scope)
    if (before && before.meant === entry.meant) return `${done}. It was already in the dictionary, so there is nothing to undo.`
    if (before) return `${done}. To undo, call dict_add with heard "${before.heard}" and meant "${before.meant}".`
    const undo = entry.heard !== undefined ? `heard "${entry.heard}" and meant "${entry.meant}"` : `meant "${entry.meant}"`
    return `${done}. To undo, call dict_remove with ${undo}.`
  }
  // dict_remove: every entry for a word, or one entry exactly (how an add is undone).
  const word = typeof args.word === 'string' ? args.word.trim() : ''
  const pair = word === '' ? entryInput(args.heard, args.meant) : null
  if (word === '' && !pair) return 'Not changed: give the word to remove in "word", or one entry exactly in "meant" (and "heard").'
  const r = pair ? await removePair($, pair) : await removeEntry($, word)
  if (pair) {
    if (r.kind === 'removed') told($, t(ctx.locale, 'dict_by_ai', { change: removeText(ctx.locale, r, showEntry(pair)) }))
    return removeText('en', r, showEntry(pair))
  }
  if (r.kind === 'removed') told($, t(ctx.locale, 'dict_by_ai', { change: removeText(ctx.locale, r, word) }))
  return removeText('en', r, word)
}

async function ruleAction($: EngineInterface, action: string, args: Record<string, unknown>): Promise<string> {
  if (action === 'rule_list') {
    await serially(async () => {
      await readRules($, 'project')
      await readRules($, 'global')
    })
    return JSON.stringify(effectiveRules(rules.global, rules.project).map(r => ({ id: r.id, text: r.text, ...(r.when ? { when: r.when } : {}), enabled: r.enabled, scope: r.scope, source: r.source })))
  }
  if (action === 'rule_add') {
    const input = ruleInput(args.text, args.when)
    if (!input) return t('en', 'rule_invalid')
    const scope: RuleScope = args.scope === 'project' ? 'project' : 'global'
    const r = await changeRules<Rule>($, scope, cur => {
      const a = addRule(cur, scope, input, 'claude')
      return 'full' in a ? { fail: 'full' as const } : { rules: a.rules, result: a.rule }
    })
    if (!r.ok) return ruleFailure('en', r.reason, '')
    notice($, t(ctx.locale, 'rule_by_ai', { change: t(ctx.locale, 'rule_added', { scope: scopeName(ctx.locale, scope), rule: showRule(r.result) }) }))
    return t('en', 'rule_added', { scope: scopeName('en', scope), rule: `${r.result.id} ${showRule(r.result)}` })
  }
  const id = typeof args.id === 'string' ? args.id.trim() : ''
  if (id === '') return "Not changed: give the rule's id from rule_list."
  if (action === 'rule_update') {
    if (STARTER_IDS.has(id) && (args.text !== undefined || args.when !== undefined || typeof args.enabled !== 'boolean')) {
      return `Not changed: ${id} is a starter rule; it takes only enabled (true or false).`
    }
    const change: { text?: string; when?: string | null; enabled?: boolean } = {}
    if (args.text !== undefined) {
      const text = ruleInput(args.text, undefined)?.text
      if (text === undefined) return t('en', 'rule_invalid')
      change.text = text
    }
    if (args.when !== undefined) {
      if (typeof args.when === 'string' && args.when.trim() === '') change.when = null
      else {
        const when = ruleInput('x', args.when)?.when
        if (when === undefined) return t('en', 'rule_invalid')
        change.when = when
      }
    }
    if (typeof args.enabled === 'boolean') change.enabled = args.enabled
    const r = await changeRules<Rule>($, ruleScope(id), cur => {
      const u = updateRule(cur, id, change)
      return u ? { rules: u.rules, result: u.rule } : null
    })
    if (!r.ok) return ruleFailure('en', r.reason, id)
    notice($, t(ctx.locale, 'rule_by_ai', { change: t(ctx.locale, 'rule_updated', { rule: showRule(r.result) }) }))
    return t('en', 'rule_updated', { rule: `${r.result.id} ${showRule(r.result)}` })
  }
  // rule_remove
  const r = await changeRules($, ruleScope(id), cur => {
    const x = removeRule(cur, id)
    return x ? { rules: x.rules, result: x } : null
  })
  if (!r.ok) return ruleFailure('en', r.reason, id)
  const key = r.result.turnedOff ? 'rule_turned_off' : 'rule_removed'
  notice($, t(ctx.locale, 'rule_by_ai', { change: t(ctx.locale, key, { rule: showRule(r.result.rule) }) }))
  return t('en', key, { rule: `${r.result.rule.id} ${showRule(r.result.rule)}` })
}

// The engine asks permission only for the calls it serves itself, and this tool is served by the
// hook below, so a change to rules or settings asks here: the engine's verdict first, then the person.
const PERM_FIELDS = ['heard', 'meant', 'word', 'scope', 'id', 'text', 'when', 'enabled', 'key', 'value'] as const
const PERM_FIELD_CHARS = 300
const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text)

async function permission($: EngineInterface, tool: string, args: Record<string, unknown>): Promise<string | null> {
  const action = typeof args.action === 'string' ? args.action : ''
  if (!ACTIONS.includes(action)) return null
  const input = Object.fromEntries(Object.entries(args).filter(([k]) => k !== 'tool' && k !== 'tool_use_id'))
  const verdict = await $.tool.check({ tool, input })
  if (verdict.decision === 'allow') return null
  if (verdict.decision === 'deny') return `Not changed: ${verdict.reason ?? 'permission denied'}`
  const L = ctx.locale
  // Only the fields the tools take, each cut short: nothing else Claude passes reaches the question.
  const fields = PERM_FIELDS.filter(k => input[k] !== undefined).map(k => `${k}: ${JSON.stringify(cut(String(input[k]), PERM_FIELD_CHARS))}`)
  const change = [action, ...fields].join(' · ')
  const question = t(L, 'perm_question', { change }) + (action === 'rule_add' || action === 'rule_update' ? ` ${t(L, 'perm_rule_note')}` : '')
  try {
    const answer = await $.ui.ask(question, { options: [t(L, 'perm_allow'), t(L, 'perm_deny')], header: 'Tidia' })
    return answer === t(L, 'perm_allow') ? null : 'Not changed: the user did not allow it.'
  } catch {
    // Dismissed, or a -p run with no one to ask: not the person saying no.
    return 'Not changed: the question was dismissed, or there was no one to ask.'
  }
}

async function polishTool($: EngineInterface, args: Record<string, unknown>): Promise<string> {
  const action = typeof args.action === 'string' ? args.action : ''
  if (action.startsWith('dict_') && ACTIONS.includes(action)) return dictAction($, action, args)
  if (action.startsWith('rule_') && ACTIONS.includes(action)) return ruleAction($, action, args)
  if (action === 'setting_get') {
    const values = Object.fromEntries(Object.entries(currentValues(ctx.cfg)).map(([k, v]) => [k, showValue(v)]))
    return JSON.stringify({ cleaning: ctx.enabled ? 'on' : 'off', ...values })
  }
  if (action === 'setting_set') {
    const value = typeof args.value === 'boolean' ? (args.value ? 'on' : 'off') : typeof args.value === 'number' ? String(args.value) : args.value
    if (typeof args.key !== 'string' || typeof value !== 'string') {
      return `Not changed: setting_set takes key and value: ${SETTINGS.map(s => `${s.key} = ${settingChoices(s)}`).join('; ')}.`
    }
    const r = await applySetting($, `${args.key} ${value}`)
    if (r.ok) notice($, t(ctx.locale, 'setting_by_ai', { change: settingText(ctx.locale, r) }))
    return settingText('en', r)
  }
  if (action === 'off' || action === 'on') {
    const on = action === 'on'
    await setEnabled($, on)
    // Claude turns Tidia on or off without asking, so the person always sees it.
    told($, t(ctx.locale, 'polish_by_ai', { change: t(ctx.locale, on ? 'cmd_on' : 'cmd_off') }))
    return t('en', on ? 'cmd_on' : 'cmd_off')
  }
  return `Unknown action. Use one of: ${ACTIONS.join(', ')}.`
}

async function openPane($: EngineInterface, L: Locale): Promise<boolean> {
  await refresh($)
  await paneChanged($, null)
  const r = await $.ui.open({ id: PANE_ID, title: t(L, 'pane_title'), focus: true, closeOnEscape: true })
  return r.isPlaced
}

async function paneChanged($: EngineInterface, message: string | null): Promise<void> {
  await update($, paneState, v => ({ version: (v?.version ?? 0) + 1, message }))
}

function paneModel(message: string | null): PaneModel {
  const L = ctx.locale
  const refs = new Map<string, { scope: Scope; entry: EntryInput }>()
  const idOf = (e: EntryInput) => `${e.heard ?? ''}=${e.meant}`
  const entries: PaneRow[] = []
  for (const scope of ['project', 'global'] as const) {
    for (const e of dicts[scope].entries) {
      const key = `${scope}:${idOf(e)}`
      refs.set(key, { scope, entry: inputOf(e) })
      entries.push({ key, text: `${showEntry(e)} · ${t(L, scope === 'global' ? 'scope_global' : 'scope_project')} · ${t(L, `source_${e.source}`)}` })
    }
  }
  const candidates = dicts.global.candidates.slice(0, PANE_ROWS).map(c => {
    refs.set(idOf(c), { scope: 'global', entry: inputOf(c) })
    return { key: idOf(c), text: showEntry(c) }
  })
  paneRefs = refs
  const found = proposals.slice(0, PANE_ROWS).map(p => ({ key: p, text: p }))
  const ruleRows = effectiveRules(rules.global, rules.project).map(r => ({
    key: `rule:${r.id}`,
    text: `${showRule(r)} · ${scopeName(L, r.scope)} · ${t(L, sourceKey(r.source))}`,
    enabled: r.enabled,
    removable: r.source !== 'starter',
  }))
  return { entries: entries.slice(0, PANE_ROWS), candidates, proposals: found, rules: ruleRows, more: Math.max(0, entries.length - PANE_ROWS), message }
}

// A rule the person added reads as theirs, like a dictionary entry they added.
function sourceKey(source: Rule['source']): Key {
  return source === 'starter' ? 'source_starter' : source === 'claude' ? 'source_claude' : 'source_manual'
}

async function rulesText($: EngineInterface, L: Locale): Promise<string> {
  await serially(async () => {
    await readRules($, 'project')
    await readRules($, 'global')
  })
  const list = effectiveRules(rules.global, rules.project)
  return [
    t(L, 'rules_head', { count: String(list.length) }),
    ...list.map(r => `  ${r.id} · ${showRule(r)} · ${scopeName(L, r.scope)} · ${t(L, sourceKey(r.source))} · ${t(L, r.enabled ? 'rule_on' : 'rule_off')}`),
  ].join('\n')
}

async function paneRule($: EngineInterface, key: string, remove: boolean): Promise<void> {
  const L = ctx.locale
  const id = key.slice('rule:'.length)
  const current = effectiveRules(rules.global, rules.project).find(r => r.id === id)
  if (!current) return
  if (remove) {
    const r = await changeRules($, ruleScope(id), cur => {
      const x = removeRule(cur, id)
      return x ? { rules: x.rules, result: x } : null
    })
    await paneChanged($, r.ok ? t(L, r.result.turnedOff ? 'rule_turned_off' : 'rule_removed', { rule: showRule(r.result.rule) }) : ruleFailure(L, r.reason, id))
    return
  }
  const r = await changeRules<Rule>($, ruleScope(id), cur => {
    const u = updateRule(cur, id, { enabled: !current.enabled })
    return u ? { rules: u.rules, result: u.rule } : null
  })
  await paneChanged($, r.ok ? t(L, 'rule_updated', { rule: `${showRule(r.result)} · ${t(L, r.result.enabled ? 'rule_on' : 'rule_off')}` }) : ruleFailure(L, r.reason, id))
}

const inputOf = (e: EntryInput): EntryInput => ({ ...(e.heard !== undefined ? { heard: e.heard } : {}), meant: e.meant })

async function paneAdd($: EngineInterface, text: string): Promise<void> {
  const L = ctx.locale
  const r = parseAddArgs(text)
  await paneChanged($, r ? addText(L, await addEntry($, r.input, r.scope), r.input, r.scope) : t(L, 'dict_usage'))
}

async function paneRemove($: EngineInterface, key: string): Promise<void> {
  const L = ctx.locale
  const ref = paneRefs.get(key)
  if (!ref) return
  const { scope, entry } = ref
  const failed = await serially(async (): Promise<string | null> => {
    const read = await readScope($, scope)
    if ('refused' in read) return t(L, 'dict_unsaved', { reason: read.refused })
    if ('unreadable' in read) return t(L, 'dict_unreadable')
    const reason = await saveDict($, scope, dropEntry(read.dict, entry))
    return reason === null ? null : t(L, 'dict_unsaved', { reason })
  })
  await paneChanged($, failed ?? t(L, 'dict_removed', { entry: showEntry(entry) }))
}

async function paneCandidate($: EngineInterface, key: string, approve: boolean): Promise<void> {
  const ref = paneRefs.get(key)
  if (!ref) return
  const input = ref.entry
  const now = new Date(await $.clock.now()).toISOString()
  const done = await serially(async () => {
    const read = await readScope($, 'global')
    if (!('dict' in read)) return false
    // Gone meanwhile (added or rejected elsewhere): nothing to do.
    if (!read.dict.candidates.some(c => sameKey(c, input) && c.meant === input.meant)) return false
    const next = approve ? acceptOffer(read.dict, input, now) : { dict: rejectLearned(read.dict, input), outcome: 'added' as const }
    return next.outcome === 'added' && (await saveDict($, 'global', next.dict)) === null
  })
  await paneChanged($, done && approve ? t(ctx.locale, 'dict_added', { entry: showEntry(input), scope: t(ctx.locale, 'scope_global') }) : null)
}

// Names the repository itself gives: its package, top-level folders, branches.
async function repoNames($: EngineInterface, root: string): Promise<string[]> {
  const names: string[] = []
  try {
    const pkg = JSON.parse(await $.fs.read(`${root}/package.json`)) as { name?: unknown; displayName?: unknown }
    for (const n of [pkg.name, pkg.displayName]) if (typeof n === 'string' && n.trim() !== '') names.push(n.trim())
  } catch {
    // No package.json, or not JSON.
  }
  try {
    for (const e of await $.fs.list(root)) if (e.kind === 'dir' && !e.name.startsWith('.') && !IGNORED_DIRS.has(e.name)) names.push(e.name)
  } catch {
    // An unreadable root leaves the folders out.
  }
  try {
    const r = await $.process.run(['git', 'branch', '--format=%(refname:short)'], { cwd: root })
    for (const b of r.stdout.split('\n')) {
      const name = b.trim().split('/').at(-1) ?? ''
      if (name.length >= 3 && !IGNORED_BRANCHES.has(name)) names.push(name)
    }
  } catch {
    // Not a git repository.
  }
  return names
}

async function readIfThere($: EngineInterface, path: string): Promise<string | null> {
  try {
    return await $.fs.read(path)
  } catch {
    return null
  }
}

// The person's prompts in this project's recent transcripts, read on this computer.
async function pastPrompts($: EngineInterface, root: string): Promise<string[]> {
  const home = await $.env.get('HOME')
  const dir = (transcriptAt?.root === root ? transcriptAt.dir : null) ?? (home ? `${home}/.claude/projects/${root.replace(/[^A-Za-z0-9]/g, '-')}` : null)
  if (!dir) return []
  let files
  try {
    files = (await $.fs.list(dir)).filter(f => f.kind === 'file' && f.name.endsWith('.jsonl') && f.size <= BUILD_FILE_BYTES)
  } catch {
    return []
  }
  const prompts: string[] = []
  for (const f of files.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, BUILD_FILES)) {
    const text = await readIfThere($, `${dir}/${f.name}`)
    if (text) prompts.push(...transcriptPrompts(text, root))
  }
  return prompts
}

// Asks first, gathers candidate words on this computer, lets the model keep the names among
// them (only the words go to it), and leaves them in the pane to add.
async function buildDictionary($: EngineInterface, L: Locale): Promise<string | null> {
  let answer: string
  try {
    answer = await $.ui.ask(t(L, 'build_question'), { options: [t(L, 'build_with'), t(L, 'build_repo')], header: 'Tidia' })
  } catch {
    return t(L, 'build_cancelled')
  }
  const withConversations = answer === t(L, 'build_with')
  if (!withConversations && answer !== t(L, 'build_repo')) return t(L, 'build_cancelled')
  const root = await syncRoot($)
  // The project's own docs are written with care, so a name there counts once; a word in past
  // prompts must come up a few times.
  const docs: string[] = []
  for (const name of ['README.md', 'CLAUDE.md', '.claude/CLAUDE.md']) {
    // A link can point out of the project, at a file the person never meant to share.
    const path = `${root}/${name}`
    try {
      const st = await $.fs.stat(path)
      if (st.kind !== 'file' || st.isLink || st.size > BUILD_FILE_BYTES) continue
    } catch {
      continue
    }
    const text = await readIfThere($, path)
    if (text) docs.push(...text.split(/\n{2,}/))
  }
  const prompts = withConversations ? await pastPrompts($, root) : []
  await refresh($)
  const known = new Set((['project', 'global'] as const).flatMap(s => dicts[s].entries.map(e => e.meant.toLowerCase())))
  const seen = new Set<string>()
  // Every candidate passes the checks an entry the person types does: a package or branch name
  // from a cloned repository is not trusted text.
  const fresh = (terms: string[]) => terms.filter(term => {
    const key = term.toLowerCase()
    if (known.has(key) || seen.has(key) || !entryInput(undefined, term) || looksSecret(term)) return false
    seen.add(key)
    return true
  })
  const fromRepo = fresh([...(await repoNames($, root)), ...harvest(docs, 1).map(c => c.term)])
  const fromPrompts = fresh(harvest(prompts, BUILD_MIN_COUNT).map(c => c.term))
  const candidates = [...fromRepo, ...fromPrompts]
  if (candidates.length === 0) return t(L, 'build_none')
  const req = refineRequest(candidates)
  let terms: string[] | null = null
  try {
    const res = await $.model.complete({ model: ctx.cfg.model, system: req.system, prompt: req.prompt, maxTokens: req.maxTokens, effort: 'low', timeoutMs: 30_000 })
    if (res.isAnswered) terms = parseTerms(res.text, candidates)
  } catch {
    // The model refused: the project's own names go to the person as they are.
  }
  // Unsifted words from past prompts can hold a pasted password or key, so only the model's picks
  // from them are ever proposed.
  proposals = terms ?? fromRepo.slice(0, 50)
  if (proposals.length === 0) return t(L, 'build_none')
  if (await openPane($, L)) return null
  return `${t(L, 'build_found', { count: String(proposals.length) })}\n${proposals.join(', ')}`
}

// One proposal by its word, or all of them, or none: a proposal named "all" is still one word.
async function paneProposals($: EngineInterface, which: { one: string } | 'all' | 'skip'): Promise<void> {
  const L = ctx.locale
  const picked = which === 'skip' ? [] : which === 'all' ? proposals : proposals.filter(p => p === which.one)
  proposals = typeof which === 'string' ? [] : proposals.filter(p => p !== which.one)
  if (picked.length === 0) {
    await paneChanged($, null)
    return
  }
  const now = new Date(await $.clock.now()).toISOString()
  const failed = await serially(async (): Promise<string | null> => {
    const read = await readScope($, 'project')
    if ('refused' in read) return t(L, 'dict_unsaved', { reason: read.refused })
    if ('unreadable' in read) return t(L, 'dict_unreadable')
    let dict = read.dict
    for (const meant of picked) dict = upsert(dict, { meant }, 'bootstrap', now).dict
    const reason = await saveDict($, 'project', dict)
    return reason === null ? null : t(L, 'dict_unsaved', { reason })
  })
  await paneChanged($, failed ?? t(L, 'dict_added', { entry: picked.join(', '), scope: t(L, 'scope_project') }))
}

// The conversation's identifiers, read again only once a new turn has been sent.
async function recentTerms($: EngineInterface): Promise<string[]> {
  try {
    const turns = await $.session.turns()
    if (ctx.terms?.turns === turns) return ctx.terms.list
    const messages = await $.session.messages()
    const list = Array.isArray(messages) ? sessionTerms(messages as ReadonlyArray<{ text: string }>) : []
    ctx.terms = { turns, list }
    return list
  } catch {
    return []
  }
}

async function tick($: EngineInterface): Promise<void> {
  if (!ctx.enabled || ctx.polling) return
  ctx.polling = true
  try {
    const { text } = await $.prompt.read()
    if (text === '' && ctx.det.last !== '') ctx.emptied = dictation()
    else if (text !== '') ctx.emptied = null
    const r = ctx.ready
    if (r && text !== expected(r)) {
      ctx.ready = null
      await clearView($, r.id)
    }
    // Speech went on after the pause: that polish is of a half-said dictation. An emptied prompt is
    // Enter, which waits for it.
    const j = ctx.job
    if (j && text !== '' && text !== j.draft) {
      ctx.abort?.abort()
      ctx.job = null
      await clearView($, j.id)
    }
    // An emptied prompt ends whatever was in it (the snapshot above keeps it for an Enter): a
    // dictation into it next is measured from empty, not from what was cleared.
    if (text.trim() === '') {
      ctx.landed = null
      ctx.tried = null
      if (ctx.job === null) forgetDictation()
    }
    feed($, { type: 'poll', text, at: await $.clock.now() })
  } finally {
    ctx.polling = false
  }
}

function feed($: EngineInterface, ev: DetectorEvent): void {
  const before = ctx.det
  const r = step(before, ev, ctx.cfg.settleMs)
  ctx.det = r.state
  if (ev.type === 'poll' && before.phase === 'candidate' && r.state.phase === 'idle' && r.state.last === before.last && ctx.dictBase === null) {
    ctx.offered = { baseline: before.baseline, text: before.last }
  }
  // Speech after a keyboard edit, even a word too short to polish: what it writes was not typed.
  if (r.state.phase === 'dictating' && ctx.dictBase === null) ctx.learnBase = null
  if (!r.effect) return
  // A single change is a dictation only when it continues one; a recalled prompt is left alone.
  if (r.effect.kind === 'offer' && ctx.dictBase === null) return
  if (ctx.dictBase === null) {
    ctx.dictBase = r.effect.baseline
    ctx.learnBase = null
  }
  // Enter tidies the whole dictation once.
  if (ctx.cfg.polishOn === 'enter') return
  // Polished in the background only: the microphone may still be writing into the prompt.
  void polish($, r.effect.text, findSegment(ctx.dictBase, r.effect.text), ctx.cfg.style)
}

function forgetDictation(): void {
  ctx.dictBase = null
  ctx.ready = null
  ctx.offered = null
}

function dictation(): Dictation {
  return { det: ctx.det, dictBase: ctx.dictBase, ready: ctx.ready, landed: ctx.landed, learnBase: ctx.learnBase, tried: ctx.tried, offered: ctx.offered }
}

async function clearView($: EngineInterface, id: number): Promise<void> {
  await update($, view, v => (v !== null && v.id === id ? null : v))
}

// The text the prompt must still hold for a result to land.
function expected(p: Polished): string {
  return p.draft
}

async function polish($: EngineInterface, draft: string, segment: Segment, style: Style): Promise<Outcome> {
  const id = ++ctx.nextId
  const sent = ctx.sent
  ctx.abort?.abort()
  const abort = new AbortController()
  ctx.abort = abort
  const done = clean($, draft, segment, style, cleanTimeout(segment.text.length), abort.signal)
  ctx.job = { id, draft, done }
  ctx.ready = null
  await update($, view, () => ({ kind: 'polishing', id }))
  const outcome = await done
  if (ctx.job?.id !== id) return outcome
  ctx.job = null
  await present($, id, outcome, sent, draft)
  return outcome
}

async function clean($: EngineInterface, draft: string, segment: Segment, style: Style, timeoutMs: number, signal?: AbortSignal): Promise<Outcome> {
  const original = segment.text.trim()
  const lead = segment.text.slice(0, segment.text.length - segment.text.trimStart().length)
  const trail = segment.text.slice(segment.text.trimEnd().length)
  if (ctx.cfg.dictionary) await syncRoot($)
  const hints = withOwnName(ctx.cfg.dictionary ? pickHints(dicts, await recentTerms($), original) : { terms: [], pairs: [] }, original)
  const active = style === 'minimal' ? [] : effectiveRules(rules.global, rules.project).filter(r => r.enabled)
  const lines = ruleLines(active)
  const req = buildRequest({
    rules: lines,
    dictated: original,
    before: draft.slice(0, segment.start),
    after: draft.slice(segment.end),
    style,
    englishTerms: ctx.cfg.englishTerms,
    language: ctx.language,
    terms: hints.terms,
    pairs: hints.pairs,
  })
  let res: Awaited<ReturnType<EngineInterface['model']['complete']>>
  try {
    res = await $.model.complete({
      model: ctx.cfg.model,
      system: req.system,
      prompt: req.prompt,
      maxTokens: req.maxTokens,
      effort: 'low',
      timeoutMs,
    }, signal ? { signal } : undefined)
  } catch (err) {
    // The engine refuses to send (a blocked model, a bad cap): the original stays.
    $.ui.log(`tidia: the model call was refused (${err instanceof Error ? err.message : String(err)})`, { to: 'debug' })
    return { ok: false }
  }
  if (!res.isAnswered) {
    $.ui.log(`tidia: the model call ended without text (${res.reason})`, { to: 'debug' })
    return { ok: false }
  }
  const cleaned = parseReply(res.text, lines.length)
  if (!cleaned) {
    $.ui.log('tidia: the reply was not the expected JSON', { to: 'debug' })
    return { ok: false }
  }
  const text = cleaned.text.trim()
  // The model sometimes lists a fix it did not make, or one for words nobody said: only a short
  // fix the text carries, of words in the dictation, counts.
  const said = original.toLowerCase()
  const fixes = cleaned.fixes.filter(f => text.includes(f.to) && said.includes(f.from.toLowerCase()) && words(f.to).length <= 4)
  // A rule that asked for labeled lines makes its labels layout; a plain list has none to excuse.
  const verdict = guard(original, text, style, fixes, { labels: cleaned.rules.length > 0 })
  if (!verdict.ok) {
    $.ui.log(`tidia: the guard refused the cleanup (${verdict.reason})`, { to: 'debug' })
    return { ok: false }
  }
  return { ok: true, polished: { draft, segment, original, replacement: lead + text + trail, cleaned: { text, fixes, rules: cleaned.rules, layout: cleaned.layout }, style, conditionalRule: cleaned.rules.some(n => active[n - 1]?.when !== undefined) } }
}

async function present($: EngineInterface, id: number, outcome: Outcome, sent: number, draft: string): Promise<void> {
  if (!outcome.ok) {
    if (ctx.sent === sent) ctx.tried = draft
    await update($, view, () => ({ kind: 'failed', id }))
    $.clock.after(FAILED_VISIBLE_MS, () => void clearView($, id))
    return
  }
  const p = outcome.polished
  if (p.cleaned.text === p.original) {
    if (ctx.sent === sent) ctx.tried = draft
    await clearView($, id)
    return
  }
  const { text } = await $.prompt.read()
  // An Enter since the polish began sent the dictation: the box is the next message's.
  if (text !== expected(p) || ctx.sent !== sent) {
    await clearView($, id)
    return
  }
  // The cleanup shows above the prompt, never in it: no surface says when a recording ends, and a
  // fill stops the microphone, so what was said after the pause was lost (manual check S1,
  // 2026-10-13). Enter sends this result while the prompt still holds what it was made from.
  ctx.ready = { ...p, id }
  await update($, view, (): BandView => ({ kind: 'ready', id, text: replaceSegment(p.draft, p.segment, p.replacement) }))
}

async function dismissOnEdit($: EngineInterface): Promise<void> {
  const v = await read($, view)
  if (v !== null && v.kind !== 'polishing') await update($, view, () => null)
}

// Enter waits for a polish until it lands or the limit runs out.
async function waitToSend($: EngineInterface, id: number, work: Promise<Outcome>, limitMs?: number): Promise<Outcome | null> {
  await update($, view, (): BandView => ({ kind: 'sending', id }))
  if (limitMs === undefined) return work
  return Promise.race([work, $.clock.sleep(limitMs).then(() => null)])
}

// Shown in the transcript with details on; the debug log has it either way.
function notice($: EngineInterface, text: string): void {
  $.ui.log(text, ctx.cfg.debug ? undefined : { to: 'debug' })
}

// A change Claude made without asking is always shown, whatever the details setting.
function told($: EngineInterface, text: string): void {
  $.ui.log(text)
}

// The message shows as the prompt held it: a cleanup made at Enter is told beside it.
const SENT_PREVIEW_CHARS = 300
// The desktop and the terminal draw the cleanup in the person's own row (the UserMessage render
// hook), as message_view says. Elsewhere a log row draws its line breaks as spaces, so each line of
// a list is a row of its own.
async function tellSent($: EngineInterface, said: string, text: string, p: Polished): Promise<void> {
  // Every surface attached now; the one the band last drew on when the engine names none.
  let surfaces: readonly string[] = []
  try {
    surfaces = await $.session.surfaces()
  } catch {
    // The band's surface below.
  }
  if (surfaces.length === 0 && ctx.surface !== null) surfaces = [ctx.surface]
  const mode = sentMode(ctx.locale, p)
  if (surfaces.some(rowSurface)) {
    const sid = await sessionId($)
    const note: SentNote = { said, sent: text, mode, ...(sid !== null ? { session: sid } : {}) }
    await update($, sentNotes, cur => withNote(cur ?? kept, note))
    kept = withNote(kept, note)
    // Other sessions write the store too: the note goes into what it holds now. A note too long
    // to keep, or a full store, costs only the redraw of old bubbles.
    if (!storable(note)) return
    try {
      await $.store.set(SENT_KEY, withNote(parseNotes(await $.store.get(SENT_KEY)), note))
    } catch (err) {
      $.ui.log(`tidia: could not keep the bubble notes (${message(err)})`, { to: 'debug' })
    }
  }
  if (!surfaces.some(s => s !== 'terminal' && s !== 'desktop')) return
  const shown = text.length > SENT_PREVIEW_CHARS ? `${text.slice(0, SENT_PREVIEW_CHARS)}…` : text
  const [first = '', ...rest] = shown.split('\n').filter(line => line.trim() !== '')
  $.ui.log(t(ctx.locale, 'sent_as', { mode, text: first }))
  for (const line of rest) $.ui.log(line)
}

// What the cleanup did, in a word: prose or a list (polish's choice) or minimal, in the person's
// own words where bubble_labels gives them; then whether a rule with a condition applied.
const LABEL_KEYS: Record<LabelKind, Key> = { prose: 'sent_label_prose', list: 'sent_label_list', minimal: 'sent_label_minimal' }
function sentMode(L: Locale, p: Polished): string {
  const kind: LabelKind = p.style === 'minimal' ? 'minimal' : p.cleaned.layout
  const mode = customLabels(ctx.cfg.bubbleLabels)[kind] ?? t(L, LABEL_KEYS[kind])
  return p.conditionalRule ? t(L, 'sent_rules_applied', { mode }) : mode
}

// Why Enter sent the prompt as typed, for a person who turned details on.
function sentAsTyped($: EngineInterface, why: string): null {
  notice($, `tidia: sent as typed (${why})`)
  return null
}

// The note beside each dictated message is short: what Claude does with it is said once, at the
// start of a session and after each compaction (sessionGuide), so a long dictated conversation does
// not carry the same instructions in every turn. The transcript goes in as a JSON string, so
// nothing dictated can close it and speak for Tidia. A cleanup the person edited by hand is what
// they meant: the transcript is then for reference only.
function rawNote(raw: string, edited = false): string {
  const quoted = JSON.stringify(raw)
  return edited
    ? `[tidia] Dictated by voice, tidied, then edited by hand: the message above is what the user meant. Raw transcript, for reference (JSON): ${quoted}`
    : `[tidia] Dictated by voice and tidied before sending; where the meaning differs, this raw transcript is what the user said (JSON): ${quoted}`
}

// What Claude should know about Tidia's notes and tools, once per session.
function sessionGuide(cfg: Config): string {
  return [
    '[tidia] The user may dictate messages by voice. Tidia tidies each one before sending and puts a "[tidia]" note beside it with the raw transcript.',
    'Speech loses its intonation, so a tidied question can read as a statement, and two remarks can come out joined by a negation or contrast the user never said. Where a message and its raw transcript differ in meaning, the transcript is what the user said; when it reads either way, ask rather than act on the tidied reading.',
    cfg.dictionary ? `If a raw transcript shows that speech recognition misheard a word and you are sure which word was meant, from the context or from the user's own correction, add it with the ${DICT_TOOL} tool (action dict_add with heard and meant), then tell the user in one short line. Do not add ordinary words, guesses, or anything the user did not say.` : '',
    `When the user says how their own dictated messages should be written (for example "when I talk about a bug, put it as symptom, steps, expected"), that is a Tidia rule, not a request about your replies: add it with the ${RULES_TOOL} tool's rule_add at once. If they keep asking for their dictated messages to be shaped the same way, offer it by calling rule_add. Either way they allow or decline it in a dialog, so do not ask in chat first.`,
  ].filter(Boolean).join('\n')
}

const PASTED = /\[(?:Pasted text|Image) #\d+/
// Where Tidia redraws the person's row for a message tidied at Enter: the desktop draws the prompt
// as dictated, so always; the terminal draws the message sent, so only to show more than it.
function rowSurface(surface: string): boolean {
  return surface === 'desktop' || (surface === 'terminal' && ctx.cfg.messageView !== 'tidied')
}

// Where the person's own messages come from: the terminal's composer, the desktop app (sdk), Remote
// Control, and a row stored before origins were (unclassified).
const PERSON: ReadonlySet<string> = new Set(['composer', 'sdk', 'bridge', 'unclassified'])

// Claude Code submits the transcript as it lands in tap mode, or on release with voice.autoSubmit.
async function voiceSubmits($: EngineInterface): Promise<boolean> {
  try {
    const voice = ((await $.settings.read()) as { voice?: { mode?: unknown; autoSubmit?: unknown } }).voice
    return voice?.mode === 'tap' || voice?.autoSubmit === true
  } catch {
    return false
  }
}

// Other sessions send too: the prints go into what the store holds now. Losing them costs only a
// recalled prompt tidied again.
async function rememberPrints($: EngineInterface, texts: readonly string[]): Promise<void> {
  prints = withPrints(prints, texts)
  try {
    await $.store.set(PRINTS_KEY, withPrints(parsePrints(await $.store.get(PRINTS_KEY)), texts))
  } catch (err) {
    $.ui.log(`tidia: could not keep the sent prompts (${message(err)})`, { to: 'debug' })
  }
}

async function polishForSubmit($: EngineInterface, text: string, d: Dictation): Promise<{ text: string; raw: string; polished: Polished } | null> {
  if (!ctx.enabled) return null
  // Bash mode and slash commands are not messages to tidy.
  if (/^[!/]/.test(text)) return null
  const ready = d.ready
  if (ready && expected(ready) === text) {
    return { text: replaceSegment(ready.draft, ready.segment, ready.replacement), raw: ready.original, polished: ready }
  }
  if (ready) notice($, 'tidia: the prompt changed after the pause, tidying it again')
  const job = ctx.job
  if (job && job.draft === text) {
    // The message takes the result, so polish() must not also put it in the prompt, and a polish
    // of the next dictation, begun while this one is awaited, must not cancel it.
    ctx.job = null
    ctx.abort = null
    const outcome = await waitToSend($, job.id, job.done, JOB_WAIT_MS)
    if (!outcome) return sentAsTyped($, 'the cleanup took too long')
    if (!outcome.ok) return sentAsTyped($, 'the cleanup failed or was refused')
    const p = outcome.polished
    return { text: replaceSegment(p.draft, p.segment, p.replacement), raw: p.original, polished: p }
  }
  // A pause polish already tried this very prompt.
  if (d.tried === text) return null
  // Enter right after speaking, tap mode and voice.autoSubmit send before the dictation settled.
  const det = d.det
  let base = d.dictBase ?? (det.phase === 'dictating' ? det.baseline : null)
  // Tap mode and autoSubmit put the final transcript in and submit it, so the poll saw the speech
  // once or not at all. Under hold-to-talk without autoSubmit that is a recalled prompt.
  const unseen = det.phase === 'idle' && text !== det.last
  const offered = d.offered
  const seenOnce =
    det.phase === 'candidate' ? det.baseline
    : det.phase === 'idle' && det.last === text && offered?.text === text ? offered.baseline
    : null
  if (base === null && (unseen || seenOnce !== null) && (await voiceSubmits($))) {
    // ↑ puts a past prompt in at once too: one sent before is recalled, not spoken. Enter after ↑
    // is a key press of its own, so the poll saw it; what the voice puts in goes out before a poll,
    // and the same words said again are speech.
    if (!unseen && prints.includes(promptPrint(text))) return null
    // The final transcript replaces what the voice showed while listening (2026-10-14: "And", heard
    // in the silence before a Chinese sentence).
    const shown = offered !== null && offered.text === det.last ? offered.baseline : null
    base = seenOnce ?? (shown !== null && !keeps(det.last, text) ? shown : det.last)
  }
  if (base === null) return det.phase === 'idle' && text === det.last ? null : sentAsTyped($, 'no dictation was seen in the prompt')
  // The engine has emptied the prompt by now, so the message itself must be the prompt from before
  // the dictation with one run put in. Typing ends a dictation; a paste shows as a placeholder in
  // the prompt and arrives expanded.
  if (PASTED.test(det.last)) return sentAsTyped($, 'the prompt holds a paste')
  const segment = findSegment(base, text)
  if (!keeps(base, text)) return sentAsTyped($, 'the text around the dictation changed')
  if (countWords(segment.text) < MIN_WORDS) return null
  // The send replaces any polish of the half-said text: it must not show that one's result.
  ctx.abort?.abort()
  ctx.job = null
  const outcome = await waitToSend($, ++ctx.nextId, clean($, text, segment, ctx.cfg.style, Math.min(cleanTimeout(segment.text.length), SUBMIT_WAIT_MS)))
  if (!outcome?.ok) return sentAsTyped($, 'the cleanup failed or was refused')
  const p = outcome.polished
  notice($, t(ctx.locale, 'sent_polished'))
  return { text: replaceSegment(p.draft, p.segment, p.replacement), raw: p.original, polished: p }
}

// Whether text is base with one run put in.
function keeps(base: string, text: string): boolean {
  const segment = findSegment(base, text)
  return text.slice(0, segment.start) + text.slice(segment.end) === base
}

const LEARN_VISIBLE_MS = 10_000

// What the person retyped over the raw dictation before sending, as heard -> meant pairs.
function retyped(sent: string): EntryInput[] {
  return ctx.learnBase ? corrections(ctx.learnBase.text, sent, ctx.learnBase.region) : []
}

async function showLearned($: EngineInterface, c: EntryInput): Promise<void> {
  const id = ++ctx.nextId
  await update($, view, (): BandView => ({ kind: 'learned', id, meant: c.meant, ...(c.heard !== undefined ? { heard: c.heard } : {}) }))
  $.clock.after(LEARN_VISIBLE_MS, () => void clearView($, id))
}

// Runs after the message went out: a store failure only costs the lesson.
async function learn($: EngineInterface, found: EntryInput[]): Promise<void> {
  if (found.length === 0) return
  const now = new Date(await $.clock.now()).toISOString()
  const shown = await serially(async () => {
    const read = await readScope($, 'global')
    if (!('dict' in read)) return null
    let dict = read.dict
    let first: EntryInput | null = null
    for (const c of found) {
      const r = learnFrom(dict, c, now)
      dict = r.dict
      if (!first && r.outcome === 'added') first = c
    }
    if (dict === read.dict) return null
    return (await saveDict($, 'global', dict)) === null ? first : null
  })
  if (shown) await showLearned($, shown)
}

// The submit takes the dictation as it starts, so a dictation begun while it waits for the
// model is the next message's and is kept.
function takeDictation($: EngineInterface): Dictation {
  const d = dictation()
  ctx.landed = null
  ctx.learnBase = null
  ctx.emptied = null
  ctx.tried = null
  forgetDictation()
  feed($, { type: 'submit' })
  return d
}

async function afterSubmit($: EngineInterface): Promise<void> {
  await update($, view, v => (v !== null && (v.kind === 'sending' || v.kind === 'ready') ? null : v))
}

function choices(setting: Setting): string {
  return setting.kind === 'choice' ? setting.options.join(' | ') : setting.kind === 'text' ? `<text> | none` : 'on | off'
}

function settingsText(L: Locale): string {
  const now = currentValues(ctx.cfg)
  const rows = SETTINGS.map(s => {
    const value = now[s.key]
    return `  ${s.key} = ${value === undefined ? '' : showValue(value)}   (${choices(s)})\n      ${t(L, `desc_${s.key}` as Key)}`
  })
  return [t(L, 'settings_head'), ...rows].join('\n')
}

type SettingResult = { ok: true; key: string; value: SetValue } | { ok: false; text: (L: Locale) => string }

// Changes a userConfig field the way /config does; the engine then reloads the mod with it.
async function applySetting($: EngineInterface, args: string): Promise<SettingResult> {
  const r = parseSet(args)
  if (!r.ok) {
    if (r.error === 'usage') return { ok: false, text: L => t(L, 'set_usage') }
    if (r.error === 'key') {
      const key = r.key
      return { ok: false, text: L => t(L, 'set_bad_key', { key, keys: SETTINGS.map(s => s.key).join(', ') }) }
    }
    const key = r.key
    const setting = findSetting(key)
    return { ok: false, text: L => t(L, 'set_bad_value', { key, choices: setting ? choices(setting) : '' }) }
  }
  try {
    const res = await $.config.set({ key: `tidia.${r.key}`, value: r.value })
    const deny = res.deny
    if (deny !== undefined) return { ok: false, text: L => t(L, 'set_denied', { key: r.key, reason: deny }) }
  } catch (err) {
    const reason = message(err)
    return { ok: false, text: L => t(L, 'set_denied', { key: r.key, reason }) }
  }
  return { ok: true, key: r.key, value: r.value }
}

function settingText(L: Locale, r: SettingResult): string {
  return r.ok ? t(L, 'set_done', { key: r.key, value: showValue(r.value) }) : r.text(L)
}

async function changeSetting($: EngineInterface, L: Locale, args: string): Promise<string> {
  return settingText(L, await applySetting($, args))
}

// Turns polishing on or off for this session, from /tidia on|off or Claude.
async function setEnabled($: EngineInterface, on: boolean): Promise<void> {
  ctx.landed = null
  if (on) {
    ctx.enabled = true
    ctx.learnBase = null
    ctx.det = initial('')
    forgetDictation()
    await keepSession($)
    return
  }
  ctx.enabled = false
  ctx.learnBase = null
  ctx.job = null
  ctx.abort?.abort()
  forgetDictation()
  await update($, view, () => null)
  await keepSession($)
}

export const register: Register = (on, options) => {
  ctx = fresh(parseConfig(options))

  // Each step on its own: one that fails costs its part, not the polling or the command.
  on('session.start', async ($, e, next) => {
    const step = async (what: string, work: () => Promise<void>) => {
      try {
        await work()
      } catch (err) {
        $.ui.log(`tidia: could not ${what} (${message(err)})`, { to: 'debug' })
      }
    }
    await step('read the language setting', async () => {
      const settings = (await $.settings.read()) as { language?: unknown }
      ctx.locale = resolveLocale(ctx.cfg.uiLanguage, settings.language)
      ctx.language = typeof settings.language === 'string' ? settings.language : undefined
    })
    // A reload after a settings change keeps /tidia off and the recent messages.
    await step('read the session state', async () => {
      const keep = await read($, sessionKeep)
      if (keep) {
        ctx.enabled = keep.enabled
        ctx.said = keep.said
      }
    })
    await step('read the dictionary', () => loadDicts($))
    await step('read the bubble notes', async () => {
      kept = parseNotes(await $.store.get(SENT_KEY))
    })
    await step('read the sent prompts', async () => {
      prints = parsePrints(await $.store.get(PRINTS_KEY))
    })
    await step('register /tidia', async () => {
      await $.command.register({ name: 'tidia', description: 'Tidia: status, settings, dictionary, rules, on, off', argumentHint: '[on|off|settings|set <setting> <value>|dict|rules]' })
    })
    await step('move the settings of an older version', () => migrateOld($))
    await step('offer the dictionary tool', async () => {
      for (const spec of TOOL_SPECS) await $.tool.register(toolRegistration(spec))
    })
    // Whatever is already in the prompt is the baseline, not a dictation.
    await step('read the prompt', async () => {
      ctx.det = initial((await $.prompt.read()).text)
    })
    $.clock.every(POLL_MS, () => void tick($))
    return next(e)
  })

  // /clear, /resume and /branch reset $.state; start the detector over with them.
  on('classic.SessionStart', async ($, e, next) => {
    if (e.transcript_path) transcriptAt = { dir: e.transcript_path.replace(/\/[^/]*$/, ''), root: e.cwd }
    if (e.source === 'clear' || e.source === 'resume' || e.source === 'fork') {
      // A polish of the old conversation must not land in the new one, nor its id match a new job's.
      ctx.abort?.abort()
      const nextId = ctx.nextId
      session = undefined
      ctx = fresh(ctx.cfg, ctx.locale, ctx.enabled, ctx.language)
      ctx.nextId = nextId
      // The new conversation's state starts empty: /tidia off must still outlive a reload.
      await keepSession($)
    }
    const r = await next(e)
    // Once per conversation, and again after a compaction summarised the turns that said it.
    if (!ctx.enabled) return r
    return { ...r, additionalContext: [...(r.additionalContext ?? []), sessionGuide(ctx.cfg)] }
  }).catch(($, e, next) => next(e))

  on('prompt.edit', async ($, e, next) => {
    const box = await next(e)
    if (ctx.enabled) {
      // Held Space repeats may come folded into one edit, without a key.
      const isSpace = /^ +$/.test(e.inputText) && e.start === e.end
      // Hold-to-talk types spaces while the microphone warms up; any other edit ends the dictation.
      if (!isSpace) {
        if (ctx.dictBase !== null && ctx.learnBase === null) {
          const seg = findSegment(ctx.dictBase, e.text)
          ctx.learnBase = { text: e.text, region: { start: seg.start, end: seg.end } }
        }
        forgetDictation()
        // An emptied prompt starts over: what is typed next is a new message, not a correction, and
        // carries no transcript of the cleanup that was there.
        if (box.text.trim() === '') {
          ctx.learnBase = null
          ctx.landed = null
        }
      }
      feed($, { type: 'edit', text: box.text, at: await $.clock.now(), isSpace })
      await dismissOnEdit($)
    }
    return box
  })

  on('prompt.fill', async ($, e, next) => {
    const r = await next(e)
    // Tidia's own fill sets the detector itself.
    if (e.origin.kind === 'plugin' && e.origin.name === 'tidia') return r
    // The fill result carries no text; the box holds the outcome of every fill mode.
    if (r.isFilled && ctx.enabled) {
      ctx.learnBase = null
      ctx.landed = null
      forgetDictation()
      feed($, { type: 'fill', text: (await $.prompt.read()).text })
    }
    return r
  })

  on('prompt.submit', async ($, e, next) => {
    // Notifications, peers, channels, schedules and other plugins submit too; only the person's own Enter is ours.
    if (e.origin.kind !== 'composer') return next(e)
    ctx.sent += 1
    // A poll between Enter emptying the box and this hook took the emptied box for Esc.
    const emptied = ctx.emptied
    if (emptied && emptied.det.last === e.text) Object.assign(ctx, emptied)
    const found = ctx.enabled && ctx.cfg.dictionary && ctx.cfg.learn === 'ask' ? retyped(e.text) : []
    const d = takeDictation($)
    const landed = d.landed
    const rewritten = await polishForSubmit($, e.text, d)
    const text = rewritten?.text ?? e.text
    // A landed cleanup is sent as the prompt holds it, edits and all; what was said goes beside it.
    // More speech after it is tidied on its own: what was said is both runs.
    const before = landed !== null && e.text.includes(landed.text) ? `${landed.raw} ` : ''
    const raw = rewritten ? before + rewritten.raw : landed !== null && text.trim() !== '' ? landed.raw : null
    const edited = !rewritten && landed !== null && text !== landed.text
    if (rewritten && rewritten.text !== e.text) await tellSent($, e.text, rewritten.text, rewritten.polished)
    const context = [...(e.context ?? [])]
    if (raw !== null && ctx.cfg.attachRaw && raw !== text) context.push(rawNote(raw, edited))
    ctx.said = [{ text, raw }, ...ctx.said].slice(0, SAID_DEPTH)
    void rememberPrints($, [e.text, text])
    await keepSession($)
    await afterSubmit($)
    // Learning waits for nothing and changes nothing in the message.
    void learn($, found)
    return next({ ...e, text, ...(context.length > 0 ? { context } : {}) })
  }).catch(($, e, next) => next(e))

  // The model's arguments arrive flat beside `tool`; they are its input, so polishTool checks each one.
  for (const spec of TOOL_SPECS) {
    // The three share one input type, so the id is typed as one of them.
    const tool = `${TOOL_PREFIX}${spec.name}` as typeof DICT_TOOL
    on('tool.call', { tool }, async ($, e) => {
      const args = { ...e } as Record<string, unknown>
      const action = typeof args.action === 'string' ? args.action : ''
      if (toolOf(action) !== spec) return { result: `Unknown action. Use one of: ${spec.actions.join(', ')}.` }
      return { result: (await permission($, tool, args)) ?? (await polishTool($, args)) }
    }).catch(($, _e) => ({ result: 'Not changed: Tidia hit an error.' }))
    // Only lifts the engine's ask: a deny rule the person set still holds.
    on('tool.check', { tool }, async ($, e, next) => {
      const verdict = await next(e)
      const input = (e.input ?? {}) as Record<string, unknown>
      return verdict.decision === 'ask' && toolOf(String(input.action)) === spec && (await autoAllowed($, input)) ? { decision: 'allow' as const } : verdict
    }).catch(($, e, next) => next(e))
  }

  on('command.run', { command: 'tidia' }, async ($, e) => {
    const L = ctx.locale
    const raw = e.args.trim()
    const arg = raw.toLowerCase()
    if (arg === 'rules') return { text: await rulesText($, L) }
    if (arg === 'dict' || arg.startsWith('dict ')) {
      const text = await dictCommand($, L, raw.slice(4).trim())
      return text === null ? {} : { text }
    }
    if (arg === '') {
      return {
        text: t(L, 'cmd_status', {
          state: t(L, ctx.enabled ? 'state_on' : 'state_off'),
          mode: ctx.cfg.polishOn,
          style: ctx.cfg.style,
          terms: ctx.cfg.englishTerms,
        }),
      }
    }
    if (arg === 'settings') return { text: settingsText(L) }
    if (arg === 'set' || arg.startsWith('set ')) return { text: await changeSetting($, L, e.args.trim().slice(3)) }
    if (arg === 'on' || arg === 'off') {
      await setEnabled($, arg === 'on')
      return { text: t(L, arg === 'on' ? 'cmd_on' : 'cmd_off') }
    }
    return { text: t(L, 'cmd_unknown', { arg }) }
  })

  on('ui.render', async ($, e, next) => {
    if (e.component === 'Pane' && e.requestId === PANE_ID) {
      const s = await read($, paneState)
      return renderDictPane($.ui.resolve(e) as unknown as PaneEls, paneModel(s?.message ?? null), ctx.locale, {
        add: text => void paneAdd($, text),
        remove: key => void paneRemove($, key),
        approve: key => void paneCandidate($, key, true),
        dismiss: key => void paneCandidate($, key, false),
        propose: key => void paneProposals($, { one: key }),
        proposeAll: () => void paneProposals($, 'all'),
        skipProposals: () => void paneProposals($, 'skip'),
        toggleRule: key => void paneRule($, key, false),
        removeRule: key => void paneRule($, key, true),
        close: () => void $.ui.close({ id: PANE_ID }),
      })
    }
    if (e.component === 'UserMessage') {
      // The person's own rows only, so no other row subscribes to the notes. The terminal already
      // draws the message sent, which is all the tidied view shows.
      if (!rowSurface(e.surface) || !PERSON.has(e.props.origin.kind)) return next(e)
      const notes = (await read($, sentNotes)) ?? kept
      if (notes.length === 0) return next(e)
      const text = sentRowText(notes, { text: e.props.text, session: await sessionId($) }, ctx.cfg.messageView)
      return next(text === null ? e : { ...e, props: { ...e.props, text } })
    }
    if (e.component !== 'AbovePrompt') return next(e)
    ctx.surface = e.surface
    const v = await read($, view)
    if (v === null || e.props.hasSurvey) return next(e)
    // Without details the band only says a cleanup is on its way, so Enter can wait for it.
    if (!ctx.cfg.debug && v.kind !== 'polishing' && v.kind !== 'sending' && v.kind !== 'ready') return next(e)
    return renderBand($.ui.resolve(e) as unknown as BandEls, v, ctx.locale)
  })
}
