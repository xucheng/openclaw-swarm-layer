import { writeWorkflowReport } from "../reporting/reporter.js";
import { buildSessionRecordFromRun } from "../session/session-lifecycle.js";
import { resolveSessionAdapter, resolveSessionStore, resolveStateStore, type SwarmCliContext } from "./context.js";

export async function runSwarmSessionClose(
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
  if (runRecord.runner.type !== "acp" || !runRecord.sessionRef?.sessionKey) {
    throw new Error(`Run record is not an ACP closable session: ${options.run}`);
  }

  const closed = await sessionAdapter.closeAcpSession(runRecord.sessionRef.sessionKey, options.reason);
  const nextRun = {
    ...runRecord,
    resultSummary: closed.message ?? runRecord.resultSummary,
    events: [
      ...(runRecord.events ?? []),
      {
        at: closed.closedAt ?? new Date().toISOString(),
        type: "closed",
        detail: { reason: options.reason, message: closed.message },
      },
    ],
  };
  await stateStore.writeRun(options.project, nextRun);
  const workflow = await stateStore.loadWorkflow(options.project);
  const task = workflow.tasks.find((entry) => entry.taskId === nextRun.taskId);
  const nextSession = buildSessionRecordFromRun(workflow, nextRun, task);
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
  const report = await writeWorkflowReport(options.project, workflow, reportConfig, stateStore);

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
