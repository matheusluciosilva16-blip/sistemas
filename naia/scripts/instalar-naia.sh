#!/usr/bin/env bash
# ============================================================
# Instalador da Naia (Hermes Agent) — etapas 1, 2, 3 e 5
# A etapa 4 (OAuth) fica de fora: exige interacao humana.
#
# IMPORTANTE: lance com setsid/nohup, desacoplado do SSH.
# Se ficar preso a sessao SSH, o processo morre de SIGHUP no
# meio do `uv pip install` e deixa o venv pela metade.
#
#   ssh root@VPS 'setsid nohup bash /tmp/instalar-naia.sh \
#     > /tmp/inst.log 2>&1 < /dev/null &'
#
# Espera os templates em /tmp/naia-template/ e as variaveis
# NAIA_BOT_TOKEN e NAIA_TELEGRAM_ID no ambiente.
# ============================================================
set -uo pipefail
log(){ echo "[$(date +%H:%M:%S)] $*"; }

: "${NAIA_BOT_TOKEN:?defina NAIA_BOT_TOKEN}"
: "${NAIA_TELEGRAM_ID:?defina NAIA_TELEGRAM_ID}"

export DEBIAN_FRONTEND=noninteractive
export PATH="$HOME/.local/bin:$PATH"

log "ETAPA 1: dependencias"
apt-get update -y >/tmp/apt.log 2>&1 || { echo "FALHA apt update"; tail -5 /tmp/apt.log; exit 1; }
apt-get install -y git curl ca-certificates ffmpeg ripgrep build-essential \
  python3 python3-venv python3-pip screen jq >>/tmp/apt.log 2>&1 \
  || { echo "FALHA apt install"; tail -15 /tmp/apt.log; exit 1; }
command -v uv >/dev/null 2>&1 || curl -LsSf https://astral.sh/uv/install.sh | sh >/tmp/uv.log 2>&1
export PATH="$HOME/.local/bin:$PATH"
uv --version || { echo "FALHA uv"; exit 1; }
log "ETAPA 1 OK"

log "ETAPA 2: runtime Hermes"
export UV_NO_CONFIG=1 HERMES_SETUP_NONINTERACTIVE=1
rm -rf /usr/local/lib/hermes-agent
git clone --quiet https://github.com/NousResearch/hermes-agent.git /usr/local/lib/hermes-agent || exit 1
cd /usr/local/lib/hermes-agent
# Pin intencional. NAO trocar por main: a versao nova ja quebrou comandos antes.
git checkout --quiet v2026.5.29 2>/dev/null || log "aviso: tag indisponivel, seguindo na main"
chmod +x ./setup-hermes.sh 2>/dev/null
# setup-hermes.sh retorna exit != 0 mesmo concluindo com sucesso.
# Validar pelo binario produzido, nunca pelo codigo de saida.
./setup-hermes.sh < /dev/null >/tmp/setup.log 2>&1 || true
if [ ! -x /usr/local/lib/hermes-agent/venv/bin/hermes ]; then
  log "setup-hermes.sh nao produziu o venv, aplicando fallback"
  rm -rf venv
  uv venv --python 3.11 venv || exit 1
  UV_NO_CONFIG=1 uv pip install --python venv/bin/python -e ".[all]" || exit 1
fi
cat > /usr/local/bin/hermes <<'WRAP'
#!/usr/bin/env bash
unset PYTHONPATH
unset PYTHONHOME
exec "/usr/local/lib/hermes-agent/venv/bin/hermes" "$@"
WRAP
chmod +x /usr/local/bin/hermes
mkdir -p /root/.hermes
hermes --version || { echo "FALHA hermes --version"; exit 1; }
# Pacotes que as skills dela usam e que nao vem por padrao
uv pip install --python venv/bin/python pip beautifulsoup4 lxml requests >/dev/null 2>&1
log "ETAPA 2 OK"

log "ETAPA 3: configuracao"
for f in config.yaml .env SOUL.md AGENTS.md; do
  [ -f "/tmp/naia-template/$f" ] || { echo "FALHA: /tmp/naia-template/$f ausente"; exit 1; }
  cp "/tmp/naia-template/$f" "/root/.hermes/$f"
done
mkdir -p /root/.config/systemd/user
cp /tmp/naia-template/hermes-gateway.service /root/.config/systemd/user/
sed -i "s|{{TELEGRAM_BOT_TOKEN}}|${NAIA_BOT_TOKEN}|" /root/.hermes/.env
sed -i "s|{{DONO_TELEGRAM_ID}}|${NAIA_TELEGRAM_ID}|" /root/.hermes/.env
chmod 600 /root/.hermes/.env
rm -f /root/.hermes/auth.lock   # lock orfao bloqueia autenticacao
[ "$(grep -c '{{' /root/.hermes/.env)" = "0" ] || { echo "FALHA: placeholder sobrando"; exit 1; }
log "ETAPA 3 OK"

log "ETAPA 5: systemd (servico so sobe apos o OAuth da etapa 4)"
loginctl enable-linger root >/dev/null 2>&1
systemctl start user@0.service >/dev/null 2>&1 || true
sleep 2
export XDG_RUNTIME_DIR=/run/user/0
systemctl --user daemon-reload
systemctl --user enable hermes-gateway.service 2>&1 | tail -1
log "ETAPA 5 PREPARADA"

echo
echo "=================================================="
echo "BASE INSTALADA. Falta a etapa 4 (OAuth):"
echo "  screen -dmS hauth env HERMES_HOME=/root/.hermes PYTHONUNBUFFERED=1 \\"
echo "    hermes auth add openai-codex --type oauth --no-browser --manual-paste"
echo "  screen -S hauth -X hardcopy -h /tmp/scr.txt   # le o link e o codigo"
echo "Depois: systemctl --user restart hermes-gateway.service"
echo "=================================================="
