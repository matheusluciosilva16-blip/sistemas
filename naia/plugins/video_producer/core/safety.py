"""Proteções de arquivo: nomes sanitizados e caminhos presos à base."""

from __future__ import annotations

import re
import unicodedata
from pathlib import Path

_UNSAFE = re.compile(r"[^a-z0-9._-]+")


def slugify(text: str, max_len: int = 60) -> str:
    """Converte texto livre em nome de arquivo seguro (só a-z, 0-9, . _ -)."""
    norm = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    slug = _UNSAFE.sub("_", norm.lower()).strip("._-")
    slug = re.sub(r"_+", "_", slug)[:max_len].strip("._-")
    return slug or "arquivo"


def safe_join(base: Path, *parts: str) -> Path:
    """Junta ``parts`` em ``base`` e recusa qualquer caminho que escape dela."""
    base = Path(base).resolve()
    candidate = base.joinpath(*parts).resolve()
    if candidate != base and base not in candidate.parents:
        raise ValueError(f"caminho fora da pasta permitida: {candidate}")
    return candidate
