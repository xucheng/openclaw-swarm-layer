import { writeWorkflowReport } from "../reporting/reporter.js";
import { createOrchestrator } from "../services/orchestrator.js";
import { SessionStore } from "../session/session-store.js";
import { resolveSessionAdapter, resolveStateStore, resolveSubagentAdapter, type SwarmCliContext } from "./context.js";

export async function runSwarmRun(
  options: { project: string; task?: string; dryRun?: boolean; runner?: "manual" | "acp" | "subagent" },
  context?: SwarmCliContext,
): Promise<unknown> {
  const stateStore = resolveStateStore(context);
  const sessionStore = context?.sessionStore ?? new SessionStore(stateStore.config);
  const sessionAdapter = resolveSessionAdapter(context);
  const subagentAdapter = resolveSubagentAdapter(context);
  const reportConfig = context?.config ?? stateStore.config;
  const orchestrator = createOrchestrator({ stateStore, sessionStore, sessionAdapter, subagentAdapter });
  const result = await orchestrator.runOnce({
    projectRoot: options.project,
    taskId: options.task,
    dryRun: options.dryRun,
    runnerOverride: options.runner,
  });

  if (!options.dryRun) {
    const workflow = await stateStore.loadWorkflow(options.project);
    const report = await writeWorkflowReport(options.project, workflow, reportConfig);
    return {
      ...result,
      localReportPath: report.localReportPath,
      obsidianReportPath: report.obsidianReportPath,
    };
  }

  return result;
}
