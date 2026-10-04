"""Job: identificador, pastas e log de cada vídeo.

Cada pedido vira um job com pastas próprias em ``temp/{job_id}`` e
``output/{job_id}``, o que permite gerar vídeos em paralelo sem conflito.
"""

from __future__ import annotations

import json
import logging
import re
import secrets
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from .config import Settings, secret_values
from .safety import safe_join

_TOKEN_PATTERNS = [
    re.compile(r"AIza[0-9A-Za-z_\-]{20,}"),          # chave Google antiga
    re.compile(r"AQ\.[0-9A-Za-z_\-\.]{20,}"),          # chave Google nova
    re.compile(r"sk_[0-9A-Za-z]{20,}"),               # ElevenLabs
    re.compile(r"\b\d{6,}:[0-9A-Za-z_\-]{30,}\b"),     # token de bot do Telegram
    re.compile(r"(?i)(key=)[^&\s\"']+"),               # ?key= em URL
    re.compile(r"(?i)(x-goog-api-key|xi-api-key|authorization)(\"?\s*[:=]\s*\"?)[^\s\"',}]+"),
]


def redact(text: str) -> str:
    """Remove segredos conhecidos e padrões de token de um texto."""
    out = str(text)
    for value in secret_values():
        out = out.replace(value, "***")
    for pat in _TOKEN_PATTERNS:
        if pat.groups >= 2:
            out = pat.sub(lambda m: m.group(1) + m.group(2) + "***", out)
        elif pat.groups == 1:
            out = pat.sub(lambda m: m.group(1) + "***", out)
        else:
            out = pat.sub("***", out)
    return out


class _RedactingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = redact(record.getMessage())
        record.args = ()
        if record.exc_info:
            record.exc_text = redact(logging.Formatter().formatException(record.exc_info))
            record.exc_info = None
        return True


def new_job_id(now: datetime | None = None) -> str:
    now = now or datetime.now()
    return f"video_{now:%Y%m%d_%H%M%S}_{secrets.token_hex(2)}"


@dataclass
class Job:
    job_id: str
    settings: Settings
    temp_dir: Path
    output_dir: Path
    log_path: Path
    logger: logging.Logger
    started: float = field(default_factory=time.monotonic)

    @classmethod
    def create(cls, settings: Settings, job_id: str | None = None) -> "Job":
        settings.ensure_dirs()
        job_id = job_id or new_job_id()
        temp_dir = safe_join(settings.temp_dir, job_id)
        output_dir = safe_join(settings.output_dir, job_id)
        temp_dir.mkdir(parents=True, exist_ok=False)
        output_dir.mkdir(parents=True, exist_ok=False)
        log_path = safe_join(settings.logs_dir, f"{datetime.now():%Y-%m-%d}_{job_id}.log")

        logger = logging.getLogger(f"video_producer.job.{job_id}")
        logger.setLevel(logging.DEBUG)
        logger.propagate = False
        handler = logging.FileHandler(log_path, encoding="utf-8")
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
        handler.addFilter(_RedactingFilter())
        logger.addHandler(handler)
        return cls(job_id, settings, temp_dir, output_dir, log_path, logger)

    # -- utilidades ---------------------------------------------------------
    def path(self, *parts: str) -> Path:
        return safe_join(self.temp_dir, *parts)

    def save_json(self, name: str, data: Any) -> Path:
        target = self.path(name)
        target.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        return target

    def step(self, name: str):
        return _Step(self, name)

    def close(self) -> None:
        for h in list(self.logger.handlers):
            h.close()
            self.logger.removeHandler(h)


class _Step:
    """Context manager que registra início, duração e falha de cada etapa."""

    def __init__(self, job: Job, name: str):
        self.job, self.name = job, name

    def __enter__(self):
        self.t0 = time.monotonic()
        self.job.logger.info("STEP %s: início", self.name)
        return self

    def __exit__(self, exc_type, exc, tb):
        dt = time.monotonic() - self.t0
        if exc is None:
            self.job.logger.info("STEP %s: ok em %.2fs", self.name, dt)
        else:
            self.job.logger.error("STEP %s: falhou em %.2fs", self.name, dt,
                                  exc_info=(exc_type, exc, tb))
        return False
