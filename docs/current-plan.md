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
- `M4`: complete (Harness Enhancement)
- **All M1-M4 milestones delivered.**

## M1-M3.3 Completion Matrix

| Milestone | DoD Criteria | Status | Notes |
|-----------|-------------|--------|-------|
| M1 | Plugin installs, CLI works, init-plan-run-review-report flow, tests pass | Complete | Stable foundation |
| G0 | ACP integration surface documented, mapping frozen | Complete | sessions_spawn contract chosen |
| M2.0 | `swarm run --runner acp` launches real task, session tracking, smoke test | Complete | Bridge-backed path |
| M2.1 | Session status/cancel/close, bridge doctor, failure matrix | Complete | Bridge hardened |
| M2.2 | Event logs, operator UX polish, normalized summaries | Complete | Operator-ready |
| M2.3 | Public API seams, compatibility metadata, migration checklist | Complete | Convergence planned |
| M3.0 | Session schema, store, lifecycle, CLI list/inspect, status/report integration | Complete | Foundation laid |
| M3.1 | `reuse_if_available` dispatches to idle session, `require_existing` fails cleanly, reuse visible in reports | Complete | Session reuse working |
| M3.2 | Thread-bound dispatch, follow-up/steer commands, `allowThreadBinding` enforcement | Complete | Thread binding working |
| M3.3 | Automatic retry, orphan detection/cleanup, dead letter tracking, configurable retry policy | Complete | Retry and recovery working |
| M4 | Harness enhancement: progress summary, bootstrap, sprint contracts, evaluator injection, quality rubrics, session budget, assumption metadata, task immutability | Complete | GAN-inspired patterns applied |

## M3.1 Closeout Details

Delivered:

- **P1** - `AcpSpawnParams.existingSessionKey` and `RunnerRunInput.reusedSession` fields added
- **P2** - `AcpRunner.run()` passes existing sessionKey through spawn params; run record marks reused sessions with `session_reused` event type
- **P3** - `SwarmOrchestrator.runOnce()` calls `selectReusableSessionForTask` before dispatch; `require_existing` returns `session_required` error; `RunOnceResult.reusedSessionId` field added
- **P4** - Run summaries distinguish "ACP session reused: ..." from "ACP session accepted: ..."; dry-run shows "would reuse session X"; lastAction includes reused session label
- **P5** - 165 unit tests (7 new for M3.1), build clean
- **P6** - 22 e2e tests (2 new: full reuse flow + require_existing error), full regression green
- **CLI fix** - `swarm-run.ts` now passes `sessionStore` to `createOrchestrator` so session reuse selection works through CLI path

Test coverage: 165 unit tests across 37 files, 22 e2e tests across 16 files.

## What Is Proven Now

Everything from M3.0 plus:

- Tasks with `reuse_if_available` policy dispatch to an idle persistent session when one exists
- Tasks with `require_existing` policy fail cleanly with `session_required` when no matching session exists
- Session record is correctly updated on reuse (createdAt preserved, state transitions idle -> active)
- AcpRunner passes `existingSessionKey` through spawn params for the backend to handle
- Operator sees "reused session=X" in run output, reports, and lastAction
- Dry-run mode shows session reuse intent without executing
- No-match reuse_if_available gracefully falls back to spawning new session

## M3.2 Closeout Details

Delivered:

- **P0** - Type extensions: `SessionRecord.threadId`, `RunRecord.sessionRef.threadId`, `AcpSpawnParams.threadId`, `AcpAcceptedSession.threadId`
- **P1** - AcpRunner thread dispatch: passes `threadId` from reused session through spawn params; records threadId from backend response in sessionRef
- **P2** - Orchestrator config enforcement: rejects thread-bound dispatch when `allowThreadBinding=false` with clear error message
- **P3** - CLI commands: `swarm session follow-up` (injects task into active session) and `swarm session steer` (sends message to active session)
- **P4** - Session lifecycle: `buildSessionRecordFromRun` captures threadId from run sessionRef; preserves existing threadId on merge
- **P5** - Tests: 176 unit tests (11 new), 22 e2e tests, build clean, full regression green

Test coverage: 176 unit tests across 38 files, 22 e2e tests across 16 files.

## M3.3 Closeout Details

Delivered:

- **P0** - Type extensions: `RetryPolicy`, `RetryHistoryEntry`, `TaskStatus.dead_letter`, `TaskNode.runner.retryPolicy`, `RunRecord.retryHistory`, `WorkflowStatusSummary.deadLetterTasks`
- **P1** - Retry engine: `shouldRetry()`, `isRetryableStatus()`, `appendRetryHistory()` in `retry-engine.ts`; `SwarmOrchestrator.evaluateRetry()` checks policy, re-dispatches or moves to dead letter
- **P2** - Orphan detection: `swarm session cleanup` scans active sessions for staleness, marks as orphaned with configurable `--stale-minutes` threshold
- **P3** - Dead letter visibility: `dead_letter` status in tasks, attention items with "exhausted all retries" message, dead letter count in report summary
- **P4** - Tests: 187 unit tests (11 new), 22 e2e tests, build clean, full regression green

Test coverage: 187 unit tests across 40 files, 22 e2e tests across 16 files.

## M4 Harness Enhancement Closeout Details

Delivered (2026-03-25):

