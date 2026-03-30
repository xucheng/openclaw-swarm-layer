<div align="center">

# OpenClaw Swarm Layer

### Spec-Driven Workflow Orchestration for AI Agent Swarms

Turn Markdown specs into executable task graphs. Dispatch through ACP automation, manual fallback, or legacy subagent bridge. Track with persistent sessions. Gate with review approval.

[![Version](https://img.shields.io/badge/version-0.3.3-blue.svg)](CHANGELOG.md)
[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22-green.svg)](https://nodejs.org)
[![OpenClaw](https://img.shields.io/badge/OpenClaw-%3E%3D2026.3.22-purple.svg)](https://openclaw.dev)
[![Tests](https://img.shields.io/badge/Tests-872%20unit%20%7C%2068%20e2e-brightgreen.svg)](#development)

[Quick Start](#quick-start) · [Installation](#installation) · [CLI Reference](#cli-commands) · [Configuration](docs/configuration.md) · [Docs](#documentation)

</div>

---

## Features

- **Spec-driven planning** — Markdown spec with goals and phased tasks → dependency-ordered task graph
- **ACP-first execution** — ACP is the only default-capable automated runner; capability-aware `auto` resolution
- **Persistent sessions** — Reuse, thread binding, follow-up, steer, cancel, and close flows
- **Review gates** — Explicit approve/reject with structured quality rubrics (weighted multi-dimension scoring)
- **Sprint contracts** — Verifiable acceptance criteria per task with GAN-inspired evaluator injection
- **Cross-session continuity** — Progress synthesis, bootstrap startup sequence, harness assumption tracking
- **Automatic retry** — Configurable per-task retry policy with dead letter tracking
- **Operator reporting** — Status snapshots, run/review logs, spec archives, completion summaries → local + Obsidian sync
- **Runtime diagnostics** — `swarm doctor`, `swarm status`, and workflow reports surface ACP bridge-exit gate directly

## Prerequisites

- **Node.js** >= 22
- **OpenClaw** >= 2026.3.22 (tested against `2026.3.24`)

## Installation

### From ClawHub (recommended)

```bash
clawhub install openclaw-swarm-layer
```

### From npm

```bash
npm install -g openclaw-swarm-layer
openclaw plugins install openclaw-swarm-layer
```

### From source

```bash
git clone https://github.com/xucheng/openclaw-swarm-layer.git
cd openclaw-swarm-layer
npm install && npm run build
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
| `swarm plan --project <path> --spec <path>` | Import a spec and build task graph |
| `swarm run --project <path> [--runner acp\|manual\|subagent] [--dry-run]` | Execute the next runnable task |
| `swarm review --project <path> --task <id> --approve\|--reject` | Approve or reject a task |
| `swarm report --project <path>` | Generate a workflow report |
| `swarm status --project <path>` | Show workflow status, runtime posture, and bridge-exit gate |
| `swarm doctor` | Diagnose ACP readiness and bridge-exit gate status |

### Session Management

| Command | Description |
|---------|-------------|
| `swarm session list --project <path>` | List known sessions |
| `swarm session inspect --project <path> --session <id>` | Inspect a session |
| `swarm session status --project <path> --run <id>` | Poll session status |
| `swarm session cancel --project <path> --run <id>` | Cancel an active session |
| `swarm session close --project <path> --run <id>` | Close a session |
| `swarm session follow-up --project <path> --session <id> --task <desc>` | Inject a follow-up task |
| `swarm session steer --project <path> --session <id> --message <text>` | Send a steering message |
| `swarm session cleanup --project <path> [--stale-minutes <n>]` | Clean up orphaned sessions |

## Runner Model

| Runner | Role | Default-capable | Requirements |
|--------|------|-----------------|--------------|
| `acp` | Primary automation path | Yes | ACP enabled, public control-plane available |
| `manual` | Operator-driven safe fallback | Always available | None |
| `subagent` | Legacy bridge-backed opt-in | No | `subagent.enabled=true` + `bridge.subagentEnabled=true` |

`defaultRunner: "auto"` resolves to `acp` when ACP automation is available, otherwise falls back to `manual`.

## Development

```bash
npm run build          # TypeScript -> dist/
npm test               # Unit + e2e tests
npm run test:unit      # Unit tests only (872 tests, 324 suites)
npm run test:e2e       # E2E tests only (68 tests, 104 suites)
npm run test:watch     # Watch mode
```

## Documentation

**User Guides:**
- [User Manual](docs/user-manual.md) — Install, configuration, daily workflow, and troubleshooting
- [Configuration Reference](docs/configuration.md) — Config schema, defaults, examples, and journaling
- [Skills Guide](docs/skills-guide.md) — Unified skill usage modules

**Operations:**
- [ACP Bridge Exit Gate](docs/acp-bridge-exit-gate.md) — Bridge-free ACP floor, live smoke matrix, artifact expectations
- [Operator Runbook](docs/operator-runbook.md) — Install, smoke, upgrade, rollback, legacy bridge guidance
- [Migration Checklist](docs/migration-checklist.md) — Staged bridge replacement planning
- [Testing Strategy](docs/testing-strategy.md) — Unit, e2e, and smoke verification rules

**Project History:**
- [Changelog](CHANGELOG.md) — Release notes
- [Roadmap](docs/roadmap.md) — Milestone structure and delivery history
- [Milestones](docs/milestones.md) — Definition of done per milestone

## License

[MIT](LICENSE)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
