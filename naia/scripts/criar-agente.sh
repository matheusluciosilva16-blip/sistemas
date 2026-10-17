#!/usr/bin/env bash
# ============================================================
# criar-agente — cria um SEGUNDO agente na mesma VPS, sem tocar
# na Naia.
#
# Usa os perfis do proprio Hermes: o agente novo vive em
# /root/.hermes/profiles/<nome>, com memoria, chaves e login
# proprios, e roda num servico separado (hermes-gateway-<nome>).
# A Naia (/root/.hermes e hermes-gateway.service) nao e alterada.
#
# No terminal da VPS:
#   bash /root/naia-sync/naia/scripts/criar-agente.sh <nome> [zero|copia] [chatgpt|claude]
#
#   zero    agente em branco (padrao)
#   copia   comeca com config, SOUL.md, AGENTS.md, skills, memoria
#           e chaves da Naia (menos o bot e o login)
#   chatgpt login proprio na conta do ChatGPT (padrao). A cota e
#           dividida com a Naia.
#   claude  chave de API da Anthropic, cobrada por uso
#
# Token do bot e chave de API sao pedidos na tela, sem aparecer.
# NUNCA rode `hermes profile use`: isso muda o agente que o
# servico da Naia atende.
# ============================================================
set -uo pipefail

NOME="${1:-}"; MODO="${2:-zero}"; MODELO="${3:-chatgpt}"
MODELO_CLAUDE="${MODELO_CLAUDE:-claude-sonnet-5-5}"
NAIA=/root/.hermes
DIR="$NAIA/profiles/$NOME"
UNIT_NAIA=/root/.config/systemd/user/hermes-gateway.service
UNIT="hermes-gateway-$NOME.service"
PY=/usr/local/lib/hermes-agent/venv/bin/python
export XDG_RUNTIME_DIR=/run/user/0

fail(){ echo "ERRO: $*"; exit 1; }
ok(){ echo "OK: $*"; }

# --- 0. conferencias -----------------------------------------
[ "$(id -u)" = 0 ] || fail "rode como root."
[[ "$NOME" =~ ^[a-z][a-z0-9_-]{1,30}$ ]] || fail "nome invalido. Use letras minusculas, sem espaco. Ex.: bash $0 nova"
case "$NOME" in default|hermes|naia|root|test|tmp) fail "o nome '$NOME' e reservado.";; esac
case "$MODO" in zero|copia) ;; *) fail "segundo parametro: zero ou copia.";; esac
case "$MODELO" in chatgpt|claude) ;; *) fail "terceiro parametro: chatgpt ou claude.";; esac
[ -e "$DIR" ] && fail "ja existe um agente '$NOME' em $DIR."
[ -f "$UNIT_NAIA" ] || fail "nao achei o servico da Naia em $UNIT_NAIA."
[ -s "$NAIA/active_profile" ] && [ "$(cat "$NAIA/active_profile")" != "default" ] \
  && fail "existe um perfil ativo diferente do padrao ($NAIA/active_profile). Pare e me avise."
command -v hermes >/dev/null || fail "comando hermes nao encontrado."

DONO=$(grep -E '^TELEGRAM_ALLOWED_USERS=' "$NAIA/.env" | head -1 | cut -d= -f2-)
[[ "$DONO" =~ ^[0-9,]+$ ]] || fail "nao consegui ler o seu ID do Telegram no .env da Naia."
TOKEN_NAIA=$(grep -E '^TELEGRAM_BOT_TOKEN=' "$NAIA/.env" | head -1 | cut -d= -f2-)

NAIA_ANTES=$(systemctl --user is-active hermes-gateway.service)
echo "Naia agora: $NAIA_ANTES"

# --- 1. bot novo ---------------------------------------------
echo
echo "Crie o bot novo no @BotFather (/newbot) e copie o token."
read -rsp "Cole o token do bot NOVO e aperte Enter (nada aparece na tela): " TOKEN; echo
TOKEN=$(printf '%s' "$TOKEN" | tr -d '[:space:]')
[[ "$TOKEN" =~ ^[0-9]+:[A-Za-z0-9_-]{30,}$ ]] || fail "isso nao parece um token do BotFather."
[ "$TOKEN" = "$TOKEN_NAIA" ] && fail "esse e o token do bot da Naia. Crie um bot novo."
# o token vai pelo stdin do curl, nunca pela linha de comando
BOT=$(printf 'url = "https://api.telegram.org/bot%s/getMe"\n' "$TOKEN" | curl -sS --max-time 15 -K - \
      | "$PY" -c 'import json,sys; d=json.load(sys.stdin); print(d["result"]["username"] if d.get("ok") else "")' 2>/dev/null)
[ -n "$BOT" ] || fail "o Telegram recusou esse token."
ok "bot @$BOT"

if [ "$MODELO" = claude ]; then
  echo
  echo "Antes de seguir, defina um limite de gasto mensal em console.anthropic.com."
  read -rsp "Cole a chave de API da Anthropic (sk-ant-...) e aperte Enter (nada aparece na tela): " CHAVE; echo
  CHAVE=$(printf '%s' "$CHAVE" | tr -d '[:space:]')
  [[ "$CHAVE" =~ ^sk-ant- ]] || fail "isso nao parece uma chave da Anthropic."
fi

