import { resolveRuntimePolicySnapshot } from "../config.js";
import { resolveSwarmPaths } from "../lib/paths.js";
import { journalRunEntry } from "../reporting/obsidian-journal.js";
import { writeWorkflowReport } from "../reporting/reporter.js";
import { createOrchestrator } from "../services/orchestrator.js";
import type { RunBatchResult } from "../services/orchestrator.js";
import { synthesizeProgress } from "../session/progress-summary.js";
import { SessionStore } from "../session/session-store.js";
import { resolveSessionAdapter, resolveStateStore, type SwarmCliContext } from "./context.js";

export async function runSwarmRun(
  options: {
    project: string;
    task?: string;
    dryRun?: boolean;
    runner?: "manual" | "acp";
    parallel?: number;
    allReady?: boolean;
  },
  context?: SwarmCliContext,
): Promise<unknown> {
  const stateStore = resolveStateStore(context);
  const sessionStore = context?.sessionStore ?? new SessionStore(stateStore.config);
  const sessionAdapter = resolveSessionAdapter(context);
  const reportConfig = stateStore.config;
  const orchestrator = createOrchestrator({ stateStore, sessionStore, sessionAdapter });

  const isBatch = options.parallel !== undefined || options.allReady === true;

  if (isBatch) {
    return runSwarmRunBatch(options, stateStore, orchestrator, reportConfig);
  }

  const result = await orchestrator.runOnce({
    projectRoot: options.project,
    taskId: options.task,
    dryRun: options.dryRun,
    runnerOverride: options.runner,
  });

  if (!options.dryRun) {
    const workflow = await stateStore.loadWorkflow(options.project);
    const runs = await stateStore.loadRuns(options.project);
    const report = await writeWorkflowReport(options.project, workflow, reportConfig, stateStore);

    if (result.runIds?.[0]) {
      const runRecord = runs.find((r) => r.runId === result.runIds?.[0]);
      if (runRecord) {
        const paths = resolveSwarmPaths(options.project, reportConfig);
        await journalRunEntry(paths, stateStore.config.journal, runRecord);
      }
    }

    const existingProgress = await stateStore.loadProgress(options.project);
    const progress = synthesizeProgress(workflow, runs, existingProgress ?? undefined);
    await stateStore.saveProgress(options.project, progress);

    return {
      ...result,
      runtime: resolveRuntimePolicySnapshot(stateStore.config, workflow.runtime, { runtimeVersion: stateStore.runtimeVersion }),
      localReportPath: report.localReportPath,
      obsidianReportPath: report.obsidianReportPath,
    };
  }

  const workflow = await stateStore.loadWorkflow(options.project);
  return {
    ...result,
    runtime: resolveRuntimePolicySnapshot(stateStore.config, workflow.runtime, { runtimeVersion: stateStore.runtimeVersion }),
  };
}

async function runSwarmRunBatch(
  options: {
    project: string;
    dryRun?: boolean;
    runner?: "manual" | "acp";
    parallel?: number;
    allReady?: boolean;
  },
  stateStore: import("../state/state-store.js").StateStore,
  orchestrator: import("../services/orchestrator.js").SwarmOrchestrator,
  reportConfig: import("../config.js").SwarmPluginConfig,
): Promise<unknown> {
  const batchResult: RunBatchResult = await orchestrator.runBatch({
    projectRoot: options.project,
    parallel: options.parallel,
    allReady: options.allReady,
    dryRun: options.dryRun,
    runnerOverride: options.runner,
  });

  if (!options.dryRun) {
    const workflow = await stateStore.loadWorkflow(options.project);
    const runs = await stateStore.loadRuns(options.project);
    const report = await writeWorkflowReport(options.project, workflow, reportConfig, stateStore);

    for (const result of batchResult.results) {
      if (result.runIds?.[0]) {
        const runRecord = runs.find((r) => r.runId === result.runIds?.[0]);
        if (runRecord) {
          const paths = resolveSwarmPaths(options.project, reportConfig);
          await journalRunEntry(paths, stateStore.config.journal, runRecord);
        }
      }
    }

    const existingProgress = await stateStore.loadProgress(options.project);
    const progress = synthesizeProgress(workflow, runs, existingProgress ?? undefined);
    await stateStore.saveProgress(options.project, progress);

    return {
      ...batchResult,
      runtime: resolveRuntimePolicySnapshot(stateStore.config, workflow.runtime, { runtimeVersion: stateStore.runtimeVersion }),
      localReportPath: report.localReportPath,
      obsidianReportPath: report.obsidianReportPath,
    };
  }

  const workflow = await stateStore.loadWorkflow(options.project);
  return {
    ...batchResult,
    runtime: resolveRuntimePolicySnapshot(stateStore.config, workflow.runtime, { runtimeVersion: stateStore.runtimeVersion }),
  };
}
