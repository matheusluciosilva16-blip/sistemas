import json
import logging
import os
from pathlib import Path

from video_producer.tests._base import IsolatedEnv

from video_producer.core.config import load_settings
from video_producer.core.cost import estimate_cost
from video_producer.core.ethics import violations
from video_producer.core.jobs import Job, new_job_id, redact
from video_producer.core.safety import safe_join, slugify


class SafetyTest(IsolatedEnv):
    def test_slugify(self):
        name = slugify("../../Busca & Apreensão!.mp4")
        self.assertNotIn("/", name)
        self.assertFalse(name.startswith("."))
        self.assertTrue(name.startswith("busca_apreensao"))

    def test_path_traversal(self):
        with self.assertRaises(ValueError):
            safe_join(self.data_dir, "..", "etc", "passwd")
        self.assertEqual(safe_join(self.data_dir, "a", "b.txt"), (self.data_dir / "a" / "b.txt").resolve())


class JobTest(IsolatedEnv):
    def test_job_id_formato(self):
        self.assertRegex(new_job_id(), r"^video_\d{8}_\d{6}_[0-9a-f]{4}$")

    def test_pastas_e_log_sem_segredo(self):
        os.environ["GEMINI_API_KEY"] = "AQ.segredo_de_teste_1234567890abcdef"
        job = Job.create(load_settings())
        job.logger.info("chamando com chave %s e url https://x/?key=%s", os.environ["GEMINI_API_KEY"], "AIzaFAKEFAKEFAKEFAKEFAKE1234")
        try:
            raise RuntimeError("falha com x-goog-api-key: AQ.outro_segredo_abcdefghijklmnop")
        except RuntimeError:
            job.logger.error("erro", exc_info=True)
        job.close()
        self.assertTrue(job.temp_dir.is_dir() and job.output_dir.is_dir())
        log = job.log_path.read_text(encoding="utf-8")
        self.assertNotIn("segredo_de_teste", log)
        self.assertNotIn("outro_segredo", log)
        self.assertNotIn("AIzaFAKE", log)
        self.assertIn("RuntimeError", log)  # stack trace preservado

    def test_redact_padroes(self):
        self.assertNotIn("sk_", redact("xi-api-key: sk_abcdefghijklmnopqrstuvwx"))
        self.assertEqual(redact("token 123456789:AAEabcdefghijklmnopqrstuvwxyz0123456"), "token ***")


class SettingsTest(IsolatedEnv):
    def test_mock_padrao_e_repr_sem_chave(self):
        os.environ["ELEVENLABS_API_KEY"] = "sk_chave_super_secreta_123"
        s = load_settings()
        self.assertTrue(s.mock)
        self.assertNotIn("secreta", repr(s))
        self.assertEqual(s.public_dict()["elevenlabs_api_key"], "configurada")


class CostTest(IsolatedEnv):
    def test_estimativa_veo_fast_720p(self):
        est = estimate_cost(duration_s=40, n_scenes=7, veo_model="veo-3.1-fast-generate-preview",
                            veo_resolution="720p", veo_seconds=42, voice_chars=600)
        self.assertAlmostEqual(est.breakdown["veo_usd"], 4.2)
        self.assertEqual(est.total_usd, 4.2)

    def test_override_por_env(self):
        os.environ["VEO_PRICE_PER_SECOND"] = "0.5"
        est = estimate_cost(duration_s=10, n_scenes=2, veo_model="qualquer", voice_chars=0)
        self.assertEqual(est.total_usd, 5.0)


class EthicsTest(IsolatedEnv):
    def test_detecta_promessa_e_preco(self):
        v = violations("Garantimos o resultado! Consulta grátis.")
        self.assertIn("promessa de resultado", v)
        self.assertIn("preço ou gratuidade", v)

    def test_texto_informativo_passa(self):
        self.assertEqual(violations("Guarde os documentos e procure orientação jurídica de confiança."), [])