# --- 2. perfil -----------------------------------------------
if [ "$MODO" = copia ]; then
  hermes profile create "$NOME" --clone-from default --no-alias || fail "o Hermes nao criou o perfil."
  # o --clone do Hermes nao leva o AGENTS.md; as regras da Naia estao nele
  [ -f "$NAIA/AGENTS.md" ] && cp "$NAIA/AGENTS.md" "$DIR/AGENTS.md"
else
  hermes profile create "$NOME" --no-alias || fail "o Hermes nao criou o perfil."
fi
[ -d "$DIR" ] || fail "o perfil nao apareceu em $DIR."
ok "perfil criado em $DIR"

# --- 3. .env do agente novo ----------------------------------
# na copia, o .env veio da Naia: troca so o bot, mantem as outras chaves
umask 077
[ -f "$DIR/.env" ] || : > "$DIR/.env"
TOKEN="$TOKEN" DONO="$DONO" CHAVE="${CHAVE:-}" "$PY" - "$DIR/.env" <<'PY'
import os, sys
path = sys.argv[1]
novos = {"TELEGRAM_BOT_TOKEN": os.environ["TOKEN"],
         "TELEGRAM_ALLOWED_USERS": os.environ["DONO"],
         "TELEGRAM_REACTIONS": "true"}
if os.environ.get("CHAVE"):
    novos["ANTHROPIC_API_KEY"] = os.environ["CHAVE"]
linhas = open(path).read().splitlines()
fora = [l for l in linhas if l.split("=", 1)[0].strip() not in novos]
fora += [f"{k}={v}" for k, v in novos.items()]
open(path, "w").write("\n".join(fora) + "\n")
PY
chmod 600 "$DIR/.env"
unset TOKEN CHAVE
ok ".env do agente novo gravado"

# --- 4. modelo -----------------------------------------------
if [ "$MODELO" = claude ]; then
  MODELO_CLAUDE="$MODELO_CLAUDE" "$PY" - "$DIR/config.yaml" <<'PY'
import os, sys, yaml
p = sys.argv[1]
try:
    cfg = yaml.safe_load(open(p)) or {}
except FileNotFoundError:
    cfg = {}
cfg["model"] = {"default": os.environ["MODELO_CLAUDE"], "provider": "anthropic"}
yaml.safe_dump(cfg, open(p, "w"), allow_unicode=True, sort_keys=False)
PY
  ok "modelo: $MODELO_CLAUDE pela chave de API"
else
  echo
  echo "Agora o login no ChatGPT do agente novo."
  echo "Abra o link que vai aparecer, entre na sua conta e cole o codigo de volta aqui."
  rm -f "$DIR/auth.lock"
  hermes -p "$NOME" auth add openai-codex --type oauth --no-browser --manual-paste \
    || fail "o login nao terminou. Rode o script de novo depois de apagar $DIR (rm -r $DIR)."
  if [ "$MODO" = zero ]; then
    "$PY" - "$DIR/config.yaml" <<'PY'
import sys, yaml
p = sys.argv[1]
try:
    cfg = yaml.safe_load(open(p)) or {}
except FileNotFoundError:
    cfg = {}
m = cfg.get("model") or {}
m.setdefault("default", "gpt-5.6-terra")
m["provider"] = "openai-codex"
m.setdefault("base_url", "https://chatgpt.com/backend-api/codex")
cfg["model"] = m
yaml.safe_dump(cfg, open(p, "w"), allow_unicode=True, sort_keys=False)
PY
  fi
  ok "login no ChatGPT feito"
fi

# --- 5. teste antes de ligar ---------------------------------
echo "testando o modelo..."
RESP=$(hermes -p "$NOME" -z "Responda apenas: OK" 2>&1 | tail -3)
echo "$RESP" | grep -q "OK" || { echo "$RESP"; fail "o modelo nao respondeu. Nada foi ligado; a Naia segue igual."; }
ok "modelo respondeu"

# --- 6. servico separado -------------------------------------
sed -e "s|^Description=.*|Description=Hermes Agent Gateway - $NOME|" \
    -e "s|^Environment=\"HERMES_HOME=.*\"|Environment=\"HERMES_HOME=$DIR\"|" \
    "$UNIT_NAIA" > "/root/.config/systemd/user/$UNIT"
grep -q "HERMES_HOME=$DIR" "/root/.config/systemd/user/$UNIT" || fail "nao consegui montar o servico $UNIT."
systemctl --user daemon-reload
systemctl --user enable --now "$UNIT" >/dev/null 2>&1
sleep 8

NOVO=$(systemctl --user is-active "$UNIT")
NAIA_DEPOIS=$(systemctl --user is-active hermes-gateway.service)
echo
echo "=================================================="
echo "agente novo ($UNIT): $NOVO"
echo "Naia (hermes-gateway.service): antes $NAIA_ANTES, agora $NAIA_DEPOIS"
[ "$NOVO" = active ] && echo "Mande a primeira mensagem: https://t.me/$BOT"
echo
echo "Desligar o agente novo: systemctl --user disable --now $UNIT"
echo "Logs dele: tail -f $DIR/logs/gateway.log"
echo "Comandos dele sempre com -p: hermes -p $NOME ..."
echo "NUNCA rode: hermes profile use"
echo "=================================================="
