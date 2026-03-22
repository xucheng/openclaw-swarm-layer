# No-Upstream Bridge Plan

## Goal

Continue implementing real `acp` and `subagent` execution without waiting for upstream plugin SDK improvements and without rewriting the current orchestration core.

## Recommended Minimal-Change Strategy

Keep the current plugin exactly where it is architecturally:

- plugin = orchestration/control plane
- runner = execution abstraction
- adapter = runtime-specific boundary

Then add one new boundary:

- `local execution bridge`

## Why This Is The Smallest Safe Change

- it does not touch planner, state-store, review-gate, reporting, or CLI contracts
- it isolates all incomplete plugin-SDK integration work into one replaceable layer
- it avoids waiting for upstream public exports
- it preserves future migration back to official public APIs once OpenClaw exposes them

## Concrete Shape

### 1. Add a bridge process

Create a repo-local helper such as:

- `scripts/openclaw-exec-bridge.mjs`

The plugin calls it through `runtime.system.runCommandWithTimeout` and exchanges JSON over stdout/stderr.

### 2. Normalize bridge commands

Bridge subcommands:

- `acp-spawn`
- `acp-status`
- `acp-cancel`
- `acp-close`
- `subagent-spawn`

Optional later:

- `subagent-status`
- `subagent-kill`

### 3. Keep plugin-side contracts unchanged

Existing interfaces stay stable:

- `OpenClawSessionAdapter`
- `OpenClawSubagentAdapter`
- `AcpRunner`
- `SubagentRunner`

Only the concrete adapter implementation changes from `unsupported` to `bridge-backed`.

## Bridge Implementation Strategy

### ACP

Inside the bridge process:

- resolve the local OpenClaw install path
- check the tested version range
- use internal bundle/deep-import access only inside the bridge
- call ACP manager internals
- return normalized JSON to the plugin

### Subagent

Inside the bridge process:

- resolve the local OpenClaw install path
- locate internal subagent spawn implementation
- call internal spawn helper
- return normalized JSON to the plugin

This keeps all private coupling outside the plugin runtime boundary.

## Required Guards

- explicit config flag to enable bridge mode
- explicit OpenClaw version allowlist
- startup self-check for symbol resolution
- clear error message when internal symbols move

## Suggested Config Additions

```json
{
  "acp": {
    "experimentalBridge": "internal-bundle"
  },
  "subagent": {
    "experimentalBridge": "internal-bundle"
  },
  "bridge": {
    "openclawRoot": "/path/to/openclaw/install",
    "versionAllow": ["2026.2.26"]
  }
}
```

## Step Order

1. Implement bridge JSON protocol
2. Implement ACP bridge first
3. Replace ACP real adapter with bridge-backed adapter
4. Run real ACP smoke
5. Implement subagent bridge
6. Run subagent smoke

## Why ACP First

- ACP is still the primary product path
- current code is already more complete on ACP than subagent
- success here unblocks the intended M2 delivery target

## What Not To Change

Do not rewrite:

- planner
- workflow-state
- review-gate
- report format
- runner interfaces
- CLI contracts

The bridge approach works precisely because the rest of the system is already in place.

## Bottom Line

If upstream public plugin APIs remain incomplete, the next minimal-change path is:

> keep the plugin as-is, and move real ACP/subagent execution into a repo-local bridge process that the plugin shells out to behind guarded experimental adapters.

## Current Implementation Status

- bridge config has been added
- bridge-backed ACP adapter skeleton has been implemented
- bridge protocol and command runner are wired through plugin runtime `runCommandWithTimeout`
- current bridge mapping targets tested OpenClaw `2026.2.26`
- current bridge mapping now also covers local OpenClaw `2026.3.13`
- a real local ACP bridge smoke has been run successfully through the bridge-backed adapter
- a real local subagent bridge smoke has also been run successfully through the bridge-backed adapter
- bridge hardening now includes backend health wait and version/self-check coverage
- bridge doctor/self-check command is available through `openclaw swarm doctor`
