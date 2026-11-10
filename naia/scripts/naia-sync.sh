#!/usr/bin/env bash
# ============================================================
# naia-sync — aplica na VPS o que foi commitado no repositorio,
# para a Naia e para os outros agentes (Donna).
#
# Roda por cron. Desenhado para NUNCA destruir o aprendizado
# delas: cada agente edita o proprio SOUL.md e AGENTS.md conforme
# incorpora treinamento. Se o arquivo local mudou desde a
# ultima sincronizacao, o script NAO sobrescreve — registra
# conflito e segue. Quem decide e o dono.
#
# config.yaml: o repositorio manda em tudo, MENOS em mcp_servers
# (as conexoes como Sync e Meu Estagiario, com as chaves), que
# ficam sempre como estao na VPS. A comparacao ignora essa parte.
#
# Agentes:
#   naia   repo naia/hermes/              -> /root/.hermes/
#   donna  repo naia/donna/ (+ config.yaml de naia/hermes/ se
#          naia/donna/config.yaml nao existir)
#                                         -> /root/.hermes/profiles/donna/
# ============================================================
set -uo pipefail

REPO=/root/naia-sync
STATE=/root/.naia-sync-state
BACKUP=/root/.naia-backups
LOG=/root/.hermes/logs/naia-sync.log
PY=/usr/local/lib/hermes-agent/venv/bin/python
[ -x "$PY" ] || PY=python3

mkdir -p "$STATE" "$BACKUP" "$(dirname "$LOG")"
log(){ echo "[$(date "+%Y-%m-%d %H:%M:%S")] $*" >> "$LOG"; }

# --- 1. buscar o repositorio ---------------------------------
cd "$REPO" 2>/dev/null || { log "ERRO: $REPO nao existe"; exit 1; }
BEFORE=$(git rev-parse HEAD 2>/dev/null)
git fetch -q origin main 2>>"$LOG" || { log "ERRO: git fetch falhou"; exit 1; }
git reset -q --hard origin/main 2>>"$LOG"
AFTER=$(git rev-parse HEAD 2>/dev/null)

# o proprio sincronizador se atualiza quando muda no repositorio
SELF=$(readlink -f "$0")
NOVO="$REPO/naia/scripts/naia-sync.sh"
if [ -f "$NOVO" ] && [ "$SELF" != "$(readlink -f "$NOVO")" ] && ! cmp -s "$NOVO" "$SELF"; then
  if install -m 755 "$NOVO" "$SELF" 2>>"$LOG"; then
    log "naia-sync atualizado pelo repositorio"
    exec "$SELF" "$@"
  fi
fi

STAMP=$(date +%Y%m%d-%H%M%S)

# md5 do config.yaml sem mcp_servers (formatacao nao importa)
cfg_md5(){
  [ -f "$1" ] || return 0
  "$PY" - "$1" <<'PY' 2>/dev/null
import hashlib, json, sys, yaml
d = yaml.safe_load(open(sys.argv[1])) or {}
d.pop("mcp_servers", None)
print(hashlib.md5(json.dumps(d, sort_keys=True, default=str).encode()).hexdigest())
PY
}

# grava o config do repositorio mantendo o mcp_servers da VPS
cfg_apply(){ # src dst
  "$PY" - "$1" "$2" <<'PY'
import os, sys, yaml
src, dst = sys.argv[1], sys.argv[2]
novo = yaml.safe_load(open(src)) or {}
if os.path.exists(dst):
    atual = yaml.safe_load(open(dst)) or {}
    if "mcp_servers" in atual:
        novo["mcp_servers"] = atual["mcp_servers"]
tmp = dst + ".naia-sync-tmp"
with open(tmp, "w") as f:
    yaml.safe_dump(novo, f, sort_keys=False, allow_unicode=True, default_flow_style=False)
os.replace(tmp, dst)
PY
}

CHANGED=0
APLICADOS=()   # "dst|backup" de cada agente, para reverter se o servico nao subir

