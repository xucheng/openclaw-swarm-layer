# Milestones And Definition Of Done

## Verification Discipline

- every implementation stage must add or update unit coverage before it can be closed
- every milestone node must pass e2e regression before it is marked complete
- `npm run build` stays part of the milestone verification gate
- backlog, progress docs, and Obsidian notes are updated together with milestone status

Repository history does not define a formal `M0` milestone. The tracked milestone set starts at `M1`.

## M1 Orchestration Foundation

### M1 DoD

- plugin installs and loads in OpenClaw
- `openclaw swarm --help` works
- `init -> plan -> status -> run --dry-run -> run -> review -> report` works
- local report and optional Obsidian report are written
- unit tests, e2e tests, and build pass

Current status: complete (2026-03-22 via initial release baseline).

## G0 ACP Integration Decision

### G0 DoD

- ACP integration surface decision documented
- `task -> spawn params -> sessionRef -> run status -> review` mapping documented
- no private deep-import chosen as the intended long-term path
- implementation dependencies and upstream gaps recorded

Current status: complete (2026-03-22).

## M2 ACP Execution Beta

### M2.0 DoD

- `openclaw swarm run --runner acp` can launch a real ACP oneshot task
- accepted result produces stable `runId`, `sessionRef`, and run record
- ACP success/failure enters review flow correctly
- at least one real harness smoke test passes
- unit + e2e coverage exists for mapping and happy path

Current status:

- complete via the bridge-backed beta execution path
- local ACP smoke passed during the beta milestone
- local subagent smoke also passed as a secondary beta path

### M2.1 DoD

- `swarm session status` works
- `swarm session cancel` works
- `swarm session close` works
- operator can trace `runId <-> sessionKey`
- minimal restart recovery works for session metadata

Current status: complete (2026-03-22).

### M2.2 DoD

- event log is actively used for ACP runs
- timeout, error, cancel, and review paths are observable
- at least two harness smoke paths are repeatable
- operator runbook covers setup, diagnosis, and rollback

Current status:

- complete enough for the original beta scope
- operator-facing status/report/review visibility is in place
- normalized completion summaries are in place

### M2.3 DoD

- bridge version mappings are centralized
- public API capability detection is centralized
- doctor reports public API availability alongside bridge readiness
- replacement candidates and migration checklist are operator-visible
- ACP and subagent bridge adapters expose explicit replacement seams

Current status: complete (2026-03-22).

### M2 Overall DoD

- real ACP execution exists for the beta scope
- operator control and diagnostics exist for live ACP runs
- private-coupling hotspots and migration seams are documented
- the project is ready to move from execution beta into sessionized swarm work

Current status: complete (2026-03-22).

## M3 Sessionized Swarm

### M3 Overall DoD

- persistent session reuse works
- thread binding is supported where channel policy allows
- follow-up/steer flow works on existing ACP sessions
- recovery and retry strategy is documented and tested

Current status: complete (2026-03-22).

### M3.0 DoD

- session schema exists and validates
- session records persist independently from runs
- session lifecycle derived from execution outcomes
- `swarm status` includes session summary
- operator can list and inspect sessions
- M2.x state migrates cleanly forward
- unit and e2e coverage exists for session registry basics

Current status: complete (2026-03-21).

### M3.1 DoD

- tasks with `reuse_if_available` policy dispatch to idle persistent sessions
- tasks with `require_existing` policy fail cleanly when no session exists
- session record correctly updated on reuse (`createdAt` preserved)
- operator can see reuse details in run output and reports
- unit + e2e coverage exists for reuse flow

Current status: complete (2026-03-22).

### M3.2 DoD

- thread-bound task dispatch within persistent sessions
- follow-up/steer commands on existing sessions
- `allowThreadBinding` config enforcement
- task chaining within the same session context

Current status: complete (2026-03-22).

### M3.3 DoD

- automatic retry for transient session failures
- session resurrection after orchestrator restart
- orphaned session detection and cleanup
- configurable retry policy per task kind

Current status: complete (2026-03-22).

## M4 Harness Enhancement

### M4 DoD

- cross-session progress summary synthesized after run and review
- session bootstrap verifies environment, loads progress, selects task, and verifies baseline
- sprint contracts generated from spec acceptance criteria and attached to coding tasks
- task field immutability enforced on workflow save when enabled
- evaluator tasks auto-injected after coding tasks with dependency chain preserved
- quality rubrics score across weighted dimensions and integrate with the review gate
- session budget tracks duration and retries with exceeded annotation
- harness assumption metadata is stored and validated on workflow state
- all features remain backward compatible with existing `M1-M3` flows when disabled
- e2e regression covers the enhanced flow and backward compatibility

Current status: complete (2026-03-25).

## M5 ACP-Default Convergence

### M5 Overall DoD

- ACP is the only default-capable automated runner
- ACP automation uses the public control-plane path as the supported path
- `subagent` is retained only as a legacy bridge-backed opt-in path
- historical workflows, runs, and sessions remain readable

### M5.4a DoD

- minimum supported OpenClaw version is fixed for bridge-free ACP expectations
- bridge-exit metadata is surfaced through doctor, status, and workflow reports
- live smoke matrix is defined, documented, and rerun on a supported install
- remaining ACP bridge dependencies are enumerated explicitly
- the full report and journal artifact structure is documented for smoke verification

