#!/usr/bin/env bash
# ============================================================
# corrigir-chave-console — aplica no Hermes 0.21.5 a correcao
# oficial #133856 (ja no main do hermes-agent, ainda sem versao):
# chaves do Console que comecam com sk-ant-usr, sk-ant-svc ou
# sk-ant-admin passam a ser tratadas como chave de API, e nao
# como login do Claude Code.
#
# Sem a correcao, o Hermes manda a identidade do Claude Code com
# essas chaves e a Anthropic responde "credit balance is too low",
# porque o credito de API nao cobre uso do Claude Code.
#
# A correcao some numa proxima atualizacao do Hermes, que ja a traz.
# Depois aplica o teste da chave guardada no .env.
#
# No terminal da VPS:
#   bash /root/naia-sync/naia/scripts/corrigir-chave-console.sh
# ============================================================
set -uo pipefail
ARQ=/usr/local/lib/hermes-agent/agent/anthropic_credentials.py
PY=/usr/local/lib/hermes-agent/venv/bin/python

fail(){ echo "ERRO: $*"; exit 1; }
ok(){ echo "OK: $*"; }
[ "$(id -u)" = 0 ] || fail "rode como root."
[ -f "$ARQ" ] || fail "nao achei $ARQ."

if grep -q '"sk-ant-usr"' "$ARQ"; then
  ok "a correcao ja estava aplicada"
else
  cp -a "$ARQ" "$ARQ.antes-133856"
  "$PY" - "$ARQ" <<'PY' || { cp -a "$ARQ.antes-133856" "$ARQ"; fail "o arquivo nao e o esperado; nada foi alterado."; }
import sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
old = '''    if not key or key.startswith("sk-ant-api"):
        return False
    return key.startswith(("sk-ant-", "eyJ", "cc-"))'''
new = '''    # Correcao #133856 (hermes-agent main): familias de chave do Console pagam por token.
    if not key or key.startswith(("sk-ant-api", "sk-ant-usr", "sk-ant-svc", "sk-ant-admin")):
        return False
    return key.startswith(("sk-ant-", "eyJ", "cc-"))'''
if s.count(old) != 1:
    sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new))
PY
  ok "correcao aplicada (original guardado em $ARQ.antes-133856)"
fi

# confere que o Hermes carrega o arquivo e classifica certo
"$PY" - <<'PY' || fail "a correcao nao funcionou."
import sys
sys.path.insert(0, "/usr/local/lib/hermes-agent")
from agent.anthropic_credentials import _is_oauth_token as f
assert not f("sk-ant-usr-x") and not f("sk-ant-api03-x") and f("sk-ant-oat01-x")
PY
ok "o Hermes agora trata chaves sk-ant-usr como chave de API"

grep -q '^ANTHROPIC_API_KEY=' /root/.hermes/.env || { echo "Nenhuma chave no .env ainda. Rode o conectar-chave-anthropic.sh."; exit 0; }
echo "testando a chave guardada (a Naia continua no modelo atual)..."
RESP=$(timeout 180 hermes --provider anthropic -m claude-sonnet-5-5 -z "Responda apenas: OK" 2>&1 | tail -5)
echo "$RESP"
echo "$RESP" | grep -q "OK" || fail "o teste com a chave falhou."
echo
echo "=================================================="
echo "Chave da Anthropic funcionando pelo credito de API."
echo "Avise o Claude Code para colocar a chave como primeira opcao da Naia."
echo "=================================================="
