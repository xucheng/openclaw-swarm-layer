import { applyAcpRunStatusToWorkflow } from "../review/review-gate.js";
import { writeWorkflowReport } from "../reporting/reporter.js";
import { buildSessionRecordFromRun } from "../session/session-lifecycle.js";
import { resolveSessionAdapter, resolveSessionStore, resolveStateStore, resolveSubagentAdapter, type SwarmCliContext } from "./context.js";
import { syncAcpRunRecord, syncSubagentRunRecord } from "../runtime/session-sync.js";

function canUseLocalClosedRunFallback(error: unknown, runRecord: { status: string; events?: Array<{ type: string }> }): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const hasClosedEvent = (runRecord.events ?? []).some((event) => event.type === "closed");
  return hasClosedEvent && /metadata is missing|Unable to resolve session target/i.test(message);
}

export async function runSwarmSessionStatus(
  options: { project: string; run: string },
  context?: SwarmCliContext,
): Promise<unknown> {
  const stateStore = resolveStateStore(context);
  const sessionStore = resolveSessionStore(context);
  const sessionAdapter = resolveSessionAdapter(context);
  const reportConfig = context?.config ?? stateStore.config;
  const runRecord = await stateStore.loadRun(options.project, options.run);

  if (!runRecord) {
    throw new Error(`Run record not found: ${options.run}`);
  }
  if (!runRecord.sessionRef?.sessionKey) {
    throw new Error(`Run record has no session key: ${options.run}`);
  }

  let synced;
  try {
    if (runRecord.runner.type === "acp") {
      const remoteStatus = await sessionAdapter.getAcpSessionStatus(runRecord.sessionRef.sessionKey);
      synced = syncAcpRunRecord(runRecord, remoteStatus);
    } else if (runRecord.runner.type === "subagent") {
      const remoteStatus = await resolveSubagentAdapter(context).getSubagentRunStatus(runRecord.sessionRef.sessionKey);
      synced = syncSubagentRunRecord(runRecord, remoteStatus);
    } else {
      throw new Error(`Run record is not a session-backed runner: ${options.run}`);
    }
  } catch (error) {
    if (!canUseLocalClosedRunFallback(error, runRecord)) {
      throw error;
    }
    synced = {
      runRecord: {
        ...runRecord,
        resultSummary: runRecord.resultSummary ?? "session metadata missing after close; using local ledger",
      },
      remoteStatus: {
        sessionKey: runRecord.sessionRef.sessionKey,
        state: runRecord.status === "cancelled" ? "cancelled" : "completed",
        checkedAt: new Date().toISOString(),
        message: "session metadata missing after close; using local ledger",
      },
    };
  }
  await stateStore.writeRun(options.project, synced.runRecord);

  const workflow = await stateStore.loadWorkflow(options.project);
  const nextWorkflow = applyAcpRunStatusToWorkflow(workflow, {
    taskId: synced.runRecord.taskId,
    runStatus: synced.runRecord.status,
    summary: synced.runRecord.resultSummary,
    at: synced.remoteStatus.checkedAt,
  });
  await stateStore.saveWorkflow(options.project, nextWorkflow);
  const task = nextWorkflow.tasks.find((entry) => entry.taskId === synced.runRecord.taskId);
  const nextSession = buildSessionRecordFromRun(nextWorkflow, synced.runRecord, task);
  if (nextSession) {
    const existing = await sessionStore.loadSession(options.project, nextSession.sessionId);
    await sessionStore.writeSession(
      options.project,
      existing
        ? {
            ...existing,
            ...nextSession,
            createdAt: existing.createdAt,
          }
        : nextSession,
    );
  }
  const report = await writeWorkflowReport(options.project, nextWorkflow, reportConfig, stateStore);

  return {
    ok: true,
    runId: synced.runRecord.runId,
    status: synced.runRecord.status,
    sessionRef: synced.runRecord.sessionRef,
    resultSummary: synced.runRecord.resultSummary,
    localReportPath: report.localReportPath,
    obsidianReportPath: report.obsidianReportPath,
  };
}
