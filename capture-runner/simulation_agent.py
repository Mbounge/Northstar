#!/usr/bin/env python3
"""Run the capture-grounded simulation agent using Northstar's shared runtime.

prepare reads existing evidence only. run defaults to a checkpointed agent file
exchange, with no paid model calls. --provider openai is an explicit opt-in.
"""
from __future__ import annotations

import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys


def command(arguments: list[str]) -> list[str]:
    root = Path(__file__).resolve().parent.parent
    node = os.environ.get("NORTHSTAR_NODE") or shutil.which("node")
    if not node:
        raise RuntimeError("Install Node and Northstar's npm dependencies, or configure NORTHSTAR_NODE")
    return [node, "--import", "tsx", str(root / "scripts/northstar-simulation-agent.ts"), *arguments]


def main() -> int:
    try:
        # A separate process group gives this launcher explicit ownership of
        # cancellation, including SIGTERM when called by another agent.
        child = subprocess.Popen(command(sys.argv[1:]),
                                 cwd=Path(__file__).resolve().parent.parent,
                                 start_new_session=True)
        def forward(signum, _frame):
            if child.poll() is None:
                try:
                    os.killpg(child.pid, signum)
                except ProcessLookupError:
                    pass  # The child can finish between poll() and forwarding.
        previous = {sig: signal.signal(sig, forward)
                    for sig in (signal.SIGINT, signal.SIGTERM)}
        try:
            return child.wait()
        finally:
            for sig, handler in previous.items():
                signal.signal(sig, handler)
    except (OSError, RuntimeError) as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
