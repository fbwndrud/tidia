#!/usr/bin/env python3
"""Golden-set evaluation: sends each case in eval/cases.json through the mod's own request
builder, a real model call (`claude -p`, the user's account) and the mod's own guard, then
writes a report to eval/results/<date>.md.

Usage: python3 -I eval/run.py [--model sonnet] [--effort low] [--style polish] [--english-terms auto]
                              [--jobs 4] [--only ko,en] [--ids 'ko-g*,en-1'] [--exclude 'ko-g3']
                              [--kinds C1,C7] [--repeat 1]

A case may set its own "style" and "englishTerms"; a case's value wins over the flag. Its
optional "kinds" lists the input kinds (C1–C15 in docs/test-plan.md) it covers.

Model calls run with --setting-sources project from an empty folder, so the caller's own
hooks and plugins do not change what the model sees.
"""
import argparse, concurrent.futures, datetime, fnmatch, json, pathlib, re, shutil, subprocess, sys, tempfile, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
COPY = ['.claude-plugin', 'hooks', 'src', 'types', 'tsconfig.json']


def run_tests(mod: pathlib.Path, name: str, body: str) -> str:
    tests = mod / 'tests'
    shutil.rmtree(tests, ignore_errors=True)
    tests.mkdir()
    (tests / f'{name}.test.ts').write_text(body)
    out = subprocess.run(['claude', 'plugin', 'test', str(mod)], stdin=subprocess.DEVNULL, capture_output=True, text=True)
    return out.stdout + out.stderr


def marked(output: str, tag: str) -> dict:
    found = {}
    for m in re.finditer(rf'@@{tag} (\S+) (.*?)@@END@@', output, re.S):
        found[m.group(1)] = json.loads(m.group(2))
    return found


# The rules a case runs with, as a TypeScript expression: its own `rules` lines, the starter rules
# turned on, or the rules exactly as the mod sends them by default (none in minimal, as in the mod).
RULES_IMPORT = "import { effectiveRules, emptyRules, REGISTER_IDS, ruleLines, STARTER_RULES } from '../src/rules'"


def rules_expr(c):
    if c['style'] == 'minimal':
        return '[]'
    if 'rules' in c:
        return json.dumps(c['rules'], ensure_ascii=False)
    # The starter rules are off by default; a case with "starters" runs with the shape ones on (the
    # register starters contradict each other, and at most one is on).
    if c.get('starters'):
        return "ruleLines(effectiveRules({ ...emptyRules(), starters: Object.fromEntries(STARTER_RULES.filter(s => !REGISTER_IDS.includes(s.id)).map(s => [s.id, { enabled: true }])) }, emptyRules()))"
    return 'ruleLines(effectiveRules(emptyRules(), emptyRules()))'


def build_requests(mod, cases):
    lines = ["import { test } from 'claude-code/testing'", "import { buildRequest } from '../src/cleaner'",
             "import { resolveTerms } from '../src/language'", "import { withOwnName } from '../src/dict/dict'", RULES_IMPORT, "test('dump', () => {"]
    for c in cases:
        args = {'dictated': c['dictated'].strip(), 'before': '', 'after': '', 'style': c['style'], 'englishTerms': c['englishTerms'], 'terms': c.get('terms', []), 'pairs': c.get('pairs', [])}
        a = json.dumps(args, ensure_ascii=False)
        # `level`: what englishTerms resolved to for this dictation (auto picks one per language).
        # Hints go through withOwnName as they do in the mod, so a dictation that says Tidia gets its spelling.
        lines.append(f"  {{ const b = {a}; const a = {{ ...b, ...withOwnName({{ terms: b.terms, pairs: b.pairs }}, b.dictated), rules: {rules_expr(c)} }}; console.log('@@REQ {c['id']} ' + JSON.stringify({{ ...buildRequest(a), level: resolveTerms(a.englishTerms, a.dictated) }}) + '@@END@@') }}")
    lines.append('})')
    reqs = marked(run_tests(mod, 'dump', '\n'.join(lines) + '\n'), 'REQ')
    missing = [c['id'] for c in cases if c['id'] not in reqs]
    if missing:
        sys.exit(f'could not build requests for {missing}')
    return reqs


