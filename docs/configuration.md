# Configuration Reference

All configuration is specified in your OpenClaw config under `plugins.entries.openclaw-swarm-layer.config`.

## Runtime Defaults

The plugin now ships with an ACP-first posture:

- `defaultRunner` defaults to `"auto"`.
- `"auto"` resolves to `acp` only when ACP automation is actually available on the current install.
- If ACP automation is unavailable, `"auto"` resolves to `manual`.
- `subagent` is experimental and disabled by default.
- Bridge is compatibility fallback only.

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
| `defaultRunner` | `"auto" \| "manual" \| "acp" \| "subagent"` | `"auto"` | Capability-aware default runner policy |
| `maxParallelTasks` | integer (>= 1) | `1` | Maximum concurrent task dispatches |
| `reviewRequiredByDefault` | boolean | `true` | Whether tasks require review before completing |
| `enforceTaskImmutability` | boolean | `false` | Prevent task-definition drift across saves |

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

## Subagent Configuration (`subagent`)

Controls the experimental subagent runner.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Explicitly opt in to experimental subagent dispatch |

## Bridge Configuration (`bridge`)

Controls compatibility fallback for ACP and subagent.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Legacy umbrella alias. Still readable, but prefer runner-scoped flags below |
| `acpFallbackEnabled` | boolean | `false` | Enable ACP bridge fallback for compatibility |
| `subagentEnabled` | boolean | `false` | Enable subagent bridge-backed execution |
| `nodePath` | string | - | Path to Node.js binary. Usually `$(which node)` |
| `openclawRoot` | string | - | Path to OpenClaw installation root |
| `versionAllow` | string[] | `[]` | Allowed OpenClaw versions for bridge compatibility |

Notes:

- `bridge.enabled=true` is still accepted as a deprecated umbrella alias.
- New configs should prefer `bridge.acpFallbackEnabled` and `bridge.subagentEnabled`.
- Bridge should be enabled only when doctor output says public ACP is unavailable or incomplete and you deliberately want compatibility fallback.

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

## ACP Compatibility Fallback Configuration

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
            "versionAllow": ["2026.3.24"]
          }
        }
      }
    }
  }
}
```

Use this only when `swarm doctor` says public ACP is unavailable or incomplete and you intentionally want bridge compatibility fallback.

## Subagent Experimental Configuration

```json
{
  "plugins": {
    "entries": {
      "openclaw-swarm-layer": {
        "config": {
          "subagent": {
            "enabled": true
          },
          "bridge": {
            "subagentEnabled": true,
            "nodePath": "$(which node)",
            "openclawRoot": "$(npm root -g)/openclaw",
            "versionAllow": ["2026.3.24"]
          }
        }
      }
    }
  }
}
```

`subagent` is still experimental. Keep it opt-in and do not treat it as the normal default path.

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
- `openclaw swarm report --project <path>` — write the workflow report and journals.
