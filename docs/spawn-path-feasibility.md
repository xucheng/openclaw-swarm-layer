# Spawn Path Feasibility

## Goal

Capture the current feasibility of using OpenClaw public plugin surfaces to spawn real child execution from `openclaw-swarm-layer`.

## Short Answer

OpenClaw has two real spawn families relevant to this project:

- `runtime="acp"`
- `runtime="subagent"`

But for a standalone native plugin, both currently have a similar problem:

- the public top-level `openclaw/plugin-sdk` surface does not expose a stable plugin-side spawn facade for either ACP control-plane execution or subagent direct spawn

## Evidence

### Public package exports

`openclaw/package.json` exports only:

- `.`
- `./plugin-sdk`
- `./plugin-sdk/account-id`

That means plugin code should treat `openclaw/plugin-sdk` as the public boundary.

### ACP

The public top-level SDK exports ACP runtime backend registry functions, but not a usable session control-plane manager for plugin-side orchestration.

Observed result from runtime inspection:

- `openclaw/plugin-sdk` does not expose `getAcpSessionManager()` at runtime

Impact:

- our experimental real ACP adapter can exist behind a guard
- but real plugin-side ACP smoke remains blocked without an upstream public export or a private deep-import experiment

### Subagent

OpenClaw clearly supports subagent spawning conceptually and internally:

- docs describe `sessions_spawn` default runtime as `subagent`
- internal declarations include `spawnSubagentDirect()` in `dist/plugin-sdk/agents/subagent-spawn.d.ts`

But the public top-level SDK still does not export a stable helper for plugin-side use.

Observed result from runtime inspection:

- `openclaw/plugin-sdk` top-level exports do not include `spawnSubagentDirect`
- the internal implementation appears bundled inside hashed/internal files, which is not a stable public contract

Impact:

- we can implement a `subagent` runner scaffold and injected adapter path
- but a real default plugin-side subagent adapter is also blocked unless upstream exports a stable helper or we accept a private deep-import experiment

## Product Recommendation

- keep `acp` as the primary product direction
- keep `subagent` as a secondary/fallback runner direction
- do not pivot the project from ACP to subagent just because ACP is currently blocked

Reason:

- ACP matches the product goal of external harness orchestration
- subagent matches OpenClaw-native delegated runs
- they overlap operationally but are not the same product boundary

## Engineering Recommendation

Near-term safe path:

- keep runner abstractions for `manual`, `acp`, and `subagent`
- keep real adapters behind explicit guards or test injection
- avoid private deep-imports as the default implementation

Decision point:

1. Wait for upstream to expose stable public spawn/control-plane helpers
2. Or explicitly choose a private deep-import experiment with known upgrade risk

## Current Project Status

- `manual`: real and usable
- `acp`: orchestration logic mostly complete; real public integration blocked
- `subagent`: secondary runner scaffold complete; real public integration also blocked

## Bottom Line

For this plugin today, the problem is not that OpenClaw lacks spawn concepts.

The problem is that the current public plugin SDK does not yet provide a stable top-level spawn/control facade that a native plugin can depend on for real child execution without crossing into private internals.
