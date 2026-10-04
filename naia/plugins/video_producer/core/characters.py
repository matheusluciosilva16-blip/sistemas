"""Personagens persistentes, uma pasta por personagem em ``characters/``."""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass
from pathlib import Path

from .config import CHARACTERS_DIR, load_json
from .errors import CharacterNotFound
from .safety import safe_join, slugify

IMAGE_FILES = ("face_front.png", "face_side.png", "face_3quarter.png", "full_body.png")


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return " ".join(text.lower().replace("_", " ").replace("-", " ").split())


@dataclass
class Character:
    id: str
    folder: Path
    profile: dict
    outfit: dict
    voice: dict

    @property
    def name(self) -> str:
        return self.profile.get("name", self.id)

    def reference_images(self) -> list[Path]:
        """Imagens de referência que existem de fato na pasta."""
        return [self.folder / f for f in IMAGE_FILES if (self.folder / f).is_file()]

    def visual_description(self) -> str:
        """Descrição em inglês para prompts de vídeo (Veo responde melhor em inglês)."""
        a = self.profile.get("appearance", {})
        o = self.outfit
        parts = [a.get("prompt_description", ""), o.get("prompt_description", "")]
        return ". ".join(p for p in parts if p)


def available(base: Path = CHARACTERS_DIR) -> list[str]:
    return sorted(p.name for p in base.iterdir() if (p / "character.json").is_file())


def find_in_text(text: str, base: Path = CHARACTERS_DIR) -> str | None:
    """Procura o nome de alguma personagem existente dentro de um texto livre."""
    hay = f" {_norm(text)} "
    for cid in available(base):
        try:
            name = load_json(base / cid / "character.json").get("name", cid)
        except Exception:
            name = cid
        for candidate in {_norm(name), _norm(cid)}:
            if candidate and f" {candidate} " in hay:
                return cid
    return None


def resolve_id(name: str, base: Path = CHARACTERS_DIR) -> str:
    wanted = slugify(name).replace("-", "_")
    for cid in available(base):
        if cid == wanted or _norm(cid) == _norm(name):
            return cid
    found = find_in_text(name, base)
    if found:
        return found
    raise CharacterNotFound(f"personagem desconhecida: {name!r}; existentes: {available(base)}")


def load(character_id: str, base: Path = CHARACTERS_DIR) -> Character:
    folder = safe_join(base, slugify(character_id).replace("-", "_"))
    if not (folder / "character.json").is_file():
        raise CharacterNotFound(f"sem character.json em {folder}")
    profile = load_json(folder / "character.json")
    outfit = load_json(folder / "outfit.json") if (folder / "outfit.json").is_file() else {}
    voice = load_json(folder / "voice.json") if (folder / "voice.json").is_file() else {}
    return Character(profile.get("id", folder.name), folder, profile, outfit, voice)
