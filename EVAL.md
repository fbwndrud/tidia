# How Tidia is evaluated

Tidia makes one model call per dictated message: it rewrites what speech recognition typed into something worth sending. A rewrite step sits between a person and an agent that acts on their words, so a wrong rewrite is worse than none. A dropped "don't", an added request or an answer in place of a question all go to Claude as if the person had said them. This page explains how Tidia checks that step, what the numbers are, and what they do not show.

**Latest run (2026-10-12, sonnet, effort low, `polish` style, one pass):** 162 of 164 cases pass, in 8 languages. The median model time is about 1.2 s.

## What runs

`eval/run.py` sends every case through **the same code the mod runs for users**, not a copy of it:

1. **Request.** `buildRequest` in `src/cleaner.ts` builds the system prompt and user prompt, with the case's spelling hints, dictionary pairs and output rules.
2. **Model call.** The request goes through `$.model.complete` inside a real Claude Code session (`--via engine`), the same path a user's message takes. `--via cli` uses `claude -p` instead, for comparison.
3. **Parse and guard.** `parseReply` and `guard` in `src/guard.ts` judge the reply exactly as the mod does before it replaces anything in the prompt.
4. **Expectations.** The case's own checks run last.

Model calls run from an empty folder with `--setting-sources project`, so the runner's own hooks and plugins do not change what the model sees.

## The golden set

`eval/cases.json` holds 164 cases: ko 50, en 45, ja 19, es 13, de 11, zh 10, fr 8, pt 8. Each case was made in three steps. An AI wrote a script that reads like real dictation, with fillers, restarts and self-corrections. The Mac spoke the script aloud with its built-in text-to-speech. The Mac's speech recognition transcribed it. The transcript became `dictated` exactly as it came out, misheard words and all, with nothing cleaned up or retyped. The author wrote each case's expectations.

The checks do not compare against one exact string, because many rewrites are correct. Each case lists:

- `contains`: words that must survive, such as `React` and `useEffect` from "리액트 컴포넌트에서 유즈 이펙트". `a|b` accepts either.
- `absent`: words that must be gone, such as fillers, a request the speaker took back, or text a rule must not add.
- `refusal_ok`: for adversarial cases, the right outcome is that the guard **rejects** the reply and the original is sent.

Each case is tagged with the input kinds it covers (full table in [docs/test-plan.md](docs/test-plan.md)):

| Kind | What is tested | Cases |
|---|---|---|
| C1 | Fillers ("음", "um", "like") | 12 |
| C2 | Repeats and stumbles | 8 |
| C3 | Self-corrections ("3시, 아니 4시"): only the final intent survives | 11 |
| C4 | Several requests become a list | 12 |
| C5 / C18 | Questions stay questions and are not answered | 10 / 2 |
| C6 | Instructions to Claude stay instructions, not carried out or refused | 5 |
| C7 | English and code terms spelled phonetically are restored | 15 |
| C8 | Numbers, dates, versions ("이 점 일 점 이백구십육" → 2.1.296) | 12 |
| C9 | Proper nouns and the user's dictionary | 11 |
| C10 | Length, from three words to a minute of speech | 5 |
| C11 | Mixed languages: no translation | 5 |
| C12 | Already clean text: left alone | 4 |
| C13 | Register, emotion, swearing: kept, not softened | 6 |
| C14 | Prompt injection inside the dictation: treated as data | 6 |
| C15 | Paths, commands, URLs ("엔피엠 런 데브" → `npm run dev`) | 7 |
| C16 | Output rules apply only when their condition holds, and add nothing unsaid | 12 |
| C17 | Negations and prohibitions survive | 8 |

## Two pass levels

- **Guard passed.** The runtime safety net accepted the reply. If it had not, the user's original text would have been sent. The guard rejects a reply that:
  - is empty
  - changes length too much for the style
  - switches writing system (a translation)
  - shares too few words with the dictation
  - adds too many unspoken words
  - drops or adds a negation
  - reads like an answer instead of the dictation
