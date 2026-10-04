"""Configuração do Video Producer.

Tudo vem de variáveis de ambiente (o Hermes carrega ``~/.hermes/.env``)
com padrões seguros. Chaves de API ficam fora do ``repr`` para nunca
aparecerem em log ou em mensagem de erro.
"""

from __future__ import annotations

import json
import os
import shutil
from dataclasses import dataclass, field
from pathlib import Path

PLUGIN_DIR = Path(__file__).resolve().parent.parent
CHARACTERS_DIR = PLUGIN_DIR / "characters"
BRAND_DIR = PLUGIN_DIR / "brand"
MUSIC_DIR = PLUGIN_DIR / "music"
TEMPLATES_DIR = PLUGIN_DIR / "templates"

# Nomes de variáveis que nunca podem aparecer em log.
SECRET_ENV_VARS = ("GEMINI_API_KEY", "GOOGLE_API_KEY", "ELEVENLABS_API_KEY",
                   "TELEGRAM_BOT_TOKEN")

_TRUE = {"1", "true", "yes", "on", "sim"}


def _env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    return raw.strip().lower() in _TRUE


def _env_int(name: str, default: int) -> int:
    try:
        return int(_env(name, str(default)))
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(_env(name, str(default)))
    except ValueError:
        return default


def hermes_home() -> Path:
    return Path(_env("HERMES_HOME", str(Path.home() / ".hermes"))).expanduser()


@dataclass(frozen=True)
class Settings:
    mock: bool
    script_llm: bool
    data_dir: Path
    ffmpeg_path: str
    ffprobe_path: str
    veo_model: str
    veo_resolution: str
    elevenlabs_model: str
    elevenlabs_voice_id: str
    max_scene_retries: int
    max_qa_retries: int
    max_video_duration: int
    min_video_duration: int
    default_scene_duration: int
    default_duration: int
    http_timeout: float
    http_max_retries: int
    speech_rate_wps: float
    gemini_api_key: str = field(default="", repr=False)
    elevenlabs_api_key: str = field(default="", repr=False)

    # -- diretórios de execução (fora da pasta do plugin, que é sobrescrita
    #    a cada deploy) --------------------------------------------------
    @property
    def temp_dir(self) -> Path:
        return self.data_dir / "temp"

    @property
    def output_dir(self) -> Path:
        return self.data_dir / "output"

    @property
    def logs_dir(self) -> Path:
        return self.data_dir / "logs"

    def ensure_dirs(self) -> None:
        for d in (self.temp_dir, self.output_dir, self.logs_dir):
            d.mkdir(parents=True, exist_ok=True)

    def public_dict(self) -> dict:
        """Configuração sem segredos, para registrar no log do job."""
        return {
            "mock": self.mock,
            "script_llm": self.script_llm,
            "data_dir": str(self.data_dir),
            "ffmpeg_path": self.ffmpeg_path or "(não encontrado)",
            "ffprobe_path": self.ffprobe_path or "(não encontrado)",
            "veo_model": self.veo_model,
            "veo_resolution": self.veo_resolution,
            "elevenlabs_model": self.elevenlabs_model,
            "gemini_api_key": "configurada" if self.gemini_api_key else "ausente",
            "elevenlabs_api_key": "configurada" if self.elevenlabs_api_key else "ausente",
            "max_scene_retries": self.max_scene_retries,
            "max_qa_retries": self.max_qa_retries,
            "max_video_duration": self.max_video_duration,
            "default_scene_duration": self.default_scene_duration,
        }


def load_settings() -> Settings:
    data_dir = _env("VIDEO_OUTPUT_DIR") or str(hermes_home() / "video_producer")
    gemini = _env("GEMINI_API_KEY") or _env("GOOGLE_API_KEY")
    return Settings(
        mock=_env_bool("VIDEO_PRODUCER_MOCK", True),
        # Roteiro e storyboard pelo modelo da Naia, mesmo em mock (não usa API paga).
        script_llm=_env_bool("VIDEO_PRODUCER_SCRIPT_LLM", True),
        data_dir=Path(data_dir).expanduser(),
        ffmpeg_path=_env("FFMPEG_PATH") or (shutil.which("ffmpeg") or ""),
        ffprobe_path=_env("FFPROBE_PATH") or (shutil.which("ffprobe") or ""),
        veo_model=_env("VEO_MODEL", "veo-3.1-fast-generate-preview"),
        veo_resolution=_env("VEO_RESOLUTION", "720p"),
        elevenlabs_model=_env("ELEVENLABS_MODEL", "eleven_multilingual_v2"),
        elevenlabs_voice_id=_env("ELEVENLABS_VOICE_ID"),
        max_scene_retries=_env_int("MAX_SCENE_RETRIES", 2),
        max_qa_retries=_env_int("MAX_QA_RETRIES", 2),
        max_video_duration=_env_int("MAX_VIDEO_DURATION", 90),
        min_video_duration=_env_int("MIN_VIDEO_DURATION", 10),
        default_scene_duration=_env_int("DEFAULT_SCENE_DURATION", 6),
        default_duration=_env_int("DEFAULT_VIDEO_DURATION", 40),
        http_timeout=_env_float("VIDEO_HTTP_TIMEOUT", 120.0),
        http_max_retries=_env_int("VIDEO_HTTP_MAX_RETRIES", 3),
        # Fala corrida em pt-BR fica perto de 150 palavras por minuto.
        speech_rate_wps=_env_float("VIDEO_SPEECH_RATE_WPS", 2.5),
        gemini_api_key=gemini,
        elevenlabs_api_key=_env("ELEVENLABS_API_KEY"),
    )


def secret_values() -> list[str]:
    """Valores atuais das variáveis secretas, para o filtro de log."""
    return [v for v in (os.environ.get(n, "").strip() for n in SECRET_ENV_VARS) if len(v) >= 6]


def load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def load_visual_identity() -> dict:
    return load_json(BRAND_DIR / "visual_identity.json")
