# Testing Strategy

## Principles

- every implementation task adds or updates unit coverage
- every milestone-sized slice reruns e2e regression
- ACP bridge-exit work is not complete until the live smoke matrix is evaluated on a supported install

## Unit Coverage

Must cover:

- config validation
- state-store behavior
- planner and task graph
- runner selection and runner behavior
- review gate and report generation
- ACP mapping, session adapter behavior, and bridge-exit gate metadata
- operator surfaces that expose runtime posture and bridge-exit status
- session lifecycle, budget, progress synthesis, bootstrap, and follow-up flows

## E2E Coverage

Current baseline:

- `npm run test:unit`: 59 files / 359 tests
- `npm run test:e2e`: 19 files / 25 tests
- init -> plan -> status
- run -> review -> report
- ACP dry-run scaffold
- bridge doctor and bridge failure classification
- backward compatibility with existing workflow state and session reads

## Smoke Coverage

`M5.4a` defines the required live smoke matrix:

1. ACP backend direct route
2. swarm doctor
3. swarm init / plan / status
4. swarm dry-run
5. swarm live ACP run
6. swarm session lifecycle
7. swarm review / report / journal sync
8. swarm autopilot tick

Minimum artifact expectations:

- local state: `<project>/.openclaw/swarm/workflow-state.json`
- local report: `<project>/.openclaw/swarm/reports/swarm-report.md`
- local spec archive: `<project>/.openclaw/swarm/reports/specs/<specId>.md`
- when journaling is enabled: top-level `<obsidianRoot>/<project>-swarm-report.md` plus project journal files under `<obsidianRoot>/<project>/`

A smoke run can be partial by stage. The full journal shape appears only after the corresponding lifecycle step has executed.

Release `0.5.3` validation on OpenClaw `2026.5.3-1` covers startup tool-contract manifest checks, plugin doctor health, full unit regression, and full e2e regression.

## Regression Rule

Before marking any milestone done:

```bash
./node_modules/.bin/vitest run test/unit
./node_modules/.bin/vitest run test/e2e
npm run build
```
