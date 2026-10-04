"""Carrega o plugin como o Hermes faz (hermes_plugins.<nome>) e usa /video."""

import asyncio
import importlib.util
import json
import sys
import types
from pathlib import Path

from video_producer.tests._base import IsolatedEnv

PLUGIN_DIR = Path(__file__).resolve().parents[1]


class FakeCtx:
    def __init__(self):
        self.commands, self.tools = {}, {}
        self.llm = object()  # sem complete_structured: simula LLM quebrado

    def register_command(self, name, handler, description="", args_hint=""):
        self.commands[name] = handler

    def register_tool(self, name, toolset, schema, handler, **kw):
        assert schema["name"] == name and toolset == "video_producer"
        self.tools[name] = handler


def load_like_hermes():
    if "hermes_plugins" not in sys.modules:
        ns = types.ModuleType("hermes_plugins")
        ns.__path__ = []
        sys.modules["hermes_plugins"] = ns
    name = "hermes_plugins.video_producer"
    spec = importlib.util.spec_from_file_location(name, PLUGIN_DIR / "__init__.py",
                                                  submodule_search_locations=[str(PLUGIN_DIR)])
    module = importlib.util.module_from_spec(spec)
    module.__package__ = name
    module.__path__ = [str(PLUGIN_DIR)]
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


class PluginLoadTest(IsolatedEnv):
    def test_registra_e_executa_video(self):
        ctx = FakeCtx()
        load_like_hermes().register(ctx)
        self.assertIn("video", ctx.commands)
        self.assertEqual(set(ctx.tools), {"video_producer", "video_estimate_cost"})

        reply = asyncio.run(ctx.commands["video"](
            "Faça um Reel de 30 segundos com Maria Gabriela explicando busca e apreensão de veículo."))
        self.assertIn("🎬 Job video_", reply)
        self.assertIn("Fase A", reply)

        help_text = asyncio.run(ctx.commands["video"](""))
        self.assertIn("Uso: /video", help_text)

        cost = json.loads(ctx.tools["video_estimate_cost"]({"duration_seconds": 40}))
        self.assertGreater(cost["total_usd"], 0)

        tool_out = json.loads(ctx.tools["video_producer"]({"request": "vídeo sobre conta bloqueada"}))
        self.assertEqual(tool_out["status"], "planned")
