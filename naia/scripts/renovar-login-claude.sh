#!/usr/bin/env bash
# ============================================================
# renovar-login-claude — reconecta a assinatura do Claude (reserva
# da Naia e da Donna) com um token de longa duracao, que nao expira
# como o login comum ("OAuth session expired and could not be
# refreshed").
#
# Usa `claude setup-token` (token de 1 ano, feito para servidores)
# e guarda o token como CLAUDE_CODE_OAUTH_TOKEN no .env da Naia e
# dos agentes ativos. O token e colado sem aparecer na tela e nunca
# vai para o repositorio. Depois testa a chave de API e a assinatura.
#
#   bash /root/naia-sync/naia/scripts/renovar-login-claude.sh
# ============================================================
set -uo pipefail
NAIA=/root/.hermes
export PATH="/root/.local/bin:$PATH" XDG_RUNTIME_DIR=/run/user/0
fail(){ echo "ERRO: $*"; exit 1; }
ok(){ echo "OK: $*"; }
[ "$(id -u)" = 0 ] || fail "rode como root."
command -v claude >/dev/null 2>&1 || fail "o Claude Code nao esta instalado. Rode o conectar-claude.sh."

echo "1) Vai aparecer um link. Abra no navegador, entre na conta do Claude Max,"
echo "   autorize e cole o codigo aqui no terminal."
echo "2) No fim aparece um token comecando com sk-ant-oat. Copie o token inteiro."
echo
read -rp "Aperte Enter para comecar..." _
claude setup-token || fail "o setup-token nao terminou. Rode o script de novo."
echo
for TENT in 1 2 3; do
  read -rsp "Cole o token sk-ant-oat... e aperte Enter (nada aparece na tela): " TOK; echo
  TOK=$(printf '%s' "$TOK" | tr -d '[:space:]')
  [[ "$TOK" =~ ^sk-ant-oat ]] && break
  echo "  Isso nao e o token: comeca com \"${TOK:0:6}\" e tem ${#TOK} caracteres. Copie de novo."
  TOK=""
done
[ -n "$TOK" ] || fail "nenhum token valido. Nada foi alterado."
clear 2>/dev/null || true   # tira o token da tela

for ENV in "$NAIA/.env" "$NAIA"/profiles/*/.env; do
  [ -f "$ENV" ] || continue
  [ "$ENV" != "$NAIA/.env" ] && [ -f "$(dirname "$ENV")/gateway.parked" ] && continue
  cp -a "$ENV" "$ENV.antes-token-claude"
  TOK="$TOK" python3 - "$ENV" <<'PY'
import os, sys
p = sys.argv[1]
linhas = [l for l in open(p).read().splitlines() if not l.startswith("CLAUDE_CODE_OAUTH_TOKEN=")]
linhas.append("CLAUDE_CODE_OAUTH_TOKEN=" + os.environ["TOK"])
open(p, "w").write("\n".join(linhas) + "\n")
PY
  chmod 600 "$ENV"
  ok "token guardado em $ENV"
done
unset TOK

echo "religando a Naia e a Donna..."
systemctl --user restart hermes-gateway.service; sleep 20
echo "servico: $(systemctl --user is-active hermes-gateway.service)"

echo
echo "== teste 1: chave de API (primeira opcao)"
R1=$(timeout 180 hermes --provider custom:anthropic-chave -m claude-sonnet-5-5 -z "Responda apenas: OK" 2>&1 | tail -4)
echo "$R1" | cut -c1-200
echo "$R1" | grep -qi "credit balance" && echo ">> O CREDITO DA CHAVE DE API ACABOU (ver console.anthropic.com > Billing)."
echo
echo "== teste 2: assinatura do Claude (reserva)"
R2=$(timeout 300 hermes --provider claude-subscription-directsdk-experimental -m sonnet -z "Responda apenas: OK" 2>&1 | tail -4)
echo "$R2" | cut -c1-200
echo "$R2" | grep -q "OK" && ok "assinatura funcionando" || echo "ERRO: a assinatura ainda falhou; mande um print."
