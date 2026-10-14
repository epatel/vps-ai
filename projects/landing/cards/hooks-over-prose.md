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
| "Never do X when condition C" (needs logic) | `PreToolUse` hook that exits `2` to block, with the reason on stderr |
| "Don't finish until tests pass" | `Stop` hook that runs the fast test suite and exits `2` on failure |

Keep in prose only what needs judgment: naming conventions, design preferences, when to ask the user. Leave a one-line note in CLAUDE.md for each enforced rule ("edits under `generated/` are blocked — change the generator instead") so the agent understands a block and knows the intended route, instead of trying workarounds.

## Example

`.claude/settings.json` (committed, so it applies to everyone working in the repo):

```json
{
  "permissions": {
    "deny": [
      "Edit(src/generated/**)",
      "Bash(git push --force:*)"
    ]
  },
  "hooks": {
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
f=$(jq -r '.tool_input.file_path // empty')
case "$f" in
  *.py)       .venv/bin/ruff format -q "$f" ;;
  *.ts|*.tsx) npx --no-install prettier --write --log-level warn "$f" ;;
esac
exit 0
```

A blocking hook writes its reason to stderr and exits `2`; Claude sees the message and adjusts. Any other non-zero exit is reported to the user but does not block.

## Rules of thumb

- **Mechanical → hook; judgment → prose.** If you can't write the check as a short script, it stays in CLAUDE.md.
- **Fast hooks only.** A hook runs on every matching call; keep `PostToolUse` under a second or two. Put slow checks (full test suite) in a `Stop` hook or CI.
- **Fail open on missing tools.** A formatter hook that errors when the formatter isn't installed blocks every edit on a fresh machine; exit `0` in that case.
- **Project hooks in `.claude/settings.json`, personal ones in `.claude/settings.local.json`** (gitignored). Never put machine-specific paths in the committed file.
- **Verify by triggering it.** After adding a rule, make the agent attempt the forbidden action once and confirm it is blocked with the expected message.

## When to apply

Any project whose CLAUDE.md contains "always/never/before every" rules that a script could check. Audit the instruction files, move each mechanical rule into settings, and replace its paragraph with the one-line note.
