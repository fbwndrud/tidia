# Tidia — voice dictation cleanup for Claude Code

**Tidy dictation for AI.** Talk messy. Send tidy.

[![Release](https://img.shields.io/github/v/release/fbwndrud/tidia)](https://github.com/fbwndrud/tidia/releases/latest) [![Claude Code](https://img.shields.io/badge/Claude_Code-2.1.296%2B-D97757)](https://code.claude.com/) [![MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

<!-- languages:start -->
English · [한국어](README.ko.md) · [日本語](README.ja.md) · [简体中文](README.zh.md) · [繁體中文](README.zh-TW.md) · [Español](README.es.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Português (Brasil)](README.pt-BR.md) · [Русский](README.ru.md) · [हिन्दी](README.hi.md) · [Bahasa Indonesia](README.id.md)
<!-- languages:end -->

[Install](#install) · [Use](#use) · [Talk to Claude](#voice-settings) · [Cost and privacy](#privacy) · [More](#help)

Tidia (*TID-ee-a*) cleans up what Claude Code's built-in dictation types into your prompt before you send it. It works with the terminal's `/voice` and the desktop app's microphone button.

- Removes fillers ("um", "음", "えーと"), repetitions and false starts, and keeps only what you settled on after you correct yourself mid-sentence.
- Turns English terms that speech recognition spelled phonetically back into English ("리액트" → React, "깃 푸시" → git push), and spells the files and names from your conversation the way they are written.
- Keeps your words. It does not answer, translate or summarize, and if the cleanup fails or looks wrong, your original is sent instead.

| You say | Claude receives |
|---|---|
| “Um, check the login page—I mean the settings page—and, uh, add tests.” | “Check the settings page and add tests.” |

<a id="install"></a>

## Install

Requires **Claude Code 2.1.296+**. Tested on macOS; Linux and Windows are not tested yet.

Run this in your **terminal**, outside a Claude Code conversation:

```bash
claude plugin install tidia --marketplace fbwndrud/tidia
```

Installs for your user account, across projects. Restart Claude Code (or start a new desktop Code session), then run `/tidia` to check that it is on. No API key or separate service is needed.

<details>
<summary>Other installation options</summary>

Inside a Claude Code conversation, run these **one at a time**, then choose **Install for you**:

```text
/plugin marketplace add fbwndrud/tidia
/plugin install tidia@tidia
```

For this repository only, append `--scope local` to the terminal install command. To try a clone without installing: `claude --plugin-dir /path/to/tidia`.

[Claude Code · plugin installation](https://code.claude.com/docs/en/plugins/install#add-a-marketplace-and-install-in-one-command)

</details>

### Update

Run these in your terminal, then restart Claude Code:

```bash
claude plugin marketplace update tidia
claude plugin update tidia@tidia
```

For automatic updates, open `/plugin` → **Marketplaces** → **tidia** → **Enable auto-update**. Third-party marketplaces do not auto-update by default.

<details>
<summary>Remove</summary>

```bash
claude plugin uninstall tidia@tidia
```

</details>

<a id="use"></a>

## Use

First use: turn on `/voice` in the terminal, or click the microphone in the desktop app’s **Code** tab. Speak, then send the message. Tidia cleans it automatically; no settings to change.

Dictate as usual and press Enter. The cleaned version is sent.

![Spoken requests full of fillers and self-corrections are sent as clean messages](docs/demo.gif)

<details>
<summary>Cleanup styles, message views and pause previews</summary>

- The dictation is tidied once, when you press Enter: one model call per message. The send waits a few seconds for it. A pause in your speech tidies nothing.
- Two styles. `polish`, the default, rewrites it as a short, clear message, and as a list when you ask for several things. `minimal` only drops fillers and keeps your own wording: ask Claude to "keep my own words".
- Your message shows as it was sent, the same on the desktop and in the terminal. On the desktop it stays that way when you come back to the session or restart the app. Two more views show what happened (`message_view`):

  | `tidied` (default) | `labeled` | `full` |
  |---|---|---|
  | the message sent | what Tidia did (`→ tidied`, `→ list`, `→ minimal`), then the message sent | what you said, then what Tidia did and the message sent |
  | ask: "show only the tidied message" | ask: "show what Tidia did on my messages" | ask: "show my dictation above the tidied message" |

  With `labeled` or `full`, `· rules applied` is added when an output rule with a condition applied, and you can ask Claude to change the words (`bubble_labels`).
- To tidy at each pause instead, ask Claude to "tidy my dictation at each pause". Each time you stop speaking, the tidied version shows above the prompt and Enter sends it. It costs a model call per pause (often 2–4 per message instead of one), and the preview cannot be edited: change the prompt and it is sent as you changed it, untidied.
- If you edit the prompt yourself before sending, the cleanup is dropped and what you see is sent. Typing is never tidied.
- To see more of what Tidia does and why a send went out untidied, ask Claude to "show the dictation cleanup details".

</details>

<a id="voice-settings"></a>

## Talk to Claude

You speak rather than type, so you never have to set anything up by hand. Ask Claude:

- "Add Tailscale to my voice dictionary." / "No, I said Tailscale."
- "Keep my own words, only drop the fillers." / "Turn off the dictation cleanup for now."
- "When I report a bug, write it as what happens, steps, expected."
- "Always send my dictation as a numbered list, then a one-line summary." / "Keep my dictation as plain sentences."
- "Tidy my dictation in a polite tone." / "My dictated messages should sound short and matter-of-fact."

<details>
<summary>Output rules and dictionary permissions</summary>

How your dictated messages read, from their tone to a shape for bug reports, is one list of output rules: each applies always, or only when its condition holds. Seven starter rules (bug reports, feature requests, reviews, task lists, and a polite, casual or as-spoken tone) are off until you ask for one.

When Claude can tell a word you dictated was misheard, it adds it to the dictionary by itself and says so in one line; "undo that" removes it. Entries Claude did not add are only changed after asking, and "ask before changing my dictionary" (`dict_approval ask`) makes every dictionary change ask. Rule and setting changes ask you first, unless Claude Code's permission mode already allows Tidia's tools. Settings saved by an older version are carried over on the first start after an upgrade.

![Asking Claude by voice for a bug report rule, allowing the change, then dictating a bug that is sent as labeled lines](docs/demo-settings.gif)

</details>

<a id="privacy"></a>

## Cost and privacy

Each cleanup uses one model call through your existing Claude connection. The default is one cleanup per sent dictation. Tidia does not process audio or send telemetry; it stores recent transcripts and settings locally.

<details>
<summary>Token costs, stored data and what Claude receives</summary>

- **Each cleanup is one model call**, sonnet by default: about 1,000 tokens of fixed instructions plus roughly twice the dictation's length. A short dictation uses about 1,000–1,500 tokens; a long one or several output rules, up to about 2,000. It counts toward your Claude usage like any other request. `haiku` is faster and cheaper: "use haiku for the dictation cleanup".
- Cleaning sends the dictated text, up to 300 characters of the prompt on each side of it, spelling hints (your dictionary entries and file and identifier names from the conversation's last few messages) and your output rules through the session's own Anthropic connection. `/tidia dict build` asks first and sends only candidate words, in one call. There is no other server and no telemetry.
- Tidia never touches audio. It keeps your last 50 tidied messages (what you said and what was sent) in its own store on your computer, so they show the same after a restart: always on the desktop, and in the terminal with `message_view` labeled or full (a very long one is kept only until the session ends). It also keeps the word corrections it learns from you (up to 200 pairs), your dictionary, and a fingerprint (a 32-bit hash, not the words) of your last 200 sent prompts, so a prompt recalled with ↑ is not tidied again; nothing else you dictate is stored.
- When a message was tidied, Claude also gets one line it does not show in your message: that sentence and your raw dictation, nothing else. For example:

  `[tidia] Dictated by voice and tidied before sending; where the meaning differs, this raw transcript is what the user said (JSON): "um so like can you uh check the the login page I mean the settings page"`

  If you edited the cleanup by hand before sending, the line says the message is what you meant and the transcript is only for reference. Typed messages and dictations Tidia left unchanged get no line. `attach_raw off` stops it. Once per session (and after a compaction), a short guide tells Claude how to read these lines and when to add a misheard word or a rule.

</details>

<a id="help"></a>

## More

| If… | Try this |
|---|---|
| `claude` is missing, or `--marketplace` is unknown | [Install or update Claude Code](https://code.claude.com/docs/en/setup); check `claude --version` is 2.1.296+. |
| `/tidia` is missing after installation | Restart Claude Code and check that `tidia@tidia` is enabled in `claude plugin list`. |
| Dictation stays unchanged | Run `/tidia` to check it is on. Short dictations (under three words), manual edits and clean text can be left unchanged. Ask Claude to “show the dictation cleanup details” to see why. |


[docs/architecture.md](docs/architecture.md) explains how it works, with diagrams. [docs/reference.md](docs/reference.md) has the band's keys, the commands, every setting, the dictionary and the output rules.

<details>
<summary>Compatibility, language coverage and limitations</summary>

**Limits.** The VS Code extension has no band, so the debug details do not show there. A dictation under three words is left as it is. Spoken commands like "make it shorter" or "send" are cleaned as text, not followed. Speech recognition drops intonation, so a question said without a question word can come out as a statement; Claude gets your raw words with it and is asked to check.

**Languages.** The README and interface messages are available in 12 languages: English, Korean, Japanese, Simplified and Traditional Chinese, Spanish, German, French, Brazilian Portuguese, Russian, Hindi and Indonesian. `ui_language auto` follows Claude Code's language setting; set one explicitly with, for example, `/tidia set ui_language ja`. Traditional Chinese is selected for `zh-TW`, `zh-Hant` and `zh-HK`; unsupported languages use English.

The cleanup works in any language Claude writes. The new translations do not extend the language-specific cleanup validation. The checks that catch a flipped meaning or an answer sent in place of your request, and the golden set, cover eight: Korean, English, Japanese, Chinese, Spanish, German, French and Portuguese (162 of 164 cases pass, one run with sonnet).

</details>

**Something cleaned wrong?** [Open an issue](https://github.com/fbwndrud/tidia/issues/new?template=cleanup.yml) with what you said and what was sent. Each report becomes a test case.

<a id="development"></a>

## Development

<details>
<summary>Developer checks and evaluation</summary>

```bash
claude plugin test .
```

```bash
claude plugin validate --strict .
```

```bash
npx -y -p typescript@5.6.3 tsc -p .
```

Check that the settings match with `bun scripts/check-settings.ts`, and that translated README links and commands match with `python3 scripts/check-translations.py`. See [translation maintenance](docs/translations.md) when adding a language or changing documentation, and [publishing a release](docs/releasing.md) before tagging a version.

The typecheck reads the engine's declarations from `.claude-plugin/types/`, which Claude Code writes when it first loads the mod (`claude --plugin-dir .`).

`eval/` holds a golden set of 164 dictations in eight languages (AI-written scripts spoken by the Mac's text-to-speech and transcribed by its speech recognition) and a runner (`python3 -I eval/run.py`) that cleans them with the real model and checks the results. [EVAL.md](EVAL.md) explains the method, the latest results and what they do not show. `docs/manual-checks.md` lists the microphone checks automated tests cannot cover.

</details>

<a id="license"></a>

## License

MIT
