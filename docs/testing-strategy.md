# Testing Strategy

## Principles

- every small implementation task gets unit coverage
- every milestone-sized slice gets e2e regression
- ACP work adds smoke tests against at least one real harness before milestone close

## Unit Coverage

Must cover:

- config validation
- state-store behavior
- planner and task graph
- runner selection and runner behavior
- review gate (including quality rubric scoring)
- report generation
- ACP mapping and status mapping once `M2` work starts
- sprint contract lifecycle (create, freeze, update, evaluate)
- task field immutability guard
- evaluator task injection and dependency chain
- session budget tracking
- harness assumption metadata
- cross-session progress synthesis
- session bootstrap sequence

## E2E Coverage

Current baseline:

- `init -> plan -> status`
- `run -> review -> report`
- ACP dry-run scaffold
- harness enhanced flow: plan with contract → evaluator injection → run → rubric review → progress → bootstrap → immutability
- backward compatibility: existing flow works with no enhanced features enabled

Required after `M2.0`:

- ACP oneshot happy path
- ACP completion into review
- ACP error/timeout path

## Smoke Coverage

Required before closing `M2`:

- at least one real ACP harness smoke
- repeatable operator command smoke for session status/cancel/close

## Regression Rule

Before marking any milestone done:

```bash
npm test
npm run build
```
