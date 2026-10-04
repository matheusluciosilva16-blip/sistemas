"""Acesso ao modelo da Naia para escrever roteiro e storyboard.

Usa ``ctx.llm`` do Hermes: o mesmo modelo e a mesma conta que a Naia já
usa, sem chave extra. Em modo mock, ou fora do Hermes, não há LLM e as
ferramentas usam a versão determinística.
"""

from __future__ import annotations

import json
from typing import Any, Protocol


class LlmUnavailable(RuntimeError):
    pass


class StructuredLlm(Protocol):
    def structured(self, *, instructions: str, text: str, schema: dict,
                   purpose: str, timeout: float = 120.0) -> dict: ...


class HermesLlm:
    """Adaptador para ``PluginContext.llm`` (``agent.plugin_llm.PluginLlm``)."""

    def __init__(self, plugin_llm: Any):
        self._llm = plugin_llm

    def structured(self, *, instructions: str, text: str, schema: dict,
                   purpose: str, timeout: float = 120.0) -> dict:
        try:
            from agent.plugin_llm import PluginLlmTextInput  # disponível só dentro do Hermes
        except ImportError as exc:
            raise LlmUnavailable(f"fora do Hermes: {exc}") from exc

        result = self._llm.complete_structured(
            instructions=instructions,
            input=[PluginLlmTextInput(text=text)],
            json_schema=schema,
            schema_name=purpose,
            timeout=timeout,
            purpose=f"video_producer.{purpose}",
        )
        parsed = result.parsed
        if parsed is None:
            parsed = json.loads(result.text)
        if not isinstance(parsed, dict):
            raise ValueError(f"resposta estruturada não é objeto: {type(parsed).__name__}")
        return parsed


class NoLlm:
    def structured(self, **_kw) -> dict:
        raise LlmUnavailable("sem LLM (modo mock ou fora do Hermes)")
