# Operator Runbook

## Runtime Posture

- ACP public control-plane is the normal execution path on supported OpenClaw versions.
- `defaultRunner: "auto"` resolves to `acp` only when ACP automation is available on the current install.
- If ACP automation is unavailable, `auto` falls back to `manual`.
- Bridge is compatibility fallback only.
- `subagent` is experimental and disabled by default.

## Install

```bash
openclaw plugins install -l /path/to/openclaw-swarm-layer
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
- `remainingBridgeDependencies`: ACP bridge blockers that still need deletion before `M5.4b`

## Basic Smoke

```bash
openclaw swarm doctor --json
openclaw swarm init --project <path>
openclaw swarm plan --project <path> --spec <spec> --json
openclaw swarm status --project <path> --json
openclaw swarm run --project <path> --dry-run --json
```

Expect:

- doctor reports the bridge-exit gate and remaining blockers
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
8. `openclaw swarm session status --project <path> --run <runId> --json`
9. `openclaw swarm session cancel --project <path> --run <runId> --json`
10. `openclaw swarm session close --project <path> --run <runId> --json`
11. `openclaw swarm review --project <path> --task <taskId> --approve --json`
12. `openclaw swarm report --project <path> --json`

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

## ACP Compatibility Fallback

Use bridge only when public ACP is unavailable or incomplete and you deliberately want compatibility fallback.

Recommended config:

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
            "acpFallbackEnabled": true,
            "nodePath": "$(which node)",
            "openclawRoot": "$(npm root -g)/openclaw",
            "versionAllow": [">=2026.3.22"]
          }
        }
      }
    }
  }
}
```

Operator rules:

- keep bridge fallback explicit and narrow
- keep `versionAllow` tight to tested builds
- prefer returning to public ACP once doctor reports it ready

## Subagent Experimental Smoke

Use this only when you explicitly opt in to `subagent`.

```bash
openclaw swarm doctor --json
openclaw swarm run --project <path> --runner subagent --dry-run --json
openclaw swarm run --project <path> --runner subagent --json
```

Do not treat subagent as the normal default path.

## Upgrade Checklist

Before upgrading OpenClaw:

1. Check whether bridge fallback is enabled for ACP or subagent.
2. If bridge fallback is enabled, note `bridge.versionAllow`.
3. Upgrade OpenClaw in a non-critical session first.
4. Run `openclaw swarm doctor --json`.
5. If doctor reports public ACP ready and no compatibility blockers:
   - keep ACP on the public path
   - remove unnecessary bridge fallback only after the smoke matrix is green
6. If doctor reports version drift or missing exports:
   - update bridge mappings in the plugin repo
   - update `bridge.versionAllow`
   - rerun unit, e2e, and smoke verification

## Failure Remediation Quick Guide

- ACP backend direct smoke fails
  - verify the local `acpx` tooling path or replace the smoke probe with the supported backend check for the current install
- doctor green but live ACP run fails
  - treat that as an environment blocker, not bridge-removal proof
  - fix runtime backend configuration and rerun the matrix
- version drift
  - compare installed OpenClaw version with `bridge.versionAllow`
  - update mappings and allowlist together
- subagent blocked
  - confirm `subagent.enabled=true`
  - keep `bridge.subagentEnabled=true` until a public spawn export exists

## Rollback

```bash
openclaw plugins disable openclaw-swarm-layer
```

If needed:

```bash
openclaw plugins uninstall openclaw-swarm-layer
```

Do not delete project `.openclaw/swarm/` state automatically.
