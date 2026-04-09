# Operator Runbook

## Runtime Posture

- ACP public control-plane is the only supported ACP execution path.
- `defaultRunner: "auto"` resolves to `acp` only when the public ACP path is available on the current install.
- If ACP automation is unavailable, `auto` falls back to `manual`.
- `bridge.acpFallbackEnabled` is now legacy config; it is ignored for runtime capability.
- The supported runner surface is `manual + acp` only.
- Bridge settings remain readable for compatibility diagnostics only.

## Install

```bash
openclaw plugins install -l /path/to/openclaw-swarm-layer
```

Published-package install:

```bash
openclaw plugins install clawhub:openclaw-swarm-layer
openclaw skills install swarm-layer
```

Ensure config includes:

- plugin load path or install record
- `plugins.allow` entry
- `plugins.entries.openclaw-swarm-layer.enabled = true`
- optional `plugins.entries.openclaw-swarm-layer.config.obsidianRoot`

## ACP Bridge Exit Gate

The bridge-exit gate fixes the bridge-free ACP floor at OpenClaw `>=2026.3.22`.

Use these operator surfaces:

- `openclaw swarm doctor --json`
- `openclaw swarm status --project <path> --json`
- `openclaw swarm report --project <path> --json`

Read them as follows:

- `acpBridgeExitGate.minimumVersion`: supported bridge-free ACP floor
- `acpBridgeExitGate.versionSatisfied`: whether the current install meets that floor
- `acpBridgeExitGate.publicControlPlaneExportReady`: whether doctor has confirmed the public ACP export on this install
- `acpBridgeExitGate.readyForBridgeRemoval`: whether version floor and export readiness are both satisfied
- `remainingBridgeDependencies`: should now stay empty for ACP; any non-empty value is a regression signal

## Basic Smoke

```bash
openclaw swarm doctor --json
openclaw swarm init --project <path>
openclaw swarm plan --project <path> --spec <spec> --json
openclaw swarm status --project <path> --json
openclaw swarm run --project <path> --dry-run --json
```

Expect:

- doctor reports ACP public path readiness and `remainingBridgeDependencies = []`
- plan creates workflow state and a local report
- status shows configured default, resolved default, and gate notes
- dry-run selects ACP when ACP is actually available on the install

## Full Live Smoke Matrix

Run these before claiming bridge-free ACP readiness:

1. `~/.openclaw/scripts/openclaw-acp-post-upgrade-smoke.sh`
2. `openclaw swarm doctor --json`
3. `openclaw swarm init --project <path>`
4. `openclaw swarm plan --project <path> --spec <spec> --json`
5. `openclaw swarm status --project <path> --json`
6. `openclaw swarm run --project <path> --dry-run --json`
7. `openclaw swarm run --project <path> --json`
8. `openclaw swarm session status --project <path> --run <runId> --json` or `openclaw swarm autopilot tick --project <path> --json`
9. `openclaw swarm review --project <path> --task <taskId> --approve --json`
10. `openclaw swarm report --project <path> --json`
11. `openclaw swarm autopilot tick --project <path> --json`

## Artifact Expectations

Local artifacts:

- `<project>/.openclaw/swarm/workflow-state.json`
- `<project>/.openclaw/swarm/reports/swarm-report.md`
- `<project>/.openclaw/swarm/reports/specs/<specId>.md`
- `<project>/.openclaw/swarm/reports/run-log.md` after run

Obsidian mirror when enabled:

- top-level report file: `<obsidianRoot>/<project>-swarm-report.md`
- project journal directory: `<obsidianRoot>/<project>/`

Full Obsidian journal shape:

```text
<obsidianRoot>/
├── <project>-swarm-report.md
└── <project>/
    ├── run-log.md
    ├── review-log.md
    ├── completion-summary.md
    └── specs/
        └── <specId>.md
```

Stage-dependent partial output is expected:

- `plan` writes the spec archive
- `run` writes `run-log.md`
- `review` writes `review-log.md`
- full completion writes `completion-summary.md`

## Legacy ACP Bridge Config

Legacy config such as:

```json
{
  "bridge": {
    "acpFallbackEnabled": true
  }
}
```

no longer enables ACP automation. It should be removed during routine config cleanup. If it remains, doctor surfaces it as guidance only.

## Upgrade Checklist

Before upgrading OpenClaw:

1. Record the installed OpenClaw version.
2. Upgrade OpenClaw in a non-critical session first.
3. Run `openclaw swarm doctor --json`.
4. If doctor reports public ACP ready and `remainingBridgeDependencies = []`:
   - keep ACP on the public path
   - rerun the smoke matrix if the install changed materially
5. If doctor reports missing ACP public exports:
   - keep `manual` as the fallback
   - do not try to re-enable ACP bridge

## Failure Remediation Quick Guide

- ACP backend direct smoke fails
  - verify the local direct-route wrapper or backend tooling for the configured default agent
- doctor green but live ACP run fails
  - treat that as an environment blocker, not a reason to reintroduce ACP bridge
- live ACP run reaches `completed` but workflow does not transition
  - run `openclaw swarm autopilot tick --project <path> --json` to sync active runs into workflow state
- legacy ACP bridge config warning
  - remove `bridge.acpFallbackEnabled`

## Rollback

```bash
openclaw plugins disable openclaw-swarm-layer
```

If needed:

```bash
openclaw plugins uninstall openclaw-swarm-layer
```

Do not delete project `.openclaw/swarm/` state automatically.

## Release Workflow

For npm, GitHub release, ClawHub package, and ClawHub skill publication, use [release-runbook.md](release-runbook.md).
