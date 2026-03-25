<div align="center">

# OpenClaw Swarm Layer

### Spec-Driven Workflow Orchestration for AI Agent Swarms

**The Evolution of Agent Orchestration:** Spec &rarr; Plan &rarr; Execute &rarr; Review &rarr; Ship

Turn workflow specifications into executable task graphs, dispatch through pluggable runners, and orchestrate multi-agent collaboration with persistent sessions.

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22-green.svg)](https://nodejs.org)
[![OpenClaw](https://img.shields.io/badge/OpenClaw-%3E%3D2026.2-purple.svg)](https://openclaw.dev)
[![Tests](https://img.shields.io/badge/Tests-283%20unit%20%7C%2024%20e2e-brightgreen.svg)](#development)

[Quick Start](#quick-start) &bull; [Features](#features) &bull; [CLI Reference](#cli-commands) &bull; [Configuration](docs/configuration.md) &bull; [License](LICENSE)

![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white)
![OpenClaw Plugin](https://img.shields.io/badge/OpenClaw-Plugin-8B5CF6)
![ACP Runner](https://img.shields.io/badge/Runner-ACP-FF6B35)
![Subagent Runner](https://img.shields.io/badge/Runner-Subagent-0EA5E9)
![Session Reuse](https://img.shields.io/badge/Session-Reuse-10B981)
![Thread Binding](https://img.shields.io/badge/Thread-Binding-F59E0B)
![Review Gates](https://img.shields.io/badge/Review-Gates-EF4444)

</div>

---

## Features

- **Spec-driven orchestration** — import a spec, generate a task graph, execute in dependency order
- **Multiple runners** — manual (operator-driven), ACP (external harness), subagent (OpenClaw-native)
- **Review gates** — tasks require approval before marking done; structured quality rubrics for weighted multi-dimension scoring
- **Session management** — persistent sessions with reuse, thread binding, follow-up/steer
- **Automatic retry** — configurable retry policy with dead letter tracking and session budget controls
- **Sprint contracts** — negotiated verifiable acceptance criteria per task with automated evaluator injection
- **Cross-session continuity** — progress summary synthesis, bootstrap startup sequence, harness assumption tracking
- **Task immutability** — agents cannot mutate task definitions, only update execution results
- **Operator UX** — attention items, highlights, recommended actions, reports
- **Report sync** — local reports + optional Obsidian vault sync

## Prerequisites

- Node.js >= 22
- [OpenClaw](https://openclaw.dev) >= 2026.2.24

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

# 2. Write a spec file (Markdown with Goals/Phases/Tasks sections)
cat > SPEC.md << 'EOF'
# My Workflow

## Goals
- Build and test the feature

## Phases
### Phase 1
- Implement the core logic
- Write unit tests
### Phase 2
- Integration testing
EOF

# 3. Import the spec and generate task graph
openclaw swarm plan --project . --spec SPEC.md

# 4. Check status
openclaw swarm status --project .

# 5. Execute (dry-run first)
openclaw swarm run --project . --dry-run
openclaw swarm run --project .

# 6. Review completed tasks
openclaw swarm review --project . --task <taskId> --approve

# 7. Generate report
openclaw swarm report --project .
```

## CLI Commands

### Core Workflow
| Command | Description |
|---------|-------------|
| `swarm init --project <path>` | Initialize swarm state for a project |
| `swarm status --project <path>` | Show workflow status with attention items |
| `swarm plan --project <path> --spec <path>` | Import spec and build task graph |
| `swarm run --project <path> [--runner acp\|manual\|subagent] [--dry-run]` | Execute next runnable task |
| `swarm review --project <path> --task <id> --approve\|--reject` | Approve or reject a task |
| `swarm report --project <path>` | Generate workflow report |
| `swarm doctor` | Diagnose bridge compatibility |

### Session Management
| Command | Description |
|---------|-------------|
| `swarm session list --project <path>` | List all sessions |
| `swarm session inspect --project <path> --session <id>` | Inspect a session |
| `swarm session status --project <path> --run <id>` | Poll session status |
| `swarm session cancel --project <path> --run <id>` | Cancel an active session |
| `swarm session close --project <path> --run <id>` | Close a session |
| `swarm session follow-up --project <path> --session <id> --task <desc>` | Inject follow-up task |
| `swarm session steer --project <path> --session <id> --message <text>` | Send steering message |
| `swarm session cleanup --project <path> [--stale-minutes <n>]` | Clean up orphaned sessions |

## Architecture

```
CLI (src/cli/)  <->  Tools (src/tools/)
        |                  |
   SwarmOrchestrator (src/services/orchestrator.ts)
        |
   RunnerRegistry -> TaskRunner implementations
        |                    |                |
   ManualRunner        AcpRunner        SubagentRunner
        |
   StateStore + SessionStore (src/state/, src/session/)
```

See [docs/configuration.md](docs/configuration.md) for all configuration options.

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
- [User Manual](docs/user-manual.md) — complete usage guide from install to daily operations (Chinese)
- [Skills Guide](docs/skills-guide.md) — unified skill with 5 modules (setup/operate/diagnose/report/tools)
- [Configuration Reference](docs/configuration.md) — all config options, journal setup, directory structure

**Operations:**
- [Operator Runbook](docs/operator-runbook.md) — install, smoke test, upgrade, rollback
- [Migration Checklist](docs/migration-checklist.md) — bridge replacement strategy

**Project History:**
- [Roadmap](docs/roadmap.md) — M1-M3 milestone structure
- [Milestones](docs/milestones.md) — definition of done per milestone
- [Current Plan](docs/current-plan.md) — delivery status and future directions

## License

[MIT](LICENSE)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
