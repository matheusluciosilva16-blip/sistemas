import os
import sys
import tempfile
import unittest
from pathlib import Path

PLUGINS_DIR = Path(__file__).resolve().parents[2]
if str(PLUGINS_DIR) not in sys.path:
    sys.path.insert(0, str(PLUGINS_DIR))


class IsolatedEnv(unittest.TestCase):
    """Cada teste roda com pasta de saída própria e sem chaves reais."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self._saved = dict(os.environ)
        for k in ("GEMINI_API_KEY", "GOOGLE_API_KEY", "ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID",
                  "VIDEO_PRODUCER_MOCK", "MAX_VIDEO_DURATION", "DEFAULT_VIDEO_DURATION"):
            os.environ.pop(k, None)
        os.environ["VIDEO_OUTPUT_DIR"] = self._tmp.name
        self.data_dir = Path(self._tmp.name)

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self._saved)
        self._tmp.cleanup()
