#!/usr/bin/env bash
# ============================================================
# criar-agente — cria um segundo agente na mesma VPS, ao lado da
# Naia, no Hermes 0.21 (versao com multiplexacao de perfis).
#
# O agente novo e um perfil do Hermes em /root/.hermes/profiles/<nome>,
# com bot, memoria e personalidade proprios. Ele e atendido pelo
# MESMO servico da Naia (hermes-gateway.service): nao cria servico
# novo, e a Naia nao precisa reiniciar.
#
# Comeca como copia da Naia: config (modelo e reservas), chaves do
# .env (menos o Telegram), skills, memoria, AGENTS.md (regras e
# treinamentos) e o plugin da assinatura. A personalidade vem de
# naia/<nome>/SOUL.md no repositorio, se existir.
# Liga o quadro de tarefas (kanban) e cria /root/compartilhado.
#
# No terminal da VPS:
#   bash /root/naia-sync/naia/scripts/criar-agente.sh donna
#
# Desligar o agente depois, sem afetar a Naia:
#   hermes -p <nome> gateway stop
# NUNCA rode `hermes profile use`.
# ============================================================
set -uo pipefail

NOME="${1:-}"
NAIA=/root/.hermes
DIR="$NAIA/profiles/$NOME"
REPO=/root/naia-sync/naia
PLUGIN=claude-subscription-directsdk-experimental
export XDG_RUNTIME_DIR=/run/user/0 PATH="/root/.local/bin:$PATH"

fail(){ echo "ERRO: $*"; exit 1; }
ok(){ echo "OK: $*"; }

# --- 0. conferencias -----------------------------------------
[ "$(id -u)" = 0 ] || fail "rode como root."
[[ "$NOME" =~ ^[a-z][a-z0-9_-]{1,30}$ ]] || fail "nome invalido. Use letras minusculas, sem espaco. Ex.: bash $0 donna"
case "$NOME" in default|hermes|naia|root|test|tmp) fail "o nome '$NOME' e reservado.";; esac
[ -e "$DIR" ] && fail "ja existe um agente '$NOME' em $DIR."
HV=$(hermes --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+' | head -1)
case "$HV" in 0.2[1-9]|0.[3-9]*|[1-9]*) ;; *) fail "este script e para o Hermes 0.21 ou mais novo (a VPS esta na ${HV:-?}).";; esac
[ -s "$NAIA/active_profile" ] && [ "$(cat "$NAIA/active_profile")" != "default" ] \
  && fail "existe um perfil ativo diferente do padrao ($NAIA/active_profile). Pare e me avise."
[ "$(systemctl --user is-active hermes-gateway.service)" = active ] || fail "a Naia nao esta ativa agora. Resolva isso antes."

DONO=$(grep -E '^TELEGRAM_ALLOWED_USERS=' "$NAIA/.env" | head -1 | cut -d= -f2-)
[[ "$DONO" =~ ^[0-9,]+$ ]] || fail "nao consegui ler o seu ID do Telegram no .env da Naia."
TOKEN_NAIA=$(grep -E '^TELEGRAM_BOT_TOKEN=' "$NAIA/.env" | head -1 | cut -d= -f2-)

# --- 1. bot novo ---------------------------------------------
echo "Crie o bot no @BotFather (/newbot) e copie o token."
for T in 1 2 3; do
  read -rsp "Cole o token do bot de $NOME e aperte Enter (nada aparece na tela): " TOKEN; echo
  TOKEN=$(printf '%s' "$TOKEN" | tr -d '[:space:]')
  [[ "$TOKEN" =~ ^[0-9]+:[A-Za-z0-9_-]{30,}$ ]] && break
  echo "  Isso nao parece um token do BotFather (formato 123456789:AA...). Copie de novo e cole."
  TOKEN=""
done
[ -n "$TOKEN" ] || fail "nenhum token valido. Nada foi alterado."
[ "$TOKEN" = "$TOKEN_NAIA" ] && fail "esse e o token do bot da Naia. Crie um bot novo."
# o token vai pelo stdin do curl, nunca pela linha de comando
BOT=$(printf 'url = "https://api.telegram.org/bot%s/getMe"\n' "$TOKEN" | curl -sS --max-time 15 -K - \
      | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["result"]["username"] if d.get("ok") else "")' 2>/dev/null)