def call_model(req, model, effort, cwd):
    started = time.time()
    out = subprocess.run(
        ['claude', '-p', '--setting-sources', 'project', '--model', model, '--effort', effort, '--tools', '',
         '--output-format', 'json', '--system-prompt', req['system'], req['prompt']],
        # claude -p appends whatever arrives on stdin to the prompt: give it nothing.
        stdin=subprocess.DEVNULL, capture_output=True, text=True, cwd=cwd, timeout=180,
    )
    wall = int((time.time() - started) * 1000)
    try:
        d = json.loads(out.stdout)
        usage = d.get('usage') or {}
        return {'reply': d.get('result', ''), 'api_ms': d.get('duration_api_ms'), 'wall_ms': wall,
                'thinking': (usage.get('output_tokens_details') or {}).get('thinking_tokens'), 'error': None}
    except json.JSONDecodeError:
        return {'reply': '', 'api_ms': None, 'wall_ms': wall, 'thinking': None, 'error': (out.stderr or out.stdout)[:300]}


PROBE = """import type {{ Register }} from 'claude-code'

const REQS: Array<{{ id: string; system: string; prompt: string; maxTokens: number }}> = {reqs}

export const register: Register = (on) => {{
  on('session.start', async ($, e, next) => {{
    for (let i = 0; i < REQS.length; i += {jobs}) {{
      const batch = REQS.slice(i, i + {jobs})
      const done = await Promise.all(batch.map(async r => {{
        const t0 = await $.clock.now()
        const res = await $.model.complete({{ model: '{model}', system: r.system, prompt: r.prompt, maxTokens: r.maxTokens, effort: '{effort}', timeoutMs: 60000 }})
        const t1 = await $.clock.now()
        return {{ id: r.id, ms: t1 - t0, reply: res.isAnswered ? res.text : '', error: res.isAnswered ? null : res.reason }}
      }}))
      for (const d of done) $.ui.log('@@RES ' + d.id + ' ' + JSON.stringify(d) + '@@END@@')
    }}
    return next(e)
  }})
}}
"""


def call_engine(reqs, cases, model, effort, jobs, tmp):
    """The mod's own path: $.model.complete inside a session, with the caller's real settings."""
    probe = pathlib.Path(tmp) / 'probe'
    (probe / '.claude-plugin').mkdir(parents=True)
    (probe / 'hooks').mkdir()
    (probe / '.claude-plugin' / 'plugin.json').write_text(json.dumps({'name': 'tidia-eval-probe', 'version': '0.0.0'}))
    (probe / 'hooks' / 'hooks.json').write_text(json.dumps({'modules': ['./probe.ts']}))
    items = [{'id': c['id'], **{k: reqs[c['id']][k] for k in ('system', 'prompt', 'maxTokens')}} for c in cases]
    (probe / 'hooks' / 'probe.ts').write_text(PROBE.format(reqs=json.dumps(items, ensure_ascii=False), jobs=jobs, model=model, effort=effort))
    empty = pathlib.Path(tmp) / 'engine-cwd'
    empty.mkdir()
    out = subprocess.run(
        ['claude', '-p', '--plugin-dir', str(probe), '--model', 'haiku', '--tools', '', '--output-format', 'stream-json', '--verbose', 'Reply with OK.'],
        stdin=subprocess.DEVNULL, capture_output=True, text=True, cwd=empty, timeout=1800,
    )
    # stream-json wraps each ui_log line in a JSON event: unwrap every string first.
    texts = []

    def collect(v):
        if isinstance(v, str):
            texts.append(v)
        elif isinstance(v, dict):
            for x in v.values():
                collect(x)
        elif isinstance(v, list):
            for x in v:
                collect(x)

    for line in out.stdout.splitlines():
        try:
            collect(json.loads(line))
        except json.JSONDecodeError:
            pass
    found = marked('\n'.join(t for t in texts if '@@RES' in t), 'RES')
    replies = {}
    for c in cases:
        r = found.get(c['id'])
        replies[c['id']] = {'reply': r['reply'], 'api_ms': r['ms'], 'wall_ms': r['ms'], 'thinking': None, 'error': r['error']} if r else \
            {'reply': '', 'api_ms': None, 'wall_ms': None, 'thinking': None, 'error': 'no result (probe output: ' + (out.stdout + out.stderr)[-300:] + ')'}
    return replies


