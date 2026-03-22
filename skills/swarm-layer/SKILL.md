---
name: swarm-layer
description: "OpenClaw Swarm Layer: spec-driven workflow orchestration with ACP/subagent execution, persistent sessions, review gates, and automatic retry. Covers setup, operation, diagnosis, and reporting."
---

# OpenClaw Swarm Layer

Turn workflow specifications into executable task graphs. Dispatch tasks through manual, ACP (Codex/Claude Code), or subagent runners. Track execution via persistent sessions with reuse and thread binding. Gate completion with review approval. Auto-retry on failure. Generate reports to local disk and Obsidian.

## What It Does

- **Spec-driven planning** — Write a Markdown spec with goals and phased tasks → generates a dependency-ordered task graph
- **Multi-runner execution** — Manual (operator-driven), ACP (delegate to Codex/Claude Code/Gemini), Subagent (OpenClaw-native child agents)
- **Session management** — Persistent sessions with binding-key reuse, thread-bound follow-up, and steering messages
- **Review gates** — Tasks require explicit approve/reject before marking done
- **Automatic retry** — Configurable per-task retry policy with dead letter tracking for exhausted tasks
- **Operator reports** — Status snapshots, run logs, review logs, spec archives, completion summaries → local + Obsidian sync

## What It Does NOT Do

- Not a distributed multi-node orchestrator — single machine, single project
- Not a CI/CD pipeline — no git push, PR creation, or deployment automation
- Not an autonomous PR factory — operator stays in the loop for review decisions

## Install

Three installation paths:

**ClawHub** (skill only):
```bash
clawhub install swarm-layer
```

**npm** (full plugin):
```bash
npm install openclaw-swarm-layer
openclaw plugins install -l node_modules/openclaw-swarm-layer
```

**GitHub** (source):
```bash
git clone https://github.com/xucheng/openclaw-swarm-layer.git
cd openclaw-swarm-layer && npm install && npm run build
openclaw plugins install -l /path/to/openclaw-swarm-layer
```

After install, verify: `openclaw plugins info openclaw-swarm-layer` should show `Status: loaded`.

## End-to-End Example

```bash
# 1. Initialize
openclaw swarm init --project /tmp/my-project

# 2. Write a spec
cat > /tmp/my-project/SPEC.md << 'EOF'
# Feature Build
## Goals
- Implement and test the new feature
## Phases
### Implement
- Write the core logic
### Test
- Run unit tests
EOF

# 3. Plan
openclaw swarm plan --project /tmp/my-project --spec /tmp/my-project/SPEC.md
# → specId: feature-build, taskCount: 2

# 4. Execute first task
openclaw swarm run --project /tmp/my-project --runner acp
# → action: dispatched, runId: implement-task-1-run-...

# 5. Poll until complete
openclaw swarm session status --project /tmp/my-project --run <runId>
# → status: completed

# 6. Approve
openclaw swarm review --project /tmp/my-project --task <taskId> --approve
# → status: done

# 7. Execute next task, repeat steps 4-6

# 8. View report
openclaw swarm report --project /tmp/my-project
```

## Links

- **GitHub**: https://github.com/xucheng/openclaw-swarm-layer
- **npm**: https://www.npmjs.com/package/openclaw-swarm-layer
- **Docs**: https://github.com/xucheng/openclaw-swarm-layer/tree/main/docs
- **Issues**: https://github.com/xucheng/openclaw-swarm-layer/issues
- **ClawHub**: https://clawhub.ai/skills/swarm-layer

---

## Module Router

Determine which module to use based on what the user needs:

