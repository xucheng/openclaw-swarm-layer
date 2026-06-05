# Changelog

## 0.5.10 (2026-06-05)

ACP runtime-mode and ClawHub skill alignment hotfix.

- Applied Codex ACP runtime mode `auto` after session initialization and before the first turn, preventing workflow tasks from inheriting the upstream default `read-only` mode
- Captured asynchronous ACP `runTurn` failures so accepted sessions no longer leak unhandled promise rejections back into the OpenClaw CLI process
- Enriched generic upstream `Internal error` session statuses with diagnostics from the Codex ACP wrapper stderr, including quota and usage-limit failures
- Added `acp.defaultRuntimeMode` to Swarm Layer config and OpenClaw manifest schema for explicit operator control
- Added a release consistency gate to `release:check` and `prepublishOnly` so npm package metadata, OpenClaw manifest, README badge, release runbook, release notes, and `skills/swarm-layer/SKILL.md` stay aligned
- Bumped the aligned release line to `openclaw-swarm-layer@0.5.10` so ClawHub package and skill can be republished with the corrected skill body after the `0.5.9` skill-content mismatch

### Verification

- `npm run build` green
- `npx vitest run test/unit/runtime/real-openclaw-session-adapter.test.ts test/unit/config.test.ts` green
- `npm run check:release-consistency` green
- `npm run check:docs-redaction` green
- `npm run release:check` green: build, full regression, docs redaction, release consistency, npm pack dry-run, and ClawHub package staging for `0.5.10`
- Full regression inside `release:check` green: 62 unit files / 435 tests and 20 e2e files / 26 tests

## 0.5.9 (2026-06-05)

ACP backend discovery hotfix for OpenClaw installs that place `acpx` under the state npm-project cache instead of the legacy extension install path.

- Fixed Swarm Layer ACP bootstrap to discover `@openclaw/acpx` under `npm/projects/openclaw-acpx-*/node_modules/@openclaw/acpx`
- Added `dist/index.js` as a valid `acpx` service module candidate, matching current npm-project package layout
- Added a regression test for npm-project `acpx` service discovery when OpenClaw does not expose `plugins.installs.acpx.installPath`
- Synced npm package metadata, plugin manifest metadata, README, release runbook, ClawHub package commands, ClawHub skill baseline, and release notes to `openclaw-swarm-layer@0.5.9`

### Verification

- `npm run build` green
- `npx vitest run test/unit/runtime/openclaw-exec-bridge.test.ts` green: 22 tests
- `npm run test:unit` green: 62 files / 429 tests
- `npm run test:e2e` green: 20 files / 26 tests
- `npm run check:docs-redaction` green: 47 source markdown files scanned
- `npm run release:check` green: build, full regression, docs redaction, npm pack dry-run, and ClawHub package staging for `0.5.9`
- `npm run prepublishOnly` green
- Local mini smoke on `OpenClaw 2026.6.1` verified the installed `openclaw-swarm-layer@0.5.7` hot patch could resolve the npm-project `acpx` backend and that Daily Papers 2026-06-05 closed 10/10 after artifact verification

## 0.5.8 (2026-06-05)

ClawHub skill metadata alignment release.

- Recorded the already-published ClawHub `swarm-layer` skill version `0.5.8`
- No npm package, GitHub release, or ClawHub code-plugin package was cut for this version
- Reserved `0.5.9` as the next fully aligned release across npm, GitHub, ClawHub package, and ClawHub skill

## 0.5.7 (2026-06-04)

Daily Papers-style cron reliability release based on the published `0.5.6` package line.

- Added explicit phase execution syntax in specs: `### Phase Title [parallel]` or `[sequential]`
- Kept old specs sequential by default while allowing parallel phase tasks to fan out and later phases to depend on the full previous barrier
- Fixed queued-task drain so `swarm run --all-ready --parallel N` can dispatch dependency-satisfied queued tasks even when there are no newly runnable tasks
- Prevented dry-run batch dispatch from mutating overflow tasks into `queued`
- Added `swarm run --sync-active` and `swarm status --sync` so cron and operator paths can poll active ACP sessions before deciding what is runnable
- Promoted downstream tasks to `ready` after no-review run completion, ACP completion sync, and review approvals
- Added a docs-redaction gate to CI, `release:check`, and `prepublishOnly` so release docs cannot ship local user, home, or temp paths
- Included `CHANGELOG.md` in the npm package file list
- Updated the Swarm Layer skill, README, release runbook, and release notes for `openclaw-swarm-layer@0.5.7`

