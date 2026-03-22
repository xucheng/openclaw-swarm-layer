---
name: swarm-report
description: Generate, read, and analyze swarm workflow reports — task progress, session inventory, attention items, and operator recommendations.
---

# Swarm Report

Help the user generate and understand workflow reports.

## When to Use

Use this skill when the user wants to:
- See current workflow progress
- Generate a status report
- Review session inventory
- Check what needs attention
- View historical run results

## Quick Status Check

For a fast overview:

```bash
openclaw swarm status --project <path>
```

This returns structured data including:
- Workflow lifecycle state
- Task counts (total, ready, running, blocked, dead letter)
- Review queue
- Attention items with recommended actions
- Session inventory (active, idle, closed, orphaned)
- Session reuse candidates
- Recent runs

## Generate Full Report

```bash
openclaw swarm report --project <path>
```

This writes a Markdown report to:
- **Local**: `<project>/.openclaw/swarm/reports/swarm-report.md`
- **Obsidian**: `<obsidianRoot>/<project-name>-swarm-report.md` (if configured)

## Report Sections Explained

### Attention
Items requiring immediate operator action:
- `[review]` — task completed, needs approval
- `[blocked]` — task is blocked, investigate root cause
- `[running]` — task still in progress, may need polling
- `[dead_letter]` — task exhausted all retries

Each item includes a `recommendedAction`.

### Tasks
All tasks with current status: `planned`, `ready`, `running`, `review_required`, `blocked`, `done`, `failed`, `dead_letter`.

### Review Queue
Tasks waiting for `--approve` or `--reject`. Shows latest run summary for context.

### Highlights
Notable terminal events from recent runs: completions, failures, cancellations, timeouts.

### Recommended Actions
Deduplicated list of operator actions from attention items and highlights.

### Recent Runs
Last 5 runs sorted by recency. Shows runner type, status, and result summary.

### Sessions
Last 5 sessions sorted by recency. Shows runner, mode (oneshot/persistent), state, and summary.

### Session Reuse Candidates
For each task, shows whether it's eligible for session reuse:
- `eligible=true` with `selected=<sessionId>` — would reuse that session
- `eligible=true` with no selection — eligible but no matching session available
- `eligible=false` — task kind or policy doesn't support reuse

## Reading Reports Conversationally

When the user asks **"what's the status?"**:
1. Run `openclaw swarm status --project <path> --json`
2. Summarize: "X tasks done, Y ready, Z in review queue"
3. Highlight any attention items

When the user asks **"show me the report"**:
1. Run `openclaw swarm report --project <path>`
2. Read the generated `.openclaw/swarm/reports/swarm-report.md`
3. Present key sections

When the user asks **"what needs my attention?"**:
1. Run `status` and focus on `attention` array
2. For each item, explain what happened and what to do next

When the user asks **"how are sessions doing?"**:
1. Run `status` and show `sessions` counts
2. List `recentSessions` with state info
3. Highlight any orphaned or failed sessions

## Inspect Specific Items

```bash
# Inspect a session in detail
openclaw swarm session inspect --project <path> --session <sessionId>

# View all sessions
openclaw swarm session list --project <path>
```
