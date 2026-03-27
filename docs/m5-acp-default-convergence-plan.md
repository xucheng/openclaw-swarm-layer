# M5 ACP-Default Convergence Plan

## Goal

Move `openclaw-swarm-layer` from bridge-era symmetry to ACP-first execution:

- ACP becomes the default automated path.
- `subagent` becomes opt-in and disabled by default.
- ACP no longer depends on bridge.
- bridge retirement happens per runner, not as a flag-day rewrite.

## Status After M5.4c Closeout

Completed before and during this slice:

- `M5.0` policy split
- `M5.1` ACP default cutover
- `M5.2` subagent dark mode
- `M5.3` ACP bridge reduction
- `M5.3.x-1` capability-aware `auto`
- `M5.3.x-2` docs and operator alignment
- `M5.4a` ACP version floor gate
- `M5.4b` ACP bridge removal
- `M5.4c` subagent final decision

What landed across `M5.4b-M5.4c`:

- ACP bridge session adapter removed
- ACP bridge command handlers removed from `openclaw-exec-bridge.ts`
- ACP runtime resolution now uses public ACP only
- legacy `bridge.acpFallbackEnabled` no longer grants ACP capability
- doctor, status, and report surfaces now show zero remaining ACP bridge blockers
- `subagent` is now explicitly retained only as a legacy bridge-backed opt-in path
- regression and local smoke rerun completed on `OpenClaw 2026.3.24`

## M5.4a ACP Version Floor Gate

Status: complete (2026-03-27)

DoD: satisfied.

## M5.4b ACP Bridge Removal

Status: complete (2026-03-27)

Scope:

- remove ACP bridge code once `M5.4a` proves the public ACP path is sufficient
- keep legacy read paths intact while deleting ACP runtime dependence on bridge
- update tests and operator guidance to a bridge-free ACP baseline

DoD: satisfied.

## M5.4c Subagent Final Decision

Status: complete (2026-03-27)

Scope:

- keep `subagent` only as a legacy bridge-backed opt-in path
- require both explicit enablement and bridge enablement before subagent is runnable
- document the support boundary and preserve historical reads

DoD: satisfied.

## Immediate Next Steps

1. Keep ACP on the public control-plane path and avoid reintroducing bridge fallbacks.
2. Keep `subagent` dark and legacy unless upstream exposes a public spawn export.
3. Treat any future non-empty ACP `remainingBridgeDependencies` as a regression.
