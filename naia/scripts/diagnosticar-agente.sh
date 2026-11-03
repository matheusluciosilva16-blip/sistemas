#!/usr/bin/env bash
# ============================================================
# diagnosticar-agente — por que o bot de um agente nao responde.
# So le; nao muda nada. Nunca mostra tokens: do token aparece so
# o numero do bot (a parte antes dos dois-pontos, que e publica).
#
# No terminal da VPS:
#   bash /root/naia-sync/naia/scripts/diagnosticar-agente.sh donna
# ============================================================
set -uo pipefail
NOME="${1:-donna}"
NAIA=/root/.hermes
DIR="$NAIA/profiles/$NOME"
export XDG_RUNTIME_DIR=/run/user/0 PATH="/root/.local/bin:$PATH"

botid(){ grep -m1 '^TELEGRAM_BOT_TOKEN=' "$1" 2>/dev/null | cut -d= -f2- | cut -d: -f1; }

echo "== 2. numero do bot em cada agente (repetido = conflito)"
for f in "$NAIA/.env" "$NAIA"/profiles/*/.env; do
  [ -f "$f" ] || continue
  n=$(dirname "$f" | sed "s#$NAIA/profiles/##; s#^$NAIA\$#naia#")
  p=""; [ -f "$(dirname "$f")/gateway.parked" ] && [ "$f" != "$NAIA/.env" ] && p=" (estacionado)"
  echo "  $n: $(botid "$f")$p"
done

echo
echo "== 3. o bot de $NOME no Telegram"
T=$(grep -m1 '^TELEGRAM_BOT_TOKEN=' "$DIR/.env" 2>/dev/null | cut -d= -f2-)
if [ -n "$T" ]; then
  for m in getMe getWebhookInfo; do
    printf 'url = "https://api.telegram.org/bot%s/%s"\n' "$T" "$m" | curl -sS --max-time 15 -K - \
      | python3 -c 'import json,sys; d=json.load(sys.stdin); r=d.get("result",d)
keep=("ok","username","id","url","pending_update_count","last_error_date","last_error_message","description","error_code")
print("  " + sys.argv[1] + ": " + json.dumps({k:v for k,v in (r.items() if isinstance(r,dict) else [])  if k in keep} or d, ensure_ascii=False))' "$m"
  done
else
  echo "  sem TELEGRAM_BOT_TOKEN em $DIR/.env"
fi
unset T

echo
echo "== 4. ultimos registros sobre $NOME / Telegram"
for L in "$NAIA/logs/gateway.log" "$DIR/logs/gateway.log" "$DIR/logs/errors.log"; do
  [ -f "$L" ] || continue
  echo "  -- $L"
  grep -aiE "$NOME|conflict|409|401|webhook|duplicate|telegram.*(error|fail)|unauthori" "$L" | tail -5 | cut -c1-200 | sed 's/^/    /'
done

echo
echo "== 5. registros do servico recentes sobre perfis e multiplexacao"
journalctl --user -u hermes-gateway -n 20000 --no-pager 2>/dev/null \
  | grep -aiE "multiplex|standalone|serving|served|$NOME|profile|blocker|preflight" | tail -15 | cut -c1-220 | sed 's/^/  /'

echo
echo "== 6. servico e perfis atendidos (resumo)"
systemctl --user is-active hermes-gateway.service
hermes gateway status 2>&1 | grep -iE "serv|$NOME|park|dup|error|erro" | head -12
[ -f "$DIR/gateway.parked" ] && echo "ATENCAO: $NOME esta estacionada (gateway.parked)"

