# Roadmap

## Summary

The project now uses a four-stage roadmap:

- `M1` Orchestration Foundation
- `M2` ACP Execution Beta
- `M3` Sessionized Swarm
- `M4` Harness Enhancement

`M1` is the stable orchestration base. `M2` adds real ACP execution. `M3` adds persistent session and thread-bound capabilities. `M4` applies GAN-inspired harness patterns for long-running agents.

## M1 - Orchestration Foundation

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

- single-machine orchestration prototype that is already usable for internal planning and controlled manual execution

## M2 - ACP Execution Beta

Target:

- real ACP oneshot execution for selected tasks
- stable `runId <-> sessionRef` tracking
- review-gated ACP result handling
- operator session control

Required front gate:

- `G0` ACP integration decision
  - treat `sessions_spawn` semantics as the orchestration contract
  - avoid private deep-imports as the long-term solution
  - freeze task-to-session mapping before implementation expands

Sub-milestones:

- `M2.0` ACP oneshot MVP
- `M2.1` operator control
- `M2.2` beta hardening

Delivery level:

- single-machine, single-project internal beta for spec-driven orchestration with manual + ACP oneshot execution

Current status:

- bridge-backed ACP execution is now working locally
- bridge-backed subagent execution is also working locally
- the project has moved beyond “spawn blocked” into “bridge hardening and operator reliability”
- bridge doctor/self-check and lifecycle reconciliation are now in place

## M3 - Sessionized Swarm

Target:

- persistent ACP sessions
- thread binding
- session reuse and steer flows
- stronger recovery and retry behavior

Delivery level:

- enhanced swarm runtime for longer-lived session workflows, still intentionally not a distributed control plane

Recommended structure:

- `M3.0` Session Foundation
- `M3.1` Persistent ACP Session Reuse
- `M3.2` Thread Binding And Follow-up
- `M3.3` Retry/Recovery Expansion

## End State After M1-M2

The expected delivery level after `M1-M2` is:

- internal beta
- single machine
- single project
- operator in the loop
- manual + ACP oneshot execution
- review-gated completion
- report and status visibility for operator and Obsidian

It should not yet claim:

- fully autonomous swarm
- persistent threaded ACP collaboration
- multi-node execution
- unattended PR factory

## Current M2 Snapshot

Implemented in code today:

- ACP config and preflight
- ACP spawn mapping
- accepted ACP run ledger
- session status sync
- review/cancel/close integration
- report refresh during ACP lifecycle
- secondary subagent runner scaffold with accepted-run flow via injected adapter
- bridge-backed ACP real smoke path
- bridge-backed subagent real smoke path

Blocked today:

- stable production-grade adapter without upstream private-coupling risk
- broader failure matrix and compatibility hardening
- richer asynchronous completion/result ingestion

## M4 - Harness Enhancement

Target:

- cross-session progress memory bridge
- sprint contracts with verifiable acceptance criteria
- GAN-inspired evaluator task injection
- structured quality rubrics replacing binary review
- session budget controls
- task field immutability
- harness assumption metadata

Delivery level:

- all features opt-in via config, backward compatible with existing workflows
- existing M1-M3 flows work unchanged when new features are disabled

Current status: complete (2026-03-25)

## M1-M4 Assessment

- `M1` is complete
- `M2.0` is complete
- `M2.1` is complete
- `M2.2` is complete
- `M2.3` is complete
- `M3.0` is complete (closeout 2026-03-21)
- `M3.1` is complete (closeout 2026-03-22)
- `M3.2` is complete (closeout 2026-03-22)
- `M3.3` is complete (closeout 2026-03-22)
- `M4` is complete (closeout 2026-03-25)

All M1-M4 milestones are complete. The four-stage roadmap is fully delivered.

Test coverage: 283 unit tests across 51 files, 24 e2e tests across 17 files, build clean.

Delivery level reached:

- single-machine, single-project, operator-in-the-loop
- bridge-backed internal beta with real ACP/subagent execution
- spec-driven orchestration with persistent session reuse
- thread-bound multi-turn collaboration
- automatic retry with dead letter tracking
- orphaned session detection and cleanup
- full operator visibility through CLI, status, and reports
- GAN-inspired harness patterns: sprint contracts, evaluator injection, quality rubrics
- cross-session continuity: progress summary, bootstrap sequence, assumption tracking
- protective guardrails: task immutability, session budgets

## Spawn Paths Comparison

OpenClaw does not only have ACP for spawned execution.

- `runtime="subagent"`
  - OpenClaw-native delegated run
  - best for internal background/parallel work
  - strong fit when the orchestrator wants OpenClaw-managed child runs and announce flow
- `runtime="acp"`
  - external harness runtime through an ACP backend such as `acpx`
  - best for Codex / Claude Code / Gemini CLI style execution
  - now works locally through the bridge-backed path

Project recommendation:

- keep `manual + acp` as the primary Swarm Layer direction because the product goal is harness orchestration
- treat `subagent` as a valid fallback or future secondary runner for OpenClaw-native delegated work
- do not switch the core roadmap from ACP to subagent just to avoid the current blocker, because that would change the product boundary rather than solve the intended execution path

Current implementation note:

- a `subagent` runner now exists in code as a secondary path
- a bridge-backed real subagent path also exists and has passed local smoke

See also `docs/spawn-path-feasibility.md`.
