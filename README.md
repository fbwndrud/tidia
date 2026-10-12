# Tidia — voice dictation cleanup for Claude Code

**Tidy dictation for AI.** Talk messy. Send tidy.

[한국어](README.ko.md)

![Spoken requests full of fillers and self-corrections are sent as clean messages](docs/demo.gif)

Tidia (*TID-ee-a*) cleans up what Claude Code's built-in dictation types into your prompt before you send it. It works with the terminal's `/voice` and the desktop app's microphone button.

- Removes fillers ("um", "음", "えーと"), repetitions and false starts, and keeps only what you settled on after you correct yourself mid-sentence.
- Turns English terms that speech recognition spelled phonetically back into English ("리액트" → React, "깃 푸시" → git push), and spells the files and names from your conversation the way they are written.
- Keeps your words. It does not answer, translate or summarize, and if the cleanup fails or looks wrong, your original is sent instead.

## Install

```
/plugin marketplace add fbwndrud/tidia
/plugin install tidia@tidia
```

Requires Claude Code 2.1.296 or later. Tested on macOS; Linux and Windows are not tested yet. To try it from a clone without installing: `claude --plugin-dir /path/to/tidia`.

## Use

Dictate as usual and press Enter. The cleaned version is sent.

- The dictation is tidied once, when you press Enter: one model call per message. The send waits a few seconds for it. A pause in your speech tidies nothing.
- Two styles. `polish`, the default, rewrites it as a short, clear message, and as a list when you ask for several things. `minimal` only drops fillers and keeps your own wording: ask Claude to "keep my own words".
- Your message shows as it was sent, the same on the desktop and in the terminal. On the desktop it stays that way when you come back to the session or restart the app. Two more views show what happened (`message_view`):

  | `tidied` (default) | `labeled` | `full` |
  |---|---|---|
  | the message sent | what Tidia did (`→ tidied`, `→ list`, `→ minimal`), then the message sent | what you said, then what Tidia did and the message sent |
  | ask: "show only the tidied message" | ask: "show what Tidia did on my messages" | ask: "show my dictation above the tidied message" |

  With `labeled` or `full`, `· rules applied` is added when an output rule with a condition applied, and you can ask Claude to change the words (`bubble_labels`).
- To tidy at each pause instead, so you see what Enter will send, ask Claude to "tidy my dictation at each pause".
- If you edit the prompt yourself before sending, the cleanup is dropped and what you see is sent. Typing is never tidied.
- To see more of what Tidia does and why a send went out untidied, ask Claude to "show the dictation cleanup details".

## Talk to Claude

You speak rather than type, so you never have to set anything up by hand. Ask Claude:

- "Add Tailscale to my voice dictionary." / "No, I said Tailscale."
- "Keep my own words, only drop the fillers." / "Turn off the dictation cleanup for now."
- "When I report a bug, write it as what happens, steps, expected."
- "Always send my dictation as a numbered list, then a one-line summary." / "Keep my dictation as plain sentences."
- "Tidy my dictation in a polite tone." / "My dictated messages should sound short and matter-of-fact."

How your dictated messages read, from their tone to a shape for bug reports, is one list of output rules: each applies always, or only when its condition holds. Seven starter rules (bug reports, feature requests, reviews, task lists, and a polite, casual or as-spoken tone) are off until you ask for one.

When Claude can tell a word you dictated was misheard, it adds it to the dictionary by itself and says so in one line; "undo that" removes it. Entries Claude did not add are only changed after asking, and "ask before changing my dictionary" (`dict_approval ask`) makes every dictionary change ask. Rule and setting changes ask you first, unless Claude Code's permission mode already allows Tidia's tools. Settings saved by an older version are carried over on the first start after an upgrade.

![Asking Claude by voice for a bug report rule, allowing the change, then dictating a bug that is sent as labeled lines](docs/demo-settings.gif)

## Cost and privacy

- **Each cleanup is one model call**, sonnet by default: about 1,000 tokens of fixed instructions plus roughly twice the dictation's length. A short dictation uses about 1,000–1,500 tokens; a long one or several output rules, up to about 2,000. It counts toward your Claude usage like any other request. `haiku` is faster and cheaper: "use haiku for the dictation cleanup".
- Cleaning sends the dictated text, up to 300 characters of the prompt on each side of it, spelling hints (your dictionary entries and file and identifier names from the conversation's last few messages) and your output rules through the session's own Anthropic connection. `/tidia dict build` asks first and sends only candidate words, in one call. There is no other server and no telemetry.
- Tidia never touches audio. It keeps your last 50 tidied messages (what you said and what was sent) in its own store on your computer, so they show the same after a restart: always on the desktop, and in the terminal with `message_view` labeled or full (a very long one is kept only until the session ends). It also keeps the word corrections it learns from you (up to 200 pairs) and your dictionary; nothing else you dictate is stored.
- When a message was tidied, Claude also gets one line it does not show in your message: that sentence and your raw dictation, nothing else. For example:

  `[tidia] Dictated by voice and tidied before sending; where the meaning differs, this raw transcript is what the user said (JSON): "um so like can you uh check the the login page I mean the settings page"`

  If you edited the cleanup by hand before sending, the line says the message is what you meant and the transcript is only for reference. Typed messages and dictations Tidia left unchanged get no line. `attach_raw off` stops it. Once per session (and after a compaction), a short guide tells Claude how to read these lines and when to add a misheard word or a rule.

## More

[docs/architecture.md](docs/architecture.md) explains how it works, with diagrams. [docs/reference.md](docs/reference.md) has the band's keys, the commands, every setting, the dictionary and the output rules.

**Limits.** The VS Code extension has no band, so the debug details do not show there. A dictation under three words is left as it is. Spoken commands like "make it shorter" or "send" are cleaned as text, not followed. Speech recognition drops intonation, so a question said without a question word can come out as a statement; Claude gets your raw words with it and is asked to check.

**Languages.** The cleanup works in any language Claude writes. The checks that catch a flipped meaning or an answer sent in place of your request, and the golden set, cover eight: Korean, English, Japanese, Chinese, Spanish, German, French and Portuguese (162 of 164 cases pass, one run with sonnet).

**Something cleaned wrong?** [Open an issue](https://github.com/fbwndrud/tidia/issues/new?template=cleanup.yml) with what you said and what was sent. Each report becomes a test case.

## Development

```bash
claude plugin test .
```

```bash
claude plugin validate --strict .
```

```bash
npx -y -p typescript@5.6.3 tsc -p .
```

The typecheck reads the engine's declarations from `.claude-plugin/types/`, which Claude Code writes when it first loads the mod (`claude --plugin-dir .`).

`eval/` holds a golden set of 164 real dictations in eight languages and a runner (`python3 -I eval/run.py`) that cleans them with the real model and checks the results. `docs/manual-checks.md` lists the microphone checks automated tests cannot cover.

## License

MIT
