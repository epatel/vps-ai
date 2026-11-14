#!/usr/bin/env python3
"""Check a project's agent docs against the ai.memention.net patterns.

Usage: python3 -I check-agent-docs.py [PROJECT_ROOT]

Read-only, standard library only. Prints one line per finding and exits 1 if
any ERROR was found. Checks:
  - every @import in a CLAUDE.md, CLAUDE_full.md or AGENTS.md resolves
  - no @import of a card or CLAUDE_full.md (an import loads eagerly)
  - every card-index link (in CLAUDE.md, AGENTS.md or CARDS.md) resolves, every
    card is indexed, entries have a trigger
  - cards do not reference other cards, and stay under ~150 lines
  - per-feature CLAUDE.md files respect the two-tier size limits
  - .claude/agent-setup.json (the setup record), if present, is well-formed,
    including its optional "tools" entries
Needs Python 3.9+.
"""
import hashlib
import json
import re
import sys
from pathlib import Path

SKIP_DIRS = {".git", ".worktrees", "node_modules", ".venv", "venv", "build", "dist", ".dart_tool", "target"}
IMPORT_RE = re.compile(r"(?:^|\s)@([\w./~-]+\.md)\b")
LINK_RE = re.compile(r"\]\(((?:\./)?cards/[\w.-]+\.md)\)")
INDEX_LINE_RE = re.compile(r"^\s*[-*]\s*\[[^\]]+\]\(((?:\./)?cards/[\w.-]+\.md)\)\s*(.*)$")
INSTRUCTION_FILES = ("CLAUDE.md", "CLAUDE_full.md", "AGENTS.md")

findings = []


def report(level, path, msg):
    findings.append((level, path, msg))


def strip_fences(text):
    """Drop fenced code blocks (``` or ~~~) so examples are not checked."""
    return re.sub(r"^[ \t]*(```|~~~).*?^[ \t]*\1", "", text, flags=re.S | re.M)


def strip_code(text):
    """Drop fenced code blocks and inline code so examples are not checked."""
    return re.sub(r"`[^`\n]*`", "", strip_fences(text))


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


INDEX_FILES = ("CLAUDE.md", "AGENTS.md", "CARDS.md")  # any of them may hold the card index


def check_index_entry(root, where, link, rest):
    if not (root / link).exists():
        report("ERROR", where, f"index links to missing {link}")
    trigger = re.sub(r"^[—–-]+\s*", "", rest)
    if not trigger:
        report("WARN", where, f"index entry for {link} has no trigger phrase")
    elif len(trigger.split()) < 3:
        report("WARN", where, f"trigger for {link} is very short ({trigger!r}); name the situation, not the topic")


def check_index(root):
    """Check each card-index entry; return the set of linked card paths."""
    indexed = set()
    for name in INDEX_FILES:
        f = root / name
        if not f.exists():
            continue
        text = strip_fences(f.read_text(errors="replace"))
        for m in map(INDEX_LINE_RE.match, text.splitlines()):
            if m:
                link = m.group(1).removeprefix("./")
                indexed.add(link)
                check_index_entry(root, name, link, m.group(2).strip())
    return indexed


def check_card(root, card, indexed, names):
    rel = card.relative_to(root)
    if f"cards/{card.name}" not in indexed:
        report("WARN", rel, "card is not in the index (CLAUDE.md, AGENTS.md or CARDS.md)")
    text = card.read_text(errors="replace")
    lines = text.count("\n") + 1
    if lines > 150:
        report("WARN", rel, f"{lines} lines (>150); split by sub-trigger")
    prose = strip_code(text)
    for other in LINK_RE.findall(prose) + re.findall(r"\]\(([\w.-]+\.md)\)", prose):
        stem = Path(other).stem
        if stem in names and stem != card.stem:
            report("ERROR", rel, f"references another card ({other}); cards must be self-contained")


def check_cards(root):
    cards_dir = root / "cards"
    if not cards_dir.is_dir():
        return
    indexed = check_index(root)
    cards = sorted(cards_dir.glob("*.md"))
    names = {p.stem for p in cards}
    for card in cards:
        check_card(root, card, indexed, names)


def check_feature_docs(root):
    for md in walk(root, "CLAUDE.md"):
        if md.parent == root or md.parent == root / ".claude":
            continue  # project-level instructions, not a per-feature doc
        rel = md.relative_to(root)
        lines = md.read_text(errors="replace").count("\n") + 1
        if (md.parent / "CLAUDE_full.md").exists():
            if lines > 20:
                report("WARN", rel, f"slim tier is {lines} lines (aim for ~15)")
        elif lines > 40:
            report("WARN", rel, f"{lines} lines with no CLAUDE_full.md; consider the two-tier split")


VERSION_RE = re.compile(r"^\d{4}-\d{2}-\d{2}(\.\d+)?$")
PATTERN_RE = re.compile(r"^((skill:)?[a-z0-9][a-z0-9-]*|plugin:[a-z0-9][a-z0-9-]*@[a-z0-9][a-z0-9-]*)$")


def load_record(path, rel):
    """The parsed setup record, or None after reporting why it can't be checked."""
    if not path.exists():
        report("WARN", rel, "no setup record; the next setup run cannot refresh, only update")
        return None
    try:
        rec = json.loads(path.read_text())
    except (ValueError, UnicodeDecodeError) as e:
        report("ERROR", rel, f"not valid JSON ({e})")
        return None
    if not isinstance(rec, dict):
        report("ERROR", rel, "must be a JSON object")
        return None
    return rec


