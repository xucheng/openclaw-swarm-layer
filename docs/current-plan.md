# Current Plan

## Status Snapshot

- `M1`: complete
- `M2.0`: complete
- `M2.1`: complete
- `M2.2`: complete
- `M2.3`: complete
- `M3.0`: complete
- `M3.1`: complete
- `M3.2`: complete
- `M3.3`: complete
- `M4`: complete
- `M5.0`: complete (2026-03-26)
- `M5.1`: complete (2026-03-26)
- `M5.2`: complete (2026-03-26)
- `M5.3`: complete (2026-03-26)
- `M5.3.x-1`: complete (2026-03-26)
- `M5.3.x-2`: complete (2026-03-26)
- `M5.4a`: complete (2026-03-27)
- `M5.4b`: planned
- `M5.4c`: planned

The active frontier now moves to `M5.4b ACP Bridge Removal`. `M5.4a ACP Version Floor Gate` is closed after the local `OpenClaw 2026.3.24` install passed the full smoke matrix.

## M5 Delivery Matrix

| Milestone | Goal | Status | Notes |
|-----------|------|--------|-------|
| `M5.0` | Policy split | Complete | Closed 2026-03-26 |
| `M5.1` | ACP default cutover | Complete | Closed 2026-03-26 |
| `M5.2` | Subagent dark mode | Complete | Closed 2026-03-26 |
| `M5.3` | ACP bridge reduction | Complete | Closed 2026-03-26 |
| `M5.3.x-1` | Capability-aware auto resolution | Complete | Closed 2026-03-26 |
| `M5.3.x-2` | Docs and operator surface alignment | Complete | Closed 2026-03-26 |
| `M5.4a` | ACP version floor gate | Complete | Closed 2026-03-27 after full local smoke matrix rerun |
| `M5.4b` | ACP bridge removal | Planned | Next slice; start from the remaining ACP bridge dependencies already enumerated in gate metadata |
| `M5.4c` | Subagent final decision | Planned | Independent of ACP bridge exit |

## M5.4a Closeout

- exported the bridge-free ACP floor as `ACP_BRIDGE_FREE_VERSION_FLOOR = 2026.3.22`
- added `acpBridgeExitGate` to `swarm doctor`, `swarm status`, and workflow reports
- codified the live smoke matrix and remaining ACP bridge dependencies in runtime metadata
- updated the ACP backend direct smoke script so it follows the configured default agent and validates the current local direct route (`opencode` on `qwen3.5-plus`)
- reran the full local smoke matrix with `opencode` as the effective ACP default agent
- confirmed the complete report and journal artifact structure with real smoke projects

## Verification

Implementation gates remain green:

- unit regression: `vitest run test/unit` -> 53 files, 306 tests passed
- milestone regression: `vitest run test/e2e` -> 18 files, 25 tests passed
- compile gate: `npm run build` -> clean

Live smoke matrix on the local `2026.3.24` install is now green:

- pass: `~/.openclaw/scripts/openclaw-acp-post-upgrade-smoke.sh`
- pass: `openclaw swarm doctor --json`
- pass: `openclaw swarm init --project <path>`
- pass: `openclaw swarm plan --project <path> --spec <spec> --json`
- pass: `openclaw swarm status --project <path> --json`
- pass: `openclaw swarm run --project <path> --dry-run --json`
- pass: `openclaw swarm run --project <path> --json` via `agent:opencode:acp:...`
- pass: `openclaw swarm session status --project <path> --run <runId> --json`
- pass: `openclaw swarm session cancel --project <path> --run <runId> --json`
- pass: `openclaw swarm session close --project <path> --run <runId> --json`
- pass: `openclaw swarm review --project <path> --task <taskId> --approve --json`
- pass: `openclaw swarm report --project <path> --json`

Operational note:

- the earlier `openclaw swarm doctor --json` “hang” reproduced only inside the Codex sandbox; outside the sandbox the command exits normally, so it is not currently treated as a swarm-layer product blocker

## Next Slice

Advance to `M5.4b ACP Bridge Removal`, using the enumerated bridge dependencies as the deletion boundary and keeping `subagent` decisions isolated to `M5.4c`.
