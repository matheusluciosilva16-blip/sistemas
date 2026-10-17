#!/usr/bin/env bash
# ============================================================
# atualizar-hermes — troca o PROGRAMA do Hermes por uma versao
# nova, sem mexer na Naia (/root/.hermes fica onde esta).
#
# Antes de mexer, guarda:
#   - a instalacao inteira atual (codigo + venv), para voltar
#     em um comando;
#   - uma copia do state.db e do config.yaml, porque a versao
#     nova pode converter esses arquivos.
# Depois testa a Naia no modelo de hoje. Se algo falhar, volta
# sozinho para a versao anterior.
#
# No terminal da VPS:
#   bash /root/naia-sync/naia/scripts/atualizar-hermes.sh
# Voltar para a versao anterior depois, se precisar:
#   bash /root/naia-sync/naia/scripts/atualizar-hermes.sh voltar
# ============================================================
set -uo pipefail

TAG_NOVA="v2026.9.24"
DIR=/usr/local/lib/hermes-agent
HOME_H=/root/.hermes
GUARDA=/root/.hermes-pre-update
export XDG_RUNTIME_DIR=/run/user/0 PATH="/root/.local/bin:$PATH"

fail(){ echo "ERRO: $*"; exit 1; }
ok(){ echo "OK: $*"; }
servico(){ systemctl --user is-active hermes-gateway.service; }

parar(){
  echo "desligando a Naia (pode levar ate 3 min, ela termina o que estiver fazendo)..."
  timeout 240 systemctl --user stop hermes-gateway.service \
    || systemctl --user kill -s KILL hermes-gateway.service
}

copia_db(){ # copia consistente de um SQLite: origem destino
  python3 - "$1" "$2" <<'PY'
import sqlite3, sys
a = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
b = sqlite3.connect(sys.argv[2]); a.backup(b); b.close(); a.close()
PY
}

voltar(){
  [ -d "$GUARDA/hermes-agent" ] || fail "nao ha versao anterior guardada em $GUARDA."
  echo "voltando para a versao anterior..."
  parar
  rm -rf "$DIR.falhou"; [ -e "$DIR" ] && mv "$DIR" "$DIR.falhou"
  cp -a "$GUARDA/hermes-agent" "$DIR"
  cp -a "$GUARDA/config.yaml" "$HOME_H/config.yaml"
  cp -a "$GUARDA/hermes-gateway.service" /root/.config/systemd/user/hermes-gateway.service
  systemctl --user daemon-reload
  rm -f "$HOME_H/state.db-wal" "$HOME_H/state.db-shm"
  cp -a "$GUARDA/state.db" "$HOME_H/state.db"
  systemctl --user start hermes-gateway.service; sleep 10
  echo "Naia: $(servico) | versao: $(hermes --version 2>/dev/null | head -1)"
  echo "(as conversas feitas DEPOIS da atualizacao nao ficam no historico restaurado)"
}

[ "$(id -u)" = 0 ] || fail "rode como root."
[ "${1:-}" = voltar ] && { voltar; exit 0; }

# --- 0. conferencias -----------------------------------------
[ -d "$DIR/.git" ] || fail "nao achei a instalacao do Hermes em $DIR."
ATUAL=$(git -C "$DIR" describe --tags --exact-match 2>/dev/null || git -C "$DIR" rev-parse --short HEAD)
echo "versao atual: $ATUAL ($(hermes --version 2>/dev/null | head -1))"
[ "$ATUAL" = "$TAG_NOVA" ] && { ok "ja esta na $TAG_NOVA"; exit 0; }
ls /root/naia-backup-*.tgz >/dev/null 2>&1 || fail "nao achei o backup da Naia. Rode o backup-naia.sh antes."
LIVRE=$(df --output=avail -BG / | tail -1 | tr -dc 0-9)
[ "${LIVRE:-0}" -ge 10 ] || fail "pouco espaco em disco (${LIVRE}G livres, preciso de 10G)."
[ "$(servico)" = active ] || echo "aviso: a Naia nao estava ativa antes de comecar."

echo
echo "Isto vai atualizar o Hermes de $ATUAL para $TAG_NOVA."
echo "Confirme que o snapshot da VPS esta pronto no painel da Hostinger."
read -rp "Digite SIM para continuar: " R
R=$(printf '%s' "$R" | tr -d '[:space:]' | tr '[:lower:]' '[:upper:]')
[ "$R" = SIM ] || fail "cancelado (a resposta precisa ser SIM). Nada foi alterado."

