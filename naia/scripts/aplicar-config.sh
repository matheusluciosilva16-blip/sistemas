#!/usr/bin/env bash
# ============================================================
# aplicar-config — faz o config.yaml do repositorio vencer um
# conflito do naia-sync, depois de mostrar o que vai mudar.
#
# Use quando o naia-sync registrar "CONFLITO em config.yaml"
# (algo na VPS alterou o arquivo, por exemplo `hermes plugins
# enable`). Linhas com chave/token/senha nao aparecem na tela.
#
# No terminal da VPS:
#   bash /root/naia-sync/naia/scripts/aplicar-config.sh
# ============================================================
set -uo pipefail
REPO=/root/naia-sync
NOVO="$REPO/naia/hermes/config.yaml"
ATUAL=/root/.hermes/config.yaml

[ "$(id -u)" = 0 ] || { echo "ERRO: rode como root."; exit 1; }
git -C "$REPO" fetch -q origin main && git -C "$REPO" reset -q --hard origin/main \
  || { echo "ERRO: nao consegui atualizar o repositorio."; exit 1; }

if cmp -s "$NOVO" "$ATUAL"; then
  echo "OK: a VPS ja esta igual ao repositorio. Nada a fazer."; exit 0
fi

echo "Diferencas (- VPS hoje, + repositorio):"
echo "--------------------------------------------------"
diff -u "$ATUAL" "$NOVO" | tail -n +3 \
  | grep -viE 'api_key|token|secret|password|senha' || true
echo "--------------------------------------------------"
read -rp "Aplicar a versao do repositorio? Digite sim: " R
R=$(printf '%s' "$R" | tr -d '[:space:]' | tr '[:lower:]' '[:upper:]')
[ "$R" = SIM ] || { echo "Cancelado. Nada foi alterado."; exit 1; }

# o naia-sync guarda backup, aplica, reinicia e volta sozinho se o servico nao subir
rm -f /root/.naia-sync-state/config.yaml.md5
naia-sync
tail -4 /root/.hermes/logs/naia-sync.log
echo "Naia: $(XDG_RUNTIME_DIR=/run/user/0 systemctl --user is-active hermes-gateway.service)"
