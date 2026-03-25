# Operator Runbook

## Install

```bash
openclaw plugins install -l /path/to/openclaw-swarm-layer
```

Ensure config includes:

- plugin load path or install record
- `plugins.allow` entry
- `plugins.entries.openclaw-swarm-layer.enabled = true`
- optional `plugins.entries.openclaw-swarm-layer.config.obsidianRoot`

## Basic Smoke

```bash
openclaw plugins info openclaw-swarm-layer
openclaw swarm --help
openclaw swarm init --project <path>
openclaw swarm plan --project <path> --spec <spec>
openclaw swarm status --project <path>
```

## ACP Preflight For M2

Check:

- `acp.enabled = true`
- `acp.dispatch.enabled = true`
- backend is present
- default or allowed ACP agents are configured
- chosen harness can pass a smoke run

## Bridge Mode

Use bridge mode when plugin public SDK exports are insufficient for real execution.

Recommended config:

```json
{
  "plugins": {
    "entries": {
      "openclaw-swarm-layer": {
        "config": {
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

Run doctor:

```bash
openclaw swarm doctor --json
```

Interpretation:

- `checks.*=true` means the bridge is compatible with the currently installed OpenClaw build
- `blockers` means execution should be treated as unavailable until fixed
- `remediation` lists the first actions to take before retrying runs
- `severity=healthy|warning|blocked` shows whether bridge mode is ready, risky, or unusable
- `nextAction` is the first recommended operator step
- `publicApi` shows whether top-level public spawn/control exports are available yet
- `replacementPlan` shows which bridge paths could be replaced first if public exports appear
- `migrationChecklist` gives the staged order for replacing bridge-backed paths when a public export becomes ready

## Migration Checklist

Use the doctor output together with `docs/migration-checklist.md`.

Operator rule:

- do not replace bridge internals just because a public export appears in one release
- first confirm `replacementPlan[*].status = ready`
- then follow the staged replacement order from the migration checklist

## Upgrade Checklist

Before upgrading OpenClaw:

1. Check current bridge config and note `bridge.versionAllow`
2. Upgrade OpenClaw in a non-critical session first
3. Run:

```bash
openclaw swarm doctor --json
```

4. If doctor reports version drift:
   - update bridge mappings in the plugin repo
   - update `bridge.versionAllow`
   - rerun unit/e2e bridge regressions
5. Only then re-enable normal operator use

If the upgrade breaks bridge mode unexpectedly:

- keep manual runner available
- disable bridge-backed execution paths temporarily
- prefer rollback to a tested OpenClaw version over ad-hoc internal patching in production use

## Compatibility Policy

- keep `bridge.versionAllow` narrow
- treat every new OpenClaw version as incompatible until explicitly smoke-tested
- record tested versions in repo docs and operator notes

## Failure Remediation Quick Guide

- `backend-unavailable`
  - verify `acpx` is enabled
  - run `openclaw swarm doctor --json`
  - retry only after doctor reports `acpBackendHealthy=true`
- `version-drift`
  - compare installed OpenClaw version with `bridge.versionAllow`
  - update bridge mappings and allowlist together
  - rerun unit/e2e bridge regressions before normal use
- `timeout`
  - determine whether the child run was truly slow or bridge startup hung
  - if startup hung, re-run doctor and inspect backend health
  - if task is simply long-running, adjust timeout-related settings deliberately
- `close-race`
  - trust local run ledger first
  - avoid repeatedly polling a just-closed session
  - confirm report and workflow state before attempting cleanup again

## Compatibility And Risk

- bridge mode is version-pinned and depends on internal OpenClaw bundle aliases
- changing OpenClaw versions may require updating bridge mappings before execution works again
- keep `versionAllow` narrow and explicit
- prefer bridge mode over scattering private imports through plugin business logic
- when upstream public spawn/control surfaces become available, plan to retire bridge mode

## Suggested Smoke

ACP bridge smoke:

```bash
openclaw swarm init --project <path>
openclaw swarm plan --project <path> --spec <spec>
openclaw swarm run --project <path> --runner acp --json
openclaw swarm session status --project <path> --run <runId> --json
```

Subagent bridge smoke:

```bash
openclaw swarm run --project <path> --runner subagent --json
```

## Rollback

```bash
openclaw plugins disable openclaw-swarm-layer
```

If needed:

```bash
openclaw plugins uninstall openclaw-swarm-layer
```

Do not delete project `.openclaw/swarm/` state automatically.

## Document Journaling

When `obsidianJournal` is enabled, the plugin writes structured logs alongside the status report.

State (always written to `<project>/.openclaw/swarm/`):
- `progress.json` — cross-session progress summary (auto-updated after run and review)

Local (always written to `<project>/.openclaw/swarm/reports/`):
- `run-log.md` — append-only execution log
- `review-log.md` — append-only review decision log
- `specs/<specId>.md` — spec archive on plan
- `completion-summary.md` — generated when all tasks complete

Obsidian (mirrored to `<obsidianRoot>/<project-name>/` if configured):
- Same files as above, async fire-and-forget

Enable via config:

```json
{
  "obsidianJournal": {
    "enableRunLog": true,
    "enableReviewLog": true,
    "enableSpecArchive": true,
    "enableCompletionSummary": true
  }
}
```

See [configuration.md](configuration.md) for full details.