### Verification

- `npm run build` green
- `npm run test:unit` green: 62 files / 428 tests
- `npm run test:e2e` green: 20 files / 26 tests
- `npm run check:docs-redaction` green: 43 source markdown files scanned
- `npm run smoke:autopilot-watcher` green with the node watcher
- `SWARM_WATCHER_LIBRARY=parcel npm run smoke:autopilot-watcher` green with `@parcel/watcher`
- Local mini smoke on `OpenClaw 2026.6.1` green: linked current source, loaded `openclaw-swarm-layer@0.5.7`, ran a Daily Papers-style `[parallel]` read phase, promoted synthesis to ready, and completed the workflow
- `npm run release:check` green: build, full regression, docs redaction, npm pack dry-run, and ClawHub package staging
- `npm run prepublishOnly` green

## 0.5.6 (2026-05-25)

ClawHub package artifact hotfix for the npm 11 peer-link install path.

- Included `peerDependenciesMeta` in the generated ClawHub package `package.json`, so ClawHub installs also avoid materializing a registry `node_modules/openclaw` copy
- Kept the `0.5.5` npm package peer fix unchanged

### Verification

- `npm run release:check` green
- `npm run smoke:autopilot-watcher` green
- `SWARM_WATCHER_LIBRARY=parcel npm run smoke:autopilot-watcher` green
- Remote OpenClaw npm-pack install smoke loads `openclaw-swarm-layer@0.5.6` and creates an `openclaw` peer symlink

## 0.5.5 (2026-05-25)

Remote install-smoke hotfix for OpenClaw package installs on npm 11.

- Marked the `openclaw` peer dependency as optional so npm does not materialize a registry `node_modules/openclaw` copy during plugin dependency installation
- Preserved the peer dependency declaration so OpenClaw can still create the plugin-local `openclaw` symlink expected by `openclaw/plugin-sdk/*` imports

### Verification

- `npm run release:check` green
- `npm run smoke:autopilot-watcher` green
- `SWARM_WATCHER_LIBRARY=parcel npm run smoke:autopilot-watcher` green
- Remote npm install smoke confirms the package no longer auto-installs the `openclaw` peer
- Remote OpenClaw npm-pack install smoke loads `openclaw-swarm-layer@0.5.5`

## 0.5.4 (2026-05-25)

Autopilot filesystem watcher release with the existing polling loop preserved as the default rollback path.

- Added `autopilot.watcherMode` with `polling`, `watch`, and `hybrid` modes
- Added a state watcher, workflow reader abstraction, and per-project state cache for event-driven autopilot ticks
- Added watcher source metadata to autopilot decisions and tick-source metrics
- Added node and parcel watcher smoke coverage plus an e2e filesystem regression
- Synced package metadata, plugin manifest metadata, in-plugin version metadata, README, runbook, ClawHub skill baseline, and release notes to `openclaw-swarm-layer@0.5.4`

### Verification

- `npm run build` green
- `npm run test:unit` green: 62 unit test files / 421 unit tests
- `npm run test:e2e` green: 20 e2e files / 26 e2e tests
- `npm run smoke:autopilot-watcher` green
- `SWARM_WATCHER_LIBRARY=parcel npm run smoke:autopilot-watcher` green
- `npm pack --dry-run` green

## 0.5.3 (2026-05-04)

OpenClaw `2026.5.3-1` compatibility update for the current plugin runtime manifest contract.

- Declared startup activation in `openclaw.plugin.json` so the Swarm Layer service and tool surface are loaded during gateway startup
- Declared all eight registered swarm tools under `contracts.tools`, matching OpenClaw `2026.5.3-1` requirements before registering agent tools
- Added optional `toolMetadata` for each registered swarm tool so manifest metadata mirrors runtime registration
- Added manifest regression coverage to keep startup activation, tool contracts, and optional tool metadata aligned with runtime tools
- Synced package metadata, plugin manifest metadata, in-plugin version metadata, README release badge, release runbook, ClawHub skill baseline, and release notes to `openclaw-swarm-layer@0.5.3`

### Verification

