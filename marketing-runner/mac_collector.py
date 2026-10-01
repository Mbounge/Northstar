"""Run the marketing collector on this Mac with its existing Chrome session.

Secrets stay in the ignored web environment file. The Chrome profile itself is
never copied into this process's data directory or sent to the capture host.
"""

from __future__ import annotations

import os
import runpy
from pathlib import Path

from dotenv import dotenv_values


def configure() -> None:
    runner = Path(__file__).resolve().parent
    project = runner.parent
    secrets = dotenv_values(project / ".env.development.local")
    for name in ("NORTHSTAR_MARKETING_RUNNER_TOKEN", "NORTHSTAR_MARKETING_PUBLISH_TOKEN"):
        value = secrets.get(name)
        if not value:
            raise RuntimeError(f"{name} is missing from the local ignored environment file")
        os.environ[name] = value
    os.environ.setdefault("NORTHSTAR_MARKETING_PUBLISH_URL", "https://usenorthstar.ai/api/internal/marketing-publish")
    os.environ.setdefault("NORTHSTAR_MARKETING_DATA_ROOT", str(project.parent.parent / "outputs" / "marketing-collector"))
    os.environ.setdefault("NORTHSTAR_MARKETING_BIND", "127.0.0.1")
    os.environ.setdefault("NORTHSTAR_MARKETING_PORT", "8790")
    os.environ.setdefault("NORTHSTAR_MARKETING_CHROME_DATA_DIR", str(Path.home() / "Library/Application Support/Google/Chrome"))
    os.environ["NORTHSTAR_MARKETING_BROWSER_MODE"] = "shared_cdp"


if __name__ == "__main__":
    configure()
    runpy.run_path(str(Path(__file__).with_name("service.py")), run_name="__main__")
