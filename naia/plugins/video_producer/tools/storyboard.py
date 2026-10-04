"""create_storyboard(): divide o roteiro em cenas.

A fala de cada cena sai sempre do roteiro, sem reescrita, para a legenda e
a voz baterem. O LLM só decide a parte visual (tipo de cena, enquadramento,
texto na tela, descrição do B-roll); sem LLM, regras fixas fazem isso.
"""

from __future__ import annotations

import logging
import re
from dataclasses import asdict, dataclass

from ..core import ethics
from ..core.characters import Character
from ..core.errors import StoryboardFailed
from ..core.llm import NoLlm, StructuredLlm

# Durações de clipe que o Veo gera. A cena final é cortada no tempo real da voz.
VEO_CLIP_SECONDS = (4, 6, 8)

_VISUAL_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["scenes"],
    "properties": {
        "scenes": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["scene_id", "visual_type", "shot", "camera", "overlay_text", "visual_description"],
                "properties": {
                    "scene_id": {"type": "integer"},
                    "visual_type": {"type": "string", "enum": ["character", "broll", "text"]},
                    "shot": {"type": "string", "enum": ["close-up", "medium close-up", "medium shot", "wide shot"]},
                    "camera": {"type": "string", "enum": ["static", "slow push-in", "slow pan", "handheld subtle"]},
                    "overlay_text": {"type": "string", "description": "Até 5 palavras em pt-BR, ou vazio."},
                    "visual_description": {"type": "string", "description": "Em inglês: o que aparece na cena."},
                },
            },
        }
    },
}

_VISUAL_INSTRUCTIONS = """\
Você é diretor de vídeos verticais 9:16 para um escritório de advocacia.
Para cada cena (a fala já está definida), escolha:
- visual_type: "character" (a personagem em quadro), "broll" (imagens ilustrativas sem a personagem) ou "text" (fundo da marca com texto).
- A primeira e a última cena devem ser "character". Alterne para não ficar monótono.
- overlay_text: até 5 palavras que reforcem a ideia; vazio se a cena não precisar.
- visual_description: em inglês, concreta e filmável. Sem marcas, sem pessoas reais, sem tribunal caricato, sem martelo de juiz, sem algemas.
{guidelines}"""


@dataclass
class Scene:
    scene_id: int
    speech: str
    duration: float
    veo_duration: int
    visual_type: str
    prompt: str
    character: str | None
    shot: str
    camera: str
    overlay_text: str
    needs_broll: bool
    needs_reference_image: bool

    def to_dict(self) -> dict:
        return asdict(self)


def _words(text: str) -> int:
    return len(re.findall(r"\w+", text))


def _snap_veo(seconds: float) -> int:
    for s in VEO_CLIP_SECONDS:
        if seconds <= s:
            return s
    return VEO_CLIP_SECONDS[-1]


def segment(sentences: list[str], *, target_seconds: float, rate_wps: float,
            max_seconds: float = 8.0) -> list[str]:
    """Agrupa frases em blocos de ~target_seconds sem cortar frases.

    Frase que sozinha passa de max_seconds é quebrada em vírgula ou no meio.
    """
    pieces: list[str] = []
    for s in sentences:
        if _words(s) / rate_wps <= max_seconds:
            pieces.append(s)
            continue
        parts = [p.strip() for p in re.split(r"(?<=[,;:])\s+", s) if p.strip()]
        buf = ""
        for p in parts:
            cand = f"{buf} {p}".strip()
            if buf and _words(cand) / rate_wps > max_seconds:
                pieces.append(buf)
                buf = p
            else:
                buf = cand
        if buf:
            words = buf.split()
            while len(words) / rate_wps > max_seconds:
                cut = int(max_seconds * rate_wps)
                pieces.append(" ".join(words[:cut]))
                words = words[cut:]
            if words:
                pieces.append(" ".join(words))

    groups: list[str] = []
    buf = ""
    for p in pieces:
        cand = f"{buf} {p}".strip()
        if buf and (_words(cand) / rate_wps > max_seconds or _words(buf) / rate_wps >= target_seconds):
            groups.append(buf)
            buf = p
        else:
            buf = cand
    if buf:
        groups.append(buf)
    return groups


def _build_prompt(*, visual_type: str, description: str, character: Character | None,
                  shot: str, camera: str, identity: dict) -> str:
    style = identity.get("video_style", "corporate_premium_realistic").replace("_", " ")
    base = (f"Vertical {identity.get('aspect_ratio', '9:16')} video, photorealistic, {style}, "
            f"{shot}, {camera} camera, soft natural light, shallow depth of field, no on-screen text, no logos.")
    if visual_type == "character" and character is not None:
        setting = character.profile.get("default_setting", "a modern, well-lit law office reception")
        return (f"{base} {character.visual_description()}. Setting: {setting}. "
                f"She gestures naturally while presenting, calm and confident, looking at the camera. {description}").strip()
    if visual_type == "text":
        return (f"{base} Clean abstract corporate background in {identity.get('secondary_color', '#000000')} "
                f"with subtle {identity.get('primary_color', '#F2C94C')} light accents, slow motion. {description}").strip()
    return f"{base} B-roll: {description}".strip()