- `npx vitest run test/unit/plugin.test.ts` green: 3 tests
- `npm run test:unit` green: 59 unit test files / 360 unit tests
- `npm run test:e2e` green: 19 e2e files / 25 e2e tests
- `npm run release:check` green: build, full regression, npm pack dry-run, and ClawHub package staging
- OpenClaw `2026.5.3-1` host smoke green: plugin loaded, `openclaw-swarm-layer` doctor clean, `health.plugins.errors=[]`

## 0.5.2 (2026-04-28)

OpenClaw `2026.4.26` compatibility and release packaging update.

- Updated the plugin SDK imports to the current public subpaths, including `plugin-sdk/plugin-entry` for the plugin entrypoint and `plugin-sdk/core` for runtime, tool, CLI, and service types
- Switched ACP runtime config reads to prefer `runtime.config.current()` while retaining `loadConfig()` fallback for older hosts
- Registered the `swarm` CLI through descriptor metadata only, avoiding duplicate CLI command listings in current OpenClaw plugin registry output
- Adjusted tool parameter handling for the current SDK execute signature, where params are typed as `unknown`
- Hardened OpenClaw host-root detection for symlinked launchers and mixed install layouts, while preserving mini installs that keep the bundled `acpx` runtime dependency under the OpenClaw state package
- Synced package metadata, plugin manifest metadata, in-plugin version metadata, README release badge, release runbook, and release notes to `openclaw-swarm-layer@0.5.2`

### Verification

- `npm run build` green
- `npm run test:unit` green: 59 unit test files / 359 unit tests
- `npm run test:e2e` green: 19 e2e files / 25 e2e tests
- `npm pack --dry-run` green
- remote host `OpenClaw 2026.4.26` smoke green:
  - manual workflow: `init -> plan -> run --runner manual -> review --approve -> report`
  - live ACP workflow: `init -> plan -> run -> session status -> session close`

## 0.5.1 (2026-04-09)

ACP autopilot service-loop hotfix and release-prep alignment update.

- Fixed the supervised service-loop path so background autopilot resolves the same runtime-backed ACP session adapter as the CLI and tool paths
- Passed the resolved ACP session adapter through `createSwarmService(...)`, default `AutopilotServiceLoop` construction, and custom loop dependency injection
- Passed `api.runtime` through `registerSwarmService(...)` so runtime-capable installs stop falling back to `UnsupportedOpenClawSessionAdapter`
- Added regression coverage for custom-loop session-adapter injection, default service-loop ACP wiring, and `registerSwarmService(...)` runtime propagation
- Synced package metadata, plugin manifest metadata, in-plugin version metadata, README release badge, and release runbook to `openclaw-swarm-layer@0.5.1`

### Verification
- `npm run build` green
- `npx vitest run test/unit/services/swarm-service.test.ts` green
- `npm test` green: 59 unit test files / 356 unit tests and 19 e2e files / 25 e2e tests
- `npm run release:check` green

## 0.5.0 (2026-04-08)

### M6 Autopilot Control Plane + M7 Subagent Removal

This release closes the two follow-on milestone families delivered on 2026-04-08 and becomes the new publish baseline for npm, GitHub, and ClawHub.

#### M6: Autopilot Control Plane
- Added the supervised autopilot control plane with persistent autopilot state, lease ownership, decision logging, and `status/start/pause/resume/stop/tick` command coverage
- Added deterministic tick-driven dispatch, session sync, review closure, stuck/stale recovery, degraded-mode holds, and service-loop controls
- Extended status and reports with autopilot health, decision, and queue pressure visibility

#### M7: Runtime Simplification
- Removed the legacy bridge-backed `subagent` runner, its adapters, bridge command surface, and related tests
- Reduced the supported runtime surface to `manual + acp` only while keeping historical persisted workflow/run/session JSON readable
- Eliminated the last `child_process` dependency from source and fresh `dist/`, which unblocks clean `openclaw plugins install -l .` on OpenClaw `2026.4.8`

#### Release Alignment
- Synced npm package metadata, plugin manifest metadata, lockfile version, README install commands, skills docs, and release runbook to `openclaw-swarm-layer@0.5.0`
- Revalidated the shipped package against local `OpenClaw 2026.4.8` and the current ClawHub package/skill distribution flow

#### Verification
- `npm run build` green
- `npm test` green: 59 unit test files / 354 unit tests and 19 e2e files / 25 e2e tests
- `npm pack --dry-run` green
- `npm run prepare:clawhub:package` green
- `openclaw --profile m7-smoke plugins install -l .` green
- Local ACP control-plane smoke completed through `init -> plan -> dry-run -> live run -> review -> report -> autopilot tick`

