# Hooks Over Prose

## Problem

Instruction files fill up with rules phrased as "always…", "never…", "before every…": *never edit files under `generated/`*, *always run the formatter after editing*, *never force-push*. Written in CLAUDE.md, each one is a request. It costs context every session, competes with everything else the agent is holding, and is the first thing lost when a long session is summarized. When the rule is broken, nothing notices.

## Solution

If a rule can be checked by a program at the moment a tool is called, enforce it in `.claude/settings.json` instead of asking for it in prose. The harness applies it deterministically, on every call, in every session and subagent, and it costs no context until it fires.

| Rule shape | Mechanism |
|---|---|
| "Never run X" / "never touch path P" | `permissions.deny` rule |
| "Ask before X" | `permissions.ask` rule |
| "After editing, always format / lint / regenerate" | `PostToolUse` hook on `Edit\|Write` |
| "Never do X when condition C" (needs logic), or "never run X" when X has several spellings | `PreToolUse` hook that exits `2` to block, with the reason on stderr |
| "Don't finish until tests pass" | `Stop` hook that runs the fast test suite and exits `2` on failure, and lets Claude stop when `stop_hook_active` is true |

A Bash permission rule matches the command text as written: `*` (or a trailing `:*`) is a wildcard, and nothing more. `Bash(git push --force *)` blocks `git push --force origin`, but not `git push -f`, `git push origin main --force` or `git push origin +main`. Use a deny rule for a command with one spelling. When a rule must hold however the command is written, use a `PreToolUse` hook that parses it.

Keep in prose only what needs judgment: naming conventions, design preferences, when to ask the user. Leave a one-line note in CLAUDE.md for each enforced rule ("edits under `generated/` are blocked — change the generator instead") so the agent understands a block and knows the intended route, instead of trying workarounds.

## Example

`.claude/settings.json` (committed, so it applies to everyone working in the repo):

```json
{
  "permissions": {
    "deny": [
      "Edit(src/generated/**)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/no-force-push.sh" }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/tests-before-stop.sh" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/format.sh" }
        ]
      }
    ]
  }
}
```

`.claude/hooks/format.sh` (executable). The hook receives the tool call as JSON on stdin:

```bash
#!/bin/sh
command -v jq >/dev/null || exit 0      # tool missing: do nothing, never block
f=$(jq -r '.tool_input.file_path // empty')
case "$f" in
  *.py)       [ -x .venv/bin/ruff ] && .venv/bin/ruff format -q "$f" ;;
  *.ts|*.tsx) npx --no-install prettier --write --log-level warn "$f" ;;
esac
exit 0
```

## Requires

What this pattern needs depends on which rules the user approves. Permission rules need nothing. A hook script needs whatever it calls; in the example above that is `jq`, `ruff` and `prettier`. For each approved hook, list the tools it calls and get them through the setup's *Installing tools* steps (`https://ai.memention.net/setup`, Step 3): detect, check the version, ask whether and where, install only after a yes. Prefer project-local copies (`.venv/`, `devDependencies`) over system-wide ones. A hook can also use a tool the project already has: `python3 -I -c 'import json,sys; …'` replaces `jq` without adding anything.

`.claude/hooks/no-force-push.sh` blocks a force push however it is written: `-f`, `-uf`, `--force` anywhere, `--force-with-lease`, or a `+refspec`. It skips the push inside `echo git push --force`:

```bash
#!/bin/sh
command -v python3 >/dev/null || exit 0      # tool missing: do nothing, never block
exec python3 -I -c '
import json, re, shlex, sys
cmd = json.load(sys.stdin).get("tool_input", {}).get("command", "")
def forced(args):
    return any(a == "--force" or a.startswith(("--force-", "+"))
               or re.fullmatch(r"-[A-Za-z]*f[A-Za-z]*", a) for a in args)
for part in re.split(r"&&|\|\||[;|\n]", cmd):
    try:
        words = shlex.split(part)
    except ValueError:
        words = part.split()
    while words and (words[0] in ("sudo", "env", "command") or re.fullmatch(r"\w+=.*", words[0])):
        words = words[1:]
    if words[:1] == ["git"] and "push" in words and forced(words[words.index("push") + 1:]):
        print("Force push is blocked in this project. Push without --force, or ask the user.", file=sys.stderr)
        sys.exit(2)
'
```

`.claude/hooks/tests-before-stop.sh` gives Claude one more turn when the fast tests fail. `stop_hook_active` is `true` when Claude is already continuing because of a stop hook; exiting `0` then keeps a test that cannot pass from looping:

```bash
#!/bin/sh
input=$(cat)
printf '%s' "$input" | grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true' && exit 0
[ -x .venv/bin/pytest ] || exit 0          # no test runner: do nothing
out=$(.venv/bin/pytest -q -x 2>&1) && exit 0
printf 'Tests fail. Fix them, or say why they are expected to fail:\n%s\n' "$(printf '%s\n' "$out" | tail -20)" >&2
exit 2
```

A blocking hook writes its reason to stderr and exits `2`; Claude sees the message and adjusts. Any other non-zero exit is reported to the user but does not block.

## Rules of thumb

- **Mechanical → hook; judgment → prose.** If you can't write the check as a short script, it stays in CLAUDE.md.
- **Fast hooks only.** A hook runs on every matching call; keep `PostToolUse` under a second or two. Put slow checks (full test suite) in a `Stop` hook or CI.
- **Fail open on missing tools.** A formatter hook that errors when the formatter isn't installed blocks every edit on a fresh machine. Check each tool first (`command -v jq >/dev/null || exit 0`, `[ -x .venv/bin/ruff ]`) and exit `0` when it is missing. If the user skipped installing a tool, tell them which hook does nothing until it is installed.
- **Project hooks in `.claude/settings.json`, personal ones in `.claude/settings.local.json`** (gitignored). Never put machine-specific paths in the committed file.
- **Path rules: use `Edit(...)`, and no `../`.** `Edit(...)` rules cover every file-editing tool (a `Write(...)` path rule is accepted but never checked). Path anchors are `//abs`, `~/home`, `/` (relative to the project) and plain/`./` (relative to the current directory); `../` is not a documented form. To protect a sibling directory portably, use a `PreToolUse` hook that resolves the path against `$CLAUDE_PROJECT_DIR` and exits `2`.
- **Settings reload live.** Most permission and hook edits apply to the running session, so you can test a new rule immediately.
- **Verify by triggering it.** After adding a rule, make the agent attempt the forbidden action once and confirm it is blocked with the expected message.

## When to apply

Any project whose CLAUDE.md contains "always/never/before every" rules that a script could check. Audit the instruction files, move each mechanical rule into settings, and replace its paragraph with the one-line note.
