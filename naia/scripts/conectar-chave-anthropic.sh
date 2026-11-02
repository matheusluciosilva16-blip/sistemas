#!/usr/bin/env bash
# ============================================================
# conectar-chave-anthropic — guarda a chave de API da Anthropic
# no .env da Naia e testa, sem trocar o modelo dela.
#
# A chave e pedida na tela, sem aparecer, e vai so para
# /root/.hermes/.env (permissao 600). Nunca para o repositorio.
#
# No terminal da VPS:
#   bash /root/naia-sync/naia/scripts/conectar-chave-anthropic.sh
# ============================================================
set -uo pipefail
ENV=/root/.hermes/.env
PY=/usr/local/lib/hermes-agent/venv/bin/python

fail(){ echo "ERRO: $*"; exit 1; }
ok(){ echo "OK: $*"; }
[ "$(id -u)" = 0 ] || fail "rode como root."
[ -f "$ENV" ] || fail "nao achei $ENV."

echo "Antes de seguir, confira em console.anthropic.com > Billing que ha um limite"
echo "de gasto mensal definido, para a chave nunca passar do que voce quer gastar."
# ate 3 tentativas; mostra so o comeco do que foi colado, para conferir sem expor a chave
for TENT in 1 2 3; do
  read -rsp "Cole a chave de API da Anthropic (sk-ant-...) e aperte Enter (nada aparece na tela): " CHAVE; echo
  CHAVE=$(printf '%s' "$CHAVE" | tr -d '[:space:]')
  [[ "$CHAVE" =~ ^sk-ant- ]] && break
  echo "  Isso nao e uma chave: o que chegou comeca com \"${CHAVE:0:7}\" e tem ${#CHAVE} caracteres."
  echo "  Uma chave comeca com \"sk-ant-\" e tem uns 100 caracteres. Copie a chave de novo e cole."
  CHAVE=""
done
[ -n "$CHAVE" ] || fail "nenhuma chave valida depois de 3 tentativas. Nada foi alterado."

# confere a chave na Anthropic; a chave vai pelo stdin do curl, nunca pela linha de comando
COD=$(printf 'header = "x-api-key: %s"\nheader = "anthropic-version: 2023-06-01"\nurl = "https://api.anthropic.com/v1/models"\n' "$CHAVE" \
      | curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -K -)
[ "$COD" = 200 ] || fail "a Anthropic recusou a chave (codigo $COD). Confira se copiou inteira."
ok "chave aceita pela Anthropic"

# grava no .env, trocando a linha se ja existir
cp -a "$ENV" "$ENV.antes-anthropic"
CHAVE="$CHAVE" python3 - "$ENV" <<'PY'
import os, sys
p = sys.argv[1]
linhas = [l for l in open(p).read().splitlines() if not l.startswith("ANTHROPIC_API_KEY=")]
linhas.append("ANTHROPIC_API_KEY=" + os.environ["CHAVE"])
open(p, "w").write("\n".join(linhas) + "\n")
PY
chmod 600 "$ENV"
unset CHAVE
ok "chave guardada em $ENV (copia do anterior em $ENV.antes-anthropic)"

# teste pelo Hermes, usando so a chave (sem emprestar o login do Claude Code)
echo "testando a chave pelo Hermes (a Naia continua no modelo atual)..."
RESP=$(timeout 180 hermes --provider anthropic -m claude-sonnet-5-5 -z "Responda apenas: OK" 2>&1 | tail -5)
echo "$RESP"
echo "$RESP" | grep -q "OK" || fail "o Hermes nao conseguiu usar a chave. A Naia nao foi alterada."

echo
echo "=================================================="
echo "Chave da Anthropic conectada e testada."
echo "Avise o Claude Code para colocar a chave como primeira opcao da Naia."
echo "=================================================="