# --- 1. baixar a versao nova antes de desligar ---------------
git config --global --add safe.directory "$DIR" >/dev/null 2>&1 || true
git -C "$DIR" fetch --quiet --tags origin || fail "nao consegui baixar a versao nova (git fetch)."
git -C "$DIR" rev-parse -q --verify "refs/tags/$TAG_NOVA" >/dev/null || fail "a versao $TAG_NOVA nao existe no repositorio."
ok "versao nova baixada"

# --- 2. guardar o estado atual -------------------------------
parar
rm -rf "$GUARDA"; mkdir -p "$GUARDA"; chmod 700 "$GUARDA"
cp -a "$DIR" "$GUARDA/hermes-agent" || { systemctl --user start hermes-gateway.service; fail "nao consegui guardar a instalacao atual."; }
cp -a "$HOME_H/config.yaml" "$GUARDA/config.yaml"
cp -a /root/.config/systemd/user/hermes-gateway.service "$GUARDA/hermes-gateway.service"
copia_db "$HOME_H/state.db" "$GUARDA/state.db" || { systemctl --user start hermes-gateway.service; fail "nao consegui copiar o state.db."; }
echo "$ATUAL" > "$GUARDA/VERSAO"
ok "versao atual guardada em $GUARDA"

# --- 3. instalar a versao nova -------------------------------
# Nao usa o setup-hermes.sh: na versao nova ele faz perguntas na
# tela e aborta sem elas. Monta o ambiente Python direto com o uv.
git -C "$DIR" checkout --quiet --force "$TAG_NOVA" || { voltar; fail "checkout falhou; voltei para a versao anterior."; }
cd "$DIR"
export UV_NO_CONFIG=1
echo "instalando dependencias (pode levar de 5 a 20 min)..."
rm -rf venv
{ uv venv --python 3.11 venv \
  && { UV_PROJECT_ENVIRONMENT=venv uv sync --extra all --locked \
       || VIRTUAL_ENV="$DIR/venv" uv pip install --python venv/bin/python -e ".[all]"; }; } \
  > /root/hermes-update.log 2>&1
"$DIR/venv/bin/hermes" --version >/dev/null 2>&1 || { tail -20 /root/hermes-update.log; voltar; fail "a instalacao falhou; voltei para a versao anterior. Log: /root/hermes-update.log"; }
# pacotes que as skills dela usam e que nao vem por padrao
uv pip install --python venv/bin/python pip beautifulsoup4 lxml requests >/dev/null 2>&1
ok "Hermes instalado: $(hermes --version 2>/dev/null | head -1)"

# --- 3b. ajustes que a versao nova exige ---------------------
# A versao nova faz o gateway da Naia atender tambem os bots de
# todos os perfis. Os perfis de hoje sao subagentes dela, nao
# agentes de Telegram: marca cada um como "estacionado".
for p in "$HOME_H"/profiles/*/; do
  [ -d "$p" ] && touch "$p/gateway.parked" && echo "  perfil estacionado: $(basename "$p")"
done
# A versao nova reescreve a unidade systemd sozinha a cada boot.
# O naia-sync passa a nao mexer mais nela (senao os dois brigam).
if [ -f /root/naia-sync/naia/scripts/naia-sync.sh ]; then
  install -m 755 /root/naia-sync/naia/scripts/naia-sync.sh /usr/local/bin/naia-sync && ok "naia-sync atualizado"
fi
# plugins locais antigos podem ser desativados pela versao nova
for pl in "$HOME_H"/plugins/*/; do
  [ -d "$pl" ] || continue
  echo "  conferindo plugin $(basename "$pl"):"
  timeout 60 hermes plugins compat "$pl" 2>&1 | tail -3 | sed 's/^/    /'
done

# --- 4. teste no modelo de hoje, antes de religar ------------
echo "testando a Naia no modelo atual..."
RESP=$(timeout 300 hermes -z "Responda apenas: OK" 2>&1 | tail -5)
if ! echo "$RESP" | grep -q "OK"; then
  echo "$RESP"; voltar; fail "o teste falhou; voltei para a versao anterior."
fi
ok "modelo respondeu"

# --- 5. religar e conferir -----------------------------------
systemctl --user start hermes-gateway.service
sleep 20
if [ "$(servico)" != active ]; then
  tail -30 "$HOME_H/logs/gateway.log" 2>/dev/null
  voltar; fail "o servico nao subiu; voltei para a versao anterior."
fi
echo
echo "=================================================="
echo "Hermes atualizado: $ATUAL -> $TAG_NOVA"
echo "Naia: $(servico)"
echo "Mande uma mensagem para ela no Telegram para confirmar."
echo "Se algo estranho aparecer nos proximos dias:"
echo "  bash /root/naia-sync/naia/scripts/atualizar-hermes.sh voltar"
echo "=================================================="
