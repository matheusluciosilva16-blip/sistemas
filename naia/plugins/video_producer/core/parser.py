"""Interpreta o texto do comando /video.

Aceita parâmetros explícitos (``duração=45 tema="conta bloqueada"``) e
linguagem natural ("Faça um Reel de 40 segundos com a Maria Gabriela...").
Nada do texto do usuário é executado: ele só é lido e convertido em campos.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import asdict, dataclass, field

from . import characters
from .config import Settings
from .errors import InvalidRequest

DEFAULT_CHARACTER = "maria_gabriela"

_KV = re.compile(r"""(?P<key>[A-Za-zÀ-ÿ_]+)\s*=\s*(?:"(?P<dq>[^"]*)"|'(?P<sq>[^']*)'|(?P<bare>\S+))""")

_KEY_ALIASES = {
    "personagem": "character", "character": "character", "persona": "character",
    "duracao": "duration", "duration": "duration", "tempo": "duration",
    "plataforma": "platform", "platform": "platform",
    "estilo": "style", "style": "style",
    "cta": "cta", "chamada": "cta",
    "formato": "aspect_ratio", "format": "aspect_ratio", "aspect": "aspect_ratio",
    "idioma": "language", "language": "language", "lingua": "language",
    "tema": "topic", "topic": "topic", "assunto": "topic",
    "tom": "tone", "tone": "tone",
    "publico": "audience", "audience": "audience",
    "objetivo": "goal", "goal": "goal",
}

_PLATFORMS = [
    (r"\b(reels?|instagram|insta)\b", "instagram"),
    (r"\b(shorts?|youtube)\b", "youtube_shorts"),
    (r"\btik ?tok\b", "tiktok"),
]

_FORMATS = {
    "9:16": "9:16", "vertical": "9:16", "16:9": "16:9", "horizontal": "16:9",
    "1:1": "1:1", "quadrado": "1:1",
}

# Frases de comando que não fazem parte do tema.
_FILLER = [
    r"^/video\b",
    r"\b(fa[cç]a|crie|cria|gere|gera|produza|monte|quero|preciso de)\b",
    r"\b(um|uma)\s+(reel|reels|v[ií]deo|short|shorts|tiktok)\b( jur[ií]dico)?",
    r"\b(reel|reels|v[ií]deo|short|shorts)\b( jur[ií]dico)?",
    r"\bde\s+\d{1,3}\s*(s|seg|segundos?)\b",
    r"\b\d{1,3}\s*(s|seg|segundos?)\b",
    r"\bde\s+\d\s*min(uto)?s?\b",
    r"\bcom\s+(a\s+)?personagem\b",
    r"\bpara\s+(o\s+)?(instagram|tiktok|youtube)\b",
    r"\b(no\s+formato\s+)?(vertical|horizontal|quadrado)\b",
]


def _strip_accents(text: str) -> str:
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()


@dataclass
class VideoRequest:
    raw: str
    topic: str
    title: str = ""
    character: str = DEFAULT_CHARACTER
    duration: int = 40
    platform: str = "instagram"
    aspect_ratio: str = "9:16"
    language: str = "pt-BR"
    style: str = "corporativo premium"
    tone: str = "claro, cordial e seguro"
    audience: str = "pessoas leigas que enfrentam o problema agora"
    goal: str = "informar e orientar o primeiro passo"
    cta: str | None = None
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


_TITLE_PREFIXES = [
    r"^(o\s+)?que\s+fazer\s+(quando|se|ao|em caso de|diante de)\s+",
    r"^(como\s+(agir|proceder|funciona)\s+(quando|se|em caso de|com|a|o)?\s*)",
    r"^(uma\s+pessoa|algu[eé]m|voc[eê]|o\s+cliente)\s+(recebe|tem|sofre|est[aá]\s+com|teve)\s+",
    r"^(uma|um|o|a|os|as)\s+",
]


