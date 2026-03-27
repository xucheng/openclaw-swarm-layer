# Changelog

## 0.3.0 (2026-03-27)

ACP convergence release for OpenClaw `2026.3.24`.

- Removed ACP bridge runtime dependence and finalized ACP as the only default-capable automated runner
- Locked the bridge-free ACP floor at OpenClaw `>=2026.3.22` and shipped the ACP bridge-exit gate across doctor, status, and reports
- Finalized `subagent` as a legacy bridge-backed opt-in path that requires both `subagent.enabled=true` and `bridge.subagentEnabled=true`
- Synced public-facing docs, plugin manifest metadata, and ClawHub skill content to the ACP-first / legacy-subagent posture
- Closed the `M5` roadmap through `M5.4c` with regression green: 305 unit tests across 51 files, 23 e2e tests across 18 files, build clean

## 0.2.1 (2026-03-26)

Bridge compatibility and release hygiene update for OpenClaw `2026.3.24`.

- Added bridge compatibility mappings for OpenClaw `2026.3.24`, including the renamed `loadConfig` export and current bundle aliases
- Aligned ACP runtime integration with the current public SDK surface (`openclaw/plugin-sdk/core`)
- Resolved `tsx` loader discovery for path-linked plugin installs so rebuilds stay reproducible from source
- Updated live/unit diagnostics to reflect the current ACP public export availability in `2026.3.24`
- Refreshed package metadata and lockfile so source dependencies are complete before npm publishing

## 0.2.0 (2026-03-25)

### M4 — Harness Enhancement (GAN-inspired patterns for long-running agents)

Applies battle-tested harness patterns from Anthropic engineering articles to strengthen the swarm orchestration loop.

- **Cross-session progress summary** — `synthesizeProgress()` builds an agent-readable progress file bridging session boundaries; auto-updated after every run and review
- **Session bootstrap sequence** — deterministic 4-step startup (verify env → load progress → select task → verify baseline) with config toggle
- **Sprint contracts** — `SprintContract` with typed `AcceptanceCriterion` (test_passes, file_exists, content_matches, command_exits_zero, manual_check); auto-generated from spec acceptance criteria
- **Task field immutability guard** — `validateTaskImmutability()` prevents agents from mutating task definitions (title, description, deps, runner); only status and review fields are mutable
- **Automated evaluator task injection** — GAN-inspired evaluator tasks auto-injected after coding tasks; copies sprint contracts; dependency chains preserved
- **Structured quality rubrics** — weighted multi-dimension scoring (functionality, correctness, design, craft) replaces binary approve/reject; `applyRubricResult()` integrates with review gate
- **Session budget control** — `SessionBudget` (maxDurationSeconds, maxRetries) with `BudgetUsage` tracking; budget exceeded annotated on run records
- **Harness assumption metadata** — `HarnessAssumption` type for tracking model capability, environment, tooling, and workflow structure assumptions with validation lifecycle
- **Bridge script resilience** — `scripts/openclaw-exec-bridge.mjs` now falls back to TypeScript source when `dist/` is unavailable (fixes worktree and pre-build test runs)

Test coverage: 283 unit tests across 51 files, 24 e2e tests across 17 files.

## 0.1.0 (2026-03-22)

Initial open-source release. All M1-M3 milestones delivered.

### M1 — Orchestration Foundation
- Plugin packaging and OpenClaw installation
- CLI: `init`, `status`, `plan`, `run`, `review`, `report`, `doctor`
- Manual runner with review gate
- Spec-driven task graph planning with dependency ordering
- Local and Obsidian report sync
- Optional tool registration (7 tools)

### M2 — ACP Execution Beta
- **M2.0**: Bridge-backed ACP and subagent real execution
- **M2.1**: Session status/cancel/close, bridge doctor, failure classification
- **M2.2**: Operator UX — attention, highlights, recommended actions, normalized summaries
- **M2.3**: Public API convergence seams, compatibility metadata, migration checklist

### M3 — Sessionized Swarm
- **M3.0**: Session as first-class record, session store, lifecycle state machine, list/inspect CLI, reuse candidate visibility
- **M3.1**: Persistent session reuse — `reuse_if_available` and `require_existing` policies, binding key matching
- **M3.2**: Thread binding — threadId tracking, `follow-up` and `steer` CLI commands, `allowThreadBinding` enforcement
- **M3.3**: Retry and recovery — configurable retry policy, automatic retry engine, orphan detection and cleanup, dead letter tracking
