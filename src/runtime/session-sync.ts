import type { RunRecord } from "../types.js";
import type { AcpSessionStatus } from "./openclaw-session-adapter.js";

type SyncableRemoteStatus = {
  state: RunRecord["status"];
  checkedAt?: string;
  message?: string;
  outputText?: string;
};

function parseAcpSummary(message?: string): {
  rawStatus?: string;
  recordId?: string;
  sessionId?: string;
  pid?: string;
} {
  if (!message) {
    return {};
  }
  const match = (pattern: RegExp) => message.match(pattern)?.[1];
  return {
    rawStatus: match(/status=([^\s]+)/),
    recordId: match(/acpxRecordId=([^\s]+)/),
    sessionId: match(/acpxSessionId=([^\s]+)/),
    pid: match(/pid=([^\s]+)/),
  };
}

function buildAcpSummary(remoteStatus: AcpSessionStatus, fallback?: string): string | undefined {
  const parsed = parseAcpSummary(remoteStatus.message);
  const details = [
    parsed.rawStatus ? `status=${parsed.rawStatus}` : null,
    parsed.recordId ? `record=${parsed.recordId}` : null,
    parsed.sessionId ? `session=${parsed.sessionId}` : null,
    parsed.pid ? `pid=${parsed.pid}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const detailText = details ? ` (${details})` : "";

  if (remoteStatus.state === "completed") {
    return `Completed: ACP session finished${detailText}`;
  }
  if (remoteStatus.state === "running") {
    return `Running: ACP session still active${detailText}`;
  }
  if (remoteStatus.state === "accepted") {
    return `Accepted: ACP session accepted${detailText}`;
  }
  if (remoteStatus.state === "cancelled") {
    return `Cancelled: ACP session stopped${detailText}`;
  }
  if (remoteStatus.state === "timed_out") {
    return `Timed out: ACP session exceeded allowed time${detailText}`;
  }
  if (remoteStatus.state === "failed") {
    return remoteStatus.message ? `Failed: ${remoteStatus.message}` : fallback;
  }
  return fallback;
}

export type SessionSyncResult<TRemoteStatus = AcpSessionStatus> = {
  runRecord: RunRecord;
  remoteStatus: TRemoteStatus;
};

function appendStatusEvent(runRecord: RunRecord, remoteStatus: SyncableRemoteStatus): RunRecord["events"] {
  const events = [...(runRecord.events ?? [])];
  events.push({
    at: remoteStatus.checkedAt ?? new Date().toISOString(),
    type: "status_polled",
    detail: {
      state: remoteStatus.state,
      message: remoteStatus.message,
    },
  });

  if (remoteStatus.state === "completed") {
    events.push({ at: remoteStatus.checkedAt ?? new Date().toISOString(), type: "done" });
  } else if (remoteStatus.state === "failed") {
    events.push({ at: remoteStatus.checkedAt ?? new Date().toISOString(), type: "error", detail: { message: remoteStatus.message } });
  } else if (remoteStatus.state === "cancelled") {
    events.push({ at: remoteStatus.checkedAt ?? new Date().toISOString(), type: "cancelled" });
  } else if (remoteStatus.state === "timed_out") {
    events.push({ at: remoteStatus.checkedAt ?? new Date().toISOString(), type: "timeout" });
  }

  return events;
}

function summarizeRemoteStatus(remoteStatus: SyncableRemoteStatus, fallback?: string): string | undefined {
  const labelByState: Record<RunRecord["status"], string> = {
    planned: "Planned",
    accepted: "Accepted",
    running: "Running",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled",
    timed_out: "Timed out",
  };
  const normalizedOutput = remoteStatus.outputText?.trim();
  if (normalizedOutput) {
    const singleLine = normalizedOutput.replace(/\s+/g, " ").trim();
    const summary = singleLine.length > 240 ? `${singleLine.slice(0, 237)}...` : singleLine;
    return `${labelByState[remoteStatus.state]}: ${summary}`;
  }
  const normalizedMessage = remoteStatus.message?.trim();
  if (normalizedMessage) {
    return `${labelByState[remoteStatus.state]}: ${normalizedMessage}`;
  }
  return fallback ? `${labelByState[remoteStatus.state]}: ${fallback}` : fallback;
}

function applyTerminalFields(runRecord: RunRecord, remoteStatus: SyncableRemoteStatus, runtime: RunRecord["runner"]["type"]): RunRecord {
  const nextStatus = remoteStatus.state;
  return {
    ...runRecord,
    status: nextStatus,
    endedAt:
      nextStatus === "completed" || nextStatus === "failed" || nextStatus === "cancelled" || nextStatus === "timed_out"
        ? remoteStatus.checkedAt ?? new Date().toISOString()
        : runRecord.endedAt,
    resultSummary: summarizeRemoteStatus(remoteStatus, runRecord.resultSummary),
    sessionRef: {
      ...runRecord.sessionRef,
      runtime,
      sessionKey: runRecord.sessionRef?.sessionKey,
    },
    events: appendStatusEvent(runRecord, remoteStatus),
  };
}

export function syncAcpRunRecord(runRecord: RunRecord, remoteStatus: AcpSessionStatus): SessionSyncResult<AcpSessionStatus> {
  if (runRecord.runner.type !== "acp") {
    throw new Error("Only ACP run records can be synced");
  }

  const synced: RunRecord = {
    ...applyTerminalFields(runRecord, remoteStatus, "acp"),
    resultSummary: buildAcpSummary(remoteStatus, runRecord.resultSummary),
    sessionRef: {
      ...runRecord.sessionRef,
      runtime: "acp",
      sessionKey: remoteStatus.sessionKey,
      backend: remoteStatus.backend ?? runRecord.sessionRef?.backend,
      backendSessionId: remoteStatus.backendSessionId ?? runRecord.sessionRef?.backendSessionId,
      agentSessionId: remoteStatus.agentSessionId ?? runRecord.sessionRef?.agentSessionId,
    },
  };

  return {
    runRecord: synced,
    remoteStatus,
  };
}

