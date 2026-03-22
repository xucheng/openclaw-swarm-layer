import type { RunRecord, SessionMode, SessionRecord, TaskNode, WorkflowState } from "../types.js";

function encodeSessionKey(sessionKey: string): string {
  return Buffer.from(sessionKey).toString("base64url");
}

export function deriveSessionId(runRecord: Pick<RunRecord, "runner" | "sessionRef">): string | null {
  if (!runRecord.sessionRef?.sessionKey) {
    return null;
  }
  if (runRecord.runner.type !== "acp" && runRecord.runner.type !== "subagent") {
    return null;
  }
  return `${runRecord.runner.type}-${encodeSessionKey(runRecord.sessionRef.sessionKey)}`;
}

export function deriveSessionMode(task?: TaskNode): SessionMode {
  if (task?.session?.policy === "create_persistent" || task?.runner.mode === "session" || task?.runner.persistentSession) {
    return "persistent";
  }
  return "oneshot";
}

export function deriveSessionStateFromRunStatus(mode: SessionMode, runStatus: RunRecord["status"]): SessionRecord["state"] {
  if (runStatus === "planned") {
    return "created";
  }
  if (runStatus === "accepted" || runStatus === "running") {
    return "active";
  }
  if (runStatus === "completed") {
    return mode === "persistent" ? "idle" : "closed";
  }
  if (runStatus === "failed" || runStatus === "timed_out") {
    return "failed";
  }
  return "closed";
}

export function transitionSessionState(
  existing: SessionRecord,
  newStatus: RunRecord["status"],
): SessionRecord["state"] {
  const mode = existing.mode;
  const derivedState = deriveSessionStateFromRunStatus(mode, newStatus);

  if (existing.state === "failed" && newStatus === "running") {
    return "active";
  }

  if (existing.state === "closed" && newStatus === "accepted") {
    return derivedState;
  }

  return derivedState;
}

export function buildSessionRecordFromRun(
  workflow: WorkflowState,
  runRecord: RunRecord,
  task?: TaskNode,
  existing?: SessionRecord | null,
): SessionRecord | null {
  const sessionId = deriveSessionId(runRecord);
  if (!sessionId || !runRecord.sessionRef?.sessionKey || (runRecord.runner.type !== "acp" && runRecord.runner.type !== "subagent")) {
    return null;
  }

  const mode = existing?.mode ?? deriveSessionMode(task);
  const createdAt = existing?.createdAt ?? runRecord.startedAt;
  const summary = runRecord.resultSummary ?? existing?.summary;
  const state = existing
    ? transitionSessionState(existing, runRecord.status)
    : deriveSessionStateFromRunStatus(mode, runRecord.status);

  return {
    sessionId,
    runner: runRecord.runner.type,
    projectRoot: workflow.projectRoot,
    scope: {
      specId: task?.specId ?? workflow.activeSpecId,
      bindingKey: task?.session?.bindingKey,
      taskKind: task?.kind,
    },
    mode,
    state,
    createdAt,
    updatedAt: runRecord.endedAt ?? runRecord.startedAt,
    lastRunId: runRecord.runId,
    lastTaskId: runRecord.taskId,
    providerRef: {
      sessionKey: runRecord.sessionRef.sessionKey,
      backend: runRecord.sessionRef.backend,
      backendSessionId: runRecord.sessionRef.backendSessionId,
      agentSessionId: runRecord.sessionRef.agentSessionId,
    },
    threadId: runRecord.sessionRef.threadId ?? existing?.threadId,
    summary,
    metadata: {
      runnerMode: task?.runner.mode,
      sessionPolicy: task?.session?.policy,
    },
  };
}