| User Intent | Module | Key Commands |
|------------|--------|-------------|
| Install, configure, initialize | [Setup](#setup) | `plugins install`, `doctor`, `init` |
| Plan, execute, review, session ops | [Operate](#operate) | `plan`, `run`, `review`, `session *` |
| Something broken, stuck, or failing | [Diagnose](#diagnose) | `doctor`, `session status/cancel/cleanup` |
| Check progress, read reports | [Report](#report) | `status`, `report`, `session list/inspect` |

When unsure, start with `openclaw swarm status --project .` to assess the situation.

---

# Setup

## When to Use
First-time install, bridge configuration, project initialization, or config troubleshooting.

## Flow

### 1. Prerequisites
```bash
node --version     # >= 22
openclaw --version # >= 2026.2.24
```

### 2. Install Plugin
```bash
openclaw plugins install -l /path/to/openclaw-swarm-layer
openclaw plugins info openclaw-swarm-layer   # Should show Status: loaded
```

### 3. Configure Bridge (for ACP/subagent execution)
```json
{
  "plugins": { "entries": { "openclaw-swarm-layer": { "config": {
    "acp": {
      "enabled": true,
      "defaultAgentId": "codex",
      "allowedAgents": ["codex"],
      "defaultMode": "run"
    },
    "bridge": {
      "enabled": true,
      "nodePath": "$(which node)",
      "openclawRoot": "$(npm root -g)/openclaw",
      "versionAllow": ["CURRENT_VERSION"]
    }
  }}}}
}
```

### 4. Verify
```bash
openclaw swarm doctor --json
# severity should be "healthy" or "warning", not "blocked"
```

### 5. Initialize Project
```bash
openclaw swarm init --project .
```

### 6. Optional: Obsidian Sync + Journal
```json
{
  "obsidianRoot": "/path/to/vault/reports",
  "obsidianJournal": {
    "enableRunLog": true,
    "enableReviewLog": true,
    "enableSpecArchive": true,
    "enableCompletionSummary": true
  }
}
```

### Setup Troubleshooting
- **Plugin not loading** → `openclaw plugins info openclaw-swarm-layer`
- **Bridge blocked** → `openclaw swarm doctor --json`, follow `remediation`
- **Version mismatch** → update `bridge.versionAllow`

---

# Operate

## When to Use
Plan and execute workflows, manage sessions, complete review cycles.

## Core Loop

```
Write Spec → Plan → Status → Run → Poll Session → Review → Repeat
```

### Write a Spec
```markdown
# My Workflow
## Goals
- What to achieve
## Phases
### Phase 1
- Task A
- Task B
```

### Plan → Run → Review
```bash
openclaw swarm plan --project . --spec SPEC.md      # Import and generate tasks
openclaw swarm status --project .                     # See what's ready
openclaw swarm run --project . --dry-run              # Preview
openclaw swarm run --project . --runner acp           # Execute (acp/manual/subagent)
openclaw swarm session status --project . --run <id>  # Poll until complete
openclaw swarm review --project . --task <id> --approve
```

### Runner Selection
| Runner | Use When |
|--------|----------|
| `manual` | Operator executes and records manually (default) |
| `acp` | Delegate to external harness (Codex, Claude Code) |
| `subagent` | OpenClaw-native child agent delegation |

### Session Operations
```bash
session list --project .                                    # List all
session inspect --project . --session <id>                  # Details
session follow-up --project . --session <id> --task <desc>  # Inject task
session steer --project . --session <id> --message <text>   # Redirect
session cancel --project . --run <id>                       # Abort
session cleanup --project . --stale-minutes 60              # Clean orphans
```

### Session Policies
| Policy | Behavior |
|--------|----------|
| `none` | New session each run (default) |
| `create_persistent` | Creates reusable persistent session |
| `reuse_if_available` | Reuse idle persistent session if match found |
| `require_existing` | Fail if no matching session exists |

### Conversational Patterns
| User Says | Do This |
|-----------|---------|
| "start a new workflow" | Help write spec → `plan` → `status` |
| "run the next task" | `status` → dry-run → `run` |
| "what's happening?" | `status` → `session status` for running tasks |
| "approve everything" | List review queue → approve each |
| "something is stuck" | → [Diagnose](#diagnose) module |

---

# Diagnose

## When to Use
Tasks stuck, bridge failures, sessions not updating, dead letters, orphans.

## Diagnostic Flow

```
1. openclaw swarm doctor --json      → Check bridge health
2. openclaw swarm status --project . → Find abnormal tasks/sessions
3. Investigate specific issue (see below)
```

### Doctor Severity
| Severity | Meaning | Action |
|----------|---------|--------|
| `healthy` | All good | None |
| `warning` | Works but risky | Address warnings when convenient |
| `blocked` | Cannot execute | Follow `remediation` immediately |

### Issue Resolution

**Bridge failure:**
- `doctor --json` → check `blockers` → follow `remediation`
- Common: update `bridge.versionAllow`, check `nodePath`/`openclawRoot`

**Stuck running task:**
```bash
swarm session status --project . --run <runId>   # Check if session died
swarm session cancel --project . --run <runId>   # Force cancel if hung
```

**Dead letter task** (retries exhausted):
- `swarm status` → find `dead_letter` tasks
- Fix root cause → manually reset task to `ready`

**Orphaned sessions** (stale active):
```bash
swarm session cleanup --project . --stale-minutes 60
```

**Version drift** (after OpenClaw upgrade):
```bash
swarm doctor --json
# Update bridge.versionAllow → rerun tests → verify doctor
```

---

# Report

## When to Use
Check progress, generate reports, understand session inventory.

## Quick Check
```bash
openclaw swarm status --project .  # Structured summary
openclaw swarm report --project .  # Full Markdown report
```

## Report Sections
| Section | Content |
|---------|---------|
| **Attention** | Items needing action: review / blocked / running / dead_letter |
| **Tasks** | All tasks with current status |
| **Review Queue** | Tasks awaiting approve/reject |
| **Highlights** | Notable terminal events (completed/failed/cancelled) |
| **Recommended Actions** | What to do next |
| **Recent Runs** | Last 5 runs |
| **Sessions** | Last 5 sessions with state |
| **Session Reuse Candidates** | Which tasks can reuse which sessions |

## Report Files
| File | Trigger | Mode |
|------|---------|------|
| `swarm-report.md` | Every operation | Overwrite |
| `run-log.md` | `swarm run` | Append |
| `review-log.md` | `swarm review` | Append |
| `specs/<specId>.md` | `swarm plan` | Create once |
| `completion-summary.md` | All tasks done | Overwrite |

Local: `<project>/.openclaw/swarm/reports/` (always)
Obsidian: `<obsidianRoot>/<project>/` (optional async mirror)

## Conversational Patterns
| User Says | Do This |
|-----------|---------|
| "what's the status?" | `status` → summarize counts + attention |
| "show me the report" | `report` → read and present key sections |
| "what needs attention?" | `status` → focus on `attention` array |
| "how are sessions?" | `status` → show session counts + recent |

---

# Tools Reference

For AI tool calling. All tools accept `--json` for structured output.

| Tool | Parameters | Purpose |
|------|-----------|---------|
| `swarm_status` | `project` | Workflow status with attention items |
| `swarm_task_plan` | `project`, `spec` | Import spec, generate task graph |
| `swarm_run` | `project`, `task?`, `dryRun?` | Dispatch next runnable task |
| `swarm_review_gate` | `project`, `task`, `approve?`, `reject?`, `note?` | Approve/reject review |
| `swarm_session_status` | `project`, `run` | Poll session status |
| `swarm_session_cancel` | `project`, `run`, `reason?` | Cancel session |
| `swarm_session_close` | `project`, `run`, `reason?` | Close session |
