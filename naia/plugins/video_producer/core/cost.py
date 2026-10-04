"""Estimativa de custo antes de gerar.

Os preços ficam em ``templates/pricing.json`` e podem ser sobrescritos por
variável de ambiente (``VEO_PRICE_PER_SECOND``, ``ELEVENLABS_PRICE_PER_1K_CHARS``).
São referências para não gastar às cegas; confira a tabela atual de cada
fornecedor antes de confiar no número.
"""

from __future__ import annotations

import os
from dataclasses import asdict, dataclass

from .config import TEMPLATES_DIR, load_json


@dataclass
class CostEstimate:
    total_usd: float
    breakdown: dict
    notes: list[str]

    def to_dict(self) -> dict:
        return asdict(self)


def _price(env: str, table: dict, key: str, fallback: float) -> tuple[float, str]:
    raw = os.environ.get(env, "").strip()
    if raw:
        try:
            return float(raw), f"variável {env}"
        except ValueError:
            pass
    if key in table:
        return float(table[key]), "templates/pricing.json"
    return fallback, "valor padrão"


def estimate_cost(*, duration_s: float, n_scenes: int, veo_model: str,
                  voice_chars: int, veo_resolution: str = "720p",
                  veo_seconds: float | None = None,
                  scene_attempts: float = 1.0) -> CostEstimate:
    """Custo estimado em USD.

    ``veo_seconds`` é o total de segundos que o Veo vai gerar. Se não for
    dado, usa a duração do vídeo. ``scene_attempts`` multiplica pelo número
    médio de tentativas (regeração).
    """
    try:
        pricing = load_json(TEMPLATES_DIR / "pricing.json")
    except Exception:
        pricing = {}
    veo_table = pricing.get("veo_usd_per_second", {})
    el_table = pricing.get("elevenlabs_usd_per_1k_chars", {})

    model_prices = veo_table.get(veo_model) or {}
    veo_rate, veo_src = _price("VEO_PRICE_PER_SECOND", model_prices, veo_resolution, 0.0)
    if veo_rate == 0.0 and veo_src == "valor padrão":
        notes_missing = f"Sem preço cadastrado para {veo_model} em {veo_resolution}; defina VEO_PRICE_PER_SECOND."
    else:
        notes_missing = ""
    el_rate, el_src = _price("ELEVENLABS_PRICE_PER_1K_CHARS", el_table, "default", 0.0)

    seconds = (veo_seconds if veo_seconds is not None else duration_s) * scene_attempts
    veo_cost = round(seconds * veo_rate, 4)
    voice_cost = round(voice_chars / 1000 * el_rate, 4)
    notes = [f"Veo {veo_model} {veo_resolution}: {seconds:.0f}s x US$ {veo_rate}/s ({veo_src})",
             f"Voz: {voice_chars} caracteres x US$ {el_rate}/1k ({el_src})",
             "Roteiro e storyboard usam a conta do ChatGPT da Naia (sem custo por chamada, mas gasta cota)."]
    if notes_missing:
        notes.append(notes_missing)
    if pricing.get("_aviso"):
        notes.append(pricing["_aviso"])
    return CostEstimate(
        total_usd=round(veo_cost + voice_cost, 2),
        breakdown={"veo_usd": veo_cost, "voice_usd": voice_cost, "scenes": n_scenes,
                   "veo_seconds": seconds, "voice_chars": voice_chars},
        notes=notes,
    )
