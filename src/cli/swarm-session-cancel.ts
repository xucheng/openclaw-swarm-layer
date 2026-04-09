import { applyAcpRunStatusToWorkflow } from "../review/review-gate.js";
import { writeWorkflowReport } from "../reporting/reporter.js";
import { buildSessionRecordFromRun } from "../session/session-lifecycle.js";
import { resolveSessionAdapter, resolveSessionStore, resolveStateStore, type SwarmCliContext } from "./context.js";

function resolveCancelledAt(result: { cancelledAt?: string } | { killedAt?: string }): string | undefined {
  const normalized = result as { cancelledAt?: string; killedAt?: string };
  return normalized.cancelledAt ?? normalized.killedAt;
}

export async function runSwarmSessionCancel(
  options: { project: string; run: string; reason?: string },
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

  const cancelled = await sessionAdapter.cancelAcpSession(runRecord.sessionRef.sessionKey, options.reason);
  const nextRun = {
    ...runRecord,
    status: "cancelled" as const,
    endedAt: resolveCancelledAt(cancelled) ?? new Date().toISOString(),
    resultSummary: cancelled.message ?? runRecord.resultSummary,
    events: [
      ...(runRecord.events ?? []),
      {
        at: resolveCancelledAt(cancelled) ?? new Date().toISOString(),
        type: "cancelled",
        detail: { reason: options.reason, message: cancelled.message },
      },
    ],
  };
  await stateStore.writeRun(options.project, nextRun);

  const workflow = await stateStore.loadWorkflow(options.project);
  const nextWorkflow = applyAcpRunStatusToWorkflow(workflow, { taskId: nextRun.taskId, runStatus: "cancelled" });
  await stateStore.saveWorkflow(options.project, nextWorkflow);
  const task = nextWorkflow.tasks.find((entry) => entry.taskId === nextRun.taskId);
  const nextSession = buildSessionRecordFromRun(nextWorkflow, nextRun, task);
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
    runId: nextRun.runId,
    status: nextRun.status,
    sessionRef: nextRun.sessionRef,
    resultSummary: nextRun.resultSummary,
    localReportPath: report.localReportPath,
    obsidianReportPath: report.obsidianReportPath,
  };
}
