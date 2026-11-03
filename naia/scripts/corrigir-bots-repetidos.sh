#!/usr/bin/env bash
# ============================================================
# corrigir-bots-repetidos — libera o Hermes 0.21 para atender a
# Naia e os outros agentes (Donna) ao mesmo tempo.
#
# O Hermes so atende varios perfis quando nenhum token de bot esta
# repetido (hermes_cli/gateway_migrate.py, _check_duplicate_credentials,
# que conta tambem os perfis estacionados). Subagentes criadas como
# copia da Naia na versao antiga guardam o token do bot da Naia, e
# isso deixa o servico atendendo so a Naia.
#
# Remove o token do bot da Naia SO dos subagentes estacionados
# (gateway.parked), que trabalham por dentro e nao precisam de bot.
# Guarda o .env original de cada um. Nunca mostra tokens: so o
# numero do bot (publico).
#
# No terminal da VPS:
#   bash /root/naia-sync/naia/scripts/corrigir-bots-repetidos.sh
# ============================================================
set -uo pipefail
NAIA=/root/.hermes
export XDG_RUNTIME_DIR=/run/user/0 PATH="/root/.local/bin:$PATH"
fail(){ echo "ERRO: $*"; exit 1; }
ok(){ echo "OK: $*"; }
[ "$(id -u)" = 0 ] || fail "rode como root."

botid(){ grep -m1 '^TELEGRAM_BOT_TOKEN=' "$1" 2>/dev/null | cut -d= -f2- | cut -d: -f1; }
NAIA_BOT=$(botid "$NAIA/.env")
[ -n "$NAIA_BOT" ] || fail "nao achei o bot da Naia em $NAIA/.env."
echo "bot da Naia: $NAIA_BOT"

MEXEU=0
for P in "$NAIA"/profiles/*/; do
  P=${P%/}; N=$(basename "$P"); ENV="$P/.env"
  [ -f "$ENV" ] || continue
  B=$(botid "$ENV")
  [ -n "$B" ] || continue
  if [ "$B" = "$NAIA_BOT" ]; then
    if [ ! -f "$P/gateway.parked" ]; then
      echo "  ATENCAO: $N usa o bot da Naia e NAO esta estacionado. Nao mexi; me avise."
      continue
    fi
    cp -a "$ENV" "$ENV.antes-bots"
    python3 - "$ENV" <<'PY'
import sys
p = sys.argv[1]
linhas = [l for l in open(p).read().splitlines() if not l.startswith("TELEGRAM_BOT_TOKEN=")]
open(p, "w").write("\n".join(linhas) + "\n")
PY
    chmod 600 "$ENV"
    ok "$N: token da Naia removido (original em $ENV.antes-bots)"
    MEXEU=1
  else
    echo "  $N: bot proprio ($B), mantido"
  fi
done
[ "$MEXEU" = 1 ] || echo "Nenhum token repetido encontrado."

echo
# aproveita o religamento para corrigir o erro do titulo das conversas
bash "$(dirname "$0")/corrigir-pensamento.sh" || echo "  (ajuste do pensamento nao aplicado; nao impede a Donna)"

echo
echo "religando o servico para ele voltar a atender todos os agentes..."
systemctl --user restart hermes-gateway.service
sleep 25
echo "Naia: $(systemctl --user is-active hermes-gateway.service)"
echo
journalctl --user -u hermes-gateway -n 400 --no-pager 2>/dev/null \
  | grep -aiE "stays standalone|Serving every profile|Now serving|multiplex" | tail -4 | cut -c1-200
hermes gateway status 2>&1 | grep -iE "served|serves" | head -3
echo
echo "Se aparecer 'donna' na lista acima, mande uma mensagem para ela no Telegram."