def check(mod, cases, replies):
    lines = ["import { test } from 'claude-code/testing'", "import { parseReply } from '../src/cleaner'", "import { guard } from '../src/guard'", "import { words } from '../src/tokens'", RULES_IMPORT, "test('check', () => {"]
    for c in cases:
        lines.append(f"""  {{
    const original = {json.dumps(c['dictated'].strip(), ensure_ascii=False)}
    const parsed = parseReply({json.dumps(replies[c['id']]['reply'], ensure_ascii=False)}, ({rules_expr(c)}).length)
    const text = parsed ? parsed.text.trim() : ''
    // As in the mod (hooks/register.ts clean): a short fix the text carries, of words in the
    // dictation, and line labels excused only when a rule applied.
    const fixes = parsed ? parsed.fixes.filter(f => text.includes(f.to) && original.toLowerCase().includes(f.from.toLowerCase()) && words(f.to).length <= 4) : []
    const verdict = parsed ? guard(original, text, '{c['style']}', fixes, {{ labels: parsed.rules.length > 0 }}) : {{ ok: false, reason: 'parse' }}
    console.log('@@CHK {c['id']} ' + JSON.stringify({{ text, verdict }}) + '@@END@@')
  }}""")
    lines.append('})')
    return marked(run_tests(mod, 'check', '\n'.join(lines) + '\n'), 'CHK')