- **Step 1** - Cross-session progress summary: `synthesizeProgress()` + `formatProgressMarkdown()`, auto-updated after run and review
- **Step 2** - Session bootstrap sequence: 4-step deterministic startup with `bootstrap.enabled` config toggle
- **Step 3** - Sprint contracts: `SprintContract` with `AcceptanceCriterion` types, auto-generated from spec acceptance criteria
- **Step 4** - Task field immutability guard: `validateTaskImmutability()` enforced on `saveWorkflow()` when `enforceTaskImmutability` is true
- **Step 5** - Automated evaluator task injection: GAN-inspired `<taskId>-eval` tasks with dependency chain preservation
- **Step 6** - Structured quality rubrics: 4-dimension weighted scoring via `applyRubricResult()`, integrated with review gate
- **Step 7** - Session budget control: `SessionBudget` + `BudgetUsage` tracking in run records with exceeded annotation
- **Step 8** - Harness assumption metadata: `HarnessAssumption` lifecycle tracking on `WorkflowState`
- **Step 9** - E2E regression: full enhanced flow + backward compatibility test
- **Bridge fix** - `scripts/openclaw-exec-bridge.mjs` falls back to TS source when dist/ unavailable

Test coverage: 283 unit tests across 51 files, 24 e2e tests across 17 files.

## What Still Needs Work

- **Ongoing**: Bridge compatibility maintenance as OpenClaw versions evolve
- **Ongoing**: Public API convergence when upstream exports become available

## Next Milestones

### M3.2 - Thread Binding And Follow-up

Goal: Support multi-turn conversation within a persistent ACP session, enabling follow-up tasks to continue in the same thread context.

Scope:

- Thread ID tracking: extend `SessionRecord` with `threadId` field populated from ACP backend responses
- Thread-bound task dispatch: tasks can request a specific thread within a reused session via `task.runner.threadRequested` + session policy
- Follow-up command: new CLI command `swarm session follow-up --session <id> --task <description>` to inject a follow-up task into an active session
- Steer command: new CLI command `swarm session steer --session <id> --message <text>` to send a steering message to an active session without creating a new task
- `allowThreadBinding` config enforcement: reject thread-bound tasks when config disallows
- ACP spawn params: pass `threadId` for thread-bound dispatches
- Operator visibility: show thread context in session inspect and reports

Acceptance criteria:

- A follow-up task dispatches to the same thread as its predecessor within a persistent session
- `swarm session follow-up` creates and dispatches a task in the same session
- `swarm session steer` sends a message to an active session
- `allowThreadBinding: false` rejects thread-bound dispatch with a clear error
- Thread ID is visible in session inspect output

Not in scope:

- Multi-session thread pools
- Automatic thread management (always explicit)
- Cross-spec thread sharing

Work packages:

- **P0** - Type extensions: `SessionRecord.threadId`, `AcpSpawnParams.threadId`, thread metadata in events
- **P1** - AcpRunner thread dispatch: pass threadId from reused session to spawn params
- **P2** - Orchestrator thread selection: when reusing a session with a thread, pass it through
- **P3** - Follow-up CLI: `swarm session follow-up` command implementation
- **P4** - Steer CLI: `swarm session steer` command implementation
- **P5** - Config enforcement: validate `allowThreadBinding` before thread-bound dispatch
- **P6** - Tests and regression

### M3.3 - Retry And Recovery Expansion

Goal: Robust failure handling for session-aware workflows with automatic retry and orphan cleanup.

Scope:

- Retry policy per task: `task.runner.retryPolicy` with `{ maxAttempts, backoffSeconds, retryOn }` configuration
- Automatic retry for transient failures: when a task fails with a retryable status, the orchestrator automatically re-dispatches up to `maxAttempts`
- Session resurrection: on orchestrator restart, scan for sessions in `active` state with no recent heartbeat and transition to `orphaned`
- Orphan cleanup CLI: `swarm session cleanup` to detect and close orphaned sessions
- Dead letter tracking: tasks that exhaust retries are moved to a `dead_letter` status with full retry history
- Configurable retry classification: which failure types are retryable (e.g., `timed_out` yes, `cancelled` no)

Acceptance criteria:

- A task with `maxAttempts: 3` retries automatically on `timed_out` up to 3 times
- Orphaned sessions are detected and cleaned up on `swarm session cleanup`
- Dead-lettered tasks are visible in status/report with retry history
- Non-retryable failures (cancelled, rejected) are not retried

Not in scope:

- Distributed session coordination
- Cross-machine recovery
- Exponential backoff with jitter (simple fixed backoff only for M3.3)

Work packages:

- **P0** - Type extensions: `TaskNode.runner.retryPolicy`, `RunRecord.retryHistory`, dead letter status
- **P1** - Retry engine: orchestrator checks retry policy after failure, re-dispatches with incremented attempt
- **P2** - Orphan detection: scan sessions for stale `active` state, transition to `orphaned`
- **P3** - Cleanup CLI: `swarm session cleanup` command
- **P4** - Dead letter tracking: exhausted-retry tasks marked with full history
- **P5** - Operator visibility: retry progress and dead letters in status/report
- **P6** - Tests and regression

## Future Directions

The M1-M4 roadmap is fully delivered. Potential future milestones:

- **M5**: Multi-project orchestration — coordinate workflows across multiple project roots
- **M5.1**: Public API migration — replace bridge-backed execution with upstream public SDK exports as they become available
- **M5.2**: Distributed execution — extend beyond single-machine to multi-node coordination
- **M5.3**: Unattended PR factory — autonomous spec-to-PR pipeline without operator in the loop

These are not planned. They represent potential directions once the current beta stabilizes in production use.
