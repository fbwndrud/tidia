# Manual checks — tidia

Real microphone checks that the automated tests cannot cover. Fill in **Result** with what you observed (`ok`, or what happened instead) and the Claude Code version.

## Settings in a `-p` run

`/tidia set` fails in `claude -p` (Claude Code 2.1.296): a headless run has no `/config` rows for plugin fields, so `$.config.set` rejects. Interactive sessions work. Headless users set options with `claude plugin configure` or `--config` at install.

## Since 2026-10-10 (send-time polish)

| # | Check | Result |
|---|-------|--------|
| S1 | `polish_on pause`: dictate, pause 2–3 s, keep dictating: the prompt is never rewritten mid-dictation and the microphone keeps writing. | pending |
| S2 | `polish_on pause`: after the pause the band shows `✨ Tidying…`, then the prompt holds the tidied text; it does not stop the microphone. | pending |
| S3 | Default `polish_on enter`: press Enter right after speaking: the band shows `✨ Sends once tidied` and the tidied version of the whole dictation is sent. | ok (2.1.296, tmux, Claude, 2026-10-12): the four README demos, tap mode (the closing tap sends) with macOS `say` into the built-in microphone; the band held the send and the tidied message went out. Desktop: every dictated message in a day of use went out tidied with its note; the band text there not checked. |
| S4 | Dictate a clean sentence with `polish_on pause` and wait: when nothing needed changing, Enter sends it at once without a second cleanup. | pending |
| S5 | Say English terms in Korean ("보이스 모드", "리액트", "깃 푸시"): they come back as voice mode, React, git push. | ok (2.1.296, tmux, Claude, 2026-10-12): `docs/demo.ko.gif`, spoken by macOS `say`: 엔피엠 런 테스트, 리액트, 유즈 이펙트, 깃 커밋 came back as npm run test, React, useEffect, git commit. |

## Terminal

Run: `claude --plugin-dir /path/to/tidia`

| # | Check | Result |
|---|-------|--------|
| 1 | `/tidia` prints the status line. | ok (2.1.296, tmux, Claude) |
| 2 | `/voice hold` on. Hold Space, say "음 그러니까 어 이 모두를 어떻게 구현하면 좋을지 정리해 줘" and press Enter: the band shows `✨ Sends once tidied`, then the tidied message is sent. | pending |
| 3 | `/tidia set message_view labeled`, dictate and send: the message row shows `→ 간결화` above the tidied text. | pending |
| 4 | Type a sentence on the keyboard: nothing is polished. | ok (2.1.296, tmux, Claude) |
| 5 | ↑ to recall an earlier prompt of three or more words and send it: it is sent as it is, untidied. | pending |
| 6 | `/voice tap`: tap Space, speak a sentence, tap Space again. The sent message is the polished one and the transcript shows `Sent the tidied dictation`. | ok (2.1.296, tmux, Claude, 2026-10-11): spoken by macOS `say` into the built-in microphone; "위에트에서 유즈 이펙트가 어 … 아니 개발 모드에서만" was sent as "React에서 useEffect가 개발 모드에서만 …", and Claude added 위에트 → 리액트 to the dictionary on its own (V15). |
| 7 | `/tidia off`, dictate again: nothing is polished. `/tidia on` restores it. | commands ok (2.1.296, tmux, Claude); dictation part pending |
| 8 | Pause 1–2 s in the middle of a hold-to-talk sentence, then keep talking: the polish does not get spliced into or overwritten by the rest of the recording. | pending |
| 10 | `/clear`, then `/tidia`: the command still exists and reports the status. | ok (2.1.296, tmux, Claude) |
| 11 | Let a background task notification arrive while a dictation is in the prompt: the notification is not rewritten. | pending |
| 12 | Ask by voice for an output rule ("when I report a bug, write it as what happens, steps, expected"), allow it in the dialog, then dictate a bug: it is sent under those labels. | ok (2.1.296, tmux, Claude, 2026-10-12): `docs/demo-settings.gif` and `docs/demo-settings.ko.gif`, spoken by macOS `say`. |

## Desktop

Load the mod (session mods folder, or `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json` `env`), restart the app, and use the microphone button.

