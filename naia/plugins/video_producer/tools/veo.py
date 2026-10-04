"""generate_video_scene(): cenas pelo Veo via Gemini API. Integração na FASE D."""

from __future__ import annotations

from ..core.config import Settings
from ..core.errors import MissingGeminiApiKey, NotAvailableYet


def check_ready(settings: Settings) -> None:
    if not settings.gemini_api_key:
        raise MissingGeminiApiKey("GEMINI_API_KEY ausente")


def generate_video_scene(*, scene, settings: Settings, out_path, aspect_ratio: str = "9:16",
                         reference_images=None, seed: int | None = None, logger=None) -> dict:
    check_ready(settings)
    raise NotAvailableYet("generate_video_scene real entra na FASE D",
                          user_message="As cenas reais (Veo) entram na fase D. Use VIDEO_PRODUCER_MOCK=true por enquanto.")
