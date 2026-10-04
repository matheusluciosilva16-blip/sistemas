"""Plugin Video Producer para o Hermes.

Registra:
- o comando ``/video`` (Telegram e CLI);
- as ferramentas ``video_producer`` e ``video_estimate_cost``, para a Naia
  usar quando o pedido vier em linguagem natural.

O trabalho pesado roda em thread separada para não travar o gateway.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from .agents.video_producer import VideoProducer
from .core.config import load_settings
from .core.cost import estimate_cost
from .core.llm import HermesLlm, NoLlm

logger = logging.getLogger(__name__)

_TELEGRAM_LIMIT = 3900

VIDEO_PRODUCER_SCHEMA = {
    "name": "video_producer",
    "description": (
        "Produz um vídeo curto (Reel/Shorts, 9:16) a partir de um pedido em linguagem natural: "
        "roteiro, storyboard, voz, cenas, legendas, montagem e verificação. Use quando o usuário pedir um vídeo. "
        "Passe o pedido do usuário como está. Fase atual: entrega roteiro, storyboard e custo estimado."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "request": {"type": "string", "description": "Pedido do usuário, ex.: 'Reel de 40s com a Maria Gabriela sobre busca e apreensão'."},
        },
        "required": ["request"],
    },
}

VIDEO_COST_SCHEMA = {
    "name": "video_estimate_cost",
    "description": "Estima o custo em dólares de gerar um vídeo com Veo e ElevenLabs antes de produzir.",
    "parameters": {
        "type": "object",
        "properties": {
            "duration_seconds": {"type": "number", "description": "Duração do vídeo em segundos."},
            "scenes": {"type": "integer", "description": "Número de cenas (padrão: duração/6)."},
        },
        "required": ["duration_seconds"],
    },
}


def _llm_from_ctx(ctx: Any):
    try:
        return HermesLlm(ctx.llm)
    except Exception as exc:  # versão do Hermes sem ctx.llm
        logger.warning("video_producer: ctx.llm indisponível (%s); roteiro usará modelo fixo", exc)
        return NoLlm()


def format_summary(result: dict) -> str:
    if result.get("status") == "failed":
        return (f"⚠️ {result.get('error')}\n"
                f"Job: {result.get('job_id')}")
    req, script, cost = result.get("request", {}), result.get("script") or {}, result.get("cost") or {}
    lines = [
        f"🎬 Job {result['job_id']}" + (" (modo teste)" if result.get("plan", {}).get("mock") else ""),
        f"Tema: {req.get('topic')}",
        f"Personagem: {req.get('character')} · alvo {req.get('duration')}s · {req.get('aspect_ratio')} · {req.get('platform')}",
        f"Roteiro: {script.get('word_count')} palavras, cerca de {script.get('estimated_duration')}s de fala",
        "",
        script.get("full_text", ""),
        "",
        f"Cenas ({len(result.get('storyboard', []))}):",
    ]
    t = 0.0
    for sc in result.get("storyboard", []):
        overlay = f" · tela: “{sc['overlay_text']}”" if sc.get("overlay_text") else ""
        lines.append(f"{sc['scene_id']}. {t:.0f}–{t + sc['duration']:.0f}s {sc['visual_type']}{overlay}")
        t += sc["duration"]
    if cost:
        lines += ["", f"Custo estimado quando Veo e voz estiverem ligados: US$ {cost.get('total_usd')}"]
    for w in result.get("warnings", []):
        lines.append(f"Aviso: {w}")
    if result.get("status") == "planned":
        lines += ["", "Fase A: roteiro e storyboard prontos. A montagem do MP4 entra na fase B."]
    text = "\n".join(lines)
    return text if len(text) <= _TELEGRAM_LIMIT else text[:_TELEGRAM_LIMIT] + "…"


def register(ctx) -> None:
    llm = _llm_from_ctx(ctx)

    def _run(text: str) -> dict:
        return VideoProducer(llm=llm).run(text, until="storyboard").to_dict()

    async def video_command(raw_args: str) -> str:
        text = (raw_args or "").strip()
        if not text:
            return ("Uso: /video <pedido>\n"
                    "Ex.: /video Reel de 40 segundos com a Maria Gabriela sobre busca e apreensão de veículo\n"
                    "Ou: /video personagem=Maria_Gabriela duração=45 tema=\"conta bloqueada judicialmente\"")
        result = await asyncio.to_thread(_run, text)
        return format_summary(result)

    def video_tool(args: dict, **_kw) -> str:
        result = _run(str(args.get("request", "")))
        return json.dumps(result, ensure_ascii=False)

    def cost_tool(args: dict, **_kw) -> str:
        s = load_settings()
        duration = float(args.get("duration_seconds") or s.default_duration)
        scenes = int(args.get("scenes") or max(1, round(duration / s.default_scene_duration)))
        est = estimate_cost(duration_s=duration, n_scenes=scenes, veo_model=s.veo_model,
                            veo_resolution=s.veo_resolution, voice_chars=int(duration * 15))
        return json.dumps(est.to_dict(), ensure_ascii=False)

    ctx.register_command("video", video_command,
                         description="Produz um vídeo curto a partir de um pedido",
                         args_hint="<pedido>")
    ctx.register_tool(name="video_producer", toolset="video_producer",
                      schema=VIDEO_PRODUCER_SCHEMA, handler=video_tool, emoji="🎬")
    ctx.register_tool(name="video_estimate_cost", toolset="video_producer",
                      schema=VIDEO_COST_SCHEMA, handler=cost_tool, emoji="💲")
    logger.info("video_producer registrado (mock=%s)", load_settings().mock)
