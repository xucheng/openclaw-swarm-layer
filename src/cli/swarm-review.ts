import { applyReviewDecision } from "../review/review-gate.js";
import { writeWorkflowReport } from "../reporting/reporter.js";
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
  return {
    ok: true,
    taskId: options.task,
    decision,
    status: result.task.status,
    localReportPath: report.localReportPath,
    obsidianReportPath: report.obsidianReportPath,
  };
}
