---
name: swarm-layer
description: Use the OpenClaw Swarm Layer orchestration tools for spec-driven workflow planning, execution, session management, and review.
---

# Swarm Layer

Orchestrate multi-step workflows from specs through planning, execution, review, and reporting.

## When to Use

Use swarm tools when a task needs:
- Structured spec-to-task-graph planning
- Staged execution with dependency ordering
- Review gates before completion
- Session-based ACP or subagent execution
- Operator-visible progress tracking

## Tools

### swarm_status
Show current workflow status including task counts, review queue, attention items, and session inventory.
- Parameters: `project` (string, required)

### swarm_task_plan
Import a spec and build a task graph with dependency ordering.
- Parameters: `project` (string, required), `spec` (string, required — path to spec file)

### swarm_run
Dispatch the next runnable task. Supports dry-run preview and runner selection.
- Parameters: `project` (string, required), `task` (string, optional — specific task ID), `dryRun` (boolean, optional)

### swarm_review_gate
Approve or reject a task that has completed execution and requires review.
- Parameters: `project` (string, required), `task` (string, required), `approve` (boolean, optional), `reject` (boolean, optional), `note` (string, optional)

### swarm_session_status
Poll the latest session status for an ACP or subagent run. Updates workflow state if the session has reached a terminal state.
- Parameters: `project` (string, required), `run` (string, required — run ID)

### swarm_session_cancel
Cancel an active ACP or subagent session. Marks the task as blocked.
- Parameters: `project` (string, required), `run` (string, required), `reason` (string, optional)

### swarm_session_close
Close an ACP session gracefully.
- Parameters: `project` (string, required), `run` (string, required), `reason` (string, optional)

## Typical Workflow

```
1. swarm_task_plan  → import spec, generate tasks
2. swarm_status     → check what's ready
3. swarm_run        → dispatch next task (dry-run first if unsure)
4. swarm_session_status → poll until complete (for ACP/subagent runs)
5. swarm_review_gate → approve or reject the result
6. swarm_status     → check for next task or completion
```

Repeat steps 2-6 until all tasks are done.

## Session Policies

Tasks can declare session policies for persistent session reuse:
- `none` — default, each run creates a new session
- `create_persistent` — creates a persistent session that can be reused later
- `reuse_if_available` — reuses an idle persistent session if one matches
- `require_existing` — fails if no matching session exists

## Notes

- Always check `swarm_status` before running to see what's ready
- Use dry-run (`dryRun: true`) on `swarm_run` to preview without executing
- After ACP runs, poll `swarm_session_status` to detect completion
- The review gate is required by default — approve to mark tasks done
- Reports are auto-generated on every run/review and synced to Obsidian if configured