# --- 2. aplicar um agente --------------------------------------
# sync_agente NOME DESTINO DIR_ESTADO DIR_BACKUP  ARQ=ORIGEM ...
sync_agente(){
  local NOME=$1 DST=$2 ST=$3 BK=$4; shift 4
  [ -d "$DST" ] || return 0
  mkdir -p "$ST" "$BK"

  # backup do estado atual (sempre); guarda os 30 mais recentes
  local f
  for f in SOUL.md AGENTS.md config.yaml; do
    [ -f "$DST/$f" ] && cp -p "$DST/$f" "$BK/$f.$STAMP"
    ls -1t "$BK/$f."* 2>/dev/null | tail -n +31 | xargs -r rm -f
  done
  APLICADOS+=("$DST|$BK")
  local NOVO_AGENTE=0
  ls "$ST"/*.md5 >/dev/null 2>&1 || NOVO_AGENTE=1

  local par SRC NEW CUR LAST
  for par in "$@"; do
    f=${par%%=*}; SRC=${par#*=}
    [ -f "$SRC" ] || continue
    if [ "$f" = config.yaml ]; then
      # formato antigo do estado (md5 do arquivo inteiro): adota o novo uma vez
      [ -f "$ST/.config-v2" ] || { rm -f "$ST/config.yaml.md5"; touch "$ST/.config-v2"; }
      NEW=$(cfg_md5 "$SRC"); CUR=$(cfg_md5 "$DST/$f")
      [ -n "$NEW" ] || { log "[$NOME] ERRO: $SRC nao e um YAML valido; nada aplicado"; continue; }
    else
      NEW=$(md5sum "$SRC" | cut -d" " -f1)
      CUR=$(md5sum "$DST/$f" 2>/dev/null | cut -d" " -f1)
    fi
    LAST=$(cat "$ST/$f.md5" 2>/dev/null)

    [ "$NEW" = "$CUR" ] && { echo "$NEW" > "$ST/$f.md5"; continue; }

    # primeira vez deste agente: SOUL/AGENTS diferentes do repositorio podem ser
    # aprendizado dela; marca como conflito (rm do .md5 depois forca o repositorio)
    if [ -z "$LAST" ] && [ -n "$CUR" ] && [ "$f" != config.yaml ] && [ "$NOVO_AGENTE" = 1 ]; then
      LAST=adotado-da-vps; echo "$LAST" > "$ST/$f.md5"
    fi

    if [ -n "$LAST" ] && [ -n "$CUR" ] && [ "$CUR" != "$LAST" ]; then
      # mudou na VPS desde a ultima sincronizacao: pode ser aprendizado dela
      log "[$NOME] CONFLITO em $f — o arquivo na VPS e diferente e foi alterado la. Nao sobrescrevi."
      log "  backup do estado atual: $BK/$f.$STAMP"
      log "  para forcar o do repositorio: rm $ST/$f.md5 && naia-sync"
      continue
    fi

    if [ "$f" = config.yaml ]; then
      cfg_apply "$SRC" "$DST/$f" 2>>"$LOG" || { log "[$NOME] ERRO ao gravar $f"; continue; }
    else
      cp "$SRC" "$DST/$f"
    fi
    echo "$NEW" > "$ST/$f.md5"
    CHANGED=1
    log "[$NOME] aplicado: $f"
  done
}

H="$REPO/naia/hermes"
sync_agente naia /root/.hermes "$STATE" "$BACKUP" \
  "config.yaml=$H/config.yaml" "SOUL.md=$H/SOUL.md" "AGENTS.md=$H/AGENTS.md"

D="$REPO/naia/donna"
DCFG="$D/config.yaml"; [ -f "$DCFG" ] || DCFG="$H/config.yaml"
sync_agente donna /root/.hermes/profiles/donna "$STATE/donna" "$BACKUP/donna" \
  "config.yaml=$DCFG" "SOUL.md=$D/SOUL.md" "AGENTS.md=$D/AGENTS.md"

# A unidade systemd NAO e sincronizada: desde o Hermes 0.21
# o proprio gateway reescreve hermes-gateway.service a cada boot.

# --- 3. reiniciar so se algo mudou (um servico atende todos) -
if [ "$CHANGED" = "1" ]; then
  export XDG_RUNTIME_DIR=/run/user/0
  systemctl --user restart hermes-gateway.service 2>>"$LOG"
  sleep 8
  SVC=$(systemctl --user is-active hermes-gateway.service)
  log "servico reiniciado: $SVC"
  if [ "$SVC" != "active" ]; then
    log "FALHA AO SUBIR — revertendo para o backup $STAMP"
    for par in "${APLICADOS[@]}"; do
      for f in SOUL.md AGENTS.md config.yaml; do
        [ -f "${par#*|}/$f.$STAMP" ] && cp -p "${par#*|}/$f.$STAMP" "${par%%|*}/$f"
      done
    done
    systemctl --user restart hermes-gateway.service 2>>"$LOG"
    sleep 8
    log "apos reversao: $(systemctl --user is-active hermes-gateway.service)"
  fi
elif [ "$BEFORE" != "$AFTER" ]; then
  log "repositorio atualizado, nenhum arquivo aplicavel mudou"
fi

# --- 4. snapshot do aprendizado delas ------------------------
# Sem acesso de escrita ao git (deploy key e somente leitura),
# guardamos uma copia datada do que elas escreveram sozinhas.
snapshot(){ # NOME DST SNAPDIR
  local f; mkdir -p "$3"
  for f in SOUL.md AGENTS.md; do
    if [ -f "$2/$f" ] && ! cmp -s "$2/$f" "$3/$f"; then
      cp "$2/$f" "$3/$f"
      cp "$2/$f" "$3/$f.$STAMP"
      ls -1t "$3/$f."* 2>/dev/null | tail -n +16 | xargs -r rm -f
      log "[$1] aprendizado mudou em $f — snapshot guardado"
    fi
  done
}
snapshot naia /root/.hermes "$BACKUP/aprendizado"
[ -d /root/.hermes/profiles/donna ] && snapshot donna /root/.hermes/profiles/donna "$BACKUP/donna/aprendizado"
exit 0
