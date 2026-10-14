# Tidia reference

[한국어](reference.ko.md) · [README](../README.md)

Everything the README leaves out: the band's keys, the commands, the settings, the dictionary and the output rules. You rarely need any of it: asking Claude covers the dictionary, the rules and every setting ([By voice](#by-voice)).

## The band

The band above the prompt says when a cleanup is on its way (`✨ Tidying…`, or `✨ Sends once tidied` after Enter) and is empty otherwise. With `debug` on it also shows the preview and a word it learned. It has no buttons.

Typing on the keyboard is never tidied, nor is text you recall with ↑.

## Commands

| Command | Does |
|---------|------|
| `/tidia` | Status |
| `/tidia on` / `off` | Turn it on or off for this session |
| `/tidia settings` | List the settings with their current values |
| `/tidia set <setting> <value>` | Change a setting, e.g. `/tidia set style minimal` |
| `/tidia dict` | Open the dictionary pane (a text list where no pane fits) |
| `/tidia dict list` | Print the dictionary |
| `/tidia dict add <word>` | Add a word the cleanup should spell your way |
| `/tidia dict add <heard> = <meant> [--project]` | Add a word speech recognition gets wrong |
| `/tidia dict remove <word>` | Remove an entry |
| `/tidia dict build` | Find names in this project to add (asks first) |
| `/tidia rules` | List the output rules with their condition and on/off |

## By voice

Everything below can be done by asking Claude, so you never have to type a command. Claude changes Tidia through three tools of its own (dictionary, rules, settings).

