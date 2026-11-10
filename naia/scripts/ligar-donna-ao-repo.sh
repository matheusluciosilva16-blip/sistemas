#!/usr/bin/env bash
# ============================================================
# ligar-donna-ao-repo — instala o naia-sync novo, que tambem
# sincroniza a Donna, e roda uma vez. So precisa rodar uma vez:
# daqui em diante o naia-sync se atualiza sozinho.
#
# O config.yaml do repositorio passa a valer para a Naia e para a
# Donna, mantendo as conexoes (mcp_servers: Sync, Meu Estagiario)
# que estao na VPS. SOUL.md e AGENTS.md editados por elas nunca
# sao sobrescritos.
#
#   bash /root/naia-sync/naia/scripts/ligar-donna-ao-repo.sh
# ============================================================
set -uo pipefail
fail(){ echo "ERRO: $*"; exit 1; }
[ "$(id -u)" = 0 ] || fail "rode como root."
cd /root/naia-sync && git fetch -q origin main && git reset -q --hard origin/main || fail "nao consegui atualizar /root/naia-sync."
install -m 755 /root/naia-sync/naia/scripts/naia-sync.sh /usr/local/bin/naia-sync || fail "nao consegui instalar o naia-sync."
echo "OK: naia-sync novo instalado"
LOG=/root/.hermes/logs/naia-sync.log
N=$(wc -l < "$LOG" 2>/dev/null || echo 0)
echo "sincronizando (se algo mudar, a Naia e a Donna reiniciam; leva ~15s)..."
/usr/local/bin/naia-sync
echo
echo "== o que aconteceu"
tail -n +$((N+1)) "$LOG" | grep -v "snapshot" | cut -c1-160
echo
export XDG_RUNTIME_DIR=/run/user/0
echo "servico: $(systemctl --user is-active hermes-gateway.service)"
grep -m1 threshold_tokens /root/.hermes/profiles/donna/config.yaml | sed 's/^ */Donna, limite de compressao: /'
echo
echo "Se aparecer 'CONFLITO em SOUL.md' da Donna, tudo bem: a personalidade"
echo "que ela tem hoje foi mantida."
