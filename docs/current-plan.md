# Current Plan

## Status Snapshot

- `M1`: complete
- `M2.0`: complete
- `M2.1`: complete
- `M2.2`: complete
- `M2.3`: complete
- `M3.0`: complete
- `M3.1`: complete
- `M3.2`: complete
- `M3.3`: complete
- `M4`: complete
- `M5.0`: complete (2026-03-26)
- `M5.1`: complete (2026-03-26)
- `M5.2`: complete (2026-03-26)
- `M5.3`: complete (2026-03-26)
- `M5.3.x-1`: complete (2026-03-26)
- `M5.3.x-2`: complete (2026-03-26)
- `M5.4a`: complete (2026-03-27)
- `M5.4b`: complete (2026-03-27)
- `M5.4c`: complete (2026-03-27)
- `M6`: complete (2026-04-08, `Autopilot Control Plane`)

The original five-stage roadmap is now complete. `M5.4c Subagent Final Decision` closed with `subagent` retained only as a legacy bridge-backed opt-in path, while ACP stays public-only. `M6 Autopilot Control Plane` is now complete through `M6.4`.

## M5 Delivery Matrix

| Milestone | Goal | Status | Notes |
|-----------|------|--------|-------|
| `M5.0` | Policy split | Complete | Closed 2026-03-26 |
| `M5.1` | ACP default cutover | Complete | Closed 2026-03-26 |
| `M5.2` | Subagent dark mode | Complete | Closed 2026-03-26 |
| `M5.3` | ACP bridge reduction | Complete | Closed 2026-03-26 |
| `M5.3.x-1` | Capability-aware auto resolution | Complete | Closed 2026-03-26 |
| `M5.3.x-2` | Docs and operator surface alignment | Complete | Closed 2026-03-26 |
| `M5.4a` | ACP version floor gate | Complete | Closed 2026-03-27 after full local smoke matrix rerun |
| `M5.4b` | ACP bridge removal | Complete | Closed 2026-03-27 after code removal, regression, and local smoke rerun |
| `M5.4c` | Subagent final decision | Complete | Closed 2026-03-27 with subagent retained as a legacy bridge-backed opt-in path |

## M5.4c Closeout

- removed the ACP bridge session adapter and the ACP bridge command surface
- made `resolveSessionAdapter()` public-ACP-only; unsupported installs now fall back to `manual`, not ACP bridge
- stopped `auto` runner resolution from treating `bridge.acpFallbackEnabled` as ACP capability
- changed `swarm doctor`, `swarm status`, and reports to treat ACP bridge as removed and to track `0` remaining ACP bridge blockers
- finalized `subagent` posture as legacy bridge-backed opt-in instead of experimental/default-capable
- required both `subagent.enabled=true` and `bridge.subagentEnabled=true` before `subagent` is treated as enabled or default-capable
- updated doctor, status, workflow reports, and session follow-up errors to surface the legacy support boundary
- kept historical workflows, runs, and sessions readable while leaving the live subagent path opt-in only

## Verification

Implementation gates are green:

- unit regression: `vitest run test/unit` -> 51 files, 305 tests passed
- milestone regression: `vitest run test/e2e` -> 18 files, 23 tests passed
- compile gate: `npm run build` -> clean

Outcome posture:

- ACP remains the only default-capable automated runner and uses the public control-plane path only
- `subagent` remains available only as a legacy bridge-backed opt-in path
- `subagent` is not default-capable unless both the explicit subagent flag and bridge flag are enabled
- any future public subagent path should be treated as a new follow-on milestone, not implied by M5

## Next Slice

No further `M5` convergence slice is open.

Active next milestone family:

| Milestone | Goal | Status | Notes |
|-----------|------|--------|-------|
| `M6.0` | Control-plane skeleton and state persistence | Complete | `autopilot-state`, config schema, status/report surface landed on 2026-04-08 |
| `M6.1` | Tick MVP | Complete | lease, deterministic tick, idempotent dispatch landed on 2026-04-08 |
| `M6.2` | Session sync and review closure | Complete | ACP/subagent sync, tick reconciliation, supervised review policy landed on 2026-04-08 |
| `M6.3` | Recovery and degraded mode | Complete | stuck/stale detection, cancel/close/retry/escalate, degraded dispatch hold landed on 2026-04-08 |
| `M6.4` | Service loop and release freeze | Complete | service loop, start/pause/resume/stop, and full local regression landed on 2026-04-08 |

Status note:

- `M6` milestone family is complete as of 2026-04-08.
- Current release-freeze baseline: 63 unit test files / 381 unit tests, 25 e2e files / 34 e2e tests, `npm run build`, and `npm test` green.
- No follow-on milestone family is opened yet.

