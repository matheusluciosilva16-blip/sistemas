import json

from video_producer.tests._base import IsolatedEnv

from video_producer import format_summary
from video_producer.agents.video_producer import VideoProducer
from video_producer.core.config import load_settings
from video_producer.core import characters
from video_producer.core.errors import ScriptGenerationFailed
from video_producer.tools.script import generate_script
from video_producer.tools.storyboard import create_storyboard, recalc_durations, segment

PEDIDO = "/video Faça um Reel de 30 segundos com Maria Gabriela explicando busca e apreensão de veículo."


class FakeLlm:
    """Simula o modelo da Naia. ``scripts`` é a fila de respostas do roteiro."""

    def __init__(self, scripts, visuals=None):
        self.scripts, self.visuals, self.calls = list(scripts), visuals, []

    def structured(self, *, instructions, text, schema, purpose, timeout=120.0):
        self.calls.append(purpose)
        if purpose == "script":
            return self.scripts.pop(0)
        if self.visuals is None:
            raise ValueError("sem visuais")
        return self.visuals


def _script_ok(n_words=75):
    body = ["Guarde os documentos que recebeu e leia tudo com calma."] * (n_words // 10)
    return {"hook": "Recebeu uma busca e apreensão do seu carro?", "body": body,
            "cta": "Procure orientação jurídica de confiança."}


class E2EMockPhaseA(IsolatedEnv):
    def test_pedido_completo_em_mock(self):
        result = VideoProducer().run(PEDIDO)
        self.assertEqual(result.status, "planned", result.error)
        self.assertEqual(result.request["duration"], 30)
        self.assertEqual(result.request["character"], "maria_gabriela")
        self.assertTrue(result.script["full_text"])
        self.assertEqual(result.script["violations"], [])
        self.assertGreaterEqual(len(result.storyboard), 3)
        first, last = result.storyboard[0], result.storyboard[-1]
        self.assertEqual(first["visual_type"], "character")
        self.assertEqual(last["visual_type"], "character")
        for sc in result.storyboard:
            self.assertIn(sc["veo_duration"], (4, 6, 8))
            self.assertLessEqual(sc["duration"], 8)
        joined = " ".join(sc["speech"] for sc in result.storyboard)
        self.assertEqual(joined, result.script["full_text"])  # fala intacta
        # arquivos do job
        temp = self.data_dir / "temp" / result.job_id
        for name in ("request.json", "plan.json", "script.json", "storyboard.json", "cost.json", "result.json"):
            self.assertTrue((temp / name).is_file(), name)
        log = (self.data_dir / "logs").glob(f"*_{result.job_id}.log")
        text = next(log).read_text(encoding="utf-8")
        for marker in ("pedido original", "STEP 3 roteiro: ok", "STEP 4 storyboard: ok", "status=planned"):
            self.assertIn(marker, text)
        summary = format_summary(result.to_dict())
        self.assertIn(result.job_id, summary)
        self.assertIn("Fase A", summary)

    def test_erro_amigavel(self):
        result = VideoProducer().run("/video")
        self.assertEqual(result.status, "failed")
        self.assertIn("Não entendi", result.error)
        self.assertNotIn("Traceback", result.error)

    def test_jobs_simultaneos_nao_colidem(self):
        a, b = VideoProducer().run(PEDIDO), VideoProducer().run(PEDIDO)
        self.assertNotEqual(a.job_id, b.job_id)


class LlmPathTest(IsolatedEnv):
    def setUp(self):
        super().setUp()
        import os
        os.environ["VIDEO_PRODUCER_MOCK"] = "false"
        self.settings = load_settings()
        self.char = characters.load("maria_gabriela")

    def _gen(self, llm, duration=30):
        return generate_script(topic="busca e apreensão", goal="orientar", audience="leigos",
                               character=self.char.profile, duration=duration, tone="claro",
                               style="corporativo", cta=None, speech_rate_wps=2.5, llm=llm)

    def test_roteiro_com_promessa_e_refeito(self):
        ruim = _script_ok()
        ruim["cta"] = "Garantimos que você recupera o carro!"
        llm = FakeLlm([ruim, _script_ok()])
        script = self._gen(llm)
        self.assertEqual(script.source, "llm")
        self.assertEqual(script.violations, [])
        self.assertEqual(llm.calls, ["script", "script"])

    def test_roteiro_recusado_duas_vezes_falha(self):
        ruim = _script_ok()
        ruim["hook"] = "Resultado garantido!"
        with self.assertRaises(ScriptGenerationFailed):
            self._gen(FakeLlm([ruim, dict(ruim)]))

    def test_storyboard_cai_para_regras_se_modelo_falhar(self):
        script = self._gen(FakeLlm([_script_ok()]))
        scenes = create_storyboard(script=script, topic="busca e apreensão", character=self.char,
                                   identity={"aspect_ratio": "9:16"}, default_scene_duration=6,
                                   llm=FakeLlm([], visuals=None))
        self.assertTrue(scenes)
        self.assertEqual(scenes[0].visual_type, "character")

    def test_storyboard_usa_visuais_do_modelo(self):
        script = self._gen(FakeLlm([_script_ok()]))
        n = len(segment(script.sentences, target_seconds=6, rate_wps=2.5))
        visuals = {"scenes": [{"scene_id": i, "visual_type": "broll" if 1 < i < n else "character",
                               "shot": "close-up", "camera": "static",
                               "overlay_text": "Garantia total" if i == 2 else "Seus direitos",
                               "visual_description": "car keys on a table"} for i in range(1, n + 1)]}
        scenes = create_storyboard(script=script, topic="busca e apreensão", character=self.char,
                                   identity={"aspect_ratio": "9:16"}, default_scene_duration=6,
                                   llm=FakeLlm([], visuals=visuals))
        self.assertEqual(scenes[1].overlay_text, "")  # "Garantia" removido pela regra ética
        self.assertIn("car keys", scenes[1].prompt)


class RecalcTest(IsolatedEnv):
    def test_duracao_real_da_voz(self):
        result = VideoProducer().run(PEDIDO)
        from video_producer.tools.storyboard import Scene
        scenes = [Scene(**s) for s in result.storyboard]
        recalc_durations(scenes, 33.7)
        self.assertAlmostEqual(sum(s.duration for s in scenes), 33.7, places=2)


class MockComModeloDaNaia(IsolatedEnv):
    def test_mock_usa_modelo_da_naia_para_roteiro(self):
        llm = FakeLlm([_script_ok()], visuals=None)
        result = VideoProducer(llm=llm).run(PEDIDO)
        self.assertEqual(result.status, "planned", result.error)
        self.assertEqual(result.script["source"], "llm")
        self.assertEqual(result.plan["script_source"], "modelo da Naia")

    def test_desligar_modelo_por_env(self):
        import os
        os.environ["VIDEO_PRODUCER_SCRIPT_LLM"] = "false"
        result = VideoProducer(llm=FakeLlm([_script_ok()])).run(PEDIDO)
        self.assertEqual(result.script["source"], "template_mock")


class RespostaIlegivel(IsolatedEnv):
    def test_duas_respostas_ilegiveis_viram_roteiro_fixo_com_aviso(self):
        class Broken:
            def structured(self, **kw):
                raise ValueError("JSON inválido")
        result = VideoProducer(llm=Broken()).run(PEDIDO)
        self.assertEqual(result.status, "planned", result.error)
        self.assertEqual(result.script["source"], "template_mock")
        self.assertTrue(any("roteiro fixo" in w for w in result.warnings))
