# M3 Readiness

## Decision

The project is ready to start `M3` design and controlled implementation.

## Why It Is Ready

- real execution exists today for both ACP and subagent bridge paths
- operator control exists today
- review/report/status surfaces are mature enough for asynchronous workflows
- convergence planning exists for future bridge retirement

## What M3 Should Mean

`M3` should focus on sessionized workflows, not just more execution transports.

That means:

- persistent ACP sessions
- session reuse
- thread binding where policy allows
- steer/follow-up flows
- stronger retry/recovery model

## Recommended M3 Structure

### M3.0 - Session Foundation

- task/session binding model
- session identity persistence rules
- lifecycle state model for reusable sessions
- session-aware schema updates

### M3.1 - Persistent ACP Session Reuse

- reuse a session across related tasks
- distinguish one-shot vs reusable sessions clearly
- add operator controls for session continuation

### M3.2 - Thread Binding And Follow-up

- bind sessions to thread contexts where supported
- add steer/follow-up paths
- improve report visibility for session chains

### M3.3 - Retry And Recovery

- session recovery after restart
- retry strategy for reusable sessions
- better stale/orphan session handling

## What Should Not Change Yet

- keep bridge strategy in place
- do not attempt public API replacement and persistent sessions in the same slice
- do not introduce distributed execution

## First M3 Tasks

1. design `session-aware` schema additions
2. define reusable session state transitions
3. decide which task kinds are allowed to reuse sessions
4. add docs and tests before implementation
