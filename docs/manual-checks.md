# Manual checks — tidia

Real microphone checks that the automated tests cannot cover. Fill in **Result** with what you observed (`ok`, or what happened instead) and the Claude Code version.

## Settings in a `-p` run

`/tidia set` fails in `claude -p` (Claude Code 2.1.296): a headless run has no `/config` rows for plugin fields, so `$.config.set` rejects. Interactive sessions work. Headless users set options with `claude plugin configure` or `--config` at install.

## Since 2026-10-10 (send-time polish)

| # | Check | Result |
|---|-------|--------|
| S1 | `polish_on pause`: dictate, pause 2–3 s, keep dictating: the prompt is never rewritten mid-dictation and the microphone keeps writing. | **fails** (2.1.296, tmux, Claude, 2026-10-13, two runs, hold mode, spoken by macOS `say` (Yuna) into the built-in microphone): "음 그러니까 로그인 페이지가 어 모바일에서 느린데", 3–4 s of silence while still holding, then "그 이유를 찾아서 고쳐 줘". The tidied first part ("로그인 페이지가 모바일에서 느려.", once "현상: 로그인 페이지가 모바일에서 느림." during the silence itself) ends up in the prompt and the second part never does: the speech after the pause is lost. **Fixed 2026-10-13:** the cleanup now shows above the prompt and never fills it; rerun the same way, the prompt kept both parts and Enter sent "로그인 페이지가 모바일에서 느려. 그 이유를 찾아서 고쳐 줘." |
| S2 | `polish_on pause`: after the pause the band shows `✨ Tidying…`, then the prompt holds the tidied text; it does not stop the microphone. | partly (2.1.296, tmux, Claude, 2026-10-13): `✨ 정리 중…` shows during the pause and the prompt then holds the tidied text, but the microphone's later speech is lost (S1). Since 2026-10-13 the tidied text shows above the prompt with "Enter를 누르면 이대로 보내요"; the prompt keeps the dictation. |
| S3 | Default `polish_on enter`: press Enter right after speaking: the band shows `✨ Sends once tidied` and the tidied version of the whole dictation is sent. | ok (2.1.296, tmux, Claude, 2026-10-12): the four README demos, tap mode (the closing tap sends) with macOS `say` into the built-in microphone; the band held the send and the tidied message went out. Again (2.1.299, 2026-10-14) for the demos in ja, zh, zh-TW, es, de, fr, pt-BR, ru and id: the band held the send in each, but six takes went out untidied with no band (zh four times, three of them the same sentence; zh-TW and id once each; the scenes were recorded again). **Fixed 2026-10-14:** a debug log showed two causes: the same words said again matched the print of the earlier take and were taken for a prompt recalled with ↑; and a word shown while listening ("And", before a Chinese sentence) was replaced by the final transcript, which was then sent as typed. Reading the code turned up a third, not seen in a log: a transcript that waits in the prompt past the settle time before the send had no path to the cleanup. Rerun with the fix: 8 of 8 takes (5 the same Chinese sentence in one session, 3 Indonesian) went out tidied. Desktop: every dictated message in a day of use went out tidied with its note; the band text there not checked. |
| S4 | Dictate a clean sentence with `polish_on pause` and wait: when nothing needed changing, Enter sends it at once without a second cleanup. | ok (2.1.296, tmux, Claude, 2026-10-13, hold mode): "로그인 페이지가 모바일에서 느린 이유를 찾아줘." was left as it was; Enter sent it at once, with no band and no raw note. |
| S5 | Say English terms in Korean ("보이스 모드", "리액트", "깃 푸시"): they come back as voice mode, React, git push. | ok (2.1.296, tmux, Claude, 2026-10-12): `docs/demo.ko.gif`, spoken by macOS `say`: 엔피엠 런 테스트, 리액트, 유즈 이펙트, 깃 커밋 came back as npm run test, React, useEffect, git commit. |

## Terminal

Run: `claude --plugin-dir /path/to/tidia`

