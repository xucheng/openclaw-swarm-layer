---
name: swarm-operate
description: Guide users through the full swarm workflow — from writing specs to executing tasks, managing sessions, and completing review cycles.
---

# Swarm Operate

Walk the user through the complete orchestration lifecycle conversationally.

## When to Use

Use this skill when the user wants to:
- Plan and execute a workflow from a spec
- Run tasks through the orchestration loop
- Manage ACP/subagent sessions
- Follow up on or steer active sessions
- Complete the review cycle

## The Core Loop

```
Write Spec → Plan → Check Status → Run → Poll Session → Review → Repeat
```

### Phase 1: Write a Spec

Help the user create a spec file with this structure:

```markdown
# <Workflow Title>

## Goals
- <what should be achieved>

## Constraints
- <any limitations>

## Acceptance Criteria
- <how to verify success>

## Phases
### <Phase Name>
- <Task description 1>
- <Task description 2>
### <Next Phase>
- <Task description 3>
```

Tasks within a phase are sequential. Each phase depends on the previous.

### Phase 2: Import and Plan

```bash
openclaw swarm plan --project . --spec SPEC.md
```

This generates a task graph. Check the result:

```bash
openclaw swarm status --project .
```

Look at:
- `totalTasks` — how many tasks were created
- `readyTasks` — how many can run immediately
- Task list with statuses

### Phase 3: Execute

**Dry-run first** to preview what will happen:

```bash
openclaw swarm run --project . --dry-run
```

**Execute for real:**

```bash
# Manual runner (default — marks task for review immediately)
openclaw swarm run --project .

# ACP runner (dispatches to external harness like Codex)
openclaw swarm run --project . --runner acp

# Subagent runner (OpenClaw-native delegation)
openclaw swarm run --project . --runner subagent
```

### Phase 4: Monitor Sessions (ACP/Subagent only)

After ACP or subagent dispatch, the task enters `running` state. Poll for completion:

```bash
openclaw swarm session status --project . --run <runId>
```

Repeat until status changes to `completed`, `failed`, or `timed_out`.

**If stuck**, you can cancel:

```bash
openclaw swarm session cancel --project . --run <runId> --reason "taking too long"
```

### Phase 5: Review

When a task reaches `review_required`, the operator must approve or reject:

```bash
# Approve — task moves to done
openclaw swarm review --project . --task <taskId> --approve --note "Looks good"

# Reject — task moves to blocked
openclaw swarm review --project . --task <taskId> --reject --note "Needs rework"
```

### Phase 6: Check Progress and Continue

```bash
openclaw swarm status --project .
```

If there are more `readyTasks`, go back to Phase 3. When all tasks are `done`, the workflow is complete.

## Session Operations

### Follow-up (inject a new task into an active session)

```bash
openclaw swarm session follow-up --project . --session <sessionId> --task "Fix the remaining test failures"
```

### Steer (send a message to redirect an active session)

```bash
openclaw swarm session steer --project . --session <sessionId> --message "Focus on performance tests instead"
```

### List all sessions

```bash
openclaw swarm session list --project .
```

### Inspect a specific session

```bash
openclaw swarm session inspect --project . --session <sessionId>
```

### Clean up orphaned sessions

```bash
openclaw swarm session cleanup --project . --stale-minutes 60
```

## Conversational Patterns

When the user says **"start a new workflow"**:
1. Help them write a spec
2. Run `plan`
3. Show `status`

When the user says **"run the next task"**:
1. Run `status` to see what's ready
2. Suggest dry-run first
3. Execute with appropriate runner

When the user says **"what's happening?"**:
1. Run `status` to show attention items
2. For running tasks, poll `session status`
3. Highlight review queue items

When the user says **"approve everything"**:
1. List review queue from `status`
2. Approve each task sequentially
3. Show final status

When the user says **"something is stuck"**:
1. Check `status` for blocked/running tasks
2. Check `session status` for the latest run
3. Suggest cancel if session is hung
4. Run `doctor` if bridge issues suspected
