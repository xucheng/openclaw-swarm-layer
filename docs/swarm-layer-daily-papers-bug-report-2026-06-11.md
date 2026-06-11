# Issue Draft: Swarm Layer ACP runs can be marked completed after OpenClaw embedded aborts, leaving Daily Papers artifacts missing

Date: 2026-06-11  
Workspace: `<USER_HOME>/.openclaw`  
Project root: `<USER_HOME>/.openclaw/workspace`  
Component: `openclaw-swarm-layer` ACP runner / session status sync / Daily Papers controller integration  
Observed package/runtime:
- `openclaw-swarm-layer@0.5.11`
- `OpenClaw 2026.6.5 (5181e4f)`
- ACP backend: `acpx`
- Swarm default agent: `deepseek`

## Summary

Daily Papers workflows can reach a false terminal state when dispatched through Swarm Layer ACP. In the 2026-06-11 Daily Papers repair workflow, several ACP-backed swarm tasks were recorded as `status: "completed"` even though OpenClaw logged `EmbeddedAttemptSessionTakeoverError: This operation was aborted` and the expected JerryVault note artifacts were still missing.

The user-visible symptom is that `openclaw swarm status --sync` can report tasks or the workflow as completed while the actual Daily Papers output is incomplete. This makes cron/autopilot believe the workflow made progress, but no single-paper note, summary, or audit file exists.

We worked around the issue by bypassing Swarm Layer for Daily Papers and using direct OpenClaw agent execution:

```bash
openclaw agent --agent acp-worker --session-key <unique-key> --message <prompt> --timeout <seconds> --json
```

That direct route successfully completed the 2026-06-11 Daily Papers run and produced all expected artifacts.

## Impact

- Daily Papers automation can silently skip required outputs.
- Swarm reports and run JSON can show success despite empty `artifacts: []`.
- The controller may approve/review tasks based on process lifecycle instead of artifact existence.
- Parallel phase-1 work is effectively serialized by current Swarm Layer config (`acp.maxConcurrent: 1`), making recovery slow and increasing the blast radius of stuck/false-complete runs.
- Operators need to manually compare swarm state against JerryVault artifacts to know whether the workflow is truly done.

Severity: high for scheduled artifact-producing workflows. The issue is not a total runtime outage, but it breaks the success contract for automation.

## Expected Behavior

For ACP-backed swarm tasks:

1. If the underlying OpenClaw embedded attempt aborts before a real assistant reply or tool completion, the swarm run should become `failed`, `timed_out`, or `cancelled`, not `completed`.
2. If a task declares required artifacts or acceptance criteria, the run should not be auto-completed solely because an ACP process/session reached a terminal state.
3. `openclaw swarm status --sync` should surface the abort/failure in `attention` or `recommendedActions`.
4. A completed run should include enough result evidence to distinguish "assistant finished successfully" from "process closed after prompt failure".

## Actual Behavior

Swarm run records show completed status with no artifacts:

```json
{
  "runId": "phase-1-缺失单篇笔记补齐-task-1-run-1781144427849",
  "taskId": "phase-1-缺失单篇笔记补齐-task-1",
  "status": "completed",
  "runner": { "type": "acp" },
  "resultSummary": "Completed: ACP session finished (pid=11378)",
  "artifacts": []
}
```

At the same time, OpenClaw runtime logs showed the embedded attempt failed before reply:

```text
<TEMP_DIR>/openclaw/openclaw-2026-06-11.log:4110
embedded attempt cleanup detected session takeover after prompt failure; preserving prompt error: ... promptError=This operation was aborted ...

<TEMP_DIR>/openclaw/openclaw-2026-06-11.log:4111
lane task error: lane=main ... error="EmbeddedAttemptSessionTakeoverError: This operation was aborted"

<TEMP_DIR>/openclaw/openclaw-2026-06-11.log:4113
Embedded agent failed before reply: This operation was aborted | session file changed while embedded prompt lock was released: ...
```