## M7 Subagent Removal

Motivation: the legacy subagent runner is bridge-backed, disabled by default, and introduces a `child_process` dependency that triggers the OpenClaw 2026.4.8 security scanner during `plugins install -l`. Removing it eliminates the last bridge dependency, unblocks clean local installation, and simplifies the runtime surface to manual + ACP only.

### M7.0 Core Runtime Removal

Goal: delete the subagent runner, its adapters, and all direct consumers; wire tests.

| Step | Action | Files |
|------|--------|-------|
| 0a | Delete 4 core runtime files | `subagent-runner.ts`, `subagent-mapping.ts`, `openclaw-subagent-adapter.ts`, `bridge-openclaw-subagent-adapter.ts` |
| 0b | Remove SubagentRunner from RunnerRegistry, orchestrator, and `task-runner.ts` kind union | `orchestrator.ts`, `task-runner.ts` |
| 0c | Remove subagentAdapter from CLI context and all CLI commands | `context.ts`, `swarm-run.ts`, `swarm-session-status.ts`, `swarm-session-cancel.ts`, `swarm-session-followup.ts`, `swarm-autopilot-tick.ts` |
| 0d | Remove subagent sync from session-sync | `session-sync.ts` |
| 0e | Delete 4 unit test files + edit mixed tests | `subagent-runner.test.ts`, `subagent-mapping.test.ts`, `openclaw-subagent-adapter.test.ts`, `bridge-openclaw-subagent-adapter.test.ts` + edit `runner-registry.test.ts`, `orchestrator.test.ts`, `session-sync.test.ts`, `concurrency-gate.test.ts` |
| 0f | Delete 4 e2e test files | `subagent-fallback.e2e.test.ts`, `subagent-bridge-lifecycle.e2e.test.ts`, `subagent-dark-mode.e2e.test.ts`, `subagent-bridge-fallback.e2e.test.ts` |

DoD: `npm run build` + `npm test` green.

### M7.1 Config, Schema, and Diagnostics Cleanup

Goal: remove `"subagent"` from the type system, config schema, JSON schemas, and all diagnostic surfaces.

| Step | Action | Files |
|------|--------|-------|
| 1a | Remove `"subagent"` from `RunnerType` union, `VALID_RUNNER_TYPES`, `TaskRunner.kind` | `config.ts`, `task-runner.ts` |
| 1b | Delete `SwarmSubagentConfig`, `subagentEnabled`, and all subagent config functions | `config.ts` |
| 1c | Remove `"subagent"` from 4 JSON schemas | `run.schema.json`, `session.schema.json`, `task.schema.json`, `workflow-state.schema.json` |
| 1d | Remove subagent config and enum values from `openclaw.plugin.json` | `openclaw.plugin.json` |
| 1e | Remove subagent diagnostics from doctor and public-api-seams | `swarm-doctor.ts`, `public-api-seams.ts` |
| 1f | Remove subagent patch specs from bridge-manifest | `bridge-manifest.ts` |
| 1g | Remove subagent commands from openclaw-exec-bridge | `openclaw-exec-bridge.ts` |
| 1h | Remove subagent references from reporter, status, session, and state layers | `reporter.ts`, `swarm-status.ts`, `session-lifecycle.ts`, `session-store.ts`, `state-store.ts`, `recovery-planner.ts` |
| 1i | Update all affected tests | `config.test.ts`, `doctor.test.ts`, `status.test.ts`, `bridge-manifest.test.ts`, `public-api-seams.test.ts`, `reporter.test.ts`, `session-store.test.ts`, `state-store.test.ts`, etc. |

DoD: `npm run build` + `npm test` green + `grep -ri subagent src/` returns 0 results.

### M7.2 Verification and Live Smoke

Goal: prove the removal is clean end-to-end.

| Step | Action |
|------|--------|
| 2a | Clean build (`rm -rf dist && npm run build`) |
| 2b | Verify zero `child_process` in `dist/` |
| 2c | Full unit + e2e regression |
| 2d | `openclaw plugins install -l .` passes without security block |
| 2e | Live smoke: init -> plan -> dry-run -> live ACP run -> review -> report -> autopilot tick |
| 2f | `openclaw swarm doctor --json` has no subagent references |
| 2g | Update docs: `milestones.md`, `roadmap.md`, `current-plan.md` |

DoD: zero `child_process` + install passes + all tests green + live smoke green + docs updated.

### M7 Exit Criteria

- `RunnerType` = `"manual" | "acp"` only
- no `child_process` in source or dist
- `openclaw plugins install -l .` succeeds on OpenClaw 2026.4.8
- historical workflow/run/session JSON files remain readable (schema allows unknown runner types in persisted state)
- all unit, e2e, and live smoke gates green
