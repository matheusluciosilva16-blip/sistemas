#!/usr/bin/env bash
# ============================================================
# separar-chave-anthropic — corrige o conflito entre a chave de
# API e a assinatura do Claude.
#
# O plugin da assinatura se recusa a rodar quando ANTHROPIC_API_KEY
# esta no ambiente ("OAuth provider refuses conflicting native
# auth/backend overrides: ANTHROPIC_API_KEY"), entao a reserva pela
# assinatura nunca funcionava. A chave passa a se chamar
# NAIA_ANTHROPIC_KEY, usada pelo provedor "anthropic-chave" do
# config.yaml. O valor da chave nao muda e nao aparece na tela.
#
# Vale para a Naia e para os agentes ativos (perfis sem gateway.parked).
#
# No terminal da VPS:
#   bash /root/naia-sync/naia/scripts/separar-chave-anthropic.sh
# ============================================================
set -uo pipefail
NAIA=/root/.hermes
export XDG_RUNTIME_DIR=/run/user/0 PATH="/root/.local/bin:$PATH"

fail(){ echo "ERRO: $*"; exit 1; }
ok(){ echo "OK: $*"; }
[ "$(id -u)" = 0 ] || fail "rode como root."

# --- 1. renomear a chave em cada .env ------------------------
renomear(){ # arquivo .env
  python3 - "$1" <<'PY'
import sys
p = sys.argv[1]
linhas = open(p).read().splitlines()
tem_nova = any(l.startswith("NAIA_ANTHROPIC_KEY=") for l in linhas)
saida, mudou = [], False
for l in linhas:
    if l.startswith("ANTHROPIC_API_KEY="):
        mudou = True
        if not tem_nova:
            saida.append("NAIA_ANTHROPIC_KEY=" + l.split("=", 1)[1]); tem_nova = True
        continue
    saida.append(l)
if mudou:
    open(p, "w").write("\n".join(saida) + "\n")
print("renomeada" if mudou else ("ja estava certa" if tem_nova else "sem chave"))
PY
}
for ENV in "$NAIA/.env" "$NAIA"/profiles/*/.env; do
  [ -f "$ENV" ] || continue
  # subagentes estacionados ficam como estao (tem config propria)
  [ "$ENV" != "$NAIA/.env" ] && [ -f "$(dirname "$ENV")/gateway.parked" ] && continue
  cp -a "$ENV" "$ENV.antes-separar"
  R=$(renomear "$ENV"); chmod 600 "$ENV"
  echo "  $(dirname "$ENV" | sed "s#$NAIA/profiles/##; s#^$NAIA\$#naia#"): $R"
done

# --- 2. config da Naia: versao do repositorio ----------------
echo
echo "Aplicando o config.yaml do repositorio na Naia..."
bash /root/naia-sync/naia/scripts/aplicar-config.sh || fail "o config nao foi aplicado."

# --- 3. agentes ativos usam o mesmo modelo e reservas da Naia -
for P in "$NAIA"/profiles/*/; do
  [ -f "$P/gateway.parked" ] && continue
  grep -q '^NAIA_ANTHROPIC_KEY=' "$P/.env" 2>/dev/null || continue
  /usr/local/lib/hermes-agent/venv/bin/python - "$NAIA/config.yaml" "$P/config.yaml" <<'PY'
import sys, yaml
raiz = yaml.safe_load(open(sys.argv[1])) or {}
p = sys.argv[2]
cfg = yaml.safe_load(open(p)) or {}
for k in ("model", "providers", "fallback_providers", "auth"):
    if k in raiz:
        cfg[k] = raiz[k]
yaml.safe_dump(cfg, open(p, "w"), allow_unicode=True, sort_keys=False)
PY
  ok "modelo e reservas atualizados em $(basename "$P")"
done

# --- 4. religar e testar as duas fontes ----------------------
systemctl --user restart hermes-gateway.service; sleep 15
echo "Naia: $(systemctl --user is-active hermes-gateway.service)"
for PROV in "custom:anthropic-chave claude-sonnet-5-5" "claude-subscription-directsdk-experimental sonnet"; do
  set -- $PROV
  echo "testando $1..."
  RESP=$(timeout 180 hermes --provider "$1" -m "$2" -z "Responda apenas: OK" 2>&1 | tail -3)
  echo "$RESP" | grep -q "OK" && ok "$1 respondeu" || { echo "$RESP"; echo "FALHOU: $1"; }
done
echo
echo "Pronto. No Telegram, mande /new para a Naia comecar uma conversa limpa."
