# M5 ACP-Default Convergence Plan

## Goal

Move `openclaw-swarm-layer` from bridge-era symmetry to ACP-first execution:

- ACP becomes the default automated path.
- `subagent` becomes opt-in and disabled by default.
- bridge becomes a narrow compatibility fallback.
- bridge removal becomes staged, not a flag-day rewrite.

## Status After M5.4a Closeout

Completed before this slice:

- `M5.0` policy split
- `M5.1` ACP default cutover
- `M5.2` subagent dark mode
- `M5.3` ACP bridge reduction
- `M5.3.x-1` capability-aware `auto`
- `M5.3.x-2` docs and operator alignment

`M5.4a` is now milestone-complete as of 2026-03-27.

What landed:

- bridge-free ACP floor fixed at OpenClaw `>=2026.3.22`
- `acpBridgeExitGate` added to doctor, status, and workflow reports
- live smoke matrix encoded in runtime metadata and documented for operators
- remaining ACP bridge blockers encoded explicitly
- ACP backend direct smoke updated to follow the configured default agent and validate the current local direct route
- full local smoke matrix rerun successfully with `opencode` as the effective ACP default agent

Operational note:

- the previously reported `swarm doctor` hang was sandbox-only; the real command exits normally outside the Codex sandbox

## M5.4a ACP Version Floor Gate

Status: complete (2026-03-27)

Scope:

- confirm the minimum supported OpenClaw version for bridge-free ACP expectations
- define the live smoke matrix that must pass before ACP bridge removal
- enumerate any remaining ACP bridge dependencies
- document the full report and journal structure expected from a complete smoke run

DoD: satisfied.

## M5.4b ACP Bridge Removal

Status: next

Scope:

- remove ACP bridge code once `M5.4a` proves the public ACP path is sufficient
- keep legacy read paths intact while deleting ACP runtime dependence on bridge
- update tests and operator guidance to a bridge-free ACP baseline

## M5.4c Subagent Final Decision

Status: planned

Scope:

- decide whether `subagent` stays dark-mode opt-in, graduates with a public path, or is removed
- document support boundary or migration outcome
- keep historical subagent reads intact regardless of the decision

## Immediate Next Steps

1. Start `M5.4b ACP Bridge Removal`.
2. Keep ACP bridge deletion scoped to the dependencies already enumerated by `acpBridgeExitGate`.
3. Leave `subagent` keep-or-remove decisions to `M5.4c`.
