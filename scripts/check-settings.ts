// plugin.json, /tidia set and parseConfig must name the same settings with the same choices and
// defaults. The plugin test sandbox loads no JSON, so this runs under bun: bun scripts/check-settings.ts
import manifest from '../.claude-plugin/plugin.json'
import { parseConfig } from '../src/config'
import { currentValues, SETTINGS } from '../src/settings'

const fields = (manifest as unknown as { userConfig: Record<string, { type: string; options?: string[]; default: unknown }> }).userConfig
const defaults = currentValues(parseConfig({})) as Record<string, unknown>
const problems: string[] = []
const keys = SETTINGS.map(s => s.key)
for (const k of Object.keys(fields)) if (!keys.includes(k)) problems.push(`${k}: in plugin.json, not in SETTINGS`)
for (const s of SETTINGS) {
  const f = fields[s.key]
  if (!f) {
    problems.push(`${s.key}: in SETTINGS, not in plugin.json`)
    continue
  }
  const type = s.kind === 'boolean' ? 'boolean' : 'string'
  if (f.type !== type) problems.push(`${s.key}: type ${f.type}, expected ${type}`)
  if (s.kind === 'choice' && JSON.stringify(f.options) !== JSON.stringify(s.options)) problems.push(`${s.key}: options ${JSON.stringify(f.options)} vs ${JSON.stringify(s.options)}`)
  if (JSON.stringify(f.default) !== JSON.stringify(defaults[s.key])) problems.push(`${s.key}: default ${JSON.stringify(f.default)} vs ${JSON.stringify(defaults[s.key])}`)
}
if (problems.length > 0) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log(`settings match plugin.json (${SETTINGS.length})`)