The same pattern repeated for adjacent tasks:

- `phase-1-缺失单篇笔记补齐-task-2-run-1781144476360`
- `phase-1-缺失单篇笔记补齐-task-3-run-1781144529039`

Those run records also showed `status: "completed"` and `artifacts: []`, while `<TEMP_DIR>/openclaw/openclaw-2026-06-11.log` recorded `EmbeddedAttemptSessionTakeoverError` around the same timestamps.

## Reproduction Context

Target workflow:

```bash
openclaw swarm status --project <USER_HOME>/.openclaw/workspace --sync --json
openclaw swarm run --project <USER_HOME>/.openclaw/workspace --runner acp --all-ready --parallel 4 --sync-active --json
```

Swarm spec:

```text
<USER_HOME>/.openclaw/workspace/.openclaw/swarm/specs/2026-06-11-daily-papers-top10-产物修正.json
```

Example task:

```text
phase-1-缺失单篇笔记补齐-task-1
补齐论文(2606.11722)《ICA Lens: Interpreting Language Models Without Training Another Dictionary》对应的 JerryVault 单篇'深度解读'笔记
```

Expected artifact:

```text
<USER_HOME>/Documents/ObsidianVault/JerryVault/Rose/Research/01-论文分析/**/2606.11722-*.md
```

Observed run ledger:

```text
<USER_HOME>/.openclaw/workspace/.openclaw/swarm/runs/phase-1-缺失单篇笔记补齐-task-1-run-1781144427849.json
<USER_HOME>/.openclaw/workspace/.openclaw/swarm/runs/phase-1-缺失单篇笔记补齐-task-2-run-1781144476360.json
<USER_HOME>/.openclaw/workspace/.openclaw/swarm/runs/phase-1-缺失单篇笔记补齐-task-3-run-1781144529039.json
```

## Additional Findings

### 1. Swarm Layer maps terminal ACP session states too optimistically

Before the local hot patch, the adapter effectively treated any non-running/non-cancelled terminal ACP state as `completed`. The observed OpenClaw abort text lived in error/message fields rather than as a clean `state: "failed"` value, so it was swallowed.

Local mitigation added failure text detection in:

```text
<USER_HOME>/.openclaw/extensions/openclaw-swarm-layer/dist/src/runtime/real-openclaw-session-adapter.js
```

The patched logic maps these status texts to failure:

- `status=error`
- `state=error`
- `error`
- `failed`
- `failure`
- `aborted`
- `abort`
- `This operation was aborted`

### 2. The run ledger does not enforce artifact acceptance

The run JSON can be `completed` with:

```json
"artifacts": []
```

For Daily Papers this is insufficient. The task definition explicitly requires a JerryVault Markdown file with `paper_id` frontmatter and nine required sections, but Swarm Layer completion does not verify those files.

Daily Papers now has a controller-level artifact validator, but this is a workaround. Swarm Layer should support a first-class acceptance/validation hook or at least propagate artifact-less completion as a warning when artifacts are expected.

### 3. Current config serializes work despite batch dispatch

OpenClaw agent settings allow more concurrency:

```json
"maxConcurrent": 4,
"subagents": {
  "maxConcurrent": 8
}
```

But the Swarm Layer plugin config is:

```json
"openclaw-swarm-layer": {
  "config": {
    "acp": {
      "defaultAgentId": "deepseek",
      "allowedAgents": ["deepseek", "gemini", "openclaw"],
      "defaultMode": "run",
      "maxConcurrent": 1
    }
  }
}
```

So even when Daily Papers dispatches:

```bash
openclaw swarm run --project "$WORKSPACE" --runner acp --all-ready --parallel 4 --sync-active --json
```

the effective ACP admission limit is one active swarm task. This is not the root cause of false completion, but it makes recovery slower and makes parallel phase specs misleading.

### 4. Repeated session-key / session-takeover behavior is suspicious

The OpenClaw log entries include:

```text
session file changed while embedded prompt lock was released
```

