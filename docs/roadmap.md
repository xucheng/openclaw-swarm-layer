# Roadmap

## Summary

The project completed an initial five-stage roadmap:

- `M1` Orchestration Foundation
- `M2` ACP Execution Beta
- `M3` Sessionized Swarm
- `M4` Harness Enhancement
- `M5` ACP-Default Convergence

Repository history does not define a formal `M0` milestone. The tracked milestone history starts at `M1`.

All tracked historical roadmap stages `M1-M5` are now complete.

Latest completed follow-on stage:

- `M6` Autopilot Control Plane

## Historical Stages

### M1 - Orchestration Foundation

Target:

- installable native plugin
- manual-runner orchestration loop
- stable workflow state and reporting
- optional tools and skill wiring

Scope:

- schema + state-store
- spec import + planner
- CLI `init/status/plan/run/review/report`
- manual runner
- review gate
- local report + Obsidian sync

Delivery level:

- single-machine orchestration prototype usable for controlled internal planning and manual execution

Current status: complete via the initial `0.1.0` release baseline.

### G0 - ACP Integration Decision

Decision gate recorded before full ACP expansion:

- treat `sessions_spawn` semantics as the orchestration contract
- avoid private deep-imports as the intended long-term solution
- freeze task-to-session mapping before execution scope expands
- record upstream gaps and private-coupling risks explicitly

Current status: complete and folded into the `M2` delivery history.

### M2 - ACP Execution Beta

Target:

- real ACP oneshot execution for selected tasks
- stable `runId <-> sessionRef` tracking
- review-gated ACP result handling
- operator session control

Sub-milestones:

- `M2.0` ACP oneshot MVP
- `M2.1` operator control
- `M2.2` beta hardening
- `M2.3` public API convergence

Delivery level:

- single-machine, single-project internal beta for spec-driven orchestration with manual + ACP execution

Final status:

- bridge-backed ACP execution shipped for the beta phase
- session status / cancel / close and operator diagnostics shipped
- public API seam detection, compatibility metadata, replacement planning, and migration guidance shipped

Current status: complete through `M2.3`.

### M3 - Sessionized Swarm

Target:

- persistent ACP sessions
- thread binding
- session reuse and steer flows
- stronger recovery and retry behavior

Structure delivered:

- `M3.0` Session Foundation
- `M3.1` Persistent ACP Session Reuse
- `M3.2` Thread Binding And Follow-up
- `M3.3` Retry/Recovery Expansion

Delivery level:

- enhanced swarm runtime for longer-lived session workflows, still intentionally not a distributed control plane

Final status:

- persistent session reuse delivered
- thread-bound follow-up / steer delivered
- retry, dead-letter, orphan cleanup, and recovery behavior delivered

Current status: complete through `M3.3`.

### M4 - Harness Enhancement

Target:

- cross-session progress memory bridge
- sprint contracts with verifiable acceptance criteria
- evaluator task injection
- structured quality rubrics replacing binary review
- session budget controls
- task field immutability
- harness assumption metadata

Delivery level:

- harness-strengthening features remain backward compatible with the `M1-M3` runtime when disabled

Final status:

- harness enhancement package shipped and verified with backward-compatible regression coverage

Current status: complete (2026-03-25).

### M5 - ACP-Default Convergence

Target posture after closeout:

- ACP is the only default-capable automated runner
- ACP automation uses the public control-plane path only
- legacy ACP bridge config is ignored and surfaced as operator guidance, not runtime capability
- `subagent` remains a legacy bridge-backed opt-in path
- bridge remains only for the legacy subagent path

Sub-milestones:

- `M5.0` Policy Split: complete (2026-03-26)
- `M5.1` ACP Default Cutover: complete (2026-03-26)
- `M5.2` Subagent Dark Mode: complete (2026-03-26)
- `M5.3` ACP Bridge Reduction: complete (2026-03-26)
- `M5.3.x-1` Capability-Aware Auto Resolution: complete (2026-03-26)
- `M5.3.x-2` Docs And Operator Surface Alignment: complete (2026-03-26)
- `M5.4a` ACP Version Floor Gate: complete (2026-03-27)
- `M5.4b` ACP Bridge Removal: complete (2026-03-27)
- `M5.4c` Subagent Final Decision: complete (2026-03-27)

Current status: complete through `M5.4c`.

## Follow-on Stage

### M6 - Autopilot Control Plane

Target:

- supervised control-plane loop over the existing orchestration runtime
- deterministic `tick`-based dispatch, review, sync, and recovery flow
- dedicated autopilot state, lease, and decision-log persistence
- operator-visible pause/resume/stop controls and status/report surfaces
- stronger automation without changing the supported runner boundary

Sub-milestones:

- `M6.0` Control-plane skeleton and state persistence
- `M6.1` Tick MVP with idempotent dispatch
- `M6.2` Session sync and review closure
- `M6.3` Recovery, escalation, and degraded mode
- `M6.4` Service loop, control commands, and release freeze

Delivery level:

- single-machine, single-project supervised automation layer over the shipped `M1-M5` runtime

Target posture after closeout:

