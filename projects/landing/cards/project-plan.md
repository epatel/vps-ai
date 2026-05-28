# Shared Project Plan (`project-plan.md`)

## Problem

When work is split across multiple agents — subagents spawned via the Task tool, agents running in separate git worktrees, or parallel sessions — each one starts with isolated context. Nothing holds the *overall goal* or the *current state* in a place they all see. The result is drift: agents duplicate each other's work, make conflicting decisions, re-litigate settled questions, and lose the north star the moment the orchestrator's context is summarized or a new agent is spawned cold.

## Solution

A single `project-plan.md` at the repo root that is the shared source of truth for the goal and the live state of the work. Every agent **reads it first** before doing anything, and **updates it** as it makes progress or decisions. It is the one artifact that survives across agent boundaries, context compaction, and session restarts.

It is not a spec and not a design doc — those describe *what to build*. The project plan tracks *what we're trying to achieve and where we are right now*, so independently-running agents converge instead of diverge.

## What it contains

```markdown
# Project Plan: <project / objective name>

## Goal
The single north-star outcome, in 1-3 sentences. The thing every agent
optimizes toward. If an agent's task doesn't serve this, it stops and flags it.

## Non-goals
Explicit out-of-scope items. Prevents agents from "helpfully" expanding scope.

## Milestones
- [x] M1 — <done thing>
- [ ] M2 — <in progress> (owner: agent/issue-42, status: charging_payment node)
- [ ] M3 — <not started>

## Decisions
- 2026-05-28 — Chose Postgres over Mongo (relational invariants). Locked.
- 2026-05-28 — Auth via JWT, 7d expiry. Locked.
Each line is a settled choice no agent should reopen without flagging here.

## Current state / handoff
Where the work stands right now and what the next agent should pick up.
Updated by whoever last touched the work — the running handoff note.

## Open questions
Things blocked on a human or undecided. An agent that hits one adds it here
rather than guessing.
```

## Lifecycle

1. **Orchestrator creates it** at the start, filling in Goal, Non-goals, and the initial Milestones.
2. **Every spawned agent reads it first.** Its prompt or system prompt instructs it to open `project-plan.md` before starting, so it inherits the goal and current state instead of starting blind.
3. **Agents append, they don't overwrite.** On finishing a unit of work an agent updates its milestone's status, adds any decision it made to the Decisions log, and rewrites the Current state / handoff note. Decisions and open questions are append-only; status fields are edited in place.
4. **One writer at a time for live concurrent work.** If agents run truly in parallel against the same file, route updates through the orchestrator (each subagent *returns* its plan delta as structured output and the orchestrator merges it) to avoid clobbering. Worktree-isolated agents each commit their plan edits and the merge resolves them like any other file.

## How to wire it in

Make every agent load it automatically:

- **Reference it from `CLAUDE.md`** so Claude Code auto-discovers it: a line like `Always read @project-plan.md before starting — it holds the shared goal and current state.`
- **Name it in the spawn prompt / system prompt** for subagents and worktree agents: "Read `project-plan.md` first; update its Current state and Decisions sections before you finish."
- **Treat the handoff note as the contract between agents.** The last thing an agent writes is what the next one reads.

## When to use

- Any task fanned out across multiple agents or worktrees that must share one objective.
- Long-running work where the orchestrator's context will be summarized and the goal must persist outside it.
- Issue-driven autonomous runs where each issue spawns a fresh agent that needs the broader objective, not just its own ticket.

Skip it for single-agent, single-session tasks — there the goal lives in the conversation and a separate file is overhead.

## Relationship to other patterns

The project plan is **transient and goal-oriented**: it tracks the moving front of work and is expected to change every session. This is the opposite of Context Cards, which capture **stable** knowledge (architecture, decisions-as-rationale, domain contracts) that changes rarely. A decision that becomes a permanent property of the system graduates from the plan's Decisions log into a decision card; the plan keeps only the choices still relevant to reaching the current goal.
