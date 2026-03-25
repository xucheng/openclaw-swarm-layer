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

## Harness Enhancement Options

Controls features inspired by long-running agent harness patterns.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enforceTaskImmutability` | boolean | `false` | When enabled, `saveWorkflow()` validates that immutable task fields (taskId, specId, title, description, kind, deps, workspace, runner) have not been modified between saves. Mutable fields: status, review.status, session, contract.criteria[].passes, contract.frozen |

## Bootstrap Configuration (`bootstrap`)

Controls the session startup bootstrap sequence.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable deterministic 4-step bootstrap: verify environment → load progress → select task → verify baseline. When enabled, `runOnce()` calls `runBootstrap()` at startup and short-circuits on failure |

## Evaluator Configuration (`evaluator`)

Controls automated evaluator task injection (GAN-inspired pattern).

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable automatic evaluator task injection after matching task kinds |
| `autoInjectAfter` | string[] | `["coding"]` | Task kinds that trigger evaluator injection. Each matching task gets a `<taskId>-eval` evaluator task inserted after it with correct dependency chain |

## Journal Configuration (`journal`)

Controls document journaling. **All journals are enabled by default** and always write to the local project directory. When `obsidianRoot` is configured, journals are additionally async-mirrored to Obsidian.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enableRunLog` | boolean | **`true`** | Append a table row to `run-log.md` on every task execution |
| `enableReviewLog` | boolean | **`true`** | Append a table row to `review-log.md` on every approve/reject |
| `enableSpecArchive` | boolean | **`true`** | Copy the spec as Markdown to `specs/<specId>.md` on every plan |
| `enableCompletionSummary` | boolean | **`true`** | Generate `completion-summary.md` when all tasks reach done/dead_letter |

### Document Directory Structure

When journaling is enabled, the following files are generated:

**State** (under `<project>/.openclaw/swarm/`):

```
<project>/.openclaw/swarm/
├── workflow-state.json          # Task graph, lifecycle, assumptions
├── progress.json                # Cross-session progress summary (auto-updated)
├── runs/                        # Run records with budgetUsage
├── sessions/                    # Session records
└── specs/                       # Spec documents
```

**Local** (always, under `<project>/.openclaw/swarm/reports/`):

```
<project>/.openclaw/swarm/reports/
├── swarm-report.md              # Status snapshot (overwritten each time)
├── run-log.md                   # Append-only execution log table
├── review-log.md                # Append-only review decision table
├── completion-summary.md        # One-time summary when workflow completes
└── specs/
    └── <specId>.md              # Archived spec from plan import
```

**Obsidian** (optional, under `<obsidianRoot>/<project-name>/`):

```
<obsidianRoot>/
├── <project-name>-swarm-report.md   # Status snapshot (same as local)
└── <project-name>/
    ├── run-log.md                    # Mirror of local run log
    ├── review-log.md                 # Mirror of local review log
    ├── completion-summary.md         # Mirror of local completion summary
    └── specs/
        └── <specId>.md              # Mirror of local spec archive
```

### Write Order

1. **Local write** — synchronous, always completes before CLI returns
2. **Obsidian write** — asynchronous fire-and-forget, failures silently ignored

This ensures local state is always consistent. Obsidian sync is best-effort.

### Document Lifecycle

| Document | Trigger | Write Mode | Content |
|----------|---------|-----------|---------|
| `swarm-report.md` | Every run/plan/review/session op | Overwrite | Current status snapshot |
| `run-log.md` | `swarm run` (non-dry-run) | Append | Markdown table with runId, task, runner, status, summary |
| `review-log.md` | `swarm review --approve\|--reject` | Append | Markdown table with task, decision, note |
| `specs/<specId>.md` | `swarm plan` | Create once | Full spec with goals, phases, tasks |
| `completion-summary.md` | Last task approved (all done) | Overwrite | Workflow stats, task list, run timeline |

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
          "enforceTaskImmutability": true,
          "bootstrap": {
            "enabled": true
          },
          "evaluator": {
            "enabled": true,
            "autoInjectAfter": ["coding"]
          },
          "journal": {
            "enableRunLog": true,
            "enableReviewLog": true,
            "enableSpecArchive": true,
            "enableCompletionSummary": true
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
