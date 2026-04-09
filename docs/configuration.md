# Configuration Reference

All configuration is specified in your OpenClaw config under `plugins.entries.openclaw-swarm-layer.config`.

## Runtime Defaults

The plugin now ships with an ACP-first posture:

- `defaultRunner` defaults to `"auto"`.
- `"auto"` resolves to `acp` only when ACP automation is actually available on the current install.
- If ACP automation is unavailable, `"auto"` resolves to `manual`.
- The supported runner surface is now `manual + acp` only.
- The supervised `autopilot` control plane is optional and operates over the same workflow state.
- Bridge config remains readable only for legacy ACP compatibility metadata and doctor guidance.

## Top-Level Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `stateRoot` | string | - | Custom root path for swarm state files. Defaults to `<project>/.openclaw/swarm/` |
| `defaultProjectRoot` | string | - | Default project root when `--project` is omitted |
| `obsidianRoot` | string | - | Obsidian vault path for report sync. Reports are written as `<obsidianRoot>/<project-name>-swarm-report.md` |
| `enableCli` | boolean | `true` | Register `swarm` CLI commands |
| `enableTools` | boolean | `true` | Register optional swarm tools |
| `enableService` | boolean | `true` | Register the swarm orchestrator service |
| `enableChatCommand` | boolean | `false` | Reserved for future chat command integration |
| `defaultWorkspaceMode` | `"shared" \| "isolated"` | `"shared"` | Workspace isolation mode for tasks |
| `defaultRunner` | `"auto" \| "manual" \| "acp"` | `"auto"` | Capability-aware default runner policy |
| `maxParallelTasks` | integer (>= 1) | `1` | Maximum concurrent task dispatches |
| `reviewRequiredByDefault` | boolean | `true` | Whether tasks require review before completing |
| `enforceTaskImmutability` | boolean | `false` | Prevent task-definition drift across saves |

## Review Configuration (`review`)

Controls reject-retry behavior after review decisions.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `rejectPolicy` | `"blocked" \| "ready_retry"` | `"ready_retry"` | Whether a reject blocks immediately or returns the task to `ready` |
| `maxRejectRetries` | integer (>= 1) | `3` | Maximum reject-driven retries before the task becomes blocked |

## ACP Configuration (`acp`)

Controls the primary automation path.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable ACP automation |
| `backendId` | string | - | ACP backend identifier |
| `defaultAgentId` | string | - | Default target agent, for example `"codex"` |
| `allowedAgents` | string[] | `[]` | Agent allowlist. Use `[*]` only if you really want open matching |
| `defaultMode` | `"run" \| "session"` | `"run"` | Default ACP execution mode |
| `allowThreadBinding` | boolean | `false` | Allow thread-bound session dispatch |
| `defaultTimeoutSeconds` | integer | - | Default execution timeout |
| `experimentalControlPlaneAdapter` | boolean | `false` | Force use of the public ACP control-plane adapter even if runtime probing is incomplete |

## Bridge Configuration (`bridge`)

Controls legacy compatibility settings that remain readable after ACP bridge removal.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Legacy umbrella alias. Still readable, but not used for runtime capability |
| `acpFallbackEnabled` | boolean | `false` | Legacy ACP bridge flag. Ignored for runtime capability |
| `nodePath` | string | - | Path to Node.js binary. Usually `$(which node)` |
| `openclawRoot` | string | - | Path to OpenClaw installation root |
| `versionAllow` | string[] | `[]` | Allowed OpenClaw versions for bridge compatibility |

Notes:

- `bridge.enabled=true` is still accepted as a deprecated umbrella alias.
- New configs should not rely on `bridge.acpFallbackEnabled`; it is guidance-only after ACP bridge removal.
- New configs should not add bridge settings unless you are intentionally preserving historical metadata for old installs.

## Journal Configuration (`journal`)

