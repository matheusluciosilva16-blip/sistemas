#!/usr/bin/env bash
# ============================================================
# conectar-claude — prepara a Naia para usar a assinatura do
# Claude pelo caminho oficial: o Claude Code (Agent SDK) logado
# na VPS + o plugin oficial claude-subscription-directsdk.
#
# Este script NAO troca o modelo da Naia. Ele instala, faz o
# login e testa. A troca e feita depois no config.yaml do
# repositorio (o naia-sync aplica e volta sozinho se falhar).
#
# Requer o Hermes 0.21.4 ou mais novo (atualizar-hermes.sh).
#
# No terminal da VPS:
#   bash /root/naia-sync/naia/scripts/conectar-claude.sh
# ============================================================
set -uo pipefail
export PATH="/root/.local/bin:$PATH"
PROVEDOR=claude-subscription-directsdk-experimental

fail(){ echo "ERRO: $*"; exit 1; }
ok(){ echo "OK: $*"; }

[ "$(id -u)" = 0 ] || fail "rode como root."

# --- 1. versao do Hermes -------------------------------------
V=$(hermes --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
python3 - "$V" <<'PY' || fail "o Hermes e a versao ${V:-desconhecida}; o plugin exige 0.21.4 ou mais nova. Rode o atualizar-hermes.sh antes."
import sys
v = tuple(int(x) for x in (sys.argv[1] or "0.0.0").split("."))
sys.exit(0 if v >= (0, 21, 4) else 1)
PY
ok "Hermes $V"

# --- 2. Claude Code ------------------------------------------
if ! command -v claude >/dev/null 2>&1; then
  echo "instalando o Claude Code (instalador oficial da Anthropic)..."
  curl -fsSL https://claude.ai/install.sh | bash || fail "nao consegui instalar o Claude Code."
  hash -r
fi
command -v claude >/dev/null 2>&1 || fail "o comando claude nao ficou disponivel em /root/.local/bin."
claude update >/dev/null 2>&1 || true
ok "Claude Code $(claude --version 2>/dev/null | head -1)"

# --- 3. login na sua conta -----------------------------------
if claude auth status 2>/dev/null | grep -qiE 'logged in|authenticated|"loggedIn": *true'; then
  ok "Claude Code ja esta logado"
else
  echo
  echo "Agora o login na SUA conta do Claude (a do plano Max)."
  echo "Vai aparecer um link: abra no navegador, autorize e cole o codigo de volta aqui."
  claude auth login || fail "o login nao terminou. Rode o script de novo."
fi
claude auth status 2>&1 | head -5

# --- 4. plugin oficial ---------------------------------------
if hermes plugins list 2>/dev/null | grep -q "claude-subscription-directsdk"; then
  ok "plugin ja instalado"
else
  hermes plugins install claude-subscription-directsdk || fail "nao consegui instalar o plugin."
fi

# --- 5. teste, sem mexer na Naia -----------------------------
echo "testando a assinatura do Claude (a Naia continua no modelo atual)..."
RESP=$(timeout 300 hermes --provider "$PROVEDOR" -m sonnet -z "Responda apenas: OK" 2>&1 | tail -5)
echo "$RESP"
echo "$RESP" | grep -q "OK" || fail "o Claude nao respondeu pelo plugin. A Naia nao foi alterada."

echo
echo "=================================================="
echo "Assinatura do Claude conectada e testada."
echo "A Naia ainda esta no modelo atual. Avise o Claude Code"
echo "(a sessao onde voce pediu isto) para trocar o modelo dela."
echo "=================================================="
