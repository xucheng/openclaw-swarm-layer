import { resolveRuntimePolicySnapshot } from "../config.js";
import { resolveSwarmPaths } from "../lib/paths.js";
import { planTasksFromSpec } from "../planning/planner.js";
import { journalSpecArchive } from "../reporting/obsidian-journal.js";
import { writeWorkflowReport } from "../reporting/reporter.js";
import { importSpecFromMarkdown } from "../spec/spec-importer.js";
import { resolveStateStore, type SwarmCliContext } from "./context.js";

export type SwarmPlanResult = {
  ok: true;
  specId: string;
  taskCount: number;
  activeSpecId: string;
  runtime: ReturnType<typeof resolveRuntimePolicySnapshot>;
  localReportPath: string;
  obsidianReportPath?: string;
};

export async function runSwarmPlan(
  options: { project: string; spec: string },
  context?: SwarmCliContext,
): Promise<SwarmPlanResult> {
  const stateStore = resolveStateStore(context);
  const reportConfig = stateStore.config;
  const workflow = await stateStore.loadWorkflow(options.project);
  const spec = await importSpecFromMarkdown(options.spec, { defaultProjectRoot: workflow.projectRoot });
  const tasks = planTasksFromSpec(spec, stateStore.config, { runtimeVersion: stateStore.runtimeVersion });
  const runtime = resolveRuntimePolicySnapshot(stateStore.config, undefined, { runtimeVersion: stateStore.runtimeVersion });

  await stateStore.writeSpec(options.project, spec);
  const nextWorkflow = {
    ...workflow,
    activeSpecId: spec.specId,
    lifecycle: tasks.length > 0 ? "planned" : workflow.lifecycle,
    tasks,
    reviewQueue: [],
    runtime: {
      defaultRunner: runtime.resolvedDefaultRunner,
      allowedRunners: runtime.allowedRunners,
    },
    lastAction: {
      at: new Date().toISOString(),
      type: "plan",
      message: `planned ${tasks.length} tasks for ${spec.specId}`,
    },
  };

  await stateStore.saveWorkflow(options.project, nextWorkflow);
  const report = await writeWorkflowReport(options.project, nextWorkflow, reportConfig, stateStore);

  const paths = resolveSwarmPaths(options.project, reportConfig);
  await journalSpecArchive(paths, stateStore.config.journal, spec);

  return {
    ok: true,
    specId: spec.specId,
    taskCount: tasks.length,
    activeSpecId: spec.specId,
    runtime: resolveRuntimePolicySnapshot(stateStore.config, nextWorkflow.runtime, { runtimeVersion: stateStore.runtimeVersion }),
    localReportPath: report.localReportPath,
    obsidianReportPath: report.obsidianReportPath,
  };
}