| # | Check | Result |
|---|-------|--------|
| 1 | `/tidia` prints the status line. | ok (2.1.296, tmux, Claude) |
| P | Probe (2026-10-11, desktop, a logging mod): the microphone streams the transcript into the prompt box, which `$.prompt.read` sees about every 0.5 s; no `prompt.edit` fires for it, and the Enter that stops the microphone changes nothing in the box. `$.prompt.fill` writes the box (`isFilled: true`). `$.ui.log` shows a line under the plugin's name. A message is drawn from the box as it was at Enter: a `prompt.submit` rewrite is not shown, and `{ drop }` leaves the bubble with a "blocked by hook" warning, so Tidia lands the cleanup in the box before Enter. | ok (desktop, Claude) |
| Q | Probe (2026-10-11, desktop, a logging mod): a `$.ui.log` row draws `\n`, `\r\n`, U+2028 and `<br>` as spaces and Markdown as literal text. A `ui.render` hook on `UserMessage` is drawn for the person's own rows, typed or dictated: `e.props.text` is the prompt as dictated (not the message a `prompt.submit` rewrite sent), `origin.kind` is `sdk` (not `composer`), `isExpanded` true. Text `bold`, `dimColor`, `color` and Box `backgroundColor` (hex or theme key), `borderStyle`, padding all draw; a box spans the row and `alignSelf` does nothing, but an outer `flexDirection: row` + `justifyContent: flex-end` box lets the inner one take its text's width on the right. No rounded corners. A tree of the mod's own drops the row's time, copy, rewind and fork controls; `next({ ...e, props: { ...e.props, text } })` keeps the engine's bubble and, expected, its controls (to check on the desktop). | ok (desktop, Claude) |
| 2 | Dictate the sentence from terminal check 2 and stop speaking: `✨ Tidying…` shows above the prompt, then the prompt holds the tidied text. Enter sends it as shown. | pending |
| 3 | Dictate and press Enter twice at once: the bubble shows the tidied text that was sent in place of the dictation. With `message_view labeled` it shows `→ 간결화` (or `→ 목록화`) above it; with `full`, the dictation above both. In the terminal the same views apply to the message row. | default `tidied` ok (desktop, Claude, 2026-10-12): dictated messages show as sent; the 0.1.21 view (dictation above, tidied below) was seen before `message_view` existed. `labeled` and `full` on the desktop pending. Terminal `tidied` ok in the README demos. |
| 4 | Type a sentence: nothing is polished. | pending |
| 4b | Type a Korean sentence with the IME (composition on): nothing is polished. | pending |
| 7 | `/tidia off` / `/tidia on` as in terminal check 7. | pending |

## Dictionary (M3a)

| # | Check | Result |
|---|-------|--------|
| D1 | `/tidia dict add 테일스케일 = Tailscale`, then dictate "테일스케일 같은 기능 우리도 넣어 줘" and press Enter: the sent message says "Tailscale". | pending |
| D2 | `/tidia dict`: lists `테일스케일 → Tailscale · all projects`. `/tidia dict remove Tailscale` removes it. | ok (2.1.296, `-p` and tmux, Claude) |
| D3 | Ask Claude "보이스 플래시는 Voice Polish로 음성 사전에 넣어 줘": Claude finds `mcp__tidia__dictionary` through ToolSearch; the words were never dictated, so the Tidia dialog asks first, and after it the transcript shows "Claude가 사전을 바꿈: …". | pending |
| D4 | Restart the session: `/tidia dict` still lists the entries (stored in `$.store`). | ok (2.1.296, `-p`, Claude) |
| D5 | `/tidia dict add Voice Polish --project`, open another project: the entry is not listed there. | ok (2.1.296, `-p`, Claude) |
| D6 | Dictate "테일스케일 같은 기능 넣어 줘", retype 테일스케일 as Tailscale, press Enter: `/tidia dict` shows it under "Corrected once — add?". | pending |
| D7 | Do the same again: the second identical correction adds it to the dictionary on its own; `/tidia dict` lists it, and removing it there keeps it from being learned again. | pending |
| D8 | `/tidia set learn off`, repeat D6: nothing is offered. | pending |
| D9 | `/tidia dict`: a pane opens with the add input, entries and their Remove buttons; Esc closes it. On a narrow terminal the text list prints instead. | ok (2.1.296, tmux, Claude) after two fixes: the add field now takes the keyboard on open (before, typing went to the prompt and was sent to Claude), and row buttons lead the row so a long entry no longer hides Remove |
| D10 | `/tidia dict build`: the question offers "Repo only" and "Repo and past conversations"; after a few seconds the pane lists found words; Add all stores them for this project. | ok (2.1.296, tmux, Claude): question, Repo only, proposals, Skip all |
| D11 | Removed in 0.1 (2026-10-11): the team file and `/tidia dict export` are gone. | — |
| D12 | `/tidia set dictionary off`: dictating "테일스케일 같은 기능" with the entry stored still sends "테일스케일"/"Tailscan"; on again restores "Tailscale". | pending |
