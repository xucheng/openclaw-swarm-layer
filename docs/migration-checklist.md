# Migration Checklist

## Purpose

Use this checklist when upstream public plugin SDK exports are available and the project is ready to replace ACP bridge-backed internals.

## Preconditions

1. Run `openclaw swarm doctor --json`.
2. Confirm the bridge-free ACP floor is satisfied.
3. Confirm `acpBridgeExitGate` reports the expected smoke matrix and remaining blockers.
4. Confirm the target install has rerun the required live smoke items for the change you are making.

Minimum floor:

- OpenClaw `>=2026.3.22`

## Suggested Replacement Order

### 1. ACP control-plane first

Replace:

- `bridge-openclaw-session-adapter -> openclaw-exec-bridge`

Target:

- `real-openclaw-session-adapter` via public ACP runtime exports

Touch points:

- `src/runtime/bridge-openclaw-session-adapter.ts`
- `src/runtime/openclaw-exec-bridge.ts`
- `src/runtime/real-openclaw-session-adapter.ts`

Validation after change:

- ACP unit tests
- ACP e2e regressions
- doctor + init/plan/status + dry-run + live ACP smoke on a supported install

### 2. ACP bridge retirement next

Only after the ACP public path is stable:

- remove ACP bridge compatibility code
- remove ACP bridge-specific doctor shellouts
- keep historical state and read-paths intact

Validation after change:

- rerun full unit + e2e + build gates
- rerun the complete bridge-exit smoke matrix
- confirm remaining blockers list no longer contains ACP bridge dependencies

### 3. Subagent decision last

Do not let `subagent` block ACP bridge exit.

Keep `subagent` in its own decision track until a public spawn export exists or the feature is intentionally retired.

## Artifact Expectations

For smoke runs with journaling enabled, the expected Obsidian structure is:

- `<obsidianRoot>/<project>-swarm-report.md`
- `<obsidianRoot>/<project>/run-log.md`
- `<obsidianRoot>/<project>/review-log.md`
- `<obsidianRoot>/<project>/completion-summary.md`
- `<obsidianRoot>/<project>/specs/<specId>.md`

Stage-dependent partial output is normal during plan-only or run-only smoke checks.

## Safety Rules

- do not remove ACP bridge and change `subagent` posture in the same change set
- always rerun full regression before relaxing version or compatibility guards
- keep rollback and manual fallback guidance documented while bridge and public paths coexist
