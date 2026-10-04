from video_producer.tests._base import IsolatedEnv

from video_producer.core.config import load_settings
from video_producer.core.errors import InvalidRequest
from video_producer.core.parser import parse_request


class ParserTest(IsolatedEnv):
    def parse(self, text):
        return parse_request(text, load_settings())

    def test_linguagem_natural(self):
        r = self.parse("/video Faça um Reel de 40 segundos com a personagem Maria Gabriela explicando "
                       "o que fazer quando uma pessoa recebe uma busca e apreensão de veículo.")
        self.assertEqual(r.duration, 40)
        self.assertEqual(r.character, "maria_gabriela")
        self.assertEqual(r.platform, "instagram")
        self.assertEqual(r.aspect_ratio, "9:16")
        self.assertIn("busca e apreensão de veículo", r.topic)
        self.assertNotIn("Maria", r.topic)
        self.assertNotIn("Reel", r.topic)
        self.assertTrue(r.topic.startswith("o que fazer"))
        self.assertEqual(r.title, "Busca e apreensão de veículo")

    def test_parametros_explicitos(self):
        r = self.parse('/video personagem=Maria_Gabriela duração=45 tema="conta bloqueada judicialmente"')
        self.assertEqual((r.character, r.duration, r.topic), ("maria_gabriela", 45, "conta bloqueada judicialmente"))

    def test_padroes(self):
        r = self.parse("/video Faça um Reel jurídico sobre negativação indevida.")
        self.assertEqual(r.duration, 40)
        self.assertEqual(r.character, "maria_gabriela")
        self.assertEqual(r.topic, "negativação indevida")

    def test_minutos_e_limite(self):
        r = self.parse("/video vídeo de 2 minutos sobre pensão alimentícia")
        self.assertEqual(r.duration, 90)
        self.assertTrue(r.warnings)

    def test_plataforma_e_formato(self):
        r = self.parse("/video short horizontal sobre inventário")
        self.assertEqual((r.platform, r.aspect_ratio), ("youtube_shorts", "16:9"))

    def test_pedido_vazio(self):
        with self.assertRaises(InvalidRequest):
            self.parse("/video")

    def test_texto_com_comando_shell_nao_executa(self):
        r = self.parse('/video tema="$(rm -rf /); `id`" duração=30')
        self.assertEqual(r.topic, "$(rm -rf /); `id`")  # só texto; nada é executado
