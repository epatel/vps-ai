---
name: makefile-actions
description: Create or extend a project Makefile that acts as a single consolidated action script — a numbered menu plus short targets for the project's real commands (start, test, build, deploy, setup). Use when the user wants a Makefile, a "make deploy"/"make start" entry point, a task runner, or one place to discover and run a project's common actions.
---

# Makefile Actions

Generate a Makefile that consolidates a project's real commands behind short, discoverable `make` targets. The Makefile is the menu of what you can do in this repo.

## When to use

- "add a Makefile", "make deploy", "make start", "give me a task runner", "one command to run X".
- A project has scripts (`run.sh`, `deploy.sh`, npm/pytest invocations) scattered around and wants one entry point.

## How to build it

1. Discover the real commands first — look at `package.json` scripts, `*.sh` files, CI config, README. Don't invent targets; wrap what already exists.
2. Write targets that call those commands. Pass-through args via `make target VAR=value` and `$(VAR)`.
3. Keep the structure below.

## Template

```makefile
info: menu select

menu:
	echo "1 make start                - start the app"
	echo "2 make test                 - run all tests"
	echo "3 make build                - build for production"
	echo "4 make deploy               - deploy"
	echo "5 make setup                - install deps"
	echo "6 make update_phony         - update .PHONY in Makefile"

select:
	read -p ">>> " P ; make menu | grep "^$$P " | cut -d ' ' -f2-3 | bash

.SILENT:

.PHONY: info menu select start test build deploy setup update_phony

start:
	./run.sh

test:
	./run-tests.sh

build:
	echo "build command here"

deploy:
	echo "deploy command here"

setup:
	echo "install deps here"

update_phony:
	echo "##### Updating .PHONY targets #####"
	targets=$$(grep -E '^[a-zA-Z_][a-zA-Z0-9_-]*:' Makefile | grep -v '=' | cut -d: -f1 | tr '\n' ' '); \
	sed -i.bak "s/^\.PHONY:.*/.PHONY: $$targets/" Makefile && \
	echo "Updated .PHONY: $$targets" && \
	rm -f Makefile.bak
```

## Conventions

- Recipe lines are TAB-indented, never spaces.
- `.SILENT:` so `echo` lines print clean (no command echo).
- `make` with no target runs `info`: prints the numbered menu, then prompts for a number and runs it.
- Numbered `menu` lines so `select` can map a number → command via `grep "^N "`.
- Keep `.PHONY` listing every target; run `make update_phony` after adding targets.
- Pass-through args: `make start_at TARGET=path` → recipe uses `$(TARGET)`.
