#!/usr/bin/env bash
# ============================================================
# corrigir-pensamento — faz o Hermes 0.21.5 parar de mandar
# thinking "disabled" para os modelos Claude 5 (Sonnet 5.5 etc.).
#
# Sem isso, as tarefas auxiliares (titulo da conversa, resumo de
# contexto) falham com "To turn thinking off on this model, send
# thinking: between_tools instead of disabled". A lista do Hermes
# so marca a familia Fable como "pensamento obrigatorio"; aqui
# incluimos as familias Claude 5. Incluir a mais so deixa o
# pensamento ligado (o proprio codigo diz que e o lado seguro).
#
# Uma proxima atualizacao do Hermes desfaz o ajuste; rode de novo
# se o erro voltar. Original guardado em .antes-pensamento.
#   bash /root/naia-sync/naia/scripts/corrigir-pensamento.sh
# ============================================================
set -uo pipefail
ARQ=/usr/local/lib/hermes-agent/agent/anthropic_adapter.py
PY=/usr/local/lib/hermes-agent/venv/bin/python
fail(){ echo "ERRO: $*"; exit 1; }
ok(){ echo "OK: $*"; }
[ "$(id -u)" = 0 ] || fail "rode como root."
[ -f "$ARQ" ] || fail "nao achei $ARQ."

if grep -q 'ajuste local: familias Claude 5' "$ARQ"; then
  ok "o ajuste do pensamento ja estava aplicado"
else
  cp -a "$ARQ" "$ARQ.antes-pensamento"
  "$PY" - "$ARQ" <<'PY' || { cp -a "$ARQ.antes-pensamento" "$ARQ"; fail "o arquivo nao e o esperado; nada foi alterado."; }
import sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
old = '_MANDATORY_THINKING_CLAUDE_SUBSTRINGS = ("claude-fable",)'
new = ('_MANDATORY_THINKING_CLAUDE_SUBSTRINGS = ("claude-fable", "claude-sonnet-5", "claude-opus-5", '
       '"claude-haiku-5")  # ajuste local: familias Claude 5 recusam thinking disabled')
if s.count(old) != 1:
    sys.exit(1)
open(p, "w", encoding="utf-8").write(s.replace(old, new))
PY
  ok "ajuste aplicado (original em $ARQ.antes-pensamento)"
fi

"$PY" - <<'PY' || fail "o ajuste nao funcionou."
import sys
sys.path.insert(0, "/usr/local/lib/hermes-agent")
from agent.anthropic_adapter import _accepts_thinking_disable as f
assert not f("claude-sonnet-5-5")
PY
ok "o Hermes nao manda mais thinking disabled para o Sonnet 5.5"
