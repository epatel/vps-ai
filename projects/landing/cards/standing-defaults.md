# Standing Defaults

## Problem

Agents (and people) reach for the shortest path that makes the current change
work: `pip install` into the system Python because the venv is one extra step,
a hand-edited schema because the table only has three columns today. Both
choices are invisible while the project is small and expensive once it is not —
the machine's Python is polluted and unreproducible, and the database has no
way to move from the schema it has to the schema the code expects.

These are not architectural decisions. They are defaults that should never need
re-deciding per project.

## Recommendations

### Python: always use a virtual environment

Never install project dependencies into the system or user Python. Create a
venv at the project root and use it for every command.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

- Commit `requirements.txt` (or `pyproject.toml`); gitignore `.venv/`.
- In scripts and systemd units, call the interpreter by path
  (`.venv/bin/python`) rather than relying on an activated shell.
- If a tool must be available system-wide, that is a deliberate,
  documented exception — not the default.

Why: dependency sets differ per project and drift over time. A venv makes the
set explicit, reproducible on another machine, and disposable when it breaks.

### Databases: always ship a migration path

The moment a project stores data in a schema, it needs a defined way to get
from any older schema to the current one. Add that path with the first table,
not with the first painful upgrade.

Prefer a dependency-free approach:

- Keep a `schema_version` (a one-row table, or SQLite's `PRAGMA user_version`).
- Keep migrations as ordered, immutable, forward-only steps — numbered `.sql`
  files or a list of functions, each moving version N to N+1.
- On startup, read the current version and apply every pending step in order
  inside a transaction. A fresh database starts at version 0 and runs all of
  them, so there is one code path, not two.
- Never edit a migration that has already run anywhere; add a new one.

```python
MIGRATIONS = [
    "CREATE TABLE note (id INTEGER PRIMARY KEY, body TEXT NOT NULL)",
    "ALTER TABLE note ADD COLUMN created_at TEXT",
]

def migrate(conn):
    version = conn.execute("PRAGMA user_version").fetchone()[0]
    if version > len(MIGRATIONS):
        raise RuntimeError(
            f"database schema is version {version}, but this code knows only "
            f"{len(MIGRATIONS)}: it was written by newer code"
        )
    for i, sql in enumerate(MIGRATIONS[version:], start=version):
        try:
            conn.executescript(
                f"BEGIN; {sql}; PRAGMA user_version = {i + 1}; COMMIT;"
            )
        except Exception:
            if conn.in_transaction:
                conn.rollback()
            raise
```

The explicit `BEGIN … COMMIT` is load-bearing: Python's `executescript()`
commits any open transaction before it runs and ignores `with conn:`, so
without it a migration that fails halfway leaves the schema partly changed and
the version un-bumped — and every later run fails on the half-applied step.
Here the schema change and the version bump commit together or not at all.

Two consequences of that wrapping:

- **A migration must not contain its own transaction control.** A `BEGIN`, `COMMIT` or `ROLLBACK` inside a step breaks the all-or-nothing guarantee.
- **Some statements cannot run inside a transaction:** `VACUUM`, and `PRAGMA foreign_keys` or `PRAGMA journal_mode`, which are silently ignored there. Run those outside `migrate()`, for example once at connect time, not as a migration step.

The version check at the top refuses to start when the database is newer than the code, for example after rolling back a deploy. Without it, old code would silently run against a schema it does not know.

Reach for a migration framework (Alembic, Flyway, Prisma Migrate) only when the
project already carries that dependency or the schema genuinely outgrows a
linear list. A twenty-line runner has no install step, no version conflicts,
and no lock-in — which is exactly what a small service wants.

Why: without a migration path, the only ways to change a schema are to lose the
data or to hand-edit production. Both are discovered at the worst moment.

## When to apply

Drop this card into a project's `cards/` directory and index it from
`CLAUDE.md` whenever the project runs Python or persists data. It is a
standing default, not a task — no code changes follow from adding it beyond
bringing an existing project in line.
