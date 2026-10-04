#!/usr/bin/env bash
# ============================================================
# naia-sync — aplica na VPS o que foi commitado no repositorio
#
# Roda por cron. Desenhado para NUNCA destruir o aprendizado
# dela: a Naia edita o proprio SOUL.md e AGENTS.md conforme
# incorpora treinamento. Se o arquivo local mudou desde a
# ultima sincronizacao, o script NAO sobrescreve — registra
# conflito e segue. Quem decide e o dono.
# ============================================================
set -uo pipefail

REPO=/root/naia-sync
SRC="$REPO/naia/hermes"
DST=/root/.hermes
STATE=/root/.naia-sync-state
BACKUP=/root/.naia-backups
LOG=/root/.hermes/logs/naia-sync.log

mkdir -p "$STATE" "$BACKUP" "$(dirname "$LOG")"
log(){ echo "[$(date "+%Y-%m-%d %H:%M:%S")] $*" >> "$LOG"; }

# --- 1. buscar o repositorio ---------------------------------
cd "$REPO" 2>/dev/null || { log "ERRO: $REPO nao existe"; exit 1; }
BEFORE=$(git rev-parse HEAD 2>/dev/null)
git fetch -q origin main 2>>"$LOG" || { log "ERRO: git fetch falhou"; exit 1; }
git reset -q --hard origin/main 2>>"$LOG"
AFTER=$(git rev-parse HEAD 2>/dev/null)

# --- 2. backup do estado atual dela (sempre) -----------------
STAMP=$(date +%Y%m%d-%H%M%S)
for f in SOUL.md AGENTS.md config.yaml; do
  [ -f "$DST/$f" ] && cp "$DST/$f" "$BACKUP/$f.$STAMP"
done
# guarda so os 30 backups mais recentes de cada arquivo
for f in SOUL.md AGENTS.md config.yaml; do
  ls -1t "$BACKUP/$f."* 2>/dev/null | tail -n +31 | xargs -r rm -f
done

# --- 3. aplicar arquivo por arquivo, com deteccao de conflito -
CHANGED=0
for f in config.yaml SOUL.md AGENTS.md; do
  [ -f "$SRC/$f" ] || continue
  NEW=$(md5sum "$SRC/$f" | cut -d" " -f1)
  CUR=$(md5sum "$DST/$f" 2>/dev/null | cut -d" " -f1)
  LAST=$(cat "$STATE/$f.md5" 2>/dev/null)

  [ "$NEW" = "$CUR" ] && { echo "$NEW" > "$STATE/$f.md5"; continue; }

  if [ -n "$LAST" ] && [ -n "$CUR" ] && [ "$CUR" != "$LAST" ]; then
    # o arquivo na VPS mudou desde a ultima sincronizacao: ela editou
    log "CONFLITO em $f — a Naia alterou este arquivo na VPS. Nao sobrescrevi."
    log "  backup do estado dela: $BACKUP/$f.$STAMP"
    log "  para forcar o do repositorio: rm $STATE/$f.md5 && naia-sync"
    continue
  fi

  cp "$SRC/$f" "$DST/$f"
  echo "$NEW" > "$STATE/$f.md5"
  CHANGED=1
  log "aplicado: $f"
done

# unidade systemd (raro mudar, sem conflito possivel)
UNIT="$REPO/naia/systemd/hermes-gateway.service"
DSTUNIT=/root/.config/systemd/user/hermes-gateway.service
if [ -f "$UNIT" ] && ! cmp -s "$UNIT" "$DSTUNIT"; then
  cp "$UNIT" "$DSTUNIT"; CHANGED=1; RELOAD=1
  log "aplicado: hermes-gateway.service"
fi

