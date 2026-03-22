import { resolveSwarmPaths } from "../lib/paths.js";
import { journalCompletionSummary, journalReviewEntry } from "../reporting/obsidian-journal.js";
import { writeWorkflowReport } from "../reporting/reporter.js";
import { applyReviewDecision } from "../review/review-gate.js";
import { resolveStateStore, type SwarmCliContext } from "./context.js";

export async function runSwarmReview(
  options: { project: string; task: string; approve?: boolean; reject?: boolean; note?: string },
  context?: SwarmCliContext,
): Promise<unknown> {
  const decision = options.approve ? "approve" : options.reject ? "reject" : null;
  if (!decision) {
    throw new Error("Either --approve or --reject is required");
  }

  const stateStore = resolveStateStore(context);
  const reportConfig = context?.config ?? stateStore.config;
  const workflow = await stateStore.loadWorkflow(options.project);
  const result = applyReviewDecision(workflow, options.task, decision, options.note);
  await stateStore.saveWorkflow(options.project, result.workflow);
  const report = await writeWorkflowReport(options.project, result.workflow, reportConfig);

  // Obsidian journal: review log
  const paths = resolveSwarmPaths(options.project, reportConfig);
  await journalReviewEntry(paths, stateStore.config.obsidianJournal, options.task, decision, options.note);

  // Obsidian journal: completion summary (when all tasks done)
  const allDone = result.workflow.tasks.every((t) => t.status === "done" || t.status === "dead_letter");
  if (allDone && result.workflow.tasks.length > 0) {
    const runs = await stateStore.loadRuns(options.project);
    await journalCompletionSummary(paths, stateStore.config.obsidianJournal, result.workflow, runs);
  }

  return {
    ok: true,
    taskId: options.task,
    decision,
    status: result.task.status,
    localReportPath: report.localReportPath,
    obsidianReportPath: report.obsidianReportPath,
  };
}
