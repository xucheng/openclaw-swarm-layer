import type { ProgressSummary, RunRecord, TaskNode, WorkflowState } from "../types.js";

const PROGRESS_VERSION = 1;

const DONE_STATUSES = new Set(["done", "dead_letter"]);
const ACTIVE_STATUSES = new Set(["running", "review_required"]);

function findLatestRun(taskId: string, runs: RunRecord[]): RunRecord | undefined {
  return runs
    .filter((r) => r.taskId === taskId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
}

function blockedByDeps(task: TaskNode, tasks: TaskNode[]): string[] {
  return task.deps.filter((depId) => {
    const dep = tasks.find((t) => t.taskId === depId);
    return dep && !DONE_STATUSES.has(dep.status);
  });
}

export function synthesizeProgress(
  workflow: WorkflowState,
  runs: RunRecord[],
  existing?: ProgressSummary,
): ProgressSummary {
  const completedTasks: ProgressSummary["completedTasks"] = [];
  const remainingTasks: ProgressSummary["remainingTasks"] = [];
  let currentTask: ProgressSummary["currentTask"] | undefined;

  for (const task of workflow.tasks) {
    if (DONE_STATUSES.has(task.status)) {
      const latestRun = findLatestRun(task.taskId, runs);
      completedTasks.push({
        taskId: task.taskId,
        title: task.title,
        completedAt: latestRun?.endedAt ?? latestRun?.startedAt ?? new Date().toISOString(),
        resultSummary: latestRun?.resultSummary,
      });
    } else if (ACTIVE_STATUSES.has(task.status)) {
      const latestRun = findLatestRun(task.taskId, runs);
      currentTask = {
        taskId: task.taskId,
        title: task.title,
        status: task.status,
        lastAttemptSummary: latestRun?.resultSummary,
      };
    } else {
      remainingTasks.push({
        taskId: task.taskId,
        title: task.title,
        blockedBy: blockedByDeps(task, workflow.tasks),
      });
    }
  }

  const blockers: string[] = [];
  for (const task of workflow.tasks) {
    if (task.status === "blocked") {
      blockers.push(`${task.taskId}: ${task.title} is blocked`);
    }
    if (task.status === "dead_letter") {
      blockers.push(`${task.taskId}: ${task.title} moved to dead letter`);
    }
  }

  return {
    version: PROGRESS_VERSION,
    projectRoot: workflow.projectRoot,
    specId: workflow.activeSpecId,
    updatedAt: new Date().toISOString(),
    completedTasks,
    currentTask,
    remainingTasks,
    blockers,
    keyDecisions: existing?.keyDecisions ?? [],
    environmentNotes: existing?.environmentNotes ?? [],
  };
}

export function formatProgressMarkdown(progress: ProgressSummary): string {
  const lines: string[] = [];

  lines.push("# Progress Summary");
  lines.push("");
  lines.push(`Updated: ${progress.updatedAt}`);
  if (progress.specId) {
    lines.push(`Spec: ${progress.specId}`);
  }
  lines.push("");

  lines.push("## Completed Tasks");
  if (progress.completedTasks.length === 0) {
    lines.push("- (none)");
  } else {
    for (const task of progress.completedTasks) {
      const summary = task.resultSummary ? ` — ${task.resultSummary}` : "";
      lines.push(`- [x] ${task.taskId}: ${task.title}${summary}`);
    }
  }
  lines.push("");

  if (progress.currentTask) {
    lines.push("## Current Task");
    lines.push(`- [ ] ${progress.currentTask.taskId}: ${progress.currentTask.title} (${progress.currentTask.status})`);
    lines.push("");
  }

  lines.push("## Remaining Tasks");
  if (progress.remainingTasks.length === 0) {
    lines.push("- (none)");
  } else {
    for (const task of progress.remainingTasks) {
      const blocked = task.blockedBy && task.blockedBy.length > 0 ? ` (blocked by: ${task.blockedBy.join(", ")})` : "";
      lines.push(`- [ ] ${task.taskId}: ${task.title}${blocked}`);
    }
  }
  lines.push("");

  if (progress.blockers.length > 0) {
    lines.push("## Blockers");
    for (const blocker of progress.blockers) {
      lines.push(`- ${blocker}`);
    }
    lines.push("");
  }

  if (progress.keyDecisions.length > 0) {
    lines.push("## Key Decisions");
    for (const decision of progress.keyDecisions) {
      lines.push(`- ${decision}`);
    }
    lines.push("");
  }

  if (progress.environmentNotes.length > 0) {
    lines.push("## Environment Notes");
    for (const note of progress.environmentNotes) {
      lines.push(`- ${note}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