| # | Check | Result |
|---|-------|--------|
| 1 | `/tidia` prints the status line. | ok (2.1.296, tmux, Claude) |
| 2 | `/voice hold` on. Hold Space, say "음 그러니까 어 이 모두를 어떻게 구현하면 좋을지 정리해 줘" and press Enter: the band shows `✨ Sends once tidied`, then the tidied message is sent. | ok (2.1.296, tmux, Claude, 2026-10-13, hold mode simulated by repeated Space, spoken by macOS `say` (Yuna) into the built-in microphone): the band showed `✨ 정리 끝나면 보내요`, and "어이 모두를 어떻게 구현하면 좋을지 정리해줘." was sent from the raw "음, 그러니까 어이 …". |
| 3 | `/tidia set message_view labeled`, dictate and send: the message row shows `→ 간결화` above the tidied text. | ok (2.1.296, tmux, Claude, 2026-10-13): the row shows `→ 간결화` above "어이 모두를 어떻게 구현하면 좋을지 정리해줘." Set in a session that excludes user settings (`--setting-sources project,local`), `/tidia set` reports the change but it does not take effect; pass the option with `--settings` there. |
| 4 | Type a sentence on the keyboard: nothing is polished. | ok (2.1.296, tmux, Claude) |
| 5 | ↑ to recall an earlier prompt of three or more words and send it: it is sent as it is, untidied. | **fails** (2.1.296, tmux, Claude, 2026-10-13): ↑ recalled "어이 모두를 어떻게 구현하면 좋을지 정리해줘." and Enter sent it tidied ("… 정리해 줘.", `→ 간결화`, raw note attached). **Fixed 2026-10-13:** a prompt identical to one sent before is a recall; rerun, ↑ + Enter sent "거의 모두를 어떻게 구현하면 좋을지 정리해 줘." as it was, with no raw note. |
| 6 | `/voice tap`: tap Space, speak a sentence, tap Space again. The sent message is the polished one and the transcript shows `Sent the tidied dictation`. | ok (2.1.296, tmux, Claude, 2026-10-11): spoken by macOS `say` into the built-in microphone; "위에트에서 유즈 이펙트가 어 … 아니 개발 모드에서만" was sent as "React에서 useEffect가 개발 모드에서만 …", and Claude added 위에트 → 리액트 to the dictionary on its own (V15). |
| 7 | `/tidia off`, dictate again: nothing is polished. `/tidia on` restores it. | commands ok (2.1.296, tmux, Claude); dictation part pending |
| 8 | Pause 1–2 s in the middle of a hold-to-talk sentence, then keep talking: the polish does not get spliced into or overwritten by the rest of the recording. | ok (2.1.296, tmux, Claude, 2026-10-13, hold mode, spoken by macOS `say` (Yuna) into the built-in microphone): with 2 s of silence mid-sentence, the prompt kept both parts ("음, 로그인 페이지가 어 모바일에서 느린데. 그 이유를 찾아서 고쳐줘.") and nothing was spliced or rewritten before Enter. |
| 10 | `/clear`, then `/tidia`: the command still exists and reports the status. | ok (2.1.296, tmux, Claude) |
| 11 | Let a background task notification arrive while a dictation is in the prompt: the notification is not rewritten. | ok (2.1.296, tmux, Claude, 2026-10-13): a dictation sat in the prompt while a `run_in_background` `sleep 25` finished; the "Background command … completed" notification and Claude's reply went through untouched (no raw note), and the prompt kept the dictation. |
| 12 | Ask by voice for an output rule ("when I report a bug, write it as what happens, steps, expected"), allow it in the dialog, then dictate a bug: it is sent under those labels. | ok (2.1.296, tmux, Claude, 2026-10-12): `docs/demo-settings.gif` and `docs/demo-settings.ko.gif`, spoken by macOS `say`. Again (2.1.299, 2026-10-14) in ja, zh, zh-TW, es, de, fr, pt-BR, ru and id (`docs/demo-settings.<lang>.gif`); speech recognition wrote the zh-TW dictation in Simplified characters. |
| 13 | `/voice tap`: take a prompt suggestion with Tab and press Enter: it is sent as it is, untidied, with no raw note. | ok (2.1.299, tmux, Claude, 2026-10-16), with a suggestion a logging mod proposed (`$.prompt.suggest`; the session was not signed in, so the engine made none): Tab put it in the box with no `prompt.edit` or `prompt.fill`, and the submit's origin was `composer`. Before the fix Tidia sent it to the cleanup; after it the debug log reads `tidia: sent as typed (Claude offered this prompt)`. |

## Desktop

Load the mod (session mods folder, or `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json` `env`), restart the app, and use the microphone button.

