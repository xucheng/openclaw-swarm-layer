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
  localReportPath: string;
  obsidianReportPath?: string;
};

export async function runSwarmPlan(
  options: { project: string; spec: string },
  context?: SwarmCliContext,
): Promise<SwarmPlanResult> {
  const stateStore = resolveStateStore(context);
  const reportConfig = context?.config ?? stateStore.config;
  const workflow = await stateStore.loadWorkflow(options.project);
  const spec = await importSpecFromMarkdown(options.spec, { defaultProjectRoot: workflow.projectRoot });
  const tasks = planTasksFromSpec(spec, context?.config);

  await stateStore.writeSpec(options.project, spec);
  const nextWorkflow = {
    ...workflow,
    activeSpecId: spec.specId,
    lifecycle: tasks.length > 0 ? "planned" : workflow.lifecycle,
    tasks,
    reviewQueue: [],
    lastAction: {
      at: new Date().toISOString(),
      type: "plan",
      message: `planned ${tasks.length} tasks for ${spec.specId}`,
    },
  };

  await stateStore.saveWorkflow(options.project, nextWorkflow);
  const report = await writeWorkflowReport(options.project, nextWorkflow, reportConfig);

  // Obsidian journal: spec archive
  const paths = resolveSwarmPaths(options.project, reportConfig);
  await journalSpecArchive(paths, stateStore.config.journal, spec);

  return {
    ok: true,
    specId: spec.specId,
    taskCount: tasks.length,
    activeSpecId: spec.specId,
    localReportPath: report.localReportPath,
    obsidianReportPath: report.obsidianReportPath,
  };
}
