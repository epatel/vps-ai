#!/usr/bin/env python3
"""Check a project's agent docs against the ai.memention.net patterns.

Usage: python3 -I check-agent-docs.py [PROJECT_ROOT]

Read-only, standard library only. Prints one line per finding and exits 1 if
any ERROR was found. Checks:
  - every @import in a CLAUDE.md resolves
  - no @import of a card or CLAUDE_full.md (an import loads eagerly)
  - every card-index link resolves, every card is indexed, entries have a trigger
  - cards do not reference other cards, and stay under ~150 lines
  - per-feature CLAUDE.md files respect the two-tier size limits
"""
import re
import sys
from pathlib import Path

SKIP_DIRS = {".git", ".worktrees", "node_modules", ".venv", "venv", "build", "dist", ".dart_tool", "target"}
IMPORT_RE = re.compile(r"(?:^|\s)@([\w./~-]+\.md)\b")
LINK_RE = re.compile(r"\]\(((?:\./)?cards/[\w.-]+\.md)\)")
INDEX_LINE_RE = re.compile(r"^\s*-\s*\[[^\]]+\]\(((?:\./)?cards/[\w.-]+\.md)\)\s*(.*)$")

findings = []


def report(level, path, msg):
    findings.append((level, path, msg))


def strip_code(text):
    """Drop fenced code blocks and inline code so examples are not checked."""
    text = re.sub(r"^```.*?^```", "", text, flags=re.S | re.M)
    return re.sub(r"`[^`\n]*`", "", text)


def walk(root, name):
    for p in root.rglob(name):
        if not SKIP_DIRS.intersection(p.relative_to(root).parts):
            yield p


def check_imports(root, md):
    for target in IMPORT_RE.findall(strip_code(md.read_text(errors="replace"))):
        resolved = Path(target).expanduser() if target.startswith("~") else md.parent / target
        rel = md.relative_to(root)
        if not resolved.exists():
            report("ERROR", rel, f"@{target} does not resolve")
        elif "cards/" in target or resolved.name == "CLAUDE_full.md":
            report("ERROR", rel, f"@{target} imports an on-demand file eagerly; use a plain path or link")


def check_cards(root):
    cards_dir = root / "cards"
    claude = root / "CLAUDE.md"
    if not cards_dir.is_dir():
        return
    index_text = ""
    for f in [claude, root / "CARDS.md"]:
        if f.exists():
            index_text += f.read_text(errors="replace") + "\n"
    indexed = set()
    for line in index_text.splitlines():
        m = INDEX_LINE_RE.match(line)
        if not m:
            continue
        link, rest = m.group(1).removeprefix("./"), m.group(2).strip()
        indexed.add(link)
        if not (root / link).exists():
            report("ERROR", "CLAUDE.md", f"index links to missing {link}")
        trigger = re.sub(r"^[—–-]+\s*", "", rest)
        if not trigger:
            report("WARN", "CLAUDE.md", f"index entry for {link} has no trigger phrase")
        elif len(trigger.split()) < 3:
            report("WARN", "CLAUDE.md", f"trigger for {link} is very short ({trigger!r}); name the situation, not the topic")
    names = {p.stem for p in cards_dir.glob("*.md")}
    for card in sorted(cards_dir.glob("*.md")):
        rel = card.relative_to(root)
        link = f"cards/{card.name}"
        if link not in indexed:
            report("WARN", rel, "card is not in the CLAUDE.md index")
        text = card.read_text(errors="replace")
        lines = text.count("\n") + 1
        if lines > 150:
            report("WARN", rel, f"{lines} lines (>150); split by sub-trigger")
        prose = strip_code(text)
        for other in LINK_RE.findall(prose) + re.findall(r"\]\(([\w.-]+\.md)\)", prose):
            if Path(other).stem in names and Path(other).stem != card.stem:
                report("ERROR", rel, f"references another card ({other}); cards must be self-contained")


def check_feature_docs(root):
    for md in walk(root, "CLAUDE.md"):
        if md.parent == root:
            continue
        rel = md.relative_to(root)
        lines = md.read_text(errors="replace").count("\n") + 1
        if (md.parent / "CLAUDE_full.md").exists():
            if lines > 20:
                report("WARN", rel, f"slim tier is {lines} lines (aim for ~15)")
        elif lines > 40:
            report("WARN", rel, f"{lines} lines with no CLAUDE_full.md; consider the two-tier split")


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    if not (root / "CLAUDE.md").exists():
        report("WARN", ".", "no CLAUDE.md at project root")
    for md in list(walk(root, "CLAUDE.md")) + list(walk(root, "CLAUDE_full.md")):
        check_imports(root, md)
    check_cards(root)
    check_feature_docs(root)
    for level, path, msg in findings:
        print(f"{level:5} {path}: {msg}")
    errors = sum(1 for f in findings if f[0] == "ERROR")
    print(f"{errors} error(s), {len(findings) - errors} warning(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
