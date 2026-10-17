#!/usr/bin/env bash
# ============================================================
# backup-naia — copia COMPLETA da Naia antes de reinstalar
#
# Roda na VPS. Para o gateway por alguns segundos, empacota
# /root/.hermes inteiro (memoria, treinamentos, historico,
# skills, plugins, cron, .env e auth.json) e religa.
#
# O pacote tem SEGREDOS (token do bot, chaves, OAuth).
# Baixe para o seu computador e nunca coloque no repositorio.
#
#   ssh root@VPS 'bash -s' < naia/scripts/backup-naia.sh
#   scp root@VPS:/root/naia-backup-*.tgz .
# ============================================================
set -uo pipefail

SRC=/root/.hermes
STAMP=$(date +%Y%m%d-%H%M%S)
OUT=/root/naia-backup-$STAMP.tgz
export XDG_RUNTIME_DIR=/run/user/0

[ -d "$SRC" ] || { echo "FALHA: $SRC nao existe"; exit 1; }

# para o gateway para o state.db (SQLite) nao ser copiado no meio de uma escrita
echo "parando o gateway..."
systemctl --user stop hermes-gateway.service

# cache e logs ficam de fora: sao descartaveis e ocupam espaco
umask 077
tar czf "$OUT" -C /root \
  --exclude='.hermes/cache' \
  --exclude='.hermes/image_cache' --exclude='.hermes/audio_cache' \
  --exclude='.hermes/video_cache' --exclude='.hermes/document_cache' \
  --exclude='.hermes/browser_screenshots' \
  .hermes \
  $( [ -d /root/.naia-backups ] && echo .naia-backups ) \
  $( [ -d /root/.naia-sync-state ] && echo .naia-sync-state )
RC=$?

echo "religando o gateway..."
systemctl --user start hermes-gateway.service
sleep 5
echo "gateway: $(systemctl --user is-active hermes-gateway.service)"

[ "$RC" = "0" ] || { echo "FALHA: tar retornou $RC"; exit 1; }
chmod 600 "$OUT"

# a crontab do root tem o naia-sync e as tarefas que nao vivem no .hermes
crontab -l > "/root/naia-crontab-$STAMP.txt" 2>/dev/null && chmod 600 "/root/naia-crontab-$STAMP.txt"

echo
echo "=================================================="
echo "BACKUP: $OUT ($(du -h "$OUT" | cut -f1))"
echo "conferencia do que entrou:"
for p in SOUL.md AGENTS.md config.yaml .env auth.json state.db memories training context skills plugins cron sessions; do
  if tar tzf "$OUT" ".hermes/$p" >/dev/null 2>&1; then
    echo "  OK      $p"
  else
    echo "  ausente $p"
  fi
done
echo
echo "Agora baixe para o seu computador:"
echo "  scp root@VPS:$OUT ."
echo "=================================================="
