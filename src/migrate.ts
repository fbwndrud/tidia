// Settings older versions saved that 0.1.21 on has no field for. Claude Code passes register()
// only the fields plugin.json declares now, and a saved value outside a field's options reads as
// unset, so they are read from settings.json (pluginConfigs) and moved once: light to minimal, a
// tone to its register starter, the person's own notes and markdown to rules (step 1, 0.1.21), and
// show_raw to message_view (step 2, 0.1.22). The store keeps the last step done.
import { addRule, ruleInput, updateRule, type Rules } from './rules'

export const MIGRATED_KEY = 'migrated'
export const MIGRATION_STEP = 2

const TONE_STARTERS: Record<string, string> = { polite: 'starter-polite', casual: 'starter-casual', as_spoken: 'starter-as-spoken' }
// The old markdown style, as a rule.
const MARKDOWN_RULE = "Lay it out as structured Markdown: each request, step or point on its own line starting with '- ', under a short label line when there are distinct parts."

// Tidia's saved options in a settings.json: keyed tidia@<marketplace>, or tidia from --plugin-dir.
export function savedOptions(settings: unknown): Record<string, unknown> | null {
  const configs = (settings as { pluginConfigs?: unknown } | null)?.pluginConfigs
  if (configs === null || typeof configs !== 'object') return null
  for (const [key, value] of Object.entries(configs)) {
    if (key !== 'tidia' && key !== 'tidia@inline' && !key.startsWith('tidia@')) continue
    const options = (value as { options?: unknown } | null)?.options
    if (options !== null && typeof options === 'object') return options as Record<string, unknown>
  }
  return null
}

export type Migration = { rules: Rules; config: Array<{ key: string; value: string }>; moved: string[] }

const VIEWS: Record<string, string> = { show: 'full', hide: 'labeled' }

// What the old options become after step `done`, or null when there is nothing to move.
export function migrate(options: Record<string, unknown>, rules: Rules, done = 0): Migration | null {
  let r = rules
  const moved: string[] = []
  const config: Migration['config'] = []
  if (done < 2) {
    const view = typeof options.show_raw === 'string' ? VIEWS[options.show_raw] : undefined
    if (view) {
      config.push({ key: 'message_view', value: view })
      moved.push(`show_raw ${String(options.show_raw)} → message_view ${view}`)
    }
  }
  if (done >= 1) return moved.length > 0 ? { rules: r, config, moved } : null
  if (options.style === 'light') {
    config.push({ key: 'style', value: 'minimal' })
    moved.push('style light → minimal')
  }
  const add = (text: unknown, what: string) => {
    const input = ruleInput(text, undefined)
    if (!input || r.rules.some(x => x.text === input.text)) return
    const a = addRule(r, 'global', input, 'user')
    if ('full' in a) return
    r = a.rules
    moved.push(`${what} → rule ${a.rule.id}`)
  }
  // Light took no tone, notes or layout.
  if (options.style !== 'light') {
    const id = typeof options.tone === 'string' ? TONE_STARTERS[options.tone] : undefined
    if (id && !r.starters[id]?.enabled) {
      r = updateRule(r, id, { enabled: true })!.rules
      moved.push(`tone ${String(options.tone)} → ${id}`)
    }
    add(options.tone_note, 'tone_note')
    if (options.style === 'custom') add(options.custom_note, 'custom_note')
    if (options.style === 'markdown') add(MARKDOWN_RULE, 'style markdown')
  }
  return moved.length > 0 ? { rules: r, config, moved } : null
}
