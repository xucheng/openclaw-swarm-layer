import { resolveSwarmPaths } from "../lib/paths.js";
import { journalCompletionSummary, journalReviewEntry } from "../reporting/obsidian-journal.js";
import { writeWorkflowReport } from "../reporting/reporter.js";
import { applyReviewDecision, type ReviewDecisionOptions } from "../review/review-gate.js";
import { synthesizeProgress } from "../session/progress-summary.js";
import { resolveStateStore, type SwarmCliContext } from "./context.js";

export async function runSwarmReview(
  options: { project: string; task: string; approve?: boolean; reject?: boolean; retryNow?: boolean; note?: string },
  context?: SwarmCliContext,
): Promise<unknown> {
  const decision = options.approve ? "approve" : options.reject ? "reject" : null;
  if (!decision) {
    throw new Error("Either --approve or --reject is required");
  }

  const stateStore = resolveStateStore(context);
  const reportConfig = context?.config ?? stateStore.config;
  const reviewConfig = stateStore.config.review;
  const workflow = await stateStore.loadWorkflow(options.project);

  let reviewOptions: ReviewDecisionOptions | undefined;
  if (decision === "reject") {
    if (options.retryNow) {
      reviewOptions = { rejectPolicy: "ready_retry", maxRejectRetries: Number.MAX_SAFE_INTEGER };
    } else {
      reviewOptions = { rejectPolicy: reviewConfig.rejectPolicy, maxRejectRetries: reviewConfig.maxRejectRetries };
    }
  }

  const result = applyReviewDecision(workflow, options.task, decision, options.note, reviewOptions);
  await stateStore.saveWorkflow(options.project, result.workflow);
  const report = await writeWorkflowReport(options.project, result.workflow, reportConfig, stateStore);

  // Obsidian journal: review log
  const paths = resolveSwarmPaths(options.project, reportConfig);
  await journalReviewEntry(paths, stateStore.config.journal, options.task, decision, options.note);

  // Obsidian journal: completion summary (when all tasks done)
  const runs = await stateStore.loadRuns(options.project);
  const allDone = result.workflow.tasks.every((t) => t.status === "done" || t.status === "dead_letter");
  if (allDone && result.workflow.tasks.length > 0) {
    await journalCompletionSummary(paths, stateStore.config.journal, result.workflow, runs);
  }

  // Update progress summary
  const existingProgress = await stateStore.loadProgress(options.project);
  const progress = synthesizeProgress(result.workflow, runs, existingProgress ?? undefined);
  await stateStore.saveProgress(options.project, progress);

  return {
    ok: true,
    taskId: options.task,
    decision,
    status: result.task.status,
    localReportPath: report.localReportPath,
    obsidianReportPath: report.obsidianReportPath,
  };
}
