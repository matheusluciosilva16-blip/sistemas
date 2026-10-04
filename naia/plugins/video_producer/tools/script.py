"""generate_script(): roteiro com gancho, corpo e CTA.

Com LLM, o roteiro é escrito pelo modelo da Naia dentro das regras de
publicidade da OAB. Sem LLM (modo mock), sai de um modelo fixo, só para
testar o pipeline.
"""

from __future__ import annotations

import logging
import re
from dataclasses import asdict, dataclass, field

from ..core import ethics
from ..core.errors import ScriptGenerationFailed
from ..core.llm import LlmUnavailable, NoLlm, StructuredLlm

_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["hook", "body", "cta"],
    "properties": {
        "hook": {"type": "string", "description": "Gancho de 1 frase que prende nos 3 primeiros segundos."},
        "body": {"type": "array", "items": {"type": "string"}, "minItems": 2, "maxItems": 10,
                 "description": "Frases curtas, uma ideia por frase, na ordem da fala."},
        "cta": {"type": "string", "description": "Chamada final discreta, sem promessa."},
    },
}

_INSTRUCTIONS = """\
Você é roteirista de vídeos curtos verticais (Reels/Shorts) para um escritório de advocacia brasileiro.
Escreva o texto FALADO pela personagem, em português do Brasil, frases curtas e naturais para a fala.
Tamanho: cerca de {words} palavras no total (gancho + corpo + CTA), para {duration} segundos de fala.
Personagem: {character_name}, {character_role}. Tom: {tone}. Público: {audience}. Objetivo: {goal}.
Estilo: {style}. {cta_rule}
Não use emojis, hashtags, marcações de cena nem números de artigos de lei.
{guidelines}"""

_MOCK_BODY = [
    "Primeiro, mantenha a calma e leia com atenção tudo o que você recebeu.",
    "Guarde os documentos, as mensagens e os comprovantes ligados ao caso.",
    "Anote datas, nomes e o que foi dito em cada contato.",
    "Não assine nada que você não tenha entendido por completo.",
    "Cada situação tem detalhes próprios, e a lei prevê caminhos diferentes para cada uma.",
    "Por isso, buscar orientação jurídica cedo ajuda você a entender as suas opções.",
    "Um advogado de sua confiança pode analisar os papéis e explicar os próximos passos.",
]


@dataclass
class Script:
    hook: str
    body: list[str]
    cta: str
    source: str
    target_duration: int
    speech_rate_wps: float
    violations: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    @property
    def sentences(self) -> list[str]:
        return [s for s in [self.hook, *self.body, self.cta] if s.strip()]

    @property
    def full_text(self) -> str:
        return " ".join(self.sentences)

    @property
    def word_count(self) -> int:
        return len(re.findall(r"\w+", self.full_text))

    @property
    def estimated_duration(self) -> float:
        return round(self.word_count / self.speech_rate_wps, 1)

    def to_dict(self) -> dict:
        d = asdict(self)
        d.update(full_text=self.full_text, word_count=self.word_count,
                 estimated_duration=self.estimated_duration)
        return d


def _mock_script(title: str, words_target: int, cta: str, rate: float, duration: int) -> Script:
    hook = f"{title}: veja o que fazer primeiro."
    body: list[str] = []
    count = len(hook.split()) + len(cta.split())
    for sentence in _MOCK_BODY:
        if body and count + len(sentence.split()) > words_target * 1.1:
            break
        body.append(sentence)
        count += len(sentence.split())
    return Script(hook, body, cta, "template_mock", duration, rate)


def generate_script(*, topic: str, title: str | None = None, goal: str, audience: str, character: dict,
                    duration: int, tone: str, style: str, cta: str | None,
                    speech_rate_wps: float, llm: StructuredLlm | None = None,
                    mock: bool = False, logger: logging.Logger | None = None) -> Script:
    log = logger or logging.getLogger(__name__)
    words_target = max(15, round(duration * speech_rate_wps))
    final_cta = cta or "Ficou com dúvida? Procure orientação jurídica de confiança."

    if mock or llm is None or isinstance(llm, NoLlm):
        script = _mock_script(title or topic, words_target, final_cta, speech_rate_wps, duration)
        script.violations = ethics.violations(script.full_text)
        log.info("roteiro mock: %d palavras, ~%.1fs", script.word_count, script.estimated_duration)
        return script

    prompt = _INSTRUCTIONS.format(
        words=words_target, duration=duration,
        character_name=character.get("name", "a personagem"),
        character_role=character.get("role_description", character.get("role", "")),
        tone=tone, audience=audience, goal=goal, style=style,
        cta_rule=(f'Use este CTA, adaptando só a fluidez: "{cta}".' if cta else
                  "Termine com um convite discreto para buscar orientação jurídica."),
        guidelines=ethics.GUIDELINES,
    )
    feedback = ""
    last_error = ""
    parse_failures = 0
    for attempt in (1, 2):
        try:
            data = llm.structured(instructions=prompt, text=f"Tema do vídeo: {topic}{feedback}",
                                  schema=_SCHEMA, purpose="script")
        except LlmUnavailable as exc:
            log.warning("modelo da Naia indisponível (%s); usando roteiro fixo", exc)
            script = _mock_script(title or topic, words_target, final_cta, speech_rate_wps, duration)
            script.violations = ethics.violations(script.full_text)
            return script
        except Exception as exc:  # resposta inválida do modelo
            last_error = f"resposta inválida do modelo: {exc}"
            parse_failures += 1
            log.warning("roteiro tentativa %d: %s", attempt, last_error)
            continue
        script = Script(str(data["hook"]).strip(), [str(s).strip() for s in data["body"] if str(s).strip()],
                        str(data["cta"]).strip(), "llm", duration, speech_rate_wps)
        script.violations = ethics.violations(script.full_text)
        ratio = script.word_count / words_target
        log.info("roteiro tentativa %d: %d palavras (alvo %d), violações=%s",
                 attempt, script.word_count, words_target, script.violations)
        problems = []
        if script.violations:
            problems.append("remova: " + ", ".join(script.violations))
        if not 0.65 <= ratio <= 1.35:
            problems.append(f"ajuste para cerca de {words_target} palavras (veio {script.word_count})")
        if not problems:
            return script
        last_error = "; ".join(problems)
        feedback = f"\n\nA versão anterior foi recusada. Corrija: {last_error}."
    if parse_failures == 2:
        log.warning("modelo não devolveu roteiro legível; usando roteiro fixo")
        script = _mock_script(title or topic, words_target, final_cta, speech_rate_wps, duration)
        script.violations = ethics.violations(script.full_text)
        script.notes.append("o modelo da Naia não devolveu um roteiro legível; usei o roteiro fixo")
        return script
    raise ScriptGenerationFailed(f"roteiro recusado após 2 tentativas: {last_error}")
