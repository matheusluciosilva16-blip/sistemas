# Video Producer — plugin do Hermes

Recebe um pedido como

```
/video Faça um Reel de 40 segundos com a Maria Gabriela explicando o que fazer quando uma pessoa recebe uma busca e apreensão de veículo.
```

e produz o vídeo vertical em MP4: roteiro → storyboard → voz → cenas → legendas →
montagem com FFmpeg → verificação → entrega no Telegram.

## Estado por fase

| Fase | Conteúdo | Estado |
|---|---|---|
| A | plugin, `/video`, parser, roteiro, storyboard, configuração, logs, job id, mock, custo | **pronta** |
| B | FFmpeg, ffprobe, áudio e cenas de teste, legendas `.srt`/`.ass`, render, QA | a fazer |
| C | voz pela ElevenLabs | a fazer |
| D | cenas pelo Veo (Gemini API) | a fazer |
| E | envio do MP4 pelo Telegram | a fazer |

Na fase A, o `/video` devolve o roteiro, as cenas e o custo estimado. Ainda não gera MP4.

## Como o plugin se encaixa no Hermes

O Hermes v0.15.1 carrega plugins de `~/.hermes/plugins/<nome>/` (manifesto
`plugin.yaml` + `__init__.py` com `register(ctx)`), desde que o nome esteja em
`plugins.enabled` no `config.yaml`. Nada do núcleo do Hermes é alterado. O
`hermes update` está proibido neste projeto, e o instalador apaga
`/usr/local/lib/hermes-agent`, então qualquer mudança no núcleo se perderia.

O plugin registra:

- `/video` — comando no Telegram e na CLI. Roda em thread separada para não travar o gateway.
- `video_producer` — ferramenta que a Naia usa quando o pedido vem em linguagem natural.
- `video_estimate_cost` — estimativa de custo antes de gerar.

O roteiro e o storyboard usam `ctx.llm`, o mesmo modelo e a mesma conta que a
Naia já usa. Não precisa de chave extra, mas gasta cota do ChatGPT.

```
__init__.py              registro no Hermes, /video, ferramentas, resumo para o Telegram
plugin.yaml              manifesto
agents/video_producer.py orquestrador (STEPs 1 a 18)
core/                    configuração, parser, job/log, erros, custo, ética, personagens, LLM
tools/                   script, storyboard, elevenlabs, veo, subtitles, ffmpeg, qa
characters/<id>/         character.json, outfit.json, voice.json e imagens de referência
brand/                   visual_identity.json, logo.png, intro.mp4, outro.mp4
music/                   trilhas de fundo
templates/pricing.json   preços usados na estimativa
tests/                   testes (unittest, sem dependências)
scripts/vp_local.py      roda o pipeline pela linha de comando
```

Dados de execução ficam fora da pasta do plugin, porque ela é sobrescrita a cada deploy:

```
/root/.hermes/video_producer/
  temp/{job_id}/    request.json, plan.json, script.json, storyboard.json, cost.json, result.json
  output/{job_id}/  final.mp4 (a partir da fase B)
  logs/             AAAA-MM-DD_{job_id}.log
```

## Deploy

O `naia-sync` (cron a cada 5 minutos) copia `naia/plugins/<nome>/` para
`/root/.hermes/plugins/<nome>/`. Antes de copiar, faz backup em
`/root/.naia-backups/plugin-<nome>.<data>.tgz`; se o serviço não subir, volta o
backup. Ele não apaga nada no destino, então imagens colocadas direto na VPS
são preservadas.

**Uma única vez**, porque o sincronizador instalado é anterior a essa função:

```bash
cd /root/naia-sync && git pull -q && install -m 755 naia/scripts/naia-sync.sh /usr/local/bin/naia-sync && naia-sync
```

Daí em diante, o próprio `naia-sync` se atualiza a partir do repositório.

## Variáveis de ambiente

Vão no `.env` da Naia (`/root/.hermes/.env`). A lista completa, com padrões, está em `.env.example`.

| Variável | Para quê | Padrão |
|---|---|---|
| `VIDEO_PRODUCER_MOCK` | `true` = não chama ElevenLabs nem Veo | `true` |
| `VIDEO_PRODUCER_SCRIPT_LLM` | roteiro pelo modelo da Naia | `true` |
| `GEMINI_API_KEY` | Veo (fase D) | — |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | voz (fase C) | — |
| `VEO_MODEL`, `VEO_RESOLUTION` | modelo e resolução do Veo | `veo-3.1-fast-generate-preview`, `720p` |
| `MAX_VIDEO_DURATION`, `DEFAULT_SCENE_DURATION` | limites | `90`, `6` |
| `MAX_SCENE_RETRIES`, `MAX_QA_RETRIES` | tentativas | `2`, `2` |

Chaves nunca vão para log: o log de cada job passa por um filtro que remove os
valores das variáveis secretas e padrões de token (`AIza…`, `AQ.…`, `sk_…`,
token do Telegram, `?key=`).

## Testar

Na VPS ou em qualquer máquina com Python 3.11:

```bash
cd naia/plugins
python3 -m unittest discover -s video_producer/tests -t .
python3 video_producer/scripts/vp_local.py "/video Reel de 30 segundos sobre busca e apreensão de veículo"
```

No Telegram: `/video Reel de 30 segundos com a Maria Gabriela sobre busca e apreensão de veículo`.

## Depurar

- A resposta do `/video` traz o `job_id`. O log do job está em
  `/root/.hermes/video_producer/logs/*_{job_id}.log`, com cada STEP, tempo,
  pedido, roteiro e stack trace completo dos erros.
- Os JSON intermediários estão em `/root/.hermes/video_producer/temp/{job_id}/`.
- O plugin não carregou? `grep -i video_producer /root/.hermes/logs/agent.log` e
  confira `plugins.enabled` no `config.yaml`.

## Ajustes comuns

- **Identidade visual:** edite `brand/visual_identity.json` (cores, resolução, FPS,
  posição de legenda e logo, volumes). Coloque `brand/logo.png`.
- **Nova personagem:** copie `characters/maria_gabriela/` para
  `characters/<novo_id>/` e edite os três JSON. O nome em `character.json` passa a
  ser reconhecido no texto do `/video`.
- **Trocar o modelo do Veo:** `VEO_MODEL=...` no `.env`, e o preço em `templates/pricing.json`.
- **Resolução e duração:** `resolution` e `fps` em `visual_identity.json`;
  `MAX_VIDEO_DURATION` e `DEFAULT_VIDEO_DURATION` no `.env`.

## Regras de conteúdo

O roteiro é escrito dentro das regras de publicidade da advocacia (Provimento
CFOAB 205/2021): sem promessa de resultado, sem preço, sem sensacionalismo. Um
filtro (`core/ethics.py`) recusa o roteiro e pede outro quando encontra esses
termos, e remove texto de tela que os contenha. É uma rede de segurança, não
substitui a revisão humana antes de publicar.

A Maria Gabriela é uma personagem fictícia. `brand/visual_identity.json` traz
`ai_disclosure`, ligado por padrão, para o vídeo informar que ela foi criada com IA.