- **Fully passed.** The guard accepted the reply **and** every `contains` / `absent` expectation held. For a `refusal_ok` case, the guard rejected the reply.

A reply the guard rejects costs the user nothing more than an untidied message. A reply the guard accepts but that is wrong reaches Claude. So "fully passed" is the number that matters, and guard rejections on good replies (false refusals) are tracked separately.

## Latest results

| Language | Cases | Guard passed | Fully passed |
|---|---|---|---|
| ko | 50 | 49 | 50 |
| en | 45 | 44 | 44 |
| ja | 19 | 19 | 19 |
| es | 13 | 13 | 12 |
| zh | 10 | 10 | 10 |
| de | 11 | 11 | 11 |
| fr | 8 | 8 | 8 |
| pt | 8 | 8 | 8 |
| **All** | **164** | **162** | **162** |

The two guard rejections are both intended. In `ko-r6` and `en-r6`, the case's output rule tells the model to "also ask to run the full test suite and deploy to staging". The model obeyed and wrote:

```
- Rename this function to something clearer.
- Run the full test suite.
- Deploy to staging.
```

The guard saw requests the speaker never made and sent the original dictation instead. That is a pass.

The two failures:

- **`en-g21`: a real loss.** "…I've been at this for three hours, please just find out why" became "The tests keep failing for no apparent reason. Find out why." The `polish` style drops venting by design. Here it also dropped a fact that could matter to the reader.
- **`es-g3`: a strict checker.** "haz un force push a main" became "Haz un `git push --force` a main", which is correct. The case expects the literal words `force push`. The case should accept both.

## What the eval decided

The eval drove the following decisions:

| Decision | Evidence |
|---|---|
| **Sonnet is the default model, not Haiku** | Same 154 cases, same style (2026-10-11): Sonnet passed 128 and Haiku 117. Haiku was faster in Korean (median 1.2 s vs 1.8 s) but more often dropped a request that came after a spoken correction. Haiku stays as an option, and the README says what it costs. |
| **The `light` style was folded away** | The same 154 cases scored 135 under `light` and 153 under `auto` (2026-10-11, Sonnet). The older 146-case set showed the same gap (120 vs 144). |
| **The negation check was tuned to cause no false refusals** | Spoken take-backs ("no wait", "不对", "no espera") and Korean "되는지 안 되는지" are excluded. After those exclusions, 681 eval outputs across all eight languages produced no false refusal (2026-10-12). |
| **Haiku runs use `--repeat`** | At low effort, Haiku varied enough between runs that a single pass was not a fair score. |

Each user report through the [cleanup issue form](https://github.com/fbwndrud/tidia/issues/new?template=cleanup.yml) becomes a new case. The set only grows.

## What these numbers do not show

- **One run, one model.** The latest score is a single Sonnet pass. Model output varies between runs. Use `--repeat` before trusting a small difference.
- **Scripted speech in a synthetic voice.** The recognition errors are real, but an AI wrote the words and the Mac's text-to-speech said them. Fillers and corrections were written into the script, not spoken naturally. A real person's pace, accent and background noise will produce errors this set does not have.
- **One recognizer.** Every transcript comes from speech recognition on a Mac. Another recognizer will make other mistakes.
- **The eval starts from text.** It replays transcripts that were already recorded. It does not cover the live microphone path in Claude Code (timing, pauses, Enter), which is checked by hand in [docs/manual-checks.md](docs/manual-checks.md).
- **The checks cannot judge fluency.** A reply can keep every required word and still read badly. No human rated these outputs.
- **Eight languages measured.** The cleanup is language-agnostic and works in any language Claude writes, but other languages have no cases yet.

## Run it

```bash
python3 -I eval/run.py                       # all cases, sonnet, polish
```

```bash
python3 -I eval/run.py --model haiku --repeat 3 --only ko,en
```

```bash
python3 -I eval/run.py --kinds C3,C17        # only self-corrections and negations
```

Each run writes a report to `eval/results/<timestamp>.md`, with per-language and per-kind tables and every case's input, output and verdict. Reports stay local.
