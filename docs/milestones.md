# Milestones And Definition Of Done

## Verification Discipline

- every implementation stage must add or update unit coverage before it can be closed
- every milestone node must pass e2e regression before it is marked complete
- `npm run build` stays part of the milestone verification gate
- backlog, progress docs, and Obsidian notes are updated together with milestone status

## M5 ACP-Default Convergence

### M5 Overall DoD

- ACP is the only default-capable automated runner
- `subagent` is opt-in and disabled by default
- bridge is scoped to compatibility fallback by runner
- supported OpenClaw versions use the public ACP path as the normal path
- historical workflows, runs, and sessions remain readable

### M5.4a DoD

- minimum supported OpenClaw version is fixed for bridge-free ACP expectations
- bridge-exit metadata is surfaced through doctor, status, and workflow reports
- live smoke matrix is defined, documented, and rerun on a supported install
- remaining ACP bridge dependencies are enumerated explicitly
- the full report and journal artifact structure is documented for smoke verification

Current status: complete (2026-03-27).

Completion evidence:

- version floor fixed at `>=2026.3.22`
- doctor, status, and report surfaces implemented
- unit, e2e, and build gates green
- full local smoke matrix rerun successfully on `OpenClaw 2026.3.24`
- direct smoke, dry-run, live run, session lifecycle, and review/report/journal sync all verified with `opencode` as the local ACP default agent

Operational note:

- the previously observed `openclaw swarm doctor --json` hang was sandbox-specific; outside the sandbox the command exits normally

Exit rule: satisfied on 2026-03-27.

### M5.4b DoD

- ACP bridge code can be removed without breaking the default path on supported installs
- bridge-specific ACP compatibility logic is deleted or isolated behind legacy-only guards
- operator guidance no longer depends on ACP bridge as a supported runtime path

Current status: planned.

### M5.4c DoD

- project makes a final keep-dark/remove decision on `subagent`
- if retained, `subagent` has a justified posture and documented support boundary
- if removed, historical reads remain intact and migration guidance is documented

Current status: planned.

## Assessment History

- `M5.0` complete (2026-03-26): 290 unit tests across 51 files, 24 e2e tests across 17 files, build clean
- `M5.1` complete (2026-03-26): 292 unit tests across 52 files, 24 e2e tests across 17 files, build clean
- `M5.2` complete (2026-03-26): 296 unit tests across 52 files, 25 e2e tests across 18 files, build clean
- `M5.3` complete (2026-03-26): 301 unit tests across 52 files, 25 e2e tests across 18 files, build clean
- `M5.3.x-1` complete (2026-03-26): 303 unit tests across 52 files, 25 e2e tests across 18 files, build clean
- `M5.3.x-2` complete (2026-03-26): 303 unit tests across 52 files, 25 e2e tests across 18 files, build clean
- `M5.4a` complete (2026-03-27): 306 unit tests across 53 files, 25 e2e tests across 18 files, build clean; full local smoke matrix green on `OpenClaw 2026.3.24`