Controls markdown journaling. Local journals are always written under the project; Obsidian mirroring is optional through `obsidianRoot`.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enableRunLog` | boolean | `true` | Append a table row to `run-log.md` on every task execution |
| `enableReviewLog` | boolean | `true` | Append a table row to `review-log.md` on every approve/reject |
| `enableSpecArchive` | boolean | `true` | Copy the spec as Markdown to `specs/<specId>.md` on every plan |
| `enableCompletionSummary` | boolean | `true` | Generate `completion-summary.md` when all tasks reach `done` or `dead_letter` |

## Bootstrap Configuration (`bootstrap`)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable the deterministic bootstrap sequence before execution |

## Evaluator Configuration (`evaluator`)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable automatic evaluator task injection |
| `autoInjectAfter` | string[] | `["coding"]` | Task kinds that trigger evaluator injection |

## Minimal Configuration

```json
{
  "plugins": {
    "entries": {
      "openclaw-swarm-layer": {
        "config": {}
      }
    }
  }
}
```

This enables CLI and tools with the default `auto` runner policy. Because ACP is disabled in this config, `auto` resolves to `manual`.

## ACP Public-First Configuration

```json
{
  "plugins": {
    "entries": {
      "openclaw-swarm-layer": {
        "config": {
          "defaultRunner": "auto",
          "acp": {
            "enabled": true,
            "defaultAgentId": "codex",
            "allowedAgents": ["codex"],
            "defaultMode": "run",
            "allowThreadBinding": true,
            "defaultTimeoutSeconds": 600
          }
        }
      }
    }
  }
}
```

Use this on OpenClaw builds where the public ACP control-plane path is available. On supported installs, `auto` resolves to `acp`.

## Autopilot Configuration (`autopilot`)

Controls the supervised control plane layered over the existing workflow runtime.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable autopilot control-plane commands and service loop behavior |
| `mode` | `"supervised"` | `"supervised"` | Current autopilot operating mode |
| `tickSeconds` | integer (>= 1) | `15` | Service-loop tick interval |
| `leaseSeconds` | integer (>= 1) | `45` | Lease TTL that prevents overlapping active ticks |
| `maxDispatchPerTick` | integer (>= 1) | `2` | Maximum dispatches the control plane can admit per tick |
| `reviewPolicy.mode` | `"manual_only" \| "auto_safe" \| "auto_allowlist"` | `"manual_only"` | How autopilot should handle review-closure decisions |
| `reviewPolicy.allowlistTags` | string[] | `[]` | Tags allowed for auto-approval when `reviewPolicy.mode = "auto_allowlist"` |
| `reviewPolicy.denyTags` | string[] | `["high-risk", "security", "prod"]` | Tags that always block autopilot auto-approval |
| `recoveryPolicy.stuckRunMinutes` | integer (>= 1) | `20` | Running task threshold before the recovery planner treats it as stuck |
| `recoveryPolicy.idleSessionMinutes` | integer (>= 1) | `60` | Active session threshold before the recovery planner treats it as stale |
| `recoveryPolicy.maxRecoveriesPerTask` | integer (>= 1) | `1` | Maximum automated recoveries allowed per task |
| `recoveryPolicy.cancelBeforeRetry` | boolean | `true` | Cancel active runtime state before retrying a recovered task |
| `recoveryPolicy.degradedFailureRate` | number | `0.5` | Failure-rate threshold that pushes autopilot into degraded mode |
| `recoveryPolicy.degradedMinTerminalRuns` | integer (>= 1) | `3` | Minimum recent terminal runs before degraded-mode failure rate is evaluated |
| `recoveryPolicy.degradedTerminalWindow` | integer (>= 1) | `6` | Terminal-run sample window used for degraded-mode evaluation |

## Autopilot Example

```json
{
  "plugins": {
    "entries": {
      "openclaw-swarm-layer": {
        "config": {
          "defaultRunner": "auto",
          "acp": {
            "enabled": true,
            "defaultAgentId": "codex",
            "allowedAgents": ["codex"]
          },
          "autopilot": {
            "enabled": true,
            "tickSeconds": 15,
            "leaseSeconds": 45,
            "maxDispatchPerTick": 2,
            "reviewPolicy": {
              "mode": "manual_only"
            }
          }
        }
      }
    }
  }
}
```

## Legacy ACP Bridge Config (Ignored)

```json
{
  "plugins": {
    "entries": {
      "openclaw-swarm-layer": {
        "config": {
          "defaultRunner": "auto",
          "acp": {
            "enabled": true,
            "defaultAgentId": "codex",
            "allowedAgents": ["codex"],
            "defaultMode": "run"
          },
          "bridge": {
            "acpFallbackEnabled": true,
            "nodePath": "$(which node)",
            "openclawRoot": "$(npm root -g)/openclaw",
            "versionAllow": ["2026.4.8"]
          }
        }
      }
    }
  }
}
```

This config is still readable, but it no longer enables ACP automation. Keep it only until you clean up stale config.

## Journaling Example

```json
{
  "plugins": {
    "entries": {
      "openclaw-swarm-layer": {
        "config": {
          "obsidianRoot": "/path/to/vault/reports",
          "journal": {
            "enableRunLog": true,
            "enableReviewLog": true,
            "enableSpecArchive": true,
            "enableCompletionSummary": true
          }
        }
      }
    }
  }
}
```

## Document Directory Structure

**State** (under `<project>/.openclaw/swarm/`):

```text
<project>/.openclaw/swarm/
├── workflow-state.json
├── progress.json
├── runs/
├── sessions/
└── specs/
```

**Local reports** (always written under `<project>/.openclaw/swarm/reports/`):

```text
<project>/.openclaw/swarm/reports/
├── swarm-report.md
├── run-log.md
├── review-log.md
├── completion-summary.md
└── specs/
    └── <specId>.md
```

**Obsidian mirror** (optional, under `<obsidianRoot>/<project-name>/`):

```text
<obsidianRoot>/
├── <project-name>-swarm-report.md
└── <project-name>/
    ├── run-log.md
    ├── review-log.md
    ├── completion-summary.md
    └── specs/
        └── <specId>.md
```

## Write Order

1. Local write: synchronous, completes before CLI returns.
2. Obsidian write: async best-effort mirror.

## Related Commands

- `openclaw swarm doctor --json` — inspect ACP readiness, default-runner resolution, and compatibility fallback posture.
- `openclaw swarm status --project <path>` — inspect current workflow runtime posture.
- `openclaw swarm autopilot status --project <path>` — inspect autopilot health, lease, and decision state.
- `openclaw swarm report --project <path>` — write the workflow report and journals.
