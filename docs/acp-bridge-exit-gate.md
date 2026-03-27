# ACP Bridge Exit Gate

## Purpose

`M5.4a` defined the bridge-free ACP baseline. `M5.4b` consumed that gate and removed ACP bridge runtime dependence.

Current status:

- gate satisfied on the local `OpenClaw 2026.3.24` install as of 2026-03-27
- ACP bridge removal is complete for the ACP runner
- `remainingBridgeDependencies` is now `[]` for ACP

The gate is surfaced in:

- `openclaw swarm doctor --json`
- `openclaw swarm status --project <path> --json`
- workflow reports under `ACP Bridge Exit Gate`

## Version Floor

Bridge-free ACP expectations are fixed at:

- OpenClaw `>=2026.3.22`

This floor is exported in code as `ACP_BRIDGE_FREE_VERSION_FLOOR` and used by both runtime helpers and operator surfaces.

## Post-M5.4b Interpretation

After `M5.4b`:

- ACP automation must use the public control-plane path
- `replacementPlan[acp].status` should read `complete` on supported installs
- `remainingBridgeDependencies` should remain empty for ACP
- any future ACP bridge-specific blocker is treated as a regression

## Live Smoke Matrix

### 1. ACP backend direct route

Command:

```bash
~/.openclaw/scripts/openclaw-acp-post-upgrade-smoke.sh
```

Purpose:

- validate backend wiring
- validate default agent wiring
- validate the configured local direct route before plugin-level ACP checks

Current local evidence:

- passing on `opencode` with `alibaba-coding-plan-cn/qwen3.5-plus`

### 2. Swarm doctor

Command:

```bash
openclaw swarm doctor --json
```

Purpose:

- confirm public ACP export readiness
- confirm current-install default-runner resolution
- confirm `remainingBridgeDependencies = []` for ACP

Current local evidence:

- `replacementPlan[acp].status = "complete"`
- `supportedRunners = ["subagent"]` inside bridge diagnostics, reflecting ACP bridge removal

### 3. Swarm init / plan / status

Command:

```bash
openclaw swarm init --project <path>
openclaw swarm plan --project <path> --spec <spec> --json
openclaw swarm status --project <path> --json
```

Purpose:

- validate project bootstrap
- validate workflow-state creation
- validate operator visibility on the target install

Expected local artifacts:

- `<project>/.openclaw/swarm/workflow-state.json`
- `<project>/.openclaw/swarm/reports/swarm-report.md`
- `<project>/.openclaw/swarm/reports/specs/<specId>.md`

Expected Obsidian artifacts when `obsidianRoot` and journaling are enabled:

- `<obsidianRoot>/<project>-swarm-report.md`
- `<obsidianRoot>/<project>/specs/<specId>.md`

### 4. Swarm dry-run

Command:

```bash
openclaw swarm run --project <path> --dry-run --json
```

Purpose:

- confirm the resolved default runner still selects ACP after ACP bridge removal

Current local evidence:

- a real smoke spec still resolves `selectedRunner = "acp"` on `OpenClaw 2026.3.24`

### 5. Swarm live ACP run

Command:

```bash
openclaw swarm run --project <path> --json
```

Purpose:

- exercise the public ACP control-plane through a real task dispatch

Expected local artifacts:

- `<project>/.openclaw/swarm/reports/run-log.md`

Expected Obsidian artifacts when enabled:

- `<obsidianRoot>/<project>/run-log.md`

### 6. Swarm session lifecycle

Command:

```bash
openclaw swarm session status --project <path> --run <runId> --json
openclaw swarm session cancel --project <path> --run <runId> --json
openclaw swarm session close --project <path> --run <runId> --json
```

Purpose:

- validate ACP session status, cancel, and close on the public path

### 7. Swarm review / report / journal sync

Command:

```bash
openclaw swarm review --project <path> --task <taskId> --approve --json
openclaw swarm report --project <path> --json
```

Purpose:

- validate review and reporting on the public ACP path
- validate the complete Obsidian mirror structure when journaling is enabled

Expected Obsidian artifacts for a complete smoke run:

- `<obsidianRoot>/<project>-swarm-report.md`
- `<obsidianRoot>/<project>/run-log.md`
- `<obsidianRoot>/<project>/review-log.md`
- `<obsidianRoot>/<project>/completion-summary.md`
- `<obsidianRoot>/<project>/specs/<specId>.md`
