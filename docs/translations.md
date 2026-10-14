# Translation maintenance

`README.md` is the documentation source. The Korean README uses Korean demos and links to Korean reference documents. The other translations link to the English reference documents and show demos recorded in their own language (`docs/demo.<lang>.gif`), except Hindi, which keeps the English demos because the GIF renderer cannot shape Devanagari. All 12 READMEs explain installation, usage, voice controls, costs and stored data, limits, development and licensing. When behavior changes, update the corresponding section in every translation.

Interface messages are independent of the dictation language. `ui_language auto` follows Claude Code's language setting; an explicit locale overrides it, and unknown languages use English. The existing `pt` locale uses Brazilian Portuguese; its README is `README.pt-BR.md`. Traditional Chinese uses `zh-TW`, including automatic selection for `zh-Hant` and the TW/HK/MO regions. An explicit script takes precedence over the region.

To add a language:

1. Add the locale to `SUPPORTED_LOCALES` and its English/native language aliases in `src/config.ts`. Add the same choice to `.claude-plugin/plugin.json`.
2. Translate every `Key` in `src/i18n.ts` or a file under `src/locales/`, then register the table in `LOCALES`. Preserve `{variables}`, runnable commands and literal setting values. Avoid falling back to English for untranslated keys.
3. Translate all seven README sections, preserving facts, requirements, privacy details, code commands and link targets. Add its native label and filename to `LANGUAGES` in `scripts/check-translations.py`. Put `<!-- languages -->` where the language bar belongs, then run `python3 scripts/check-translations.py --write`.
4. Update the locale list in both reference documents and the UI language count in the architecture and test plan. Add locale resolution cases and representative translated messages to the existing tests.
5. Run `claude plugin test .`, `claude plugin validate --strict .`, `npx -y -p typescript@5.6.3 tsc -p .`, `bun scripts/check-settings.ts` and `python3 scripts/check-translations.py`.

The translation checker verifies the README roster against the plugin's UI choices, identical language navigation, local link targets, required commands, code fences and section count. The TypeScript tables and i18n tests check message keys, nonempty translations, variables and command names. These checks do not establish native-speaker fluency or visual rendering quality.

The cleanup guard and golden evaluation set still cover eight languages. Adding translated documentation and messages does not extend language-specific meaning checks or real-model evaluation. Keep this distinction in every README.

A right-to-left language is not offered yet. Claude Code 2.1.296 draws every Unicode bidi control as `�` in the terminal (command output, log rows, panes and `ui.ask`), and macOS Terminal.app lays out each screen row left to right across the whole row, panes included; see [the terminal check](manual-checks.md#right-to-left-ui-2026-10-14). A right-to-left locale needs display handling per surface, and screen checks in the desktop app and in terminals, before it ships.

`ui.ask` draws its header chip in 12 characters at most, so Tidia's questions use `Tidia` rather than a translated title.