[ -n "$BOT" ] || fail "o Telegram recusou esse token. Nada foi alterado."
ok "bot @$BOT"

# --- 2. perfil como copia da Naia ----------------------------
DESC="Agente de operacao juridica: prazos, intimacoes, protocolos, pecas e acompanhamento de processos."
[ "$NOME" = donna ] || DESC="Agente $NOME, criado como copia da Naia."
hermes profile create "$NOME" --clone --no-alias --description "$DESC" || fail "o Hermes nao criou o perfil."
[ -d "$DIR" ] || fail "o perfil nao apareceu em $DIR."
# o clone nao leva o AGENTS.md (regras e treinamentos) nem os plugins
[ -f "$NAIA/AGENTS.md" ] && cp -a "$NAIA/AGENTS.md" "$DIR/AGENTS.md"
if [ -d "$NAIA/plugins/$PLUGIN" ]; then
  mkdir -p "$DIR/plugins" && cp -a "$NAIA/plugins/$PLUGIN" "$DIR/plugins/"
fi
# personalidade propria, se houver no repositorio
if [ -f "$REPO/$NOME/SOUL.md" ]; then
  cp "$REPO/$NOME/SOUL.md" "$DIR/SOUL.md"; ok "personalidade de $REPO/$NOME/SOUL.md"
fi
ok "perfil criado em $DIR"

# --- 3. Telegram do agente novo (o clone tira o da Naia) -----
umask 077
TOKEN="$TOKEN" DONO="$DONO" python3 - "$DIR/.env" <<'PY'
import os, sys
p = sys.argv[1]
novos = {"TELEGRAM_BOT_TOKEN": os.environ["TOKEN"],
         "TELEGRAM_ALLOWED_USERS": os.environ["DONO"],
         "TELEGRAM_REACTIONS": "true"}
linhas = open(p).read().splitlines() if os.path.exists(p) else []
linhas = [l for l in linhas if l.split("=", 1)[0].strip() not in novos]
linhas += [f"{k}={v}" for k, v in novos.items()]
open(p, "w").write("\n".join(linhas) + "\n")
PY
chmod 600 "$DIR/.env"
unset TOKEN
ok ".env de $NOME gravado"

# --- 4. quadro de tarefas e pasta compartilhada --------------
hermes -p "$NOME" tools enable kanban --platform telegram >/dev/null 2>&1 \
  && ok "quadro de tarefas ligado para $NOME" \
  || echo "aviso: nao consegui ligar o quadro de tarefas para $NOME (veja depois com: hermes -p $NOME tools list --platform telegram)"
mkdir -p /root/compartilhado && chmod 700 /root/compartilhado
ok "pasta compartilhada /root/compartilhado"

# --- 5. teste do modelo --------------------------------------
echo "testando o modelo de $NOME..."
RESP=$(timeout 180 hermes -p "$NOME" -z "Responda apenas: OK" 2>&1 | tail -5)
if ! echo "$RESP" | grep -q "OK"; then
  echo "$RESP"
  touch "$DIR/gateway.parked"
  fail "o modelo de $NOME nao respondeu. Deixei $NOME desligada (gateway.parked); a Naia segue igual."
fi
ok "modelo respondeu"

# --- 6. o servico da Naia passa a atender o bot novo ---------
echo "aguardando o servico atender o bot novo (ate 90 s)..."
for i in $(seq 1 18); do
  sleep 5
  hermes gateway status 2>/dev/null | grep -qw "$NOME" && break
done
echo
echo "=================================================="
hermes gateway status 2>/dev/null | grep -iE "serv|$NOME" | head -5
echo "Naia: $(systemctl --user is-active hermes-gateway.service)"
echo "Mande a primeira mensagem para $NOME: https://t.me/$BOT"
echo
echo "Desligar so $NOME:  hermes -p $NOME gateway stop"
echo "Comandos dela sempre com -p: hermes -p $NOME ..."
echo "NUNCA rode: hermes profile use"
echo "=================================================="
