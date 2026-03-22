# Migration Checklist

## Purpose

Use this checklist when upstream public plugin SDK exports become available and the project is ready to replace bridge-backed internals.

## Preconditions

1. Run:

```bash
openclaw swarm doctor --json
```

2. Confirm:

- `publicApi.readyReplacementPoints` contains the export you want to adopt
- `replacementPlan` marks the runner as `ready`
- bridge smoke is currently green before you start changing code

## Suggested Replacement Order

### 1. ACP control-plane first

Replace:

- `bridge-openclaw-session-adapter -> openclaw-exec-bridge`

Target:

- `real-openclaw-session-adapter` via top-level `getAcpSessionManager`

Touch points:

- `src/runtime/bridge-openclaw-session-adapter.ts`
- `src/runtime/openclaw-exec-bridge.ts`
- `src/runtime/real-openclaw-session-adapter.ts`

Validation after change:

- ACP unit tests
- ACP e2e regressions
- live ACP smoke

### 2. Subagent spawn next

Replace:

- `bridge-openclaw-subagent-adapter -> openclaw-exec-bridge patched helpers`

Target:

- top-level public `spawnSubagentDirect`

Touch points:

- `src/runtime/bridge-openclaw-subagent-adapter.ts`
- `src/runtime/openclaw-exec-bridge.ts`

Validation after change:

- subagent unit tests
- subagent lifecycle e2e regressions
- live subagent smoke

### 3. Bridge retirement last

Only after ACP and subagent public paths are stable:

- mark bridge mode as fallback-only
- keep compatibility code for one tested release window
- remove internal alias dependencies gradually, not all at once

## Safety Rules

- do not replace ACP and subagent bridge internals in the same change set unless both public exports are proven stable
- always rerun full regression before relaxing version guards
- keep rollback path documented and tested while bridge and public paths coexist