and errors on:

```text
lane=session:agent:acp-worker:swarm-acp
```

Current `acpx` config uses a fixed OpenClaw session for the deepseek ACP bridge:

```json
"deepseek": {
  "command": "node",
  "args": [
    "<USER_HOME>/.openclaw/scripts/openclaw-acp-stdio-filter.mjs",
    "acp",
    "--session",
    "agent:acp-worker:swarm-acp",
    "--reset-session"
  ]
}
```

The fixed bridge session may be interacting badly with concurrent or repeated oneshot ACP calls. Even with `maxConcurrent: 1`, quick retries/status sync can encounter "session file changed" and "session takeover" conditions.

## Workarounds Applied

### Daily Papers default executor switched away from Swarm Layer

`workspace/scripts/daily-papers-write-cron.py` now defaults to direct agent execution:

```python
EXECUTOR = os.environ.get('DAILY_PAPERS_EXECUTOR', 'agent').strip().lower()
CONTROLLER = Path(os.environ.get(
    'DAILY_PAPERS_CONTROLLER',
    '<USER_HOME>/.openclaw/workspace/scripts/daily-papers-swarm-controller.py'
    if EXECUTOR == 'swarm'
    else '<USER_HOME>/.openclaw/workspace/scripts/daily-papers-agent-runner.py',
))
```

`workspace/scripts/daily-papers-push.sh` now only resumes/dispatches swarm when explicitly requested:

```bash
EXECUTOR="${DAILY_PAPERS_EXECUTOR:-agent}"

if [ "$EXECUTOR" = "swarm" ]; then
    openclaw swarm run --project "$WORKSPACE" --runner acp --all-ready --parallel 4 --sync-active --json
fi
```

To force the old path:

```bash
DAILY_PAPERS_EXECUTOR=swarm workspace/scripts/daily-papers-push.sh
```

### Direct agent runner added

New runner:

```text
<USER_HOME>/.openclaw/workspace/scripts/daily-papers-agent-runner.py
```

It does the following:

- Computes missing Daily Papers artifacts using the existing validator.
- Prefetches arXiv evidence in the runner process.
- Calls `openclaw agent --agent acp-worker` with a unique session key per task.
- Forces the worker to write exactly the target artifact.
- Re-validates JerryVault files after every task.
- Writes run records under:

```text
<USER_HOME>/.openclaw/workspace/memory/daily-papers/agent-runs/<date>/
```

This route completed 2026-06-11 successfully:

```json
{
  "status": "done",
  "artifactState": {
    "missingNoteIds": [],
    "incompleteNoteIds": [],
    "missingReports": [],
    "reportIssues": {
      "summary": [],
      "audit": []
    }
  }
}
```

### Swarm controller now distrusts process-only success

`workspace/scripts/daily-papers-swarm-controller.py` now:

- Treats `failed`, `timed_out`, and `cancelled` runs as retryable.
- Reopens tasks if artifact validation says notes/reports are missing or incomplete.
- Delays phase-2 reports until phase-1 note artifacts are valid.

This prevents Daily Papers from accepting a false completed state even if Swarm Layer still misreports a run.

## Recommended Fixes

### Fix 1: Make ACP status mapping conservative

Swarm Layer should map any upstream status text containing abort/error/failure signals to `failed` unless there is an explicit successful assistant completion.

Relevant adapter area:

```text
extensions/openclaw-swarm-layer/dist/src/runtime/real-openclaw-session-adapter.js
```

Suggested behavior:

- `This operation was aborted` -> `failed`
- `EmbeddedAttemptSessionTakeoverError` -> `failed`
- `promptError` present -> `failed`
- `lastError` present -> `failed`
- `runtimeStatus.summary` containing abort/error -> `failed`

### Fix 2: Preserve upstream failure metadata in run JSON

Run records should include:

```json
{
  "status": "failed",
  "failure": {
    "source": "openclaw-embedded",
    "message": "This operation was aborted",
    "upstreamState": "...",
    "sessionKey": "...",
    "backendSessionId": "..."
  }
}
```

