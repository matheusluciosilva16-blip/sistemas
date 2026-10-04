"""Video Producer: orquestra o pipeline de um pedido até o vídeo final.

Cada STEP do pedido original vira um método. A FASE A cobre os STEPs 1 a 4
(interpretar, planejar, roteiro, storyboard) mais a estimativa de custo; os
demais entram nas fases seguintes e, por enquanto, param com aviso claro.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from typing import Any

from ..core import characters
from ..core.config import Settings, load_settings, load_visual_identity
from ..core.cost import estimate_cost
from ..core.errors import VideoProducerError
from ..core.jobs import Job
from ..core.llm import NoLlm, StructuredLlm
from ..core.parser import VideoRequest, parse_request
from ..tools.script import generate_script
from ..tools.storyboard import create_storyboard

PHASE = "A"


@dataclass
class ProductionResult:
    status: str
    job_id: str
    phase: str
    request: dict
    plan: dict
    script: dict | None = None
    storyboard: list[dict] = field(default_factory=list)
    cost: dict | None = None
    file: str | None = None
    duration: float | None = None
    resolution: str | None = None
    log_file: str | None = None
    warnings: list[str] = field(default_factory=list)
    error: str | None = None

    def to_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items()}


class VideoProducer:
    def __init__(self, settings: Settings | None = None, llm: StructuredLlm | None = None):
        self.settings = settings or load_settings()
        use_llm = llm is not None and not isinstance(llm, NoLlm) and self.settings.script_llm
        self.llm = llm if use_llm else NoLlm()
        self.use_llm = use_llm

    # -- STEP 1 ------------------------------------------------------------
    def interpret(self, text: str) -> VideoRequest:
        return parse_request(text, self.settings)

    # -- STEP 2 ------------------------------------------------------------
    def plan(self, req: VideoRequest, identity: dict) -> dict:
        s = self.settings
        return {
            "phase": PHASE,
            "mock": s.mock,
            "script_source": "modelo da Naia" if self.use_llm else "modelo fixo (teste)",
            "target_duration": req.duration,
            "aspect_ratio": req.aspect_ratio,
            "resolution": identity.get("resolution", "1080x1920") if req.aspect_ratio == "9:16" else "1920x1080",
            "fps": identity.get("fps", 30),
            "character": req.character,
            "voice_provider": "placeholder" if s.mock else "elevenlabs",
            "video_provider": "placeholder" if s.mock else f"veo:{s.veo_model}@{s.veo_resolution}",
            "limits": {"max_scene_retries": s.max_scene_retries, "max_qa_retries": s.max_qa_retries,
                       "max_video_duration": s.max_video_duration},
            "steps": ["interpretar", "plano", "roteiro", "storyboard", "voz", "duração real",
                      "recalcular cenas", "gerar cenas", "armazenar cenas", "legendas", "montagem",
                      "identidade visual", "música", "render", "QA", "correção", "salvar", "entregar"],
        }

    # -- execução ------------------------------------------------------------
    def run(self, text: str, *, until: str = "storyboard") -> ProductionResult:
        """Executa o pipeline. Em caso de erro, devolve status "failed" com mensagem amigável."""
        job = Job.create(self.settings)
        log = job.logger
        result = ProductionResult(status="running", job_id=job.job_id, phase=PHASE,
                                  request={}, plan={}, log_file=str(job.log_path))
        log.info("job %s iniciado (fase %s)", job.job_id, PHASE)
        log.info("pedido original: %s", text)
        log.info("configuração: %s", json.dumps(self.settings.public_dict(), ensure_ascii=False))
        t0 = time.monotonic()
        try:
            with job.step("1 interpretar"):
                req = self.interpret(text)
                result.request = req.to_dict()
                result.warnings.extend(req.warnings)
                job.save_json("request.json", result.request)
                log.info("pedido interpretado: %s", json.dumps(result.request, ensure_ascii=False))

            identity = load_visual_identity()
            character = characters.load(req.character)

            with job.step("2 plano"):
                result.plan = self.plan(req, identity)
                job.save_json("plan.json", result.plan)

            with job.step("3 roteiro"):
                script = generate_script(
                    topic=req.topic, title=req.title, goal=req.goal, audience=req.audience,
                    character=character.profile, duration=req.duration, tone=req.tone,
                    style=req.style, cta=req.cta, speech_rate_wps=self.settings.speech_rate_wps,
                    llm=self.llm, mock=not self.use_llm, logger=log)
                result.script = script.to_dict()
                job.save_json("script.json", result.script)
                log.info("roteiro: %s", script.full_text)
                result.warnings.extend(script.notes)
                if script.violations:
                    result.warnings.append("roteiro com termos a revisar: " + ", ".join(script.violations))

            with job.step("4 storyboard"):
                scenes = create_storyboard(
                    script=script, topic=req.topic, title=req.title, character=character, identity=identity,
                    default_scene_duration=self.settings.default_scene_duration,
                    llm=self.llm, mock=not self.use_llm, logger=log)
                result.storyboard = [s.to_dict() for s in scenes]
                job.save_json("storyboard.json", result.storyboard)

            with job.step("custo estimado"):
                est = estimate_cost(
                    duration_s=script.estimated_duration, n_scenes=len(scenes),
                    veo_model=self.settings.veo_model, veo_resolution=self.settings.veo_resolution,
                    veo_seconds=sum(s.veo_duration for s in scenes),
                    voice_chars=len(script.full_text))
                result.cost = est.to_dict()
                job.save_json("cost.json", result.cost)

            if until == "storyboard":
                result.status = "planned"
            else:
                from ..core.errors import NotAvailableYet
                raise NotAvailableYet(f"etapas após o storyboard entram na fase B (pedido: until={until})",
                                      user_message="A montagem do vídeo entra na fase B. Por enquanto entrego roteiro e storyboard.")
        except VideoProducerError as exc:
            log.error("job falhou: %s", exc, exc_info=True)
            result.status, result.error = "failed", exc.user_message
        except Exception as exc:  # erro inesperado: stack no log, mensagem curta ao usuário
            log.error("erro inesperado: %s", exc, exc_info=True)
            result.status = "failed"
            result.error = f"Erro inesperado no Video Producer. Veja o log do job {job.job_id}."
        finally:
            log.info("job %s terminou com status=%s em %.1fs", job.job_id, result.status, time.monotonic() - t0)
            job.save_json("result.json", result.to_dict())
            job.close()
        return result


def run(text: str, *, llm: Any = None, until: str = "storyboard") -> dict:
    """Atalho usado pelo plugin e pela linha de comando."""
    return VideoProducer(llm=llm).run(text, until=until).to_dict()