| Say something like | What changes | Asks first? |
|---|---|---|
| "Turn off the dictation cleanup for now." / "Turn it back on." | cleaning, this session only | no |
| "What are my Tidia settings?" / "Show my output rules." | nothing, Claude reads them | no |
| "Keep my own words, only drop the fillers." | `style minimal` | yes |
| "Only bring back code terms in English." | `english_terms low` | yes |
| "Use haiku for the dictation cleanup." | `model haiku` | yes |
| "Stop learning from my corrections." | `learn off` | yes |
| "Ask before changing my dictionary." | `dict_approval ask` | yes |
| "Tidy my dictation at each pause." | `polish_on pause` | yes |
| "Show the dictation cleanup details." | `debug on` | yes |
| "Tidy without my dictionary." | `dictionary off` | yes |
| "Show what Tidia did on my messages." / "Show my dictation above the tidied message." | `message_view labeled` / `full` | yes |
| "Label them clean, to do, as said." | `bubble_labels` | yes |
| "Don't send you my raw dictation." | `attach_raw off` | yes |
| "Show Tidia's labels in Japanese." | `ui_language ja` | yes |
| "When I report a bug, write it as what happens, steps, expected." | a new output rule | yes |
| "Turn on the bug report rule." / "Remove that rule." | a rule on, off or removed | yes |
| "No, I said Tailscale." / "Add Tailscale to my voice dictionary." | a dictionary entry | see [Dictionary](#dictionary) |
| "Undo that." | the change Claude just made | as above |

"Asks first" is a dialog where you allow or decline; Claude does not ask in chat. It is skipped when Claude Code's permission mode already allows Tidia's tools. Turning cleaning on or off and dictionary changes are always shown in one line, even with `debug` off; setting and rule changes are shown with `debug` on.

## Settings

Change them by asking Claude, with `/tidia set`, in `/config`, or at install with `claude plugin install … --config key=value` (on/off settings take `true`/`false` there).

| Setting | Values | Default | What it does |
|---------|--------|---------|--------------|
| `style` | `polish`, `minimal` | `polish` | polish: a clear, concise message for the AI, dropping chit-chat; one point as plain sentences, several requests as a list, and your output rules. minimal: plain sentences in your own wording, only fillers and taken-back words removed; output rules are not applied, and the check on the reply is stricter (it may change fewer words). Saved before 0.1.21, `light` becomes minimal and `auto`, `markdown` or `custom` polish (markdown and custom's layout carry over as output rules). |
| `english_terms` | `auto`, `off`, `low`, `medium`, `high` | `auto` | How far phonetically written English terms go back to English. low: code. medium: also product and language names. high: also technical words. auto picks by the dictation's language. |
| `model` | `sonnet`, `haiku`, `opus` | `sonnet` | The model that cleans the text. haiku is fastest and cheapest; opus is slowest. |
| `learn` | `ask`, `off` | `ask` | ask: when you retype a dictated word the same way twice, add it to the dictionary. |
| `dict_approval` | `auto`, `ask` | `auto` | auto: Claude adds a misheard word from your recent dictations when it sounds like the spelling, and removes entries it added, without asking; each change is shown. Changing or removing any other entry asks. ask: every dictionary change Claude makes asks first. |
| `polish_on` | `enter`, `pause` | `enter` | enter: tidy once, when you press Enter; the fewest model calls, and the send waits a few seconds. A message tidied at Enter shows as `message_view` says, on the desktop and in the terminal; elsewhere (VS Code) it is told in log lines under the message. pause: tidy each time you stop speaking and show the result above the prompt, so you see what Enter sends; a model call per pause (often 2–4 per message), dropped when the speech goes on. The prompt keeps your dictation, because filling it while the microphone may still be on stops the microphone. The preview cannot be edited: change the prompt and it is sent as changed, untidied. An Enter before the preview is ready waits for it. |
| `debug` | `on`, `off` | `off` | Show what Tidia does: the band's previews, notices of what Claude changed, and why a send went out untidied. Off, the band only says when a cleanup is on its way. |
| `dictionary` | `on`, `off` | `on` | Send your dictionary and the conversation's file and identifier names as spelling hints, and learn corrected words. Off tidies without them and does not learn; your entries are kept. |
| `message_view` | `tidied`, `labeled`, `full` | `tidied` | How a message tidied at Enter shows, on the desktop and in the terminal. tidied: only the message sent. labeled: what Tidia did (`→ tidied`, `→ list` or `→ minimal`, with `· rules applied` when an output rule with a condition applied), then the message sent, a line per row. full: what you said, then the same. Tidia rewrites the text of the engine's own row, so the desktop bubble keeps its time, copy, rewind and fork controls. Saved before 0.1.22, `show_raw show` becomes `full` and `hide` becomes `labeled`. |
| `bubble_labels` | free text, up to 80 characters | empty | The words for what Tidia did, shown with `message_view` labeled or full, in the order tidied/list/minimal, separated by `/` ("clean/to do/as said"). A part left empty keeps the interface language's word. `none` clears it. |
| `attach_raw` | `on`, `off` | `on` | Send the raw dictation with each tidied message as one line Claude sees and your message row does not, so Claude can recover from a bad cleanup. The line holds a fixed sentence and the raw text only. See [what Claude receives](architecture.md#4-what-claude-receives). |
| `ui_language` | `auto`, `en`, `ko`, `ja`, `zh`, `zh-TW`, `es`, `de`, `fr`, `pt`, `ru`, `hi`, `id` | `auto` | Language of the mod's labels. auto follows Claude Code's language setting. |

`/tidia set` works in interactive sessions. A `claude -p` run has no `/config` rows for plugin options, so set them with `claude plugin install … --config key=value` or `claude plugin configure` instead.

## Dictionary

The dictionary holds the spellings you care about. Entries are hints to the cleanup model, never blind find-and-replace, so a word that only sounds like an entry is left alone when it means something else.

- **Claude.** When the raw transcript or your own correction ("no, I said Tailscale") shows a word was misheard and Claude is sure of it, Claude adds it and says so in one line; "undo that" removes it. A word heard in one of your recent dictations is added without a question when it sounds like the spelling Claude gives it, and Claude removes entries it added the same way; each change is shown even with details off. Changing or removing any other entry (yours, one approved in the pane, or one Tidia learned from your corrections), a pair that does not sound alike, or a word you never dictated, asks first. `/tidia set dict_approval ask` makes every dictionary change by Claude ask.
- **Your entries.** `/tidia dict add Tailscale`, or `/tidia dict add 테일스케일 = Tailscale` for a word recognition keeps getting wrong. Entries apply to all projects unless you add `--project`.
- **Learning.** When you retype a dictated word before sending, Tidia remembers the correction; correct the same word a second time and it is added to the dictionary. Remove it by asking Claude or in `/tidia dict`. Turn this off with `/tidia set learn off`.
- **Build.** `/tidia dict build` asks first, then gathers candidate names on your computer: package and folder names, git branches, names in README and CLAUDE.md, and, only if you agree, words that recur in your own past prompts in this project. Everything is read locally; only the candidate words go to one model call, through the same Anthropic connection the session uses. Nothing is added until you approve it in the pane.
- **Conversation names.** File names and identifiers from the last few messages are sent as hints too, so "use effect" in a React conversation comes back as `useEffect`.

The dictionary holds up to 2000 entries for all projects and 2000 for each project; at most 20 hints go with one dictation.

## Output rules

Output rules are everything you tell the cleanup about how your dictated messages should read: their layout ("numbered steps, then a one-line summary"), their wording and register ("polite", "no exclamation marks") and shapes for particular cases. A rule without a condition always applies; one with a condition ("when the dictation reports a bug") applies only when the cleanup judges that it holds. Ask Claude to add one: "When I report a bug, write it as what happens, steps, expected." Since 0.1.21 they replace the `tone`, `tone_note` and `custom_note` settings: on the first start after the upgrade, a saved tone turns on its register starter and saved notes become rules, and Tidia says what it moved.

The `style` setting sits above the rules: `polish` (the default) writes concisely and applies them, a rule winning over the concise tone where the two differ, and `minimal` writes plain sentences and applies no rules. One model call both picks the layout and writes it. With `message_view` labeled or full, the message says `· rules applied` only when a rule with a condition applied; an always-on rule is your standing choice and goes untold.

Seven starter rules come with the mod, **off** until you ask for them: bug reports and feature requests as short labeled lines, review requests as what to review and what to look at, several tasks as a numbered list, and a polite, casual or as-spoken register. Turn one on by asking Claude ("turn on the bug report rule", "tidy my dictation in a polite tone") or in the `/tidia dict` pane.

Rules arrange what you said: they may add the wording they spell out (a label, a closing line you chose) but never a request or a fact you did not give, and a reply that does is thrown away in favour of your own words. Rules apply to all projects or to this one and never apply in the `minimal` style. Adding, changing or removing a rule asks you first, unless Claude Code's permission mode already allows Tidia's tools.

## Translations

The labels come in 12 languages: English, Korean, Japanese, Simplified and Traditional Chinese, Spanish, German, French, Brazilian Portuguese, Russian, Hindi and Indonesian. Automatic selection recognizes language names and regional codes; `zh-Hant` and the TW/HK/MO regions select Traditional Chinese. Unsupported languages use English. English and Korean are written by hand; the other translations await native-speaker review. Corrections are welcome as pull requests to `src/i18n.ts` and `src/locales/`; see [translation maintenance](translations.md).
