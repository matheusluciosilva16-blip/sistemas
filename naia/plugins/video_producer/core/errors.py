"""Erros do Video Producer.

Cada erro carrega duas mensagens: ``user_message``, curta e sem detalhe
técnico, que vai para o Telegram; e a mensagem técnica normal da exceção,
que vai para o log do job junto com o stack trace.
"""

from __future__ import annotations


class VideoProducerError(Exception):
    """Base de todos os erros do pipeline."""

    user_message = "Não consegui produzir o vídeo. Os detalhes estão no log do job."

    def __init__(self, message: str = "", *, user_message: str | None = None):
        super().__init__(message or self.user_message)
        if user_message:
            self.user_message = user_message


class InvalidRequest(VideoProducerError):
    user_message = "Não entendi o pedido de vídeo. Diga o tema, por exemplo: /video busca e apreensão de veículo."


class CharacterNotFound(VideoProducerError):
    user_message = "Personagem não encontrada. Confira o nome ou crie a pasta dela em characters/."


class ScriptGenerationFailed(VideoProducerError):
    user_message = "Não consegui escrever um roteiro válido para esse tema."


class StoryboardFailed(VideoProducerError):
    user_message = "Não consegui dividir o roteiro em cenas."


class MissingGeminiApiKey(VideoProducerError):
    user_message = "Falta configurar a GEMINI_API_KEY no .env da VPS para gerar as cenas."


class MissingElevenLabsApiKey(VideoProducerError):
    user_message = "Falta configurar a ELEVENLABS_API_KEY no .env da VPS para gerar a voz."


class MissingVoiceId(VideoProducerError):
    user_message = "A personagem ainda não tem voice_id da ElevenLabs configurado."


class MissingFFmpeg(VideoProducerError):
    user_message = "O FFmpeg não está instalado ou não foi encontrado na VPS."


class VoiceGenerationFailed(VideoProducerError):
    user_message = "A geração da voz falhou."


class VideoGenerationFailed(VideoProducerError):
    user_message = "A geração das cenas de vídeo falhou."


class SubtitleGenerationFailed(VideoProducerError):
    user_message = "A geração das legendas falhou."


class RenderFailed(VideoProducerError):
    user_message = "A montagem final do vídeo falhou."


class QualityCheckFailed(VideoProducerError):
    user_message = "O vídeo não passou na verificação de qualidade."


class ExternalApiError(VideoProducerError):
    """Falha de API externa. ``retryable`` diz se vale tentar de novo."""

    def __init__(self, message: str = "", *, status: int | None = None,
                 retryable: bool = False, user_message: str | None = None):
        super().__init__(message, user_message=user_message)
        self.status = status
        self.retryable = retryable


class NotAvailableYet(VideoProducerError):
    """Etapa ainda não implementada (fases B a E)."""

    user_message = "Essa etapa do Video Producer ainda não foi implementada."
