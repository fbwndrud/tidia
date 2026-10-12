#!/usr/bin/env bash
# Records the README demos: short scenes of Claude Code with this mod, where a macOS voice reads
# tap-mode dictations aloud for the built-in microphone to hear. A scene ends shortly after its last
# cleaned message is sent, before Claude does anything with it.
#
#   scripts/record-demo.sh en           docs/demo.gif              cleanup, English
#   scripts/record-demo.sh ko           docs/demo.ko.gif           cleanup, Korean
#   scripts/record-demo.sh en-settings  docs/demo-settings.gif     an output rule asked for by voice
#   scripts/record-demo.sh ko-settings  docs/demo-settings.ko.gif
#
# Needs macOS, tmux, asciinema and agg (brew install tmux asciinema agg), a quiet room and the
# speakers on (not muted). Run it from a folder Claude Code already trusts. Each dictation sends one
# real message; the session runs in the default permission mode, so nothing runs without approval.
# Each scene runs without the saved rules; the mod's saved dictionary and rules are put back afterwards,
# so a rule made on camera is not kept.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORKDIR=$PWD
SET=${1:?usage: record-demo.sh en|ko|en-settings|ko-settings}
# DEMO_DIR=<folder> keeps the recordings; a scene whose recording is already there is not recorded
# again, so one bad scene can be redone by deleting its file.
OUT=${DEMO_DIR:-$(mktemp -d)}
mkdir -p "$OUT"
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

# A scene is one Claude Code session and runs its steps, separated by "|", in order:
#   say:<text>  dictate <text> in tap mode and wait until the cleaned message is sent
#   approve     wait for Tidia's question, allow it and wait until Claude is done
case $SET in
  en | en-settings) VOICE=Samantha RATE=185 LANGUAGE=English ASK='Allow it?' HELD='s: Send as is' TAIL=3 ;;
  # Korean recognition makes up a sentence in a long silence after the voice, so it stops sooner.
  ko | ko-settings) VOICE=Yuna RATE=170 LANGUAGE=Korean ASK='허용할까요?' HELD='s: 그냥 보내기' TAIL=1.5 ;;
  *) echo "usage: record-demo.sh en|ko|en-settings|ko-settings" >&2; exit 2 ;;
esac
case $SET in
  en) GIF=demo.gif SCENES=(
    "say:um so like can you uh check the the login page I mean the settings page and um see why it is so slow on mobile"
    "say:okay so um first run the tests and uh if anything fails fix it then um update the changelog and finally uh commit everything"
    "say:uh can you um add a dark mode toggle to the uh header no wait the settings page and make it uh remember the choice"
  ) ;;
  ko) GIF=demo.ko.gif SCENES=(
    "say:음 어 그러니까 일단 엔피엠 런 테스트 돌려 보고 어 실패하는 거 있으면 고쳐 주고 음 그 다음에 체인지로그 업데이트하고 마지막으로 어 깃 커밋까지 해 줘"
    "say:음 그러니까 리액트에서 유즈 이펙트가 어 두 번 실행되는데 아 아니 개발 모드에서만 그래 왜 그런지 한 줄로 알려 줘"
    "say:어 그 버튼 색깔을 음 파란색으로 아 아니 초록색으로 바꿔 주고 어 글자는 좀 더 크게 해 줘"
  ) ;;
  en-settings) GIF=demo-settings.gif SCENES=(
    "say:um can you add a rule uh so when I report a bug it gets written as what happens steps to reproduce and what I expected|approve|say:okay so um the login button does nothing on safari like I click it and uh nothing happens and it should take me to the dashboard"
  ) ;;
  ko-settings) GIF=demo-settings.ko.gif SCENES=(
    "say:음 티디아 규칙 하나 추가해 줘 어 버그 얘기할 때는 증상 재현 방법 기대 결과 순서로 정리되게|approve|say:어 그 로그인 버튼이 음 사파리에서 안 눌려 그러니까 눌러도 아무 반응이 없는데 원래는 어 대시보드로 넘어가야 돼"
  ) ;;
esac

