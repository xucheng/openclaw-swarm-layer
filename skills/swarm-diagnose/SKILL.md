---
name: swarm-diagnose
description: Diagnose and resolve issues with the Swarm Layer — bridge failures, version drift, blocked tasks, orphaned sessions, and dead letter recovery.
---

# Swarm Diagnose

Help the user investigate and fix problems with the swarm orchestration system.

## When to Use

Use this skill when the user reports:
- Tasks stuck in running/blocked state
- Bridge execution failures
- Session status not updating
- Dead letter tasks
- Orphaned sessions
- Version compatibility issues

## Diagnostic Flow

### Step 1: Run Doctor

Always start here:

```bash
openclaw swarm doctor --json
```

**Interpret the output:**

| Field | Meaning |
|-------|---------|
| `severity: healthy` | Bridge fully functional |
| `severity: warning` | Bridge works but has risks (e.g., unpinned version) |
| `severity: blocked` | Bridge cannot execute — follow `remediation` |
| `checks.versionMapped` | OpenClaw version has bridge mappings |
| `checks.versionAllowed` | Version is in `versionAllow` list |
| `checks.acpBackendHealthy` | ACP backend is reachable |
| `checks.subagentPatchable` | Subagent helper exports available |

### Step 2: Check Workflow Status

```bash
openclaw swarm status --project <path> --json
```

Look for:
- **`attention` items** — tasks needing immediate action
- **`reviewQueue`** — tasks waiting for approval
- **Blocked tasks** — may need investigation
- **Dead letter tasks** — exhausted all retries
- **Running tasks with no recent session update** — may be orphaned

### Step 3: Investigate Specific Issues

#### Bridge Failure

If doctor shows `blocked`:

1. Check `blockers` array for specific failures
2. Follow `remediation` instructions
3. Common fixes:
   - Update `bridge.versionAllow` to include current OpenClaw version
   - Reinstall OpenClaw if internal modules changed
   - Check `bridge.nodePath` and `bridge.openclawRoot` paths

#### Stuck Running Task

```bash
# Check the session status
openclaw swarm session status --project <path> --run <runId>

# If session is dead/gone, cancel it
openclaw swarm session cancel --project <path> --run <runId> --reason "Session lost"
```

#### Dead Letter Task

Dead letter means the task exhausted its retry policy:

```bash
# Check status to find dead_letter tasks
openclaw swarm status --project <path> --json
```

To recover: manually edit workflow state to reset the task to `ready`, or fix the root cause and re-plan.

#### Orphaned Sessions

Sessions stuck in `active` state with no recent updates:

```bash
# Detect and clean up
openclaw swarm session cleanup --project <path> --stale-minutes 60
```

#### Version Drift

After upgrading OpenClaw:

```bash
# Check compatibility
openclaw swarm doctor --json

# If version drift detected:
# 1. Update bridge.versionAllow in config
# 2. Rerun tests
# 3. Verify with doctor again
```

### Step 4: Check Reports

```bash
openclaw swarm report --project <path>
```

The report file at `.openclaw/swarm/reports/swarm-report.md` contains:
- Attention items with recommended actions
- Review queue details
- Recent run summaries
- Session inventory
- Session reuse candidates

### Step 5: Nuclear Options

If everything is stuck:

```bash
# Disable the plugin temporarily
openclaw plugins disable openclaw-swarm-layer

# Or uninstall
openclaw plugins uninstall openclaw-swarm-layer
```

The `.openclaw/swarm/` state directory is preserved — it can be inspected or cleaned up manually.
