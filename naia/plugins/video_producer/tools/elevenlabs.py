"""generate_voice(): voz pela ElevenLabs. Integração na FASE C."""

from __future__ import annotations

from ..core.config import Settings
from ..core.errors import MissingElevenLabsApiKey, MissingVoiceId, NotAvailableYet


def check_ready(settings: Settings, voice: dict) -> str:
    """Confere chave e voice_id antes de qualquer chamada. Devolve o voice_id."""
    if not settings.elevenlabs_api_key:
        raise MissingElevenLabsApiKey("ELEVENLABS_API_KEY ausente")
    voice_id = (voice or {}).get("voice_id") or settings.elevenlabs_voice_id
    if not voice_id:
        raise MissingVoiceId("voice_id vazio em voice.json e ELEVENLABS_VOICE_ID ausente")
    return voice_id


def generate_voice(*, text: str, voice: dict, settings: Settings, out_path, logger=None) -> dict:
    check_ready(settings, voice)
    raise NotAvailableYet("generate_voice real entra na FASE C",
                          user_message="A voz real (ElevenLabs) entra na fase C. Use VIDEO_PRODUCER_MOCK=true por enquanto.")