# --- 3b. plugins (naia/plugins/<nome> -> /root/.hermes/plugins/<nome>) --
# Copia sem apagar nada no destino: arquivos colocados direto na VPS
# (imagens da personagem, logo) sobrevivem. Backup em .tgz antes de copiar.
PLUGSRC="$REPO/naia/plugins"
PLUGDST=/root/.hermes/plugins
PLUG_APPLIED=""
if [ -d "$PLUGSRC" ]; then
  mkdir -p "$PLUGDST"
  for d in "$PLUGSRC"/*/; do
    [ -f "$d/plugin.yaml" ] || continue
    name=$(basename "$d")
    NEWH=$(cd "$d" && find . -type f ! -path '*/__pycache__/*' -print0 | sort -z | xargs -0 md5sum | md5sum | cut -d" " -f1)
    OLDH=$(cat "$STATE/plugin-$name.md5" 2>/dev/null)
    [ "$NEWH" = "$OLDH" ] && continue
    [ -d "$PLUGDST/$name" ] && tar -C "$PLUGDST" -czf "$BACKUP/plugin-$name.$STAMP.tgz" "$name"
    ls -1t "$BACKUP/plugin-$name."*.tgz 2>/dev/null | tail -n +11 | xargs -r rm -f
    mkdir -p "$PLUGDST/$name"
    cp -a "$d". "$PLUGDST/$name/"
    echo "$NEWH" > "$STATE/plugin-$name.md5"
    PLUG_APPLIED="$PLUG_APPLIED $name"
    CHANGED=1
    log "aplicado: plugin $name"
  done
fi

# --- 4. reiniciar so se algo mudou ---------------------------
if [ "$CHANGED" = "1" ]; then
  export XDG_RUNTIME_DIR=/run/user/0
  [ "${RELOAD:-0}" = "1" ] && systemctl --user daemon-reload
  systemctl --user restart hermes-gateway.service 2>>"$LOG"
  sleep 8
  ST=$(systemctl --user is-active hermes-gateway.service)
  log "servico reiniciado: $ST"
  if [ "$ST" != "active" ]; then
    log "FALHA AO SUBIR — revertendo para o backup $STAMP"
    for f in SOUL.md AGENTS.md config.yaml; do
      [ -f "$BACKUP/$f.$STAMP" ] && cp "$BACKUP/$f.$STAMP" "$DST/$f"
    done
    for name in $PLUG_APPLIED; do
      if [ -f "$BACKUP/plugin-$name.$STAMP.tgz" ]; then
        rm -rf "$PLUGDST/$name" && tar -C "$PLUGDST" -xzf "$BACKUP/plugin-$name.$STAMP.tgz"
      else
        rm -rf "$PLUGDST/$name"
      fi
      # O md5 fica gravado: so tenta de novo quando o plugin mudar no repositorio.
      log "plugin $name revertido; corrija no repositorio para tentar de novo"
    done
    systemctl --user restart hermes-gateway.service 2>>"$LOG"
    sleep 8
    log "apos reversao: $(systemctl --user is-active hermes-gateway.service)"
  fi
elif [ "$BEFORE" != "$AFTER" ]; then
  log "repositorio atualizado, nenhum arquivo aplicavel mudou"
fi

# --- 4b. o proprio sincronizador se atualiza (vale na proxima execucao) --
SELF_SRC="$REPO/naia/scripts/naia-sync.sh"
if [ -f "$SELF_SRC" ] && ! cmp -s "$SELF_SRC" /usr/local/bin/naia-sync; then
  if bash -n "$SELF_SRC"; then
    install -m 755 "$SELF_SRC" /usr/local/bin/naia-sync
    log "naia-sync atualizado a partir do repositorio"
  else
    log "ERRO: naia-sync.sh do repositorio tem erro de sintaxe; mantive a versao atual"
  fi
fi

# --- 5. snapshot do aprendizado dela -------------------------
# Sem acesso de escrita ao git (deploy key e somente leitura),
# guardamos uma copia datada do que ela escreveu sozinha.
SNAP="$BACKUP/aprendizado"
mkdir -p "$SNAP"
for f in SOUL.md AGENTS.md; do
  if [ -f "$DST/$f" ] && ! cmp -s "$DST/$f" "$SNAP/$f"; then
    cp "$DST/$f" "$SNAP/$f"
    cp "$DST/$f" "$SNAP/$f.$STAMP"
    ls -1t "$SNAP/$f."* 2>/dev/null | tail -n +16 | xargs -r rm -f
    log "aprendizado dela mudou em $f — snapshot guardado"
  fi
done
exit 0