## 0.4.0 (2026-04-07)

### Parallel Reliability & Retry-Recovery (SPEC-003)

Three features addressing high-concurrency ACP stability, reject-retry workflows, and batch dispatch semantics.

#### Feature 1: ACP Concurrency Protection & Queued Execution
- New config: `acp.maxConcurrent` (default 6), `acp.queuePolicy` ("fifo"), `acp.retryOnSignal` (default ["SIGTERM"])
- New `queued` task status for tasks waiting on concurrency slots
- Concurrency gate prevents over-dispatching ACP sessions; excess tasks queue automatically
- Signal-based auto-retry via `shouldRetryOnSignal()` for SIGTERM and configurable signal lists

#### Feature 2: Review Reject → Retry
- New config: `review.rejectPolicy` (default "ready_retry"), `review.maxRejectRetries` (default 3)
- Reject now returns tasks to `ready` for re-run instead of permanently blocking
- `retryCount` and `lastRejectReason` tracked per task
- Exceeding `maxRejectRetries` falls to `blocked` with diagnostic message
- CLI `--retry-now` flag forces retry regardless of retry limit

#### Feature 3: Parallel Dispatch Semantics
- `swarm run --parallel N` dispatches up to N ready tasks in one command
- `swarm run --all-ready` fills available concurrency slots from the ready queue
- Dispatch stats (requested / admitted / queued) in output and status
- `swarm_run` tool updated with `parallel` and `allReady` parameters

#### Infrastructure
- New `src/runtime/concurrency-gate.ts` module for slot checking
- Extended `applyReviewDecision()` with optional reject-retry policy
- New `SwarmOrchestrator.runBatch()` method (single-task `runOnce()` unchanged)
- `WorkflowStatusSummary` and operator attention items include `queued` status
- Test coverage: 348 unit tests across 52 files, 29 e2e tests across 20 files

## 0.3.4 (2026-04-06)

OpenClaw `2026.4.5` compatibility and release packaging update.

- Fixed bundled `acpx` bootstrap for OpenClaw `2026.4.5` by tolerating the newer plugin register API shape that invokes `api.on(...)`
- Refreshed stale unhealthy ACP runtime backends during bootstrap so live ACP runs recover instead of timing out on a dead registry entry
- Revalidated the live smoke matrix on local `OpenClaw 2026.4.5`, including direct ACP smoke, doctor, init/plan/status, dry-run, live ACP dispatch, session lifecycle, review, and report
- Synced npm package, plugin manifest, lockfile, README release metadata, and current operator docs to `openclaw-swarm-layer@0.3.4`

## 0.3.3 (2026-03-30)

Release alignment and packaging hygiene patch.

- Synced npm package, plugin manifest, lockfile, and README release metadata to `openclaw-swarm-layer@0.3.3`
- Kept the runtime-only ClawHub package preparation flow for future plugin publishes
- Kept Vitest discovery constrained to canonical sources so release validation stays reproducible

## 0.3.2 (2026-03-30)

Forward-compatible bridge resolution update.

- Replaced per-version hardcoded OpenClaw bridge chunk mappings with version-range strategies and runtime discovery
- Resolved `loadConfig` by scanning stable dist entrypoints for supported OpenClaw versions `>=2026.3.22`
- Switched ACP session manager lookup to the stable `plugin-sdk/acp-runtime.js` surface so new OpenClaw releases stop requiring plugin republishes for hash churn
- Added regression coverage for the dynamic bridge manifest and exec bridge resolution paths
- Added a reproducible ClawHub package preparation script so published plugin artifacts only include runtime assets
- Excluded `.claude` worktree mirrors and `dist/**` build outputs from Vitest discovery so release validation only runs the canonical test suite
- Synced plugin manifest and release metadata for `openclaw-swarm-layer@0.3.2`

## 0.3.1 (2026-03-27)

Doctor and packaging consistency patch for OpenClaw `2026.3.24`.

- Fixed `openclaw swarm doctor --json` so npm-installed extensions detect the host ACP public SDK exports instead of reporting a false `blocked` status
- Aligned doctor-side ACP export probing with the real runtime ACP loader used by the published plugin
- Added regression coverage for host-root SDK detection when bare `openclaw/...` package imports are unavailable in the plugin install context

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