Current status: complete (2026-03-27).

Completion evidence:

- version floor fixed at `>=2026.3.22`
- doctor, status, and report surfaces implemented
- unit, e2e, and build gates green
- full local smoke matrix rerun successfully on `OpenClaw 2026.3.24`
- direct smoke, dry-run, live run, session lifecycle, and review/report/journal sync all verified with `opencode` as the local ACP default agent

Operational note:

- the previously observed `openclaw swarm doctor --json` hang was sandbox-specific; outside the sandbox the command exits normally

Exit rule: satisfied on 2026-03-27.

### M5.4b DoD

- ACP bridge code can be removed without breaking the default path on supported installs
- bridge-specific ACP compatibility logic is deleted or isolated behind legacy-only guards
- operator guidance no longer depends on ACP bridge as a supported runtime path

Current status: complete (2026-03-27).

Completion evidence:

- `resolveSessionAdapter()` now resolves only the public ACP adapter or the unsupported adapter
- ACP bridge command handlers are removed from `openclaw-exec-bridge.ts`
- doctor, status, and report surfaces now show `remainingBridgeDependencies = []`
- legacy `bridge.acpFallbackEnabled` no longer grants ACP capability and is surfaced only as guidance
- unit, e2e, and build gates are green
- local `openclaw swarm doctor --json` is green on `OpenClaw 2026.3.24`
- local ACP dry-run smoke still resolves and selects `acp` after bridge removal

Exit rule: satisfied on 2026-03-27.

### M5.4c DoD

- project makes a final keep-dark/remove decision on `subagent`
- if retained, `subagent` has a justified posture and documented support boundary
- if removed, historical reads remain intact and migration guidance is documented

Current status: complete (2026-03-27).

Completion evidence:

- runtime policy now treats `subagent` as enabled only when both `subagent.enabled=true` and `bridge.subagentEnabled=true`
- `defaultRunner="subagent"` is rejected unless the subagent bridge flag is also enabled
- doctor, status, workflow reports, and session follow-up surfaces now describe subagent as `legacy bridge-backed opt-in`
- live subagent bridge tests still pass when the opt-in flags are present
- historical workflow, run, and session reads remain unchanged

Exit rule: satisfied on 2026-03-27.

## M6 Autopilot Control Plane

### M6 Overall DoD

- a deterministic autopilot `tick` exists and can progress a project without duplicating dispatch
- active ACP and legacy subagent runs can be synchronized into workflow state through the supported runtime surface
- review, recovery, and escalation behavior is policy-driven and auditable
- autopilot state, lease ownership, and decision logs persist independently from workflow business state
- pause/resume/stop controls are operator-visible
- every `M6.x` node adds unit coverage, reruns e2e regression, and keeps `npm run build` green

Current status: complete (2026-04-08).

### M6.0 DoD

- `autopilot` config schema resolves and validates
- `autopilot-state` persists independently from workflow state
- status/report surfaces expose autopilot summary fields
- `swarm autopilot status` and `swarm autopilot tick --dry-run` exist
- unit + e2e coverage exists for the skeleton path

Current status: complete (2026-04-08).

### M6.1 DoD

- lease acquisition and expiry prevent concurrent active ticks on the same project
- deterministic `tick()` can dispatch ready/queued tasks through the existing orchestrator
- repeated no-op ticks do not create duplicate runs
- queue refill respects existing runtime concurrency limits and new autopilot dispatch caps
- unit + e2e coverage exists for idempotent dispatch behavior

Current status: complete (2026-04-08).

### M6.2 DoD

- ACP and legacy subagent runners expose a supported sync path into run records
- accepted/running sessions can be reconciled during a tick
- supervised review policies can auto-close low-risk review items while holding unsafe cases
- review decisions record policy reasons in operator-visible state
- unit + e2e coverage exists for sync and review closure

Current status: complete (2026-04-08).

### M6.3 DoD

- stuck-run and stale-session detection is policy-driven
- controlled recovery actions exist for retry, safe cancel, safe close, and escalation
- degraded mode can reduce or halt new dispatch when failure rate breaches policy
- report/status surfaces summarize recovery, retry, and escalation activity
- unit + e2e coverage exists for recovery and degraded-mode behavior

Current status: complete (2026-04-08).

### M6.4 DoD

- service loop wrapper exists over deterministic tick
- `start`, `pause`, `resume`, and `stop --mode safe` work with visible operator state
- decision log, status, and report semantics are aligned
- full milestone regression is rerun before closeout
- unit tests, e2e tests, and build pass at release-freeze time

Current status: complete (2026-04-08).

## Assessment History

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
- `M6.0` complete (2026-04-08): control-plane skeleton, autopilot state persistence, and operator status/report surface shipped
- `M6.1` complete (2026-04-08): deterministic lease-backed dispatch tick shipped
- `M6.2` complete (2026-04-08): ACP/subagent sync and supervised review closure shipped; full local regression green
- `M6.3` complete (2026-04-08): recovery planner, stuck/stale handling, cancel/close/retry/escalate actions, and degraded dispatch hold shipped
- `M6.4` complete (2026-04-08): service loop, start/pause/resume/stop controls, and aligned status/report semantics shipped; `npm run build` and `npm test` green
- `M6` complete (2026-04-08): Autopilot Control Plane closed out at 63 unit test files / 381 unit tests and 25 e2e files / 34 e2e tests
