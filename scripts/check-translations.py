#!/usr/bin/env python3
"""Check README language links and commands; --write refreshes the language bars."""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# UI locale, native language label, README filename. pt is the existing Brazilian UI locale.
LANGUAGES = [
    ('en', 'English', 'README.md'),
    ('ko', '한국어', 'README.ko.md'),
    ('ja', '日本語', 'README.ja.md'),
    ('zh', '简体中文', 'README.zh.md'),
    ('zh-TW', '繁體中文', 'README.zh-TW.md'),
    ('es', 'Español', 'README.es.md'),
    ('de', 'Deutsch', 'README.de.md'),
    ('fr', 'Français', 'README.fr.md'),
    ('pt', 'Português (Brasil)', 'README.pt-BR.md'),
    ('ru', 'Русский', 'README.ru.md'),
    ('hi', 'हिन्दी', 'README.hi.md'),
    ('id', 'Bahasa Indonesia', 'README.id.md'),
]
START, END = '<!-- languages:start -->', '<!-- languages:end -->'
COMMANDS = [
    '/plugin marketplace add fbwndrud/tidia',
    '/plugin install tidia@tidia',
    'claude plugin test .',
    'claude plugin validate --strict .',
    'npx -y -p typescript@5.6.3 tsc -p .',
    'claude --plugin-dir /path/to/tidia',
    'python3 -I eval/run.py',
    '/tidia dict build',
    'attach_raw off',
]


def language_bar(current):
    links = [label if filename == current else f'[{label}]({filename})'
             for _, label, filename in LANGUAGES]
    return f'{START}\n' + ' · '.join(links) + f'\n{END}'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    problems = []
    manifest = json.loads((ROOT / '.claude-plugin/plugin.json').read_text())
    ui_locales = [v for v in manifest['userConfig']['ui_language']['options'] if v != 'auto']
    if ui_locales != [locale for locale, _, _ in LANGUAGES]:
        problems.append('README languages and plugin UI languages do not match')
    expected_files = {filename for _, _, filename in LANGUAGES}
    actual_files = {p.name for p in ROOT.glob('README*.md')}
    if actual_files != expected_files:
        problems.append(f'Unexpected or missing README files: {sorted(actual_files ^ expected_files)}')
    for _, _, filename in LANGUAGES:
        path = ROOT / filename
        if not path.is_file():
            problems.append(f'{filename}: missing')
            continue
        text = path.read_text()
        bar = language_bar(filename)
        if args.write:
            if '<!-- languages -->' in text:
                text = text.replace('<!-- languages -->', bar, 1)
            else:
                text = re.sub(re.escape(START) + r'.*?' + re.escape(END),
                              lambda _: bar, text, flags=re.S)
            path.write_text(text)
        if bar not in text or text.count(START) != 1 or text.count(END) != 1:
            problems.append(f'{filename}: language bar is out of date (run with --write)')
        if len(re.findall(r'^## ', text, re.M)) != 7:
            problems.append(f'{filename}: expected all seven README sections')
        if text.count('```') % 2:
            problems.append(f'{filename}: unclosed code fence')
        for command in COMMANDS:
            if command not in text:
                problems.append(f'{filename}: missing command {command}')
        # All translations live at the repo root, so local links use the same base.
        for link in re.findall(r'\[[^\]]*\]\(([^)]+)\)', text):
            if re.match(r'^[a-z][a-z0-9+.-]*:', link, re.I) or link.startswith('#'):
                continue
            target = link.split('#', 1)[0]
            if target and not (path.parent / target).exists():
                problems.append(f'{filename}: broken local link {link}')
    if problems:
        raise SystemExit('\n'.join(problems))
    print(f'README translations match UI languages ({len(LANGUAGES)}); links and commands checked')


if __name__ == '__main__':
    main()