| # | Check | Result |
|---|-------|--------|
| 1 | `/tidia` prints the status line. | ok (2.1.296, tmux, Claude) |
| P | Probe (2026-10-11, desktop, a logging mod): the microphone streams the transcript into the prompt box, which `$.prompt.read` sees about every 0.5 s; no `prompt.edit` fires for it, and the Enter that stops the microphone changes nothing in the box. `$.prompt.fill` writes the box (`isFilled: true`). `$.ui.log` shows a line under the plugin's name. A message is drawn from the box as it was at Enter: a `prompt.submit` rewrite is not shown, and `{ drop }` leaves the bubble with a "blocked by hook" warning, so Tidia lands the cleanup in the box before Enter. | ok (desktop, Claude) |
| Q | Probe (2026-10-11, desktop, a logging mod): a `$.ui.log` row draws `\n`, `\r\n`, U+2028 and `<br>` as spaces and Markdown as literal text. A `ui.render` hook on `UserMessage` is drawn for the person's own rows, typed or dictated: `e.props.text` is the prompt as dictated (not the message a `prompt.submit` rewrite sent), `origin.kind` is `sdk` (not `composer`), `isExpanded` true. Text `bold`, `dimColor`, `color` and Box `backgroundColor` (hex or theme key), `borderStyle`, padding all draw; a box spans the row and `alignSelf` does nothing, but an outer `flexDirection: row` + `justifyContent: flex-end` box lets the inner one take its text's width on the right. No rounded corners. A tree of the mod's own drops the row's time, copy, rewind and fork controls; `next({ ...e, props: { ...e.props, text } })` keeps the engine's bubble and, expected, its controls (to check on the desktop). | ok (desktop, Claude) |
| R | Transcripts (2026-10-14 to 16, desktop, tap mode): ten messages sent with a next-step box button (the desktop's `wrap_up` tool, its `actions[].message`) went out tidied with a raw note, e.g. "JSON 키 받았어. 확인하고 옮겨줘." sent as "…옮겨 줘.". The button's message is queued and submitted as the person's Enter; nothing marks it. With the fix (not yet released) a tap-mode prompt that equals an argument of a tool Claude called in its last turn is sent as typed. | fix pending a check in the app |
| 2 | Dictate the sentence from terminal check 2 and stop speaking: `✨ Tidying…` shows above the prompt, then the prompt holds the tidied text. Enter sends it as shown. | pending |
| 3 | Dictate and press Enter twice at once: the bubble shows the tidied text that was sent in place of the dictation. With `message_view labeled` it shows `→ 간결화` (or `→ 목록화`) above it; with `full`, the dictation above both. In the terminal the same views apply to the message row. | default `tidied` ok (desktop, Claude, 2026-10-12): dictated messages show as sent; the 0.1.21 view (dictation above, tidied below) was seen before `message_view` existed. `labeled` and `full` on the desktop pending. Terminal `tidied` ok in the README demos. |
| 4 | Type a sentence: nothing is polished. | ok (desktop, Claude, 2026-10-12/13): typed messages in a desktop session went out as typed, with no raw note. |
| 4b | Type a Korean sentence with the IME (composition on): nothing is polished. | ok (desktop, Claude, 2026-10-12/13): eight messages typed with the Korean IME ("Eval 은 적용된거임?", "readme 에는 업데이트 안해도 됨?", …) went out as typed, with no raw note. |
| 7 | `/tidia off` / `/tidia on` as in terminal check 7. | pending |

## Dictionary (M3a)

| # | Check | Result |
|---|-------|--------|
| D1 | `/tidia dict add 테일스케일 = Tailscale`, then dictate "테일스케일 같은 기능 우리도 넣어 줘" and press Enter: the sent message says "Tailscale". | ok (2.1.296, tmux, Claude, 2026-10-13, spoken by macOS `say` (Yuna) into the built-in microphone): sent "Tailscale 같은 기능 우리도 넣어줘." from the raw "테일스케일 같은 기능 우리도 넣어줘." |
| D2 | `/tidia dict`: lists `테일스케일 → Tailscale · all projects`. `/tidia dict remove Tailscale` removes it. | ok (2.1.296, `-p` and tmux, Claude) |
| D3 | Ask Claude "보이스 플래시는 Voice Polish로 음성 사전에 넣어 줘": Claude finds `mcp__tidia__dictionary` through ToolSearch; the words were never dictated, so the Tidia dialog asks first, and after it the transcript shows "Claude가 사전을 바꿈: …". | ok (2.1.296, tmux, Claude, 2026-10-13, typed key by key): Tidia asked "Claude가 Tidia를 바꾸려고 해요: dict_add … 허용할까요?"; after allowing, the transcript shows "tidia: Claude가 사전을 바꿈: 사전에 추가(모든 프로젝트): 보이스 플래시 → Voice Polish". Text typed in one burst (tmux `send-keys`) is taken for dictation, tidied, and the word added without asking. |
| D4 | Restart the session: `/tidia dict` still lists the entries (stored in `$.store`). | ok (2.1.296, `-p`, Claude) |
| D5 | `/tidia dict add Voice Polish --project`, open another project: the entry is not listed there. | ok (2.1.296, `-p`, Claude) |
| D6 | Dictate "테일스케일 같은 기능 넣어 줘", retype 테일스케일 as Tailscale, press Enter: `/tidia dict` shows it under "Corrected once — add?". | ok (2.1.296, tmux, Claude, 2026-10-13, hold mode, `english_terms off`): retyped 포스트그레스 as Postgres and sent; `/tidia dict` shows "한 번 고친 말 — 추가할까요?  포스트그레스 → Postgres". |
| D7 | Do the same again: the second identical correction adds it to the dictionary on its own; `/tidia dict` lists it, and removing it there keeps it from being learned again. | partly (2.1.296, tmux, Claude, 2026-10-13): the second identical retype added "테일스케일 → Tailscale · 모든 프로젝트 · 학습" on its own. Not settled: after removing it, speech recognition heard the word differently on each retry ("TypeScript", "테일 스케일") and the entry came back once. In a 40-row terminal the pane cuts off its last rows without scrolling. |
| D8 | `/tidia set learn off`, repeat D6: nothing is offered. | ok (2.1.296, tmux, Claude, 2026-10-13): with learn off, retyping 슈퍼베이스 as Supabase offered nothing. |
| D9 | `/tidia dict`: a pane opens with the add input, entries and their Remove buttons; Esc closes it. On a narrow terminal the text list prints instead. | ok (2.1.296, tmux, Claude) after two fixes: the add field now takes the keyboard on open (before, typing went to the prompt and was sent to Claude), and row buttons lead the row so a long entry no longer hides Remove |
| D10 | `/tidia dict build`: the question offers "Repo only" and "Repo and past conversations"; after a few seconds the pane lists found words; Add all stores them for this project. | ok (2.1.296, tmux, Claude): question, Repo only, proposals, Skip all |
| D11 | Removed in 0.1 (2026-10-11): the team file and `/tidia dict export` are gone. | — |
| D12 | `/tidia set dictionary off`: dictating "테일스케일 같은 기능" with the entry stored still sends "테일스케일"/"Tailscan"; on again restores "Tailscale". | ok (2.1.296, tmux, Claude, 2026-10-13) with `english_terms off`: dictionary off sent "테일 스케일 같은 기능 우리도 넣어줘.", on sent "Tailscale …". With `english_terms auto` the cleanup restores "Tailscale" even with the dictionary off. |

## Right-to-left UI (2026-10-14)

An Arabic UI was built and checked, then held back from the release. What the checks found, in Claude Code 2.1.296 on macOS:

| Surface | Result |
|---|---|
| Desktop app | Unicode isolates (one per line, LTR for commands and dictionary mappings) keep `/tidia set <setting> <value>`, `--project` and `heard → meant` in order inside an RTL sentence. `ui.ask` draws bidi controls as `�`, so its question and choices must be plain. |
| Terminal.app (Terminal 2.15, 112×42 and 56×40) | Claude Code's terminal renderer replaces every bidi control with U+FFFD in command output, log rows and panes, with and without tmux: the isolates show as `�`. Plain text shows connected letters and intact commands, but Terminal.app lays out each screen row as one left-to-right paragraph across the whole row, so an Arabic label and an Arabic heard form merge into one run, pane buttons swap places with neighbouring Arabic words, and a pane's Arabic text can join Arabic in the conversation column on the same row. |

The question chip of `ui.ask` holds 12 characters: `قاموس الإملاء` showed as `قاموس الإملا`. `/tidia dict build` now names `Tidia` in it (seen in English in Terminal.app).
