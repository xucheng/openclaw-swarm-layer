import { writeWorkflowReport } from "../reporting/reporter.js";
import { createOrchestrator } from "../services/orchestrator.js";
import { resolveSessionAdapter, resolveSessionStore, resolveStateStore, resolveSubagentAdapter, type SwarmCliContext } from "./context.js";

export async function runSwarmSessionStatus(
  options: { project: string; run: string },
  context?: SwarmCliContext,
): Promise<unknown> {
  const stateStore = resolveStateStore(context);
  const reportConfig = context?.config ?? stateStore.config;
  const orchestrator = createOrchestrator({
    stateStore,
    sessionStore: resolveSessionStore(context),
    sessionAdapter: resolveSessionAdapter(context),
    subagentAdapter: resolveSubagentAdapter(context),
  });
  const synced = await orchestrator.syncRun({
    projectRoot: options.project,
    runId: options.run,
  });
  const runRecord = await stateStore.loadRun(options.project, options.run);
  if (!runRecord) {
    throw new Error(`Run record not found after sync: ${options.run}`);
  }
  const workflow = await stateStore.loadWorkflow(options.project);
  const report = await writeWorkflowReport(options.project, workflow, reportConfig, stateStore);

  return {
    ok: true,
    runId: synced.runId,
    status: synced.status,
    sessionRef: runRecord.sessionRef,
    resultSummary: runRecord.resultSummary,
    localReportPath: report.localReportPath,
    obsidianReportPath: report.obsidianReportPath,
  };
}
