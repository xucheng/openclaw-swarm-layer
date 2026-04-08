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

Planning rules for the next slice:

- `M6` is a new milestone family, not an extension of `M5`
- `M6` should preserve the shipped `M5.4c` runner posture: ACP public-only default path, subagent legacy opt-in only
- any future public subagent path should be treated as a separate follow-on milestone after `M6`, not as unfinished `M5` debt
