SHELL := bash

# The server updates itself: the webhook pulls `main` on every push/merge,
# hooks/post-merge restarts changed services, and GitHub Actions builds Flutter
# web apps. These targets cover what that does not: the parts that come from
# other repos (ai-setup, agent-skills, ai-health) and checking the server caught up.
VPS     ?= epatel@ai.memention.net
DIR     ?= vps-ai
WAIT    ?= 60
AISETUP ?= ../ai-setup
SSH     := ssh -o BatchMode=yes -o ConnectTimeout=5 $(VPS)
EXT     := VPS="$(VPS)" DIR="$(DIR)" AISETUP="$(AISETUP)" bash externals.sh

info: menu select

menu:
	echo "1 make externals            - what is out of date in ai-setup, agent-skills, ai-health"
	echo "2 make setup_publish        - publish ai-setup's site/ into main (MSG=...); the push deploys it"
	echo "3 make aihealth_update      - re-pin aihealth and reinstall it locally + on the server (V=vX.Y.Z)"
	echo "4 make check                - aihealth delta, agent-docs check, script syntax"
	echo "5 make deploy               - check, push main, confirm the server pulled, post-deploy steps"
	echo "6 make server_status        - server HEAD, drift, hooks, nginx, service states"
	echo "7 make server_pull          - make the server pull main (if the webhook missed it)"
	echo "8 make nginx_pull           - copy the live nginx site config into nginx/ai.memention.net.conf (review, commit)"
	echo "9 make logs                 - tail the server's monitor log (N=<issue> for an agent log)"
	echo "10 make run_issue           - (re)run the agent for an issue on the server (N=<issue>)"
	echo "11 make health              - aihealth scan of the repo"
	echo "12 make update_phony        - update .PHONY in Makefile"

select:
	read -p ">>> " P ; "$(MAKE)" --no-print-directory menu | grep "^$$P " | cut -d ' ' -f2-3 | bash

.SILENT:

.PHONY: info menu select externals setup_publish aihealth_update check deploy server_status server_pull nginx_pull logs run_issue health update_phony

externals:
	$(EXT) status

setup_publish:
	"$(MAKE)" --no-print-directory -C "$(AISETUP)" publish VPS="$(CURDIR)" $(if $(MSG),MSG="$(MSG)")
	git pull -q --ff-only origin main

aihealth_update:
	v="$(V)"; [ -n "$$v" ] || read -p "tag (e.g. v0.3.2): " v; $(EXT) aihealth "$$v"

check:
	if [ -x .venv/bin/aihealth ]; then \
		.venv/bin/aihealth delta --base origin/main; \
	else echo "aihealth: skipped (.venv missing, see CLAUDE.md Code health)"; fi
	python3 -I projects/landing/cards/check-agent-docs.py . | tail -1
	for f in *.sh hooks/*; do bash -n "$$f" || exit 1; done
	python3 -I -c 'import ast,sys; [ast.parse(open(f).read(), f) for f in sys.argv[1:]]' *.py
	echo "syntax: ok"

deploy: check
	VPS="$(VPS)" DIR="$(DIR)" WAIT="$(WAIT)" bash deploy.sh
	"$(MAKE)" --no-print-directory server_status

server_status:
	$(SSH) "cd $(DIR) && bash deploy-server.sh status"

server_pull:
	old=$$($(SSH) "cd $(DIR) && git rev-parse HEAD"); \
	$(SSH) "cd $(DIR) && bash deploy-server.sh pull && bash deploy-server.sh post $$old"

# The live config is what serves; agents and hand edits change it there. This brings
# it into the repo so git shows the change; review the diff before committing.
nginx_pull:
	tmp=$$(mktemp); trap 'rm -f "$$tmp"' EXIT; \
	$(SSH) "cat /etc/nginx/sites-available/ai.memention.net" > "$$tmp" && [ -s "$$tmp" ] || { echo "nginx_pull: could not read the live config"; exit 1; }; \
	if cmp -s "$$tmp" nginx/ai.memention.net.conf; then echo "nginx: repo copy matches live"; \
	else cp "$$tmp" nginx/ai.memention.net.conf; git --no-pager diff --stat -- nginx/ai.memention.net.conf; echo "nginx: updated from live; review with git diff, then commit"; fi

logs:
	if [ -n "$(N)" ]; then $(SSH) "tail -n 100 -f $(DIR)/.agent-issue-$(N).log"; \
	else $(SSH) "tail -n 100 -f $(DIR)/.issues-monitor.log"; fi

run_issue:
	n="$(N)"; [ -n "$$n" ] || read -p "issue number: " n; \
	$(SSH) "cd $(DIR) && bash monitor-issues.sh $$n"

health:
	.venv/bin/aihealth scan .

update_phony:
	echo "##### Updating .PHONY targets #####"
	targets=$$(grep -E '^[a-zA-Z_][a-zA-Z0-9_-]*:' Makefile | grep -v '=' | cut -d: -f1 | tr '\n' ' '); \
	sed -i.bak "s/^\.PHONY:.*/.PHONY: $$targets/" Makefile && \
	echo "Updated .PHONY: $$targets" && \
	rm -f Makefile.bak
