import type { RunRecord, TaskNode, WorkflowState } from "../types.js";

export type ReviewQueueItem = {
  taskId: string;
  title?: string;
  status?: string;
  latestRunId?: string;
  latestRunStatus?: string;
  latestRunSummary?: string;
  recommendedAction?: string;
};

export type AttentionItem = {
  kind: "review" | "blocked" | "running" | "dead_letter" | "queued";
  taskId: string;
  title?: string;
  message: string;
  latestRunId?: string;
  latestRunStatus?: string;
  latestRunSummary?: string;
  recommendedAction: string;
};

export type OperatorHighlight = {
  kind: "completed" | "failed" | "cancelled" | "timed_out";
  runId: string;
  taskId: string;
  runner: string;
  summary?: string;
  recommendedAction: string;
};

function buildLatestRunByTask(runs: RunRecord[]): Map<string, RunRecord> {
  const latestRunByTask = new Map<string, RunRecord>();
  for (const run of [...runs].sort((left, right) => right.startedAt.localeCompare(left.startedAt))) {
    if (!latestRunByTask.has(run.taskId)) {
      latestRunByTask.set(run.taskId, run);
    }
  }
  return latestRunByTask;
}

function toReviewQueueItem(task: TaskNode | undefined, latestRun: RunRecord | undefined): ReviewQueueItem {
  return {
    taskId: task?.taskId ?? "(unknown)",
    title: task?.title,
    status: task?.status,
    latestRunId: latestRun?.runId,
    latestRunStatus: latestRun?.status,
    latestRunSummary: latestRun?.resultSummary,
    recommendedAction: "Review the latest run outcome and approve or reject the task.",
  };
}

export function buildReviewQueueItems(workflow: WorkflowState, runs: RunRecord[]): ReviewQueueItem[] {
  const latestRunByTask = buildLatestRunByTask(runs);
  return workflow.reviewQueue.map((taskId) => {
    const task = workflow.tasks.find((entry) => entry.taskId === taskId);
    return toReviewQueueItem(task, latestRunByTask.get(taskId));
  });
}

export function buildAttentionItems(workflow: WorkflowState, runs: RunRecord[]): AttentionItem[] {
  const latestRunByTask = buildLatestRunByTask(runs);
  const items: AttentionItem[] = [];

  for (const taskId of workflow.reviewQueue) {
    const task = workflow.tasks.find((entry) => entry.taskId === taskId);
    const latestRun = latestRunByTask.get(taskId);
    items.push({
      kind: "review",
      taskId,
      title: task?.title,
      message: `Review required for ${task?.title ?? taskId}`,
      latestRunId: latestRun?.runId,
      latestRunStatus: latestRun?.status,
      latestRunSummary: latestRun?.resultSummary,
      recommendedAction: "Open the latest run summary, inspect artifacts, then approve or reject the task.",
    });
  }

  for (const task of workflow.tasks.filter((entry) => entry.status === "blocked")) {
    const latestRun = latestRunByTask.get(task.taskId);
    items.push({
      kind: "blocked",
      taskId: task.taskId,
      title: task.title,
      message: `Task is blocked: ${task.title}`,
      latestRunId: latestRun?.runId,
      latestRunStatus: latestRun?.status,
      latestRunSummary: latestRun?.resultSummary,
      recommendedAction: "Inspect the blocking outcome, fix the issue, then rerun or explicitly reject/close the task.",
    });
  }

  for (const task of workflow.tasks.filter((entry) => entry.status === "dead_letter")) {
    const latestRun = latestRunByTask.get(task.taskId);
    items.push({
      kind: "dead_letter",
      taskId: task.taskId,
      title: task.title,
      message: `Task exhausted all retries: ${task.title}`,
      latestRunId: latestRun?.runId,
      latestRunStatus: latestRun?.status,
      latestRunSummary: latestRun?.resultSummary,
      recommendedAction: "Review retry history, fix the root cause, then manually reset and rerun the task.",
    });
  }

  for (const task of workflow.tasks.filter((entry) => entry.status === "running")) {
    const latestRun = latestRunByTask.get(task.taskId);
    items.push({
      kind: "running",
      taskId: task.taskId,
      title: task.title,
      message: `Task is still running: ${task.title}`,
      latestRunId: latestRun?.runId,
      latestRunStatus: latestRun?.status,
      latestRunSummary: latestRun?.resultSummary,
      recommendedAction: "Poll session status again or wait for completion before taking review action.",
    });
  }

  for (const task of workflow.tasks.filter((entry) => entry.status === "queued")) {
    items.push({
      kind: "queued",
      taskId: task.taskId,
      title: task.title,
      message: `Task is queued awaiting concurrency slot: ${task.title}`,
      recommendedAction: "Wait for running tasks to complete or increase acp.maxConcurrent to admit more tasks.",
    });
  }

  return items;
}

export function buildOperatorHighlights(runs: RunRecord[]): OperatorHighlight[] {
  const wantedStatuses = new Set<OperatorHighlight["kind"]>(["completed", "failed", "cancelled", "timed_out"]);
  const seen = new Set<string>();
  const highlights: OperatorHighlight[] = [];

  for (const run of [...runs].sort((left, right) => right.startedAt.localeCompare(left.startedAt))) {
    if (!wantedStatuses.has(run.status as OperatorHighlight["kind"])) {
      continue;
    }
    if (seen.has(run.status)) {
      continue;
    }
    seen.add(run.status);
    highlights.push({
      kind: run.status as OperatorHighlight["kind"],
      runId: run.runId,
      taskId: run.taskId,
      runner: run.runner.type,
      summary: run.resultSummary,
      recommendedAction:
        run.status === "completed"
          ? "Inspect the completion summary and clear review items if the outcome is acceptable."
          : run.status === "failed"
            ? "Inspect the failure summary, fix the issue, then rerun or reject the task."
            : run.status === "cancelled"
              ? "Confirm whether cancellation was intentional, then either unblock or rerun the task."
              : "Inspect the timeout context and decide whether to retry with a larger timeout.",
    });
  }

  return highlights;
}

export function buildRecommendedActions(workflow: WorkflowState, runs: RunRecord[]): string[] {
  const actions = new Set<string>();
  for (const item of buildAttentionItems(workflow, runs)) {
    actions.add(item.recommendedAction);
  }
  for (const item of buildOperatorHighlights(runs)) {
    actions.add(item.recommendedAction);
  }
  return [...actions];
}
