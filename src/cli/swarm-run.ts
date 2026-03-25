import { resolveSwarmPaths } from "../lib/paths.js";
import { journalRunEntry } from "../reporting/obsidian-journal.js";
import { writeWorkflowReport } from "../reporting/reporter.js";
import { createOrchestrator } from "../services/orchestrator.js";
import { synthesizeProgress } from "../session/progress-summary.js";
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
    const runs = await stateStore.loadRuns(options.project);
    const report = await writeWorkflowReport(options.project, workflow, reportConfig);

    // Obsidian journal: run log
    if (result.runIds?.[0]) {
      const runRecord = runs.find((r) => r.runId === result.runIds?.[0]);
      if (runRecord) {
        const paths = resolveSwarmPaths(options.project, reportConfig);
        await journalRunEntry(paths, stateStore.config.journal, runRecord);
      }
    }

    // Update progress summary
    const existingProgress = await stateStore.loadProgress(options.project);
    const progress = synthesizeProgress(workflow, runs, existingProgress ?? undefined);
    await stateStore.saveProgress(options.project, progress);

    return {
      ...result,
      localReportPath: report.localReportPath,
      obsidianReportPath: report.obsidianReportPath,
    };
  }

  return result;
}
