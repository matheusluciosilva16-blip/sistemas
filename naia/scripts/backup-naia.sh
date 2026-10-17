#!/usr/bin/env bash
# ============================================================
# backup-naia — copia COMPLETA da Naia antes de reinstalar
#
# Roda na VPS, sem tirar a Naia do ar. Empacota /root/.hermes
# inteiro (memoria, treinamentos, historico, skills, plugins,
# cron, .env e auth.json).
#
# O pacote tem SEGREDOS (token do bot, chaves, OAuth).
# Baixe para o seu computador e nunca coloque no repositorio.
#
# No terminal da VPS (o naia-sync ja traz este arquivo):
#   bash /root/naia-sync/naia/scripts/backup-naia.sh
# ============================================================
set -uo pipefail

SRC=/root/.hermes
STAMP=$(date +%Y%m%d-%H%M%S)
OUT=/root/naia-backup-$STAMP.tgz

[ -d "$SRC" ] || { echo "FALHA: $SRC nao existe"; exit 1; }

# Sem parar a Naia: os bancos SQLite (state.db e outros .db) sao
# copiados pela API de backup do proprio SQLite, que gera uma copia
# consistente mesmo com ela rodando. O resto vai como esta.
# Cache e fica de fora: e descartavel e ocupa espaco.
echo "copiando (a Naia continua no ar)..."
umask 077
python3 - "$OUT" <<'PY'
import os, sqlite3, sys, tarfile, tempfile
out = sys.argv[1]
skip = {"cache", "image_cache", "audio_cache", "video_cache",
        "document_cache", "browser_screenshots"}
tmp = tempfile.mkdtemp()
with tarfile.open(out, "w:gz") as tar:
    for top in (".hermes", ".naia-backups", ".naia-sync-state"):
        base = os.path.join("/root", top)
        if not os.path.isdir(base):
            continue
        for root, dirs, files in os.walk(base):
            rel = os.path.relpath(root, "/root")
            if top == ".hermes" and root == base:
                dirs[:] = [d for d in dirs if d not in skip]
            tar.add(root, arcname=rel, recursive=False)
            for f in files:
                src = os.path.join(root, f)
                arc = os.path.join(rel, f)
                if f.endswith((".db-wal", ".db-shm", ".db-journal")):
                    continue
                if f.endswith(".db"):
                    dst = os.path.join(tmp, f)
                    try:
                        a = sqlite3.connect(f"file:{src}?mode=ro", uri=True)
                        b = sqlite3.connect(dst)
                        a.backup(b); b.close(); a.close()
                        tar.add(dst, arcname=arc)
                        os.remove(dst)
                        continue
                    except sqlite3.Error as e:
                        print(f"aviso: {arc} copiado direto ({e})")
                try:
                    tar.add(src, arcname=arc)
                except OSError as e:
                    print(f"aviso: {arc} ignorado ({e})")
PY
RC=$?
[ "$RC" = "0" ] || { echo "FALHA: tar retornou $RC"; exit 1; }
chmod 600 "$OUT"

# a crontab do root tem o naia-sync e as tarefas que nao vivem no .hermes
crontab -l > "/root/naia-crontab-$STAMP.txt" 2>/dev/null && chmod 600 "/root/naia-crontab-$STAMP.txt"

echo
echo "=================================================="
echo "BACKUP: $OUT ($(du -h "$OUT" | cut -f1))"
echo "conferencia do que entrou:"
# le o indice do pacote uma vez so (cada leitura descompacta o arquivo inteiro)
LIST=$(mktemp); tar tzf "$OUT" > "$LIST" 2>/dev/null
for p in SOUL.md AGENTS.md config.yaml .env auth.json state.db memories training context skills plugins cron sessions; do
  if grep -qxE "\.hermes/$p/?" "$LIST"; then
    echo "  OK      $p"
  else
    echo "  ausente $p"
  fi
done
rm -f "$LIST"
echo
echo "Para guardar fora da VPS, no terminal do SEU computador:"
echo "  scp root@IP_DA_VPS:$OUT ."
echo "=================================================="