# A tmux server of its own, without the user's tmux.conf, so nothing of theirs shows or changes.
tm() { tmux -L tidia-demo -f /dev/null -u "$@"; }
pane() { tm capture-pane -t tidia -p -J -S -2000; }
waitfor() { for _ in $(seq 1 "${2:-60}"); do pane | grep -q "$1" && return 0; sleep 0.5; done; echo "timed out waiting for: $1" >&2; return 1; }
idle() { sleep 1; for _ in $(seq 1 180); do tm capture-pane -t tidia -p | grep -q 'esc to interrupt' || return 0; sleep 0.5; done; echo "timed out waiting for Claude" >&2; return 1; }
# The window name reaches the recording as an invisible title change, which marks a moment in it.
mark() { tm rename-window -t tidia "$1"; }

# The message is sent once Claude is working and the band no longer holds it back for the cleanup.
# When the cleanup was already in the prompt before the send, no "sent" notice is shown, so the
# notice cannot be what is waited for.
say_step() {
  mark "say$RANDOM"
  tm send-keys -t tidia Space
  waitfor "REC" 20
  # A long silence before the voice starts invites speech recognition to make up a sentence.
  sleep 0.4
  say -v "$VOICE" -r "$RATE" "$1"
  sleep "$TAIL"
  tm send-keys -t tidia Space
  for _ in $(seq 1 80); do tm capture-pane -t tidia -p | grep -q 'esc to interrupt' && break; sleep 0.25; done
  # The band shows up just after the send.
  sleep 1
  for _ in $(seq 1 120); do tm capture-pane -t tidia -p | grep -q "$HELD" || break; sleep 0.25; done
  mark "sent$RANDOM"
}

scene() {
  local steps=$1 cast=$2 step
  tm kill-server 2>/dev/null || true
  # Each scene starts from the default rules, without the person's own or the starters they turned on.
  clean_rules
  # Only voice settings: no personal status line or hooks in the picture, and no memory, so what is
  # said on camera is not remembered in the folder's real sessions.
  tm new-session -d -s tidia -x 100 -y 22 -c "$WORKDIR" \
    "env CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 claude --setting-sources project,local --permission-mode default --settings '{\"voice\":{\"enabled\":true,\"mode\":\"tap\"},\"language\":\"$LANGUAGE\",\"autoMemoryEnabled\":false}' --plugin-dir '$ROOT'"
  tm set -g status off
  # Without focus events Claude Code prints a one-line tmux hint under the prompt.
  tm set -g focus-events on
  tm set -g set-titles on
  tm set -g set-titles-string '#W'
  waitfor "for shortcuts" 60
  sleep 1.5
  # The recording client must be UTF-8, or tmux sends every Korean character as "_".
  tm new-session -d -s tidia-rec -x 100 -y 22 \
    "env -u TMUX asciinema rec --overwrite --cols 100 --rows 22 -c 'tmux -L tidia-demo -u attach -t tidia' '$cast'"
  sleep 1.5
  IFS='|' read -ra steps <<<"$steps"
  for step in "${steps[@]}"; do
    case $step in
      say:*) say_step "${step#say:}" ;;
      approve) waitfor "$ASK" 120; sleep 1.5; tm send-keys -t tidia Enter; idle; sleep 1 ;;
    esac
  done
  sleep 1.5
  tm detach-client -s tidia
  sleep 1
  local pid
  pid=$(tm display-message -p -t tidia '#{pane_pid}')
  tm kill-server
  # Claude Code saves the mod's state while it shuts down, so the saved state is put back after.
  while kill -0 "$pid" 2>/dev/null; do sleep 0.5; done
  restore
}

STORE=$(ls -t "$HOME"/.claude/plugins/store/tidia_inline-*.json 2>/dev/null | head -1 || true)
restore() { [ -z "$STORE" ] || cp "$OUT/store.json" "$STORE"; }
clean_rules() {
  [ -z "$STORE" ] || python3 -I -c 'import json, sys; d = json.load(open(sys.argv[1])); json.dump({k: v for k, v in d.items() if not k.startswith("rules:")}, open(sys.argv[2], "w"))' "$OUT/store.json" "$STORE"
}
if [ -n "$STORE" ]; then
  cp "$STORE" "$OUT/store.json"
  trap 'tm kill-server 2>/dev/null || true; sleep 5; restore' EXIT