- existing workflow state remains the business plane; autopilot adds a separate control plane
- automation decisions are auditable and reversible
- low-risk review and recovery paths are policy-driven, not hardcoded shell glue
- unattended execution remains supervised; the project still does not claim a fully autonomous PR factory

Current status: complete (2026-04-08). `M6.0-M6.4` are implemented, and the local release-freeze baseline is 63 unit test files / 381 unit tests plus 25 e2e files / 34 e2e tests with `npm run build` and `npm test` green.

### M7 - Subagent Removal

Target:

- remove the legacy bridge-backed subagent runner entirely
- eliminate the last `child_process` dependency from the plugin
- unblock clean `openclaw plugins install -l` on OpenClaw 2026.4.8+ without security scanner blocks
- simplify the runtime surface to manual + ACP only

Sub-milestones:

- `M7.0` Core runtime removal (delete runner, adapters, bridge adapter, and their tests)
- `M7.1` Config, schema, and diagnostics cleanup (purge `"subagent"` from the type system and all surfaces)
- `M7.2` Verification and live smoke (clean build, install gate, full regression, live ACP smoke)

Delivery level:

- debt-reduction milestone that closes the subagent chapter opened in M2 and deferred in M5.4c

Target posture after closeout:

- `RunnerType` = `"manual" | "acp"` only
- zero bridge infrastructure remaining
- zero `child_process` in source or dist
- historical persisted state (workflow, run, session JSON) remains readable

Current status: planned.

## Assessment Timeline

- `M1` complete (2026-03-22): orchestration foundation shipped in the initial release baseline
- `G0` complete (2026-03-22): ACP integration contract and private-coupling risks documented
- `M2.0` complete (2026-03-22): bridge-backed ACP oneshot beta path working
- `M2.1` complete (2026-03-22): session status/cancel/close and bridge doctor shipped
- `M2.2` complete (2026-03-22): operator visibility and normalized completion summaries shipped
- `M2.3` complete (2026-03-22): public API convergence seams and migration checklist shipped
- `M3.0` complete (2026-03-21): 158 unit tests, 20 e2e tests, build clean
- `M3.1` complete (2026-03-22): 165 unit tests, 22 e2e tests, build clean
- `M3.2` complete (2026-03-22): 176 unit tests, 22 e2e tests, build clean
- `M3.3` complete (2026-03-22): 187 unit tests, 22 e2e tests, build clean
- `M4` complete (2026-03-25): 283 unit tests across 51 files, 24 e2e tests across 17 files, build clean
- `M5.0` complete (2026-03-26): 290 unit tests across 51 files, 24 e2e tests across 17 files, build clean
- `M5.1` complete (2026-03-26): 292 unit tests across 52 files, 24 e2e tests across 17 files, build clean
- `M5.2` complete (2026-03-26): 296 unit tests across 52 files, 25 e2e tests across 18 files, build clean
- `M5.3` complete (2026-03-26): 301 unit tests across 52 files, 25 e2e tests across 18 files, build clean
- `M5.3.x-1` complete (2026-03-26): 303 unit tests across 52 files, 25 e2e tests across 18 files, build clean
- `M5.3.x-2` complete (2026-03-26): 303 unit tests across 52 files, 25 e2e tests across 18 files, build clean
- `M5.4a` complete (2026-03-27): 306 unit tests across 53 files, 25 e2e tests across 18 files, build clean; full local smoke matrix green on `OpenClaw 2026.3.24`
- `M5.4b` complete (2026-03-27): 300 unit tests across 51 files, 23 e2e tests across 18 files, build clean; local doctor and ACP dry-run smoke green on `OpenClaw 2026.3.24`
- `M5.4c` complete (2026-03-27): 305 unit tests across 51 files, 23 e2e tests across 18 files, build clean; subagent retained only as a legacy bridge-backed opt-in path
- `M6.0` complete (2026-04-08): control-plane skeleton, autopilot state persistence, status/report surfaces, and dry-run tick shipped; full local regression green
- `M6.1` complete (2026-04-08): lease-backed deterministic dispatch tick shipped; full local regression green
- `M6.2` complete (2026-04-08): ACP/subagent sync path and supervised review closure shipped; 58 unit test files / 368 unit tests, 22 e2e files / 31 e2e tests, build clean
- `M6.3` complete (2026-04-08): recovery planner, stuck/stale remediation, and degraded dispatch hold shipped; targeted recovery/degraded regression green
- `M6.4` complete (2026-04-08): service loop and start/pause/resume/stop controls shipped; 63 unit test files / 381 unit tests, 25 e2e files / 34 e2e tests, build clean
- `M6` complete (2026-04-08): Autopilot Control Plane closed with full local regression green and no open `M6` slices

## What The Project Claims

The project claims:

- ACP as the only default-capable automated runner
- `subagent` as a legacy bridge-backed opt-in path with a documented support boundary (scheduled for removal in M7)
- single-machine, single-project orchestration with operator-visible workflow state, reports, and session control

The project still does not claim:

- distributed multi-node orchestration
- a fully autonomous unattended PR factory

## Delivery Guardrails

- every stage adds or updates unit coverage before closeout
- every milestone node reruns e2e regression
- roadmap, backlog, and Obsidian notes are updated together with implementation status
