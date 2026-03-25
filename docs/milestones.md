# Milestones And Definition Of Done

## M1 DoD

- plugin installs and loads in OpenClaw
- `openclaw swarm --help` works
- `init -> plan -> status -> run --dry-run -> run -> review -> report` works
- local report and optional Obsidian report are written
- unit tests, e2e tests, and build pass

## G0 DoD

- ACP integration surface decision documented
- `task -> spawn params -> sessionRef -> run status -> review` mapping documented
- no private deep-import chosen as the intended long-term path
- implementation dependencies and upstream gaps recorded

## M2.0 DoD

- `openclaw swarm run --runner acp` can launch a real ACP oneshot task
- accepted result produces stable `runId`, `sessionRef`, and run record
- ACP success/failure enters review flow correctly
- at least one real harness smoke test passes
- unit + e2e coverage exists for mapping and happy path

Current status:

- complete via bridge-backed execution path
- local ACP smoke passes
- local subagent smoke passes

## M2.1 DoD

- `swarm session status` works
- `swarm session cancel` works
- `swarm session close` works
- operator can trace `runId <-> sessionKey`
- minimal restart recovery works for session metadata

Refined focus:

- bridge hardening
- version compatibility guards
- failure matrix coverage
- actionable operator diagnostics

## M2.2 DoD

- event log is actively used for ACP runs
- timeout, error, cancel, and review paths are observable
- at least two harness smoke paths are repeatable
- operator runbook covers setup, diagnosis, and rollback

Refined focus:

- richer completion/result ingestion
- async completion UX
- report/review/operator polish

Current status:

- complete enough for the current beta scope
- operator-facing status/report/review visibility is in place
- normalized completion summaries are in place

Ready to move on:

- yes, to `M2.3 public API convergence`

## M3 DoD

- persistent session reuse works
- thread binding is supported where channel policy allows
- follow-up/steer flow works on existing ACP sessions
- recovery and retry strategy is documented and tested

## M3.0 DoD

- session schema exists and validates
- session records persist independently from runs
- session lifecycle derived from execution outcomes
- `swarm status` includes session summary
- operator can list and inspect sessions
- M2.x state migrates cleanly forward
- unit and e2e coverage exists for session registry basics

Current status: complete (2026-03-21)

## M3.1 DoD

- tasks with `reuse_if_available` policy dispatch to idle persistent sessions
- tasks with `require_existing` policy fail cleanly when no session exists
- session record correctly updated on reuse (createdAt preserved)
- operator can see "reused session=X" in run output and reports
- unit + e2e coverage for reuse flow

Current status: complete (2026-03-22)

## M3.2 DoD

- thread-bound task dispatch within persistent sessions
- follow-up/steer commands on existing sessions
- `allowThreadBinding` config enforcement
- task chaining within same session context

Current status: complete (2026-03-22)

## M3.3 DoD

- automatic retry for transient session failures
- session resurrection after orchestrator restart
- orphaned session detection and cleanup
- configurable retry policy per task kind

Current status: complete (2026-03-22)

## M4 DoD

- cross-session progress summary synthesized after run and review
- session bootstrap verifies environment, loads progress, selects task, verifies baseline
- sprint contracts generated from spec acceptance criteria and attached to coding tasks
- task field immutability enforced on workflow save (when enabled)
- evaluator tasks auto-injected after coding tasks with dependency chain preserved
- quality rubrics score across weighted dimensions and integrate with review gate
- session budget tracks duration and retries with exceeded annotation
- harness assumption metadata stored and validated on workflow state
- all features opt-in, backward compatible with existing M1-M3 flows
- e2e regression covers full enhanced flow and backward compatibility

Current status: complete (2026-03-25)

## M3 Overall DoD

- persistent session reuse works (M3.1)
- thread binding is supported where channel policy allows (M3.2)
- follow-up/steer flow works on existing ACP sessions (M3.2)
- recovery and retry strategy is documented and tested (M3.3)

Current status: complete (2026-03-22)

## Assessment History

### M2.3

- complete
- public API availability, compatibility metadata, replacement plan, and migration checklist are operator-visible

### M3.0

- complete (2026-03-21)
- 158 unit tests, 20 e2e tests, build clean
- session foundation ready for M3.1

### M3.1

- complete (2026-03-22)
- 165 unit tests, 22 e2e tests, build clean
- session reuse working end-to-end, ready for M3.2

### M3.2

- complete (2026-03-22)
- 176 unit tests, 22 e2e tests, build clean
- thread binding, follow-up, and steer commands working, ready for M3.3

### M3.3

- complete (2026-03-22)
- 187 unit tests, 22 e2e tests, build clean
- retry engine, orphan cleanup, dead letter tracking working

### M3 Overall

- complete (2026-03-22)
- all M3 DoD criteria met
- 187 unit tests across 40 files, 22 e2e tests across 16 files

### M4

- complete (2026-03-25)
- 8 harness features + 1 bridge fix + e2e regression
- 283 unit tests across 51 files, 24 e2e tests across 17 files
