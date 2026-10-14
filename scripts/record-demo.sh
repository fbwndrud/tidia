#!/usr/bin/env bash
# Records the README demos: short scenes of Claude Code with this mod, where a macOS voice reads
# tap-mode dictations aloud for the built-in microphone to hear. A scene ends shortly after its last
# cleaned message is sent, before Claude does anything with it.
#
#   scripts/record-demo.sh en           docs/demo.gif              cleanup, English
#   scripts/record-demo.sh ko           docs/demo.ko.gif           cleanup, Korean
#   scripts/record-demo.sh en-settings  docs/demo-settings.gif     an output rule asked for by voice
#   scripts/record-demo.sh ko-settings  docs/demo-settings.ko.gif
#   scripts/record-demo.sh ja           docs/demo.ja.gif           the same for ja, zh, zh-TW, es, de,
#   scripts/record-demo.sh ja-settings  docs/demo-settings.ja.gif  fr, pt-BR, ru and id
#
# Hindi has none: agg draws Devanagari without joining its letters, and Claude Code and tmux count
# its cell widths differently, so the letters come out apart or doubled. README.hi.md shows the
# English demos.
#
# Needs macOS, tmux, asciinema and agg (brew install tmux asciinema agg), a quiet room and the
# speakers on (not muted). Run it from a folder Claude Code already trusts. Each dictation sends one
# real message; the session runs in the default permission mode, so nothing runs without approval.
# Each scene runs without the saved rules; the mod's saved dictionary and rules are put back afterwards,
# so a rule made on camera is not kept.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORKDIR=$PWD
USAGE='usage: record-demo.sh <en|ko|ja|zh|zh-TW|es|de|fr|pt-BR|ru|id>[-settings]'
SET=${1:?$USAGE}
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
  # HELD is the band's "sends once tidied" line in the session's language.
  ja | ja-settings) VOICE=Kyoko RATE=180 LANGUAGE=Japanese ASK='許可しますか' HELD='整え終わったら送信します' TAIL=1.5 ;;
  zh | zh-settings) VOICE=Tingting RATE=180 LANGUAGE='Simplified Chinese' ASK='允许吗' HELD='整理完成后发送' TAIL=1.5 ;;
  zh-TW | zh-TW-settings) VOICE=Meijia RATE=180 LANGUAGE='繁體中文' ASK='要允許嗎' HELD='整理完成後傳送' TAIL=1.5 ;;
  es | es-settings) VOICE=Paulina RATE=180 LANGUAGE=Spanish ASK='¿Lo permites?' HELD='Se envía al terminar' TAIL=2 ;;
  de | de-settings) VOICE=Anna RATE=175 LANGUAGE=German ASK='Erlauben?' HELD='Wird nach dem Glätten gesendet' TAIL=2 ;;
  fr | fr-settings) VOICE=Thomas RATE=180 LANGUAGE=French ASK="L'autoriser ?" HELD='Envoi une fois mis au propre' TAIL=2 ;;
  pt-BR | pt-BR-settings) VOICE=Luciana RATE=180 LANGUAGE='Brazilian Portuguese' ASK='Permitir?' HELD='Envia ao terminar' TAIL=2 ;;
  ru | ru-settings) VOICE=Milena RATE=175 LANGUAGE=Russian ASK='Разрешить?' HELD='Отправится после обработки' TAIL=2 ;;
  id | id-settings) VOICE=Damayanti RATE=180 LANGUAGE=Indonesian ASK='Izinkan?' HELD='Dikirim setelah dirapikan' TAIL=2 ;;
  *) echo "$USAGE" >&2; exit 2 ;;
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
  ja) GIF=demo.ja.gif SCENES=(
    "say:えっと、あの、ログインページの、いや、設定ページがスマホでなんでこんなに遅いのか、えーと、調べてくれる？"
    "say:えーと、まずテストを実行して、あの、失敗したら直して、それから、えっと、変更履歴を更新して、最後に全部コミットして"
    "say:あの、ダークモードの切り替えを、えっと、ヘッダーに、いや違う、設定ページに追加して、選んだ設定を覚えておくようにして"
  ) ;;
  ja-settings) GIF=demo-settings.ja.gif SCENES=(
    "say:えっと、ルールを一つ追加して、あの、バグを報告するときは、何が起きるか、再現手順、期待する結果の順に書くように|approve|say:えーと、ログインボタンがサファリで反応しなくて、あの、押しても何も起きないんだけど、本当はダッシュボードに移動するはず"
  ) ;;
  zh) GIF=demo.zh.gif SCENES=(
    "say:嗯，那个，你帮我看看登录页面，不对，是设置页面，呃，为什么在手机上这么慢"
    "say:嗯，先跑一下测试，呃，如果有失败的就修一下，然后，那个，更新一下变更日志，最后全部提交"
    "say:那个，帮我在，呃，页头加一个深色模式开关，不对，是设置页面，然后让它记住用户的选择"
  ) ;;
  zh-settings) GIF=demo-settings.zh.gif SCENES=(
    "say:嗯，帮我加一条规则，呃，就是我报告问题的时候，按照现象、复现步骤、预期结果来写|approve|say:那个，登录按钮在苹果浏览器上点了没反应，呃，就是点了什么都不发生，本来应该跳到仪表盘的"
  ) ;;
  zh-TW) GIF=demo.zh-TW.gif SCENES=(
    "say:嗯，那個，你幫我看看登入頁面，不對，是設定頁面，呃，為什麼在手機上這麼慢"
    "say:嗯，先跑一下測試，呃，如果有失敗的就修一下，然後，那個，更新變更紀錄，最後全部提交"
    "say:那個，幫我在，呃，頁首加一個深色模式開關，不對，是設定頁面，然後讓它記住使用者的選擇"
  ) ;;
  zh-TW-settings) GIF=demo-settings.zh-TW.gif SCENES=(
    "say:嗯，幫我加一條規則，呃，就是我回報問題的時候，照現象、重現步驟、預期結果來寫|approve|say:那個，登入按鈕在蘋果瀏覽器上點了沒反應，呃，就是點了什麼都沒發生，本來應該跳到儀表板的"
  ) ;;
  es) GIF=demo.es.gif SCENES=(
    "say:eh, oye, ¿puedes revisar la página de inicio de sesión, digo, la página de ajustes, y, este, ver por qué va tan lenta en el celular?"
    "say:bueno, eh, primero corre las pruebas y, este, si algo falla arréglalo, luego actualiza el registro de cambios y, eh, al final haz commit de todo"
    "say:eh, ¿puedes agregar un interruptor de modo oscuro en el, este, encabezado, no, espera, en la página de ajustes, y que recuerde la elección?"
  ) ;;
  es-settings) GIF=demo-settings.es.gif SCENES=(
    "say:oye, agrega una regla, este, para que cuando reporte un error se escriba como qué pasa, pasos para reproducirlo y qué esperaba|approve|say:bueno, eh, el botón de iniciar sesión no hace nada en Safari, o sea, lo presiono y no pasa nada, y debería llevarme al panel"
  ) ;;
  de) GIF=demo.de.gif SCENES=(
    "say:ähm, kannst du dir mal die Login-Seite, äh, ich meine die Einstellungsseite anschauen und, ähm, prüfen, warum sie auf dem Handy so langsam ist"
    "say:also, ähm, zuerst die Tests ausführen und, äh, wenn was fehlschlägt, das beheben, dann das Änderungsprotokoll aktualisieren und, ähm, zum Schluss alles committen"
    "say:also, ähm, kannst du einen Dunkelmodus-Schalter in den, ähm, Kopfbereich, nein warte, in die Einstellungsseite einbauen und die Auswahl speichern"
  ) ;;
  de-settings) GIF=demo-settings.de.gif SCENES=(
    "say:ähm, füg bitte eine Regel hinzu, äh, wenn ich einen Fehler melde, soll er als was passiert, Schritte zum Nachstellen und was ich erwartet habe geschrieben werden|approve|say:also, ähm, der Anmeldeknopf macht in Safari nichts, also ich klicke drauf und, äh, nichts passiert, dabei sollte er mich zur Übersicht bringen"
  ) ;;
  fr) GIF=demo.fr.gif SCENES=(
    "say:euh, tu peux regarder la page de connexion, enfin je veux dire la page des paramètres, et, euh, voir pourquoi elle charge si lentement sur mobile"
    "say:bon, euh, d'abord lance les tests et, euh, si quelque chose échoue corrige-le, ensuite mets à jour le journal des modifications et, euh, enfin fais un commit de tout"
    "say:euh, tu peux ajouter un bouton de mode sombre dans l'en-tête, euh, non, pardon, dans la page des paramètres, et qu'il se souvienne du choix"
  ) ;;
  fr-settings) GIF=demo-settings.fr.gif SCENES=(
    "say:euh, ajoute une règle, euh, pour que quand je signale un bug il soit écrit comme ce qui se passe, les étapes pour le reproduire et ce que j'attendais|approve|say:bon, euh, le bouton de connexion ne fait rien sur Safari, genre je clique et, euh, il ne se passe rien, alors qu'il devrait m'amener au tableau de bord"
  ) ;;
  pt-BR) GIF=demo.pt-BR.gif SCENES=(
    "say:é, então, você pode olhar a página de login, quer dizer, a página de configurações, e, tipo, ver por que ela está tão lenta no celular"
    "say:tá, tipo, primeiro roda os testes e, é, se alguma coisa falhar corrige, depois atualiza o registro de mudanças e, é, no final faz commit de tudo"
    "say:é, você pode colocar um botão de modo escuro no, é, cabeçalho, não, espera, na página de configurações, e fazer ele lembrar a escolha"
  ) ;;
  pt-BR-settings) GIF=demo-settings.pt-BR.gif SCENES=(
    "say:tipo, adiciona uma regra, é, pra quando eu relatar um bug ele ser escrito como o que acontece, passos pra reproduzir e o que eu esperava|approve|say:então, é, o botão de login não faz nada no Safari, tipo, eu clico e, é, nada acontece, e era pra me levar pro painel"
  ) ;;
  ru) GIF=demo.ru.gif SCENES=(
    "say:э-э, слушай, можешь посмотреть страницу входа, то есть, нет, страницу настроек, и, ну, понять, почему она так тормозит на телефоне"
    "say:так, э-э, сначала запусти тесты и, ну, если что-то падает, исправь, потом обнови список изменений и, э-э, в конце закоммить всё"
    "say:э-э, можешь добавить переключатель тёмной темы в, ну, шапку, нет, подожди, на страницу настроек, и чтобы он запоминал выбор"
  ) ;;
  ru-settings) GIF=demo-settings.ru.gif SCENES=(
    "say:э-э, добавь правило, ну, чтобы когда я сообщаю об ошибке, она записывалась как что происходит, шаги воспроизведения и что я ожидал|approve|say:так, э-э, кнопка входа в сафари ничего не делает, ну, я нажимаю и ничего не происходит, а должна открывать панель"
  ) ;;
  id) GIF=demo.id.gif SCENES=(
    "say:eh, anu, bisa tolong cek halaman login, eh maksudnya halaman pengaturan, terus, hmm, lihat kenapa lambat banget di HP"
    "say:oke, eh, pertama jalankan tesnya dan, anu, kalau ada yang gagal perbaiki, terus perbarui catatan perubahan dan, eh, terakhir commit semuanya"
    "say:eh, bisa tambahkan tombol mode gelap di, anu, header, eh bukan, di halaman pengaturan, dan buat dia ingat pilihannya"
  ) ;;
  id-settings) GIF=demo-settings.id.gif SCENES=(
    "say:eh, tambahkan aturan, anu, supaya kalau aku melaporkan bug ditulis jadi apa yang terjadi, langkah untuk mereproduksi, dan apa yang aku harapkan|approve|say:oke, eh, tombol login nggak ngapa-ngapain di Safari, maksudnya aku klik dan, anu, nggak ada yang terjadi, padahal harusnya ke dashboard"
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
  for _ in $(seq 1 360); do tm capture-pane -t tidia -p | grep -q "$HELD" || break; sleep 0.25; done
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

# agg reads .ttf files from a folder; the system's .ttc collections are not picked up. Arial Unicode
# has kana, Han, Cyrillic and Devanagari; AppleGothic comes first only for Korean, so Japanese and
# Chinese text does not borrow its Hanja.
case $SET in
  en* | ko*) WIDE_FONTS='AppleGothic,Arial Unicode MS' ;;
  *) WIDE_FONTS='Arial Unicode MS,AppleGothic' ;;
esac
mkdir -p "$OUT/fonts"
cp /System/Library/Fonts/Supplemental/AppleGothic.ttf "/System/Library/Fonts/Supplemental/Arial Unicode.ttf" "$OUT/fonts/"
cp "${MONO_FONT:-$HOME/Library/Fonts/DejaVu Sans Mono for Powerline.ttf}" "$OUT/fonts/"
agg --font-dir "$OUT/fonts" --font-family "${MONO_FAMILY:-DejaVu Sans Mono for Powerline},$WIDE_FONTS" \
  --font-size 16 --idle-time-limit 3 --last-frame-duration 4 --theme monokai \
  "$OUT/$SET.cast" "$ROOT/docs/$GIF"
echo "wrote $ROOT/docs/$GIF (recordings in $OUT)"