def is_pattern_list(ids):
    return isinstance(ids, list) and all(isinstance(i, str) and PATTERN_RE.match(i) for i in ids)


def check_pattern_lists(rec, rel):
    """Validate applied/declined; return {pattern ID: list it is in}."""
    seen = {}
    for key in ("applied", "declined"):
        ids = rec.get(key, [])
        if not is_pattern_list(ids):
            report("ERROR", rel, f"{key!r} must be a list of pattern IDs like 'context-cards', 'skill:name' or 'plugin:name@marketplace'")
            continue
        for i in ids:
            if i in seen:
                report("ERROR", rel, f"{i!r} is in both {seen[i]!r} and {key!r}")
            seen[i] = key
    return seen


def is_copied_entry(entry):
    return (isinstance(entry, dict) and isinstance(entry.get("pattern"), str)
            and re.fullmatch(r"[0-9a-f]{64}", str(entry.get("sha256", ""))) is not None)


def check_copied_entry(root, rel, p, entry):
    if not is_copied_entry(entry):
        report("ERROR", rel, f"copied entry for {p} must be {{\"pattern\": ID, \"sha256\": 64 hex chars}}")
    elif not (root / p).exists():
        report("ERROR", rel, f"copied file {p} does not exist")
    elif hashlib.sha256((root / p).read_bytes()).hexdigest() != entry["sha256"]:
        report("WARN", rel, f"{p} was edited since it was copied; a refresh will propose a merge, not a replace")


def check_copied(root, rec, rel):
    copied = rec.get("copied", {})
    if not isinstance(copied, dict):
        report("ERROR", rel, "'copied' must map project paths to {pattern, sha256}")
        return
    for p, entry in copied.items():
        check_copied_entry(root, rel, p, entry)


def check_applied_skills(root, seen, rel):
    applied = (i for i, key in seen.items() if key == "applied" and i.startswith("skill:"))
    for i in applied:
        name = i.removeprefix("skill:")
        if not (root / ".claude" / "skills" / name / "SKILL.md").exists():
            report("ERROR", rel, f"{i} is applied but .claude/skills/{name}/SKILL.md is missing")


TOOL_FORMS = {"existing", "project-venv", "tool-venv", "user", "system"}
TOOL_KEYS = {"pattern", "min", "pin", "form"}
MIN_RE = re.compile(r"^\d+(\.\d+)*$")


def tool_entry_errors(entry):
    """Why a tools entry is malformed (empty list if it is well-formed)."""
    if not isinstance(entry, dict):
        return ["must be an object {pattern, min, pin, form}"]
    errors = []
    extra = sorted(set(entry) - TOOL_KEYS)
    if extra:
        errors.append(f"unknown key(s) {', '.join(extra)}; record the form, never machine paths or found versions")
    if not (isinstance(entry.get("pattern"), str) and PATTERN_RE.match(entry["pattern"])):
        errors.append("'pattern' must be a pattern ID")
    if entry.get("form") not in TOOL_FORMS:
        errors.append(f"'form' must be one of {', '.join(sorted(TOOL_FORMS))}")
    if "min" in entry and not (isinstance(entry["min"], str) and MIN_RE.match(entry["min"])):
        errors.append("'min' must be a dotted version like '3.11'")
    if "pin" in entry and not (isinstance(entry["pin"], str) and entry["pin"]):
        errors.append("'pin' must be a non-empty string")
    return errors


def check_tools(rec, seen, rel):
    tools = rec.get("tools", {})
    if not isinstance(tools, dict):
        report("ERROR", rel, "'tools' must map tool names to {pattern, min, pin, form}")
        return
    for name, entry in tools.items():
        errors = tool_entry_errors(entry)
        for e in errors:
            report("ERROR", rel, f"tools entry {name!r}: {e}")
        if errors:
            continue
        if seen.get(entry["pattern"]) != "applied":
            report("WARN", rel, f"tools entry {name!r} names {entry['pattern']!r}, which is not applied; remove the entry")


def check_record(root):
    path = root / ".claude" / "agent-setup.json"
    rel = path.relative_to(root)
    rec = load_record(path, rel)
    if rec is None:
        return
    for key in ("version", "updated"):
        if not VERSION_RE.match(str(rec.get(key, ""))):
            report("ERROR", rel, f"{key!r} must be YYYY-MM-DD (optionally .N), got {rec.get(key)!r}")
    seen = check_pattern_lists(rec, rel)
    check_copied(root, rec, rel)
    check_applied_skills(root, seen, rel)
    check_tools(rec, seen, rel)


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    if not (root / "CLAUDE.md").exists() and not (root / "AGENTS.md").exists():
        report("WARN", ".", "no CLAUDE.md or AGENTS.md at project root")
    for name in INSTRUCTION_FILES:
        for md in walk(root, name):
            check_imports(root, md)
    check_cards(root)
    check_feature_docs(root)
    check_record(root)
    for level, path, msg in findings:
        print(f"{level:5} {path}: {msg}")
    errors = sum(1 for f in findings if f[0] == "ERROR")
    print(f"{errors} error(s), {len(findings) - errors} warning(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