def absent_ok(text, word):
    # A filler is a whole word: "어" must not match inside "어떻게". A longer Korean word takes
    # particles and endings ("모드를", "삭제했습니다"), so it matches inside a word.
    if ' ' in word or re.search(r'[぀-ヿ一-鿿]', word) or (len(word) >= 2 and re.fullmatch(r'[가-힣]+', word)):
        return word not in text
    return re.search(rf'(?<![\w]){re.escape(word)}(?![\w])', text, re.I) is None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', default='sonnet')
    ap.add_argument('--effort', default='low')
    ap.add_argument('--style', default='polish', choices=['polish', 'minimal'])
    ap.add_argument('--english-terms', default='auto', choices=['auto', 'off', 'low', 'medium', 'high'])
    ap.add_argument('--repeat', type=int, default=1)
    # engine: through $.model.complete in a real session (what users get); cli: claude -p --system-prompt.
    ap.add_argument('--via', choices=['engine', 'cli'], default='engine')
    ap.add_argument('--jobs', type=int, default=4)
    ap.add_argument('--only', default='', help='languages, comma-separated')
    ap.add_argument('--ids', default='', help='case id patterns to keep, comma-separated (fnmatch: ko-g*)')
    ap.add_argument('--exclude', default='', help='case id patterns to drop, comma-separated')
    ap.add_argument('--kinds', default='', help='keep cases covering any of these kinds (C1,C7)')
    a = ap.parse_args()
    cases = json.loads((ROOT / 'eval' / 'cases.json').read_text())
    if a.only:
        langs = set(a.only.split(','))
        cases = [c for c in cases if c['lang'] in langs]
    pats = lambda v: [p for p in v.split(',') if p]
    if a.ids:
        cases = [c for c in cases if any(fnmatch.fnmatchcase(c['id'], p) for p in pats(a.ids))]
    if a.exclude:
        cases = [c for c in cases if not any(fnmatch.fnmatchcase(c['id'], p) for p in pats(a.exclude))]
    if a.kinds:
        kinds = set(pats(a.kinds))
        cases = [c for c in cases if kinds & set(c.get('kinds', []))]
    if not cases:
        sys.exit('no cases selected')
    # A case's own style / englishTerms wins over the flags.
    cases = [dict(c, style=c.get('style') or a.style, englishTerms=c.get('englishTerms') or a.english_terms) for c in cases]
    # --repeat runs each case several times: haiku at low effort varies a lot between runs.
    cases = [dict(c, id=f"{c['id']}#{n}" if a.repeat > 1 else c['id']) for c in cases for n in range(1, a.repeat + 1)]
    with tempfile.TemporaryDirectory() as tmp:
        mod = pathlib.Path(tmp) / 'mod'
        mod.mkdir()
        for name in COPY:
            src = ROOT / name
            (shutil.copytree if src.is_dir() else shutil.copy)(src, mod / name)
        empty = pathlib.Path(tmp) / 'empty'
        empty.mkdir()
        reqs = build_requests(mod, cases)
        if a.via == 'engine':
            replies = call_engine(reqs, cases, a.model, a.effort, a.jobs, tmp)
        else:
            with concurrent.futures.ThreadPoolExecutor(a.jobs) as pool:
                futures = {c['id']: pool.submit(call_model, reqs[c['id']], a.model, a.effort, empty) for c in cases}
                replies = {k: f.result() for k, f in futures.items()}
        checks = check(mod, cases, replies)

    rows, by_lang, by_kind = [], {}, {}
    for c in cases:
        r, k = replies[c['id']], checks.get(c['id'], {'text': '', 'verdict': {'ok': False, 'reason': 'check'}})
        text, ok = k['text'], k['verdict'].get('ok', False)
        # An all-lowercase expectation matches any case ("fix" in "Fix the bug"); "README" must match exactly.
        # "a|b" accepts either (a term the English-terms rule may restore: "테스트|test").
        def has(w):
            return any((alt.lower() in text.lower() if alt == alt.lower() else alt in text) for alt in w.split('|'))
        missing = [w for w in c['contains'] if not has(w)]
        left = [w for w in c['absent'] if not absent_ok(text, w)]
        # `refusal_ok`: the guard refusing the reply is the right outcome (the original is sent as spoken).
        passed = (ok and not missing and not left) or (bool(c.get('refusal_ok')) and not ok)
        s = by_lang.setdefault(c['lang'], {'n': 0, 'guard': 0, 'pass': 0, 'ms': []})
        s['n'] += 1; s['guard'] += ok; s['pass'] += passed
        if r['api_ms']: s['ms'].append(r['api_ms'])
        for kind in c.get('kinds', []):
            t = by_kind.setdefault(kind, {'n': 0, 'pass': 0})
            t['n'] += 1; t['pass'] += passed
        rows.append((c, r, k, ok, missing, left, passed))

    stamp = datetime.datetime.now().strftime('%Y-%m-%d-%H%M%S')
    out = [f'# Eval {stamp} — via {a.via}, model {a.model}, effort {a.effort}, style {a.style}, english_terms {a.english_terms}, repeat {a.repeat}', '',
           '| lang | cases | guard passed | fully passed | median ms |', '|---|---|---|---|---|']
    for lang, s in by_lang.items():
        ms = sorted(s['ms'])
        out.append(f"| {lang} | {s['n']} | {s['guard']} | {s['pass']} | {ms[len(ms) // 2] if ms else '-'} |")
    if by_kind:
        out += ['', '| kind | cases | fully passed |', '|---|---|---|']
        for kind in sorted(by_kind, key=lambda k: int(k[1:]) if k[1:].isdigit() else 99):
            out.append(f"| {kind} | {by_kind[kind]['n']} | {by_kind[kind]['pass']} |")
    summary = len(out)
    out += ['', '## Cases', '']
    for c, r, k, ok, missing, left, passed in rows:
        verdict = 'pass' if passed else 'FAIL'
        why = [] if ok else [f"guard: {k['verdict'].get('reason')}"]
        why += [f'missing {missing}'] if missing else []
        why += [f'left {left}'] if left else []
        why += [f"error: {r['error']}"] if r['error'] else []
        level = reqs[c['id']].get('level')
        setting = c['englishTerms'] if c['englishTerms'] == level else f"{c['englishTerms']}→{level}"
        out += [f"### {c['id']} — {verdict} ({r['api_ms']} ms API, {r['thinking']} thinking tokens) [style {c['style']}, english_terms {setting}]{' — ' + '; '.join(why) if why else ''}",
                '', f"- dictated: {c['dictated']}", f"- polished: {k['text']!r}"]
        if k['verdict'].get('reason') == 'parse':
            out.append(f"- raw reply: {r['reply'][:500]!r}")
        out.append('')
    report = '\n'.join(out) + '\n'
    dest = ROOT / 'eval' / 'results' / f'{stamp}.md'
    dest.parent.mkdir(exist_ok=True)
    dest.write_text(report)
    print('\n'.join(out[:summary]))
    print(f'\nreport: {dest}')


if __name__ == '__main__':
    main()