This would make `openclaw swarm status`, reports, and controller logic easier to debug.

### Fix 3: Add optional artifact validation / acceptance hooks

For artifact-producing workflows, process success should not equal task success. Swarm Layer could support one of:

- `expectedArtifacts` globs per task/spec.
- `acceptanceCommand` per task/spec.
- `completionProbe` script that returns JSON.
- A generic `postRunValidation` hook used by controllers.

If validation fails, the task should move to `failed` or `review_required`, not `done`.

### Fix 4: Avoid fixed shared OpenClaw bridge session for oneshot swarm runs

The fixed session:

```text
agent:acp-worker:swarm-acp
```

appears in session-takeover errors. For oneshot ACP tasks, prefer unique OpenClaw session keys per swarm run, or ensure the ACP bridge serializes prompt locks strictly and never treats prompt-lock takeover as success.

### Fix 5: Surface `artifacts: []` completion as an attention item

At minimum, `openclaw swarm status --sync` should emit an attention item when:

- run status is `completed`,
- task kind is `coding` or artifact-producing,
- `artifacts` is empty,
- and the task prompt/spec mentions an absolute output path or required file.

## Regression Tests to Add

1. ACP status mapping test:
   - Input status has `lastError: "This operation was aborted"`.
   - Expected swarm state: `failed`.

2. Prompt error propagation test:
   - ACP manager returns `state: "completed"` but `runtimeStatus.summary` or captured turn error contains `EmbeddedAttemptSessionTakeoverError`.
   - Expected run JSON: `status: "failed"` with failure metadata.

3. Artifact acceptance test:
   - Task expects a file path.
   - ACP session exits completed but file does not exist.
   - Expected task status: not `done`; run has validation failure.

4. Session isolation test:
   - Dispatch two oneshot runs with separate task IDs.
   - Assert no shared `agent:acp-worker:swarm-acp` prompt-lock takeover.

5. Parallel admission test:
   - Config `acp.maxConcurrent=4`.
   - Spec phase marked `[parallel]`.
   - `--all-ready --parallel 4` admits up to four tasks unless active count already consumes slots.

## Current Operational Status

As of the end of the 2026-06-11 intervention:

- Daily Papers default executor is `agent`, not `swarm`.
- 2026-06-11 Daily Papers artifacts are complete.
- `openclaw status` showed gateway reachable and task queue empty.
- `openclaw swarm status --project <USER_HOME>/.openclaw/workspace --sync --json` shows workflow completed only after controller/direct-runner artifact verification and closeout normalization.
- Swarm Layer remains enabled, but Daily Papers no longer depends on it by default.

## Files Changed Locally During Mitigation

```text
<USER_HOME>/.openclaw/extensions/openclaw-swarm-layer/dist/src/runtime/real-openclaw-session-adapter.js
<USER_HOME>/.openclaw/workspace/scripts/daily-papers-swarm-controller.py
<USER_HOME>/.openclaw/workspace/scripts/daily-papers-agent-runner.py
<USER_HOME>/.openclaw/workspace/scripts/daily-papers-write-cron.py
<USER_HOME>/.openclaw/workspace/scripts/daily-papers-push.sh
<USER_HOME>/.openclaw/workspace/scripts/daily-papers-babysitter.py
```

Validation commands run:

```bash
python3 -m py_compile \
  workspace/scripts/daily-papers-agent-runner.py \
  workspace/scripts/daily-papers-swarm-controller.py \
  workspace/scripts/daily-papers-babysitter.py \
  workspace/scripts/daily-papers-write-cron.py

bash -n workspace/scripts/daily-papers-push.sh
node --check extensions/openclaw-swarm-layer/dist/src/runtime/real-openclaw-session-adapter.js
uv run workspace/scripts/daily-papers-agent-runner.py --date 2026-06-11 --dry-run --explain
```

