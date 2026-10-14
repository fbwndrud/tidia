#!/usr/bin/env python3
"""Validate a release tag against the manifest and its saved release notes."""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('tag', help='Release tag, e.g. v0.1.27')
    args = parser.parse_args()
    if not re.fullmatch(r'v\d+\.\d+\.\d+', args.tag):
        parser.error('Expected a stable version tag: vMAJOR.MINOR.PATCH')
    manifest = json.loads((ROOT / '.claude-plugin/plugin.json').read_text())
    if args.tag != f"v{manifest['version']}":
        raise SystemExit(f"Tag {args.tag} does not match plugin version {manifest['version']}")
    notes = ROOT / 'docs/releases' / f'{args.tag}.md'
    if not notes.is_file() or not notes.read_text().strip():
        raise SystemExit(f'Missing release notes: docs/releases/{args.tag}.md')
    print(f"Release ready: {args.tag}; notes: docs/releases/{args.tag}.md")


if __name__ == '__main__':
    main()