def make_title(topic: str, max_words: int = 6) -> str:
    """Versão curta do tema, para título na tela e gancho."""
    title = topic.strip()
    for pat in _TITLE_PREFIXES:
        title = re.sub(pat, "", title, flags=re.I).strip()
    words = title.split()[:max_words] or topic.split()[:max_words]
    out = " ".join(words).strip(" .,:;-")
    return out[:1].upper() + out[1:]


def parse_request(text: str, settings: Settings) -> VideoRequest:
    raw = (text or "").strip()
    if not raw:
        raise InvalidRequest("pedido vazio")
    if len(raw) > 2000:
        raise InvalidRequest("pedido longo demais", user_message="O pedido está longo demais. Resuma o tema em poucas linhas.")

    explicit: dict[str, str] = {}
    for m in _KV.finditer(raw):
        key = _KEY_ALIASES.get(_strip_accents(m.group("key")).lower())
        if key:
            explicit[key] = (m.group("dq") or m.group("sq") or m.group("bare") or "").strip()
    free = _KV.sub(lambda m: " " if _KEY_ALIASES.get(_strip_accents(m.group("key")).lower()) else m.group(0), raw)
    low = _strip_accents(free).lower()

    warnings: list[str] = []

    # Duração
    duration = settings.default_duration
    if "duration" in explicit:
        digits = re.findall(r"\d+", explicit["duration"])
        if digits:
            duration = int(digits[0])
            if re.search(r"min", explicit["duration"], re.I):
                duration *= 60
    else:
        m = re.search(r"\b(\d{1,3})\s*(s|seg|segundos?)\b", low)
        mm = re.search(r"\b(\d)\s*min(uto)?s?\b", low)
        if m:
            duration = int(m.group(1))
        elif mm:
            duration = int(mm.group(1)) * 60
    if duration > settings.max_video_duration:
        warnings.append(f"duração reduzida de {duration}s para o máximo de {settings.max_video_duration}s")
        duration = settings.max_video_duration
    if duration < settings.min_video_duration:
        warnings.append(f"duração ajustada de {duration}s para o mínimo de {settings.min_video_duration}s")
        duration = settings.min_video_duration

    # Personagem
    if "character" in explicit:
        character = characters.resolve_id(explicit["character"])
    else:
        character = characters.find_in_text(free) or DEFAULT_CHARACTER

    # Plataforma e formato
    platform = explicit.get("platform", "").lower() or next(
        (name for pat, name in _PLATFORMS if re.search(pat, low)), "instagram")
    fmt_raw = explicit.get("aspect_ratio", "").lower()
    aspect = _FORMATS.get(fmt_raw) or next((v for k, v in _FORMATS.items() if re.search(rf"\b{re.escape(k)}\b", low)), "9:16")

    # Tema: explícito, ou o texto livre sem as palavras de comando
    topic = explicit.get("topic", "")
    if not topic:
        topic = free
        try:
            name = characters.load(character).name
            topic = re.sub(re.escape(name).replace(r"\ ", r"[\s_]+"), " ", topic, flags=re.I)
        except Exception:
            pass
        for pat in _FILLER:
            topic = re.sub(pat, " ", topic, flags=re.I)
        topic = re.sub(r"^\W*(sobre|explicando|que explique|falando sobre|a respeito de)\b", " ", topic.strip(), flags=re.I)
        topic = re.sub(r"\s+", " ", topic).strip(" .,:;-")
        topic = re.sub(r"^(a|o|com|e)\s+(?!que\b)", "", topic, flags=re.I)
    if len(topic) < 4:
        raise InvalidRequest(f"tema não identificado em {raw!r}")
    title = make_title(topic)

    return VideoRequest(
        raw=raw,
        topic=topic[:400],
        title=title,
        character=character,
        duration=duration,
        platform=platform,
        aspect_ratio=aspect,
        language=explicit.get("language", "pt-BR"),
        style=explicit.get("style", "corporativo premium"),
        tone=explicit.get("tone", "claro, cordial e seguro"),
        audience=explicit.get("audience", "pessoas leigas que enfrentam o problema agora"),
        goal=explicit.get("goal", "informar e orientar o primeiro passo"),
        cta=explicit.get("cta") or None,
        warnings=warnings,
    )
