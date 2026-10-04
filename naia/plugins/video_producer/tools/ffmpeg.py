"""ffprobe e render_video() com FFmpeg. Implementação na FASE B."""

from ..core.config import Settings
from ..core.errors import MissingFFmpeg, NotAvailableYet


def check_ready(settings: Settings) -> None:
    if not settings.ffmpeg_path or not settings.ffprobe_path:
        raise MissingFFmpeg("ffmpeg/ffprobe não encontrados (defina FFMPEG_PATH/FFPROBE_PATH)")


def render_video(*args, **kwargs):
    raise NotAvailableYet("renderização entra na FASE B")