fi

i=0
for s in "${SCENES[@]}"; do
  i=$((i + 1))
  [ -s "$OUT/$SET-$i.cast" ] || scene "$s" "$OUT/$SET-$i.cast"
done

# One cast: each scene up to the detach screen, the next starting on a cleared screen. Speech and
# waiting play fast up to the moment its cleaned message is sent; the rest plays at its own pace,
# with long pauses cut to a second. (asciicast v3 times are intervals since the previous event.)
python3 -I - "$OUT" "$SET" "$i" <<'PY'
import json, re, sys
# Claude Code's yellow notices (such as the account's usage) are personal: their letters become
# spaces. tmux draws a space as a cursor step and may split a notice across events, so the scene's
# output is joined, blanked without changing its length and split again.
NOTICE = re.compile(r'(\x1b\[38;5;220m)((?:[^\x1b]|\x1b\[C)*)')
STEP = re.compile(r'\x1b\[C|[^\x1b]')
def blank(m):
    return m.group(1) + STEP.sub(lambda c: c.group() if len(c.group()) > 1 else ' ', m.group(2))
def scrub(evs):
    out = [e for e in evs if e[1] == 'o']
    text = NOTICE.sub(blank, ''.join(e[2] for e in out))
    for e in out:
        e[2], text = text[:len(e[2])], text[len(e[2]):]
# The title changes mark() makes when speech starts and when the message is sent.
SPEECH = re.compile(r'\x1b\]\d;say\d*\x07')
SENT = re.compile(r'\x1b\]\d;sent\d*\x07')
# Claude Code's question dialog, held long enough to read.
GAP = r'(?: |\x1b\[C|\x1b\[[0-9;]*m)+'
DIALOG = re.compile(f'Enter{GAP}to{GAP}select')
out_dir, name, n = sys.argv[1], sys.argv[2], int(sys.argv[3])
header, events = None, []
for k in range(1, n + 1):
    lines = open(f'{out_dir}/{name}-{k}.cast').read().splitlines()
    header = header or lines[0]
    if events:
        events.append([2.5, 'o', '\x1b[2J\x1b[H'])
    fast, dialog, scene = True, False, []
    for line in lines[1:]:
        ev = json.loads(line)
        if ev[1] == 'o' and ('detached' in ev[2] or '\x1b[?1049l' in ev[2]):
            break
        if ev[1] == 'o' and SPEECH.search(ev[2]):
            fast = True
        arrives = fast and ev[1] == 'o' and 'tidia:' in ev[2]
        fast = fast and not arrives and not (ev[1] == 'o' and SENT.search(ev[2]))
        # The raw dictation stays up for a moment before the cleaned message replaces it.
        ev[0] = 1.2 if arrives else min(ev[0], 0.4) / 3.5 if fast else 3.0 if dialog and ev[0] >= 1 else min(ev[0], 1.0)
        dialog = ev[1] == 'o' and bool(DIALOG.search(ev[2])) or dialog and ev[0] < 1
        scene.append(ev)
    scrub(scene)
    events += scene
with open(f'{out_dir}/{name}.cast', 'w') as f:
    f.write(header + '\n')
    f.writelines(json.dumps(e, ensure_ascii=False) + '\n' for e in events)
PY

# agg reads .ttf files from a folder; the system's .ttc collections are not picked up.
mkdir -p "$OUT/fonts"
cp /System/Library/Fonts/Supplemental/AppleGothic.ttf "$OUT/fonts/"
cp "${MONO_FONT:-$HOME/Library/Fonts/DejaVu Sans Mono for Powerline.ttf}" "$OUT/fonts/"
agg --font-dir "$OUT/fonts" --font-family "${MONO_FAMILY:-DejaVu Sans Mono for Powerline},AppleGothic" \
  --font-size 16 --idle-time-limit 3 --last-frame-duration 4 --theme monokai \
  "$OUT/$SET.cast" "$ROOT/docs/$GIF"
echo "wrote $ROOT/docs/$GIF (recordings in $OUT)"
