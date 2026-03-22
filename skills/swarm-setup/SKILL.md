---
name: swarm-setup
description: Guide users through installing, configuring, and initializing the OpenClaw Swarm Layer plugin for a project.
---

# Swarm Setup

Help the user install and configure the Swarm Layer plugin from scratch.

## When to Use

Use this skill when the user wants to:
- Install the swarm layer plugin for the first time
- Configure bridge mode for ACP execution
- Initialize swarm orchestration for a project
- Troubleshoot installation or configuration issues

## Step-by-Step Flow

### 1. Check Prerequisites

Verify the environment is ready:

```bash
node --version    # Requires >= 22
openclaw --version # Requires >= 2026.2.24
```

If OpenClaw is not installed, guide the user to install it first.

### 2. Install the Plugin

```bash
openclaw plugins install -l /path/to/openclaw-swarm-layer
```

Verify installation:

```bash
openclaw plugins info openclaw-swarm-layer
```

Expected output should show `Status: loaded` and list 7 tools + CLI commands.

### 3. Configure Bridge Mode (for ACP execution)

If the user wants ACP or subagent execution (not just manual runner), they need bridge mode.

Add to OpenClaw config:

```json
{
  "plugins": {
    "entries": {
      "openclaw-swarm-layer": {
        "config": {
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
            "versionAllow": ["<current-openclaw-version>"]
          }
        }
      }
    }
  }
}
```

Replace `<current-openclaw-version>` with the output of `openclaw --version`.

### 4. Verify Bridge Health

```bash
openclaw swarm doctor --json
```

Check that:
- `severity` is `healthy` or `warning` (not `blocked`)
- All `checks.*` are `true`
- `blockers` array is empty

If `severity` is `blocked`, follow the `remediation` instructions in the output.

### 5. Initialize a Project

```bash
openclaw swarm init --project /path/to/your/project
```

This creates `.openclaw/swarm/` directory structure with empty workflow state.

### 6. Optional: Configure Obsidian Report Sync

Add `obsidianRoot` to the plugin config to sync reports to an Obsidian vault:

```json
{
  "obsidianRoot": "/path/to/your/obsidian/vault/reports"
}
```

See `docs/configuration.md` for all configuration options.

## Troubleshooting

- **Plugin not loading**: Check `openclaw plugins info openclaw-swarm-layer` — ensure `Status: loaded`
- **Bridge blocked**: Run `openclaw swarm doctor --json` and follow `remediation` instructions
- **Version mismatch**: Update `bridge.versionAllow` to include your OpenClaw version
- **ACP disabled**: Ensure `acp.enabled: true` in config