def _default_visuals(segments: list[str], topic: str, title: str) -> list[dict]:
    out = []
    n = len(segments)
    for i, speech in enumerate(segments, start=1):
        first, last = i == 1, i == n
        vtype = "character" if (first or last or i % 2 == 1) else "broll"
        overlay = ""
        if first:
            overlay = title
        elif last:
            overlay = "Busque orientação"
        out.append({
            "scene_id": i,
            "visual_type": vtype,
            "shot": "medium shot" if vtype == "character" else "wide shot",
            "camera": "static" if first or last else "slow push-in",
            "overlay_text": overlay,
            "visual_description": (f"Illustrative scene about: {topic}. Brazilian everyday context, "
                                   f"a person calmly organizing documents at a table." if vtype == "broll" else ""),
        })
    return out


def create_storyboard(*, script, topic: str, title: str | None = None, character: Character | None, identity: dict,
                      default_scene_duration: float, llm: StructuredLlm | None = None,
                      mock: bool = False, logger: logging.Logger | None = None) -> list[Scene]:
    log = logger or logging.getLogger(__name__)
    rate = script.speech_rate_wps
    segments = segment(script.sentences, target_seconds=default_scene_duration, rate_wps=rate)
    if not segments:
        raise StoryboardFailed("roteiro sem frases")

    visuals: list[dict] | None = None
    if not mock and llm is not None and not isinstance(llm, NoLlm):
        listing = "\n".join(f"Cena {i}: {s}" for i, s in enumerate(segments, start=1))
        try:
            data = llm.structured(
                instructions=_VISUAL_INSTRUCTIONS.format(guidelines=ethics.GUIDELINES),
                text=f"Tema: {topic}\nPersonagem: {character.name if character else 'nenhuma'}\n\n{listing}",
                schema=_VISUAL_SCHEMA, purpose="storyboard")
            got = sorted(data["scenes"], key=lambda s: int(s["scene_id"]))
            if len(got) != len(segments):
                raise ValueError(f"{len(got)} cenas na resposta, esperava {len(segments)}")
            visuals = got
            log.info("storyboard: visuais definidos pelo modelo")
        except Exception as exc:
            log.warning("storyboard: modelo falhou (%s); usando regras fixas", exc)
    if visuals is None:
        visuals = _default_visuals(segments, topic, title or " ".join(topic.split()[:5]))

    scenes: list[Scene] = []
    for speech, v in zip(segments, visuals):
        vtype = v.get("visual_type", "broll")
        if vtype == "character" and character is None:
            vtype = "broll"
        overlay = str(v.get("overlay_text") or "").strip()
        if ethics.violations(overlay):
            log.warning("cena %s: texto na tela removido por regra ética: %r", v.get("scene_id"), overlay)
            overlay = ""
        duration = round(_words(speech) / rate, 2)
        prompt = _build_prompt(visual_type=vtype, description=str(v.get("visual_description") or ""),
                               character=character, shot=v.get("shot", "medium shot"),
                               camera=v.get("camera", "static"), identity=identity)
        scenes.append(Scene(
            scene_id=len(scenes) + 1,
            speech=speech,
            duration=duration,
            veo_duration=_snap_veo(duration),
            visual_type=vtype,
            prompt=prompt,
            character=character.id if (character and vtype == "character") else None,
            shot=v.get("shot", "medium shot"),
            camera=v.get("camera", "static"),
            overlay_text=" ".join(overlay.split()[:6]),
            needs_broll=vtype == "broll",
            needs_reference_image=vtype == "character",
        ))
    log.info("storyboard: %d cenas, %.1fs estimados", len(scenes), sum(s.duration for s in scenes))
    return scenes


def recalc_durations(scenes: list[Scene], audio_duration: float) -> list[Scene]:
    """STEP 7: redistribui a duração real da voz pelas cenas, por número de palavras."""
    if audio_duration <= 0:
        raise ValueError("duração de áudio inválida")
    weights = [max(1, _words(s.speech)) for s in scenes]
    total = sum(weights)
    acc = 0.0
    for i, (scene, w) in enumerate(zip(scenes, weights)):
        if i == len(scenes) - 1:
            scene.duration = round(audio_duration - acc, 3)
        else:
            scene.duration = round(audio_duration * w / total, 3)
            acc += scene.duration
        scene.veo_duration = _snap_veo(scene.duration)
    return scenes
