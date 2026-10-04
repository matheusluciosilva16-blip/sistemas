#!/usr/bin/env python3
"""Roda o Video Producer fora do Telegram, para teste e depuração.

    python3 scripts/vp_local.py "/video Reel de 30 segundos sobre busca e apreensão"

Sem o Hermes não há LLM: o roteiro sai do modelo fixo, como no modo mock.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))  # pasta naia/plugins

from video_producer import format_summary  # noqa: E402
from video_producer.agents.video_producer import run  # noqa: E402

if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    result = run(" ".join(sys.argv[1:]))
    print(format_summary(result))
    print("\n--- result.json ---")
    print(json.dumps({k: result[k] for k in ("status", "job_id", "log_file", "error")}, ensure_ascii=False, indent=2))
    sys.exit(0 if result["status"] != "failed" else 1)
