# Configuration Reference

All configuration is specified in your OpenClaw config under `plugins.entries.openclaw-swarm-layer.config`.

## Top-Level Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `stateRoot` | string | - | Custom root path for swarm state files. Defaults to `<project>/.openclaw/swarm/` |
| `defaultProjectRoot` | string | - | Default project root when `--project` is omitted |
| `obsidianRoot` | string | - | Obsidian vault path for report sync. Reports are written as `<obsidianRoot>/<project-name>-swarm-report.md` |
| `enableCli` | boolean | `true` | Register `swarm` CLI commands |
| `enableTools` | boolean | `true` | Register optional swarm tools for AI use |
| `enableService` | boolean | `true` | Register the swarm orchestrator service |
| `enableChatCommand` | boolean | `false` | Reserved for future chat command integration |
| `defaultWorkspaceMode` | `"shared"` \| `"isolated"` | `"shared"` | Workspace isolation mode for tasks |
| `defaultRunner` | `"manual"` \| `"acp"` \| `"subagent"` | `"manual"` | Default task runner |
| `maxParallelTasks` | integer (>= 1) | `1` | Maximum concurrent task dispatches |
| `reviewRequiredByDefault` | boolean | `true` | Whether tasks require review before completing |

## ACP Configuration (`acp`)

Controls Agent Control Protocol execution.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable ACP runner |
| `backendId` | string | - | ACP backend identifier |
| `defaultAgentId` | string | - | Default target agent (e.g., `"codex"`) |
| `allowedAgents` | string[] | `[]` | Agent allowlist. Use `["*"]` to allow all |
| `defaultMode` | `"run"` \| `"session"` | `"run"` | Default ACP execution mode |
| `allowThreadBinding` | boolean | `false` | Allow thread-bound session dispatch |
| `defaultTimeoutSeconds` | integer | - | Default execution timeout |
| `experimentalControlPlaneAdapter` | boolean | `false` | Use experimental real SDK adapter (requires public API export) |

## Bridge Configuration (`bridge`)

Controls the bridge-backed execution path for ACP and subagent runners.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable bridge execution mode |
| `nodePath` | string | - | Path to Node.js binary. Use `$(which node)` |
| `openclawRoot` | string | - | Path to OpenClaw installation root. Use `$(npm root -g)/openclaw` |
| `versionAllow` | string[] | `[]` | Allowed OpenClaw versions for bridge compatibility |

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

This enables CLI and tools with manual runner only.

## Full Configuration Example

```json
{
  "plugins": {
    "entries": {
      "openclaw-swarm-layer": {
        "config": {
          "obsidianRoot": "/path/to/vault/reports",
          "defaultRunner": "acp",
          "reviewRequiredByDefault": true,
          "acp": {
            "enabled": true,
            "defaultAgentId": "codex",
            "allowedAgents": ["codex"],
            "defaultMode": "run",
            "allowThreadBinding": true,
            "defaultTimeoutSeconds": 600
          },
          "bridge": {
            "enabled": true,
            "nodePath": "$(which node)",
            "openclawRoot": "$(npm root -g)/openclaw",
            "versionAllow": ["2026.3.13"]
          }
        }
      }
    }
  }
}
```
