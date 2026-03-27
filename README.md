<div align="center">

# OpenClaw Swarm Layer

### Spec-Driven Workflow Orchestration For AI Agent Swarms

ACP-first orchestration for OpenClaw projects: spec import, task planning, execution, review, reporting, and persistent session reuse.

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22-green.svg)](https://nodejs.org)
[![OpenClaw](https://img.shields.io/badge/OpenClaw-%3E%3D2026.3.22-purple.svg)](https://openclaw.dev)
[![Tests](https://img.shields.io/badge/Tests-305%20unit%20%7C%2023%20e2e-brightgreen.svg)](#development)

[Quick Start](#quick-start) &bull; [Configuration](docs/configuration.md) &bull; [Bridge Exit Gate](docs/acp-bridge-exit-gate.md) &bull; [Runbook](docs/operator-runbook.md) &bull; [License](LICENSE)

</div>

---

## Runtime Posture

- ACP is the only default-capable automated runner.
- `defaultRunner: "auto"` resolves to `acp` only when ACP automation is actually available on the current OpenClaw install.
- If ACP automation is unavailable, `auto` falls back to `manual`.
- `subagent` is retained only as a legacy bridge-backed opt-in path. It stays disabled by default and requires explicit opt-in.
- Bridge is retained only for the legacy subagent path. It is no longer part of ACP execution.
- `swarm doctor`, `swarm status`, and workflow reports now surface the ACP bridge-exit gate directly.

## ACP Bridge Exit Gate

The bridge-exit gate fixes the bridge-free ACP baseline at OpenClaw `>=2026.3.22`.

It now ships as a first-class operator surface:

- `swarm doctor --json` reports `acpBridgeExitGate`, including the live smoke matrix and remaining ACP bridge dependencies.
- `swarm status --json` mirrors the same floor and matrix so operators can check the project state without rerunning doctor.
- workflow reports include an `ACP Bridge Exit Gate` section for auditability.

The full matrix and artifact expectations are documented in [docs/acp-bridge-exit-gate.md](docs/acp-bridge-exit-gate.md).

## Features

- Spec-driven orchestration from Markdown spec to executable task graph.
- ACP-first execution with capability-aware default resolution.
- Manual safe fallback when ACP automation is unavailable.
- Persistent session reuse, follow-up, steer, cancel, and close flows.
- Review gates, retry policy, dead-letter tracking, and session budget controls.
- Runtime visibility through `swarm doctor`, `swarm status`, and workflow reports.
- Optional Obsidian report sync and local markdown journals.
- Legacy subagent runner behind explicit bridge-backed opt-in.

## Prerequisites

- Node.js >= 22
- OpenClaw >= 2026.3.22 for the public ACP control-plane default path

Tested against OpenClaw `2026.3.24`.

## Installation

```bash
# Clone the repository
git clone https://github.com/xucheng/openclaw-swarm-layer.git
cd openclaw-swarm-layer
npm install
npm run build

# Install as an OpenClaw plugin
openclaw plugins install -l /path/to/openclaw-swarm-layer
```

## Quick Start

```bash
# 1. Initialize a project
openclaw swarm init --project /path/to/your/project

# 2. Import a spec and build the workflow
openclaw swarm plan --project /path/to/your/project --spec SPEC.md

# 3. Inspect runtime posture before execution
openclaw swarm doctor --json
openclaw swarm status --project /path/to/your/project --json

# 4. Dry-run with the resolved default runner
openclaw swarm run --project /path/to/your/project --dry-run --json

# 5. Execute
openclaw swarm run --project /path/to/your/project --json

# 6. Review and report
openclaw swarm review --project /path/to/your/project --task <taskId> --approve --json
openclaw swarm report --project /path/to/your/project --json
```

## CLI Commands

### Core Workflow

| Command | Description |
|---------|-------------|
| `swarm init --project <path>` | Initialize swarm state for a project |
| `swarm status --project <path>` | Show workflow status, runtime posture, bridge-exit gate, and recommended actions |
| `swarm plan --project <path> --spec <path>` | Import a spec and build task graph |
| `swarm run --project <path> [--runner acp\|manual\|subagent] [--dry-run]` | Execute the next runnable task with resolved default policy or explicit override |
| `swarm review --project <path> --task <id> --approve\|--reject` | Approve or reject a task |
| `swarm report --project <path>` | Generate a workflow report |
| `swarm doctor` | Diagnose ACP readiness, bridge-exit gate status, and legacy subagent bridge posture |

### Session Management

| Command | Description |
|---------|-------------|
| `swarm session list --project <path>` | List known sessions |
| `swarm session inspect --project <path> --session <id>` | Inspect a session |
| `swarm session status --project <path> --run <id>` | Poll session status |
| `swarm session cancel --project <path> --run <id>` | Cancel an active session |
| `swarm session close --project <path> --run <id>` | Close a session |
| `swarm session follow-up --project <path> --session <id> --task <desc>` | Inject a follow-up task into a reusable session |
| `swarm session steer --project <path> --session <id> --message <text>` | Send a steering message |
| `swarm session cleanup --project <path> [--stale-minutes <n>]` | Clean up orphaned sessions |

## Runner Model

- `manual`: operator-driven safe fallback, always available.
- `acp`: default automation path when ACP is enabled and the public control-plane path is available.
- `subagent`: legacy bridge-backed opt-in runner; disabled by default and available only when `subagent.enabled=true` and `bridge.subagentEnabled=true`.

## Development

```bash
npm run build          # TypeScript -> dist/
npm test               # Unit + e2e tests
npm run test:unit      # Unit tests only
npm run test:e2e       # E2E tests only
npm run test:watch     # Watch mode
```

## Documentation

**User Guides:**
- [User Manual](docs/user-manual.md) — install, configuration, daily workflow, and troubleshooting (Chinese)
- [Configuration Reference](docs/configuration.md) — config schema, defaults, examples, and journaling
- [Skills Guide](docs/skills-guide.md) — unified skill usage modules

**Operations:**
- [ACP Bridge Exit Gate](docs/acp-bridge-exit-gate.md) — bridge-free ACP floor, live smoke matrix, and artifact expectations
- [Operator Runbook](docs/operator-runbook.md) — install, smoke, upgrade, rollback, and legacy bridge guidance
- [Migration Checklist](docs/migration-checklist.md) — staged bridge replacement planning
- [Testing Strategy](docs/testing-strategy.md) — unit, e2e, and smoke verification rules

**Project Status:**
- [Roadmap](docs/roadmap.md) — milestone structure and delivery history
- [Milestones](docs/milestones.md) — definition of done per milestone
- [Current Plan](docs/current-plan.md) — active frontier and closeout state

## License

[MIT](LICENSE)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
