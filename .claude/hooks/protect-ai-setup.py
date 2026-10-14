#!/usr/bin/env python3
"""PreToolUse hook: block edits to files owned by the ai-setup repo.

The owned files are the ones listed in projects/landing/ai-setup.manifest.
Exits 2 (block) with the reason on stderr; anything unexpected fails open.
"""
import json
import os
import sys
from pathlib import Path

try:
    path = json.load(sys.stdin).get("tool_input", {}).get("file_path") or ""
    root = Path(os.environ.get("CLAUDE_PROJECT_DIR", ".")).resolve()
    landing = root / "projects" / "landing"
    manifest = landing / "ai-setup.manifest"
    owned = {
        (landing / line.split()[1]).resolve()
        for line in manifest.read_text().splitlines()
        if line.strip() and not line.startswith("#") and len(line.split()) == 2
    }
    if path and Path(path).resolve() in owned:
        print(
            f"{path} is owned by the ai-setup repo (see projects/landing/ai-setup.manifest). "
            "Edit it in ~/Development/claude/ai-setup (site/) and run `make sync` there.",
            file=sys.stderr,
        )
        sys.exit(2)
except Exception:
    pass
sys.exit(0)
