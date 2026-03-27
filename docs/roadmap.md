# Roadmap

## Summary

The project remains on the five-stage roadmap:

- `M1` Orchestration Foundation
- `M2` ACP Execution Beta
- `M3` Sessionized Swarm
- `M4` Harness Enhancement
- `M5` ACP-Default Convergence

`M1-M4` are complete. Within `M5`, `M5.0-M5.3`, `M5.3.x-1`, `M5.3.x-2`, and now `M5.4a ACP Version Floor Gate` are complete. The active frontier moves to `M5.4b ACP Bridge Removal`.

## M5 Status

Target posture:

- ACP is the default automated runner
- `subagent` is opt-in and disabled by default
- bridge is a narrow compatibility fallback
- bridge retirement happens per runner, not as a flag day

Sub-milestones:

- `M5.0` Policy Split: complete (2026-03-26)
- `M5.1` ACP Default Cutover: complete (2026-03-26)
- `M5.2` Subagent Dark Mode: complete (2026-03-26)
- `M5.3` ACP Bridge Reduction: complete (2026-03-26)
- `M5.3.x-1` Capability-Aware Auto Resolution: complete (2026-03-26)
- `M5.3.x-2` Docs And Operator Surface Alignment: complete (2026-03-26)
- `M5.4a` ACP Version Floor Gate: complete (2026-03-27)
- `M5.4b` ACP Bridge Removal: planned
- `M5.4c` Subagent Final Decision: planned

## M5.4a Closeout

Delivered:

- fixed the bridge-free ACP floor at OpenClaw `>=2026.3.22`
- added `acpBridgeExitGate` to doctor, status, and workflow reports
- defined the live smoke matrix and remaining ACP bridge blockers in code and docs
- updated the ACP backend direct smoke probe to follow the configured default agent and validate the current direct route
- reran the full local smoke matrix on `OpenClaw 2026.3.24` with `opencode` as the effective ACP default agent

Verification:

- 53 unit files, 306 unit tests passed
- 18 e2e files, 25 e2e tests passed
- `npm run build` clean
- full local smoke matrix green on the supported install

Operational note:

- the earlier `swarm doctor` hang only reproduced inside the Codex sandbox; outside the sandbox it returns normally and is not treated as a product blocker

## What The Project Still Does Not Claim

The project still does not claim:

- ACP bridge removal
- a final keep-or-remove decision for `subagent`

## Delivery Guardrails

- every stage adds or updates unit coverage before closeout
- every milestone node reruns e2e regression
- roadmap, backlog, and Obsidian notes are updated together with implementation status
