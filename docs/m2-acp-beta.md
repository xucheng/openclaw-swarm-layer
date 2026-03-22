# M2 ACP Execution Beta

## Goal

Turn the current ACP scaffold into a real oneshot ACP execution path without expanding into persistent session and thread-binding complexity too early.

## Implementation Order

## T0 - G0 Integration Decision

- freeze the ACP orchestration contract
- document `sessions_spawn` semantics as the target behavior
- record any missing public plugin-side execution facade

## T1 - ACP Mapping Layer

- map `TaskNode.runner` to ACP spawn params
- include:
  - `task`
  - `agentId`
  - `runtime = "acp"`
  - `mode`
  - `thread`
  - `cwd`
  - `runTimeoutSeconds`
- validate plugin config and task config before launch

## T2 - OpenClaw Session Adapter

- build a dedicated adapter for ACP session submission
- return a normalized accepted result shape
- avoid spreading ACP-specific details throughout the orchestrator

Current status:

- implemented for mock/test adapters
- experimental real adapter exists behind config guard
- real runtime path is blocked because public `openclaw/plugin-sdk` exports do not expose `getAcpSessionManager()` at runtime

## T3 - Real `AcpRunner.run()`

- submit the ACP run
- record `spawn_requested`
- record `spawn_accepted`
- write `sessionRef`
- persist minimal accepted run record

Current status:

- accepted-run ledger is implemented
- real OpenClaw control-plane submission is blocked by missing public ACP manager export

## T4 - Run Ledger Extension

- extend `RunRecord` for ACP execution
- include:
  - `sessionRef`
  - `events[]`
  - ACP-specific status progression
- add migration compatibility from `M1`

## T5 - Minimal Status Sync

- support explicit sync/status refresh
- map ACP runtime states to swarm run states
- support at least:
  - accepted
  - running
  - completed
  - failed
  - timeout

## T6 - Review Integration

- ACP completion enters review gate when required
- ACP failure and timeout also enter review flow
- review can drive task to:
  - `done`
  - `blocked`
  - `ready`

## T7 - Operator Commands

- `swarm run --runner acp`
- `swarm session status`
- `swarm session cancel`
- `swarm session close`

## T8 - Test Matrix

- unit tests
  - mapping
  - validation
  - sessionRef persistence
  - status mapping
- e2e tests
  - ACP happy path
  - review path
- smoke tests
  - at least one real harness
- failure tests
  - timeout
  - backend unavailable
  - cancel

Current status:

- unit and e2e coverage exist for scaffold, accepted run, status sync, terminal sync, cancel, and close
- a real ACP smoke attempt was run and failed at the same public SDK export blocker

## Current Blocker

- experimental real adapter was tested against local OpenClaw + `acpx`
- the adapter failed with: public `openclaw/plugin-sdk` runtime does not expose `getAcpSessionManager()`
- next decision point is:
  - wait for upstream public ACP control-plane export, or
  - intentionally adopt a private deep-import experiment with known maintenance risk

## ACP Versus Subagent For Swarm Layer

OpenClaw supports both `subagent` and `acp` spawned work:

- `subagent`
  - OpenClaw-native child session
  - better when the orchestrator wants internal delegated runs and built-in announce behavior
- `acp`
  - external harness runtime
  - better when the orchestrator must drive Codex / Claude Code / Gemini CLI / similar coding harnesses

Recommendation for this project:

- keep ACP as the main M2 direction
- do not replace M2 with a subagent pivot just because ACP is currently blocked
- optionally add a future `subagent` runner only as a complementary path, not as the replacement for harness execution

## Out Of Scope For M2

- persistent session reuse
- thread binding
- advanced recovery engine
- distributed orchestration
