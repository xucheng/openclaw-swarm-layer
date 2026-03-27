# Roadmap

## Summary

The project remains on the five-stage roadmap:

- `M1` Orchestration Foundation
- `M2` ACP Execution Beta
- `M3` Sessionized Swarm
- `M4` Harness Enhancement
- `M5` ACP-Default Convergence

`M1-M4` are complete. `M5` is now complete through `M5.4c`.

## M5 Status

Target posture after `M5` closeout:

- ACP is the default automated runner
- ACP automation uses the public control-plane path only
- legacy ACP bridge config is ignored and surfaced as operator guidance, not runtime capability
- `subagent` remains a legacy bridge-backed opt-in path
- bridge remains only for the legacy subagent path

Sub-milestones:

- `M5.0` Policy Split: complete (2026-03-26)
- `M5.1` ACP Default Cutover: complete (2026-03-26)
- `M5.2` Subagent Dark Mode: complete (2026-03-26)
- `M5.3` ACP Bridge Reduction: complete (2026-03-26)
- `M5.3.x-1` Capability-Aware Auto Resolution: complete (2026-03-26)
- `M5.3.x-2` Docs And Operator Surface Alignment: complete (2026-03-26)
- `M5.4a` ACP Version Floor Gate: complete (2026-03-27)
- `M5.4b` ACP Bridge Removal: complete (2026-03-27)
- `M5.4c` Subagent Final Decision: complete (2026-03-27)

## M5.4c Closeout

Delivered:

- removed ACP bridge execution code from runtime selection and bridge command handling
- moved ACP diagnostics to a public-ACP baseline with `remainingBridgeDependencies = []`
- kept subagent bridge isolated as the only remaining bridge-backed runtime path
- finalized `subagent` as a legacy bridge-backed opt-in path instead of an experimental future default
- required both explicit `subagent.enabled` and `bridge.subagentEnabled` before subagent is runtime-enabled
- updated tests and operator surfaces to reflect the new subagent support boundary
- reran build, unit regression, and e2e regression on the supported install

Verification:

- 51 unit files, 305 unit tests passed
- 18 e2e files, 23 e2e tests passed
- `npm run build` clean
- local `openclaw swarm doctor --json` reports ACP replacement plan status `complete`
- local ACP dry-run smoke still selects `acp` on `OpenClaw 2026.3.24`

## What The Project Still Does Not Claim

The project still does not claim:

- a public subagent execution path

The project does claim:

- ACP as the only default-capable automated runner
- `subagent` as a legacy bridge-backed opt-in path with a documented support boundary

## Delivery Guardrails

- every stage adds or updates unit coverage before closeout
- every milestone node reruns e2e regression
- roadmap, backlog, and Obsidian notes are updated together with implementation status
