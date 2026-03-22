# Changelog

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
