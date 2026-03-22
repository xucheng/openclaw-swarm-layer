import { WorkspaceManager } from "../workspace/workspace-manager.js";
import type { TaskRunner, RunnerPlanInput, RunnerPlan, RunnerRunInput, RunnerRunResult } from "./task-runner.js";

function timestamp(): string {
  return new Date().toISOString();
}

function nextAttempt(taskId: string, runIds: string[]): number {
  return runIds.filter((runId) => runId.startsWith(`${taskId}-run-`)).length + 1;
}

export class ManualRunner implements TaskRunner {
  readonly kind = "manual" as const;

  constructor(private readonly workspaceManager: WorkspaceManager = new WorkspaceManager()) {}

  async plan(input: RunnerPlanInput): Promise<RunnerPlan> {
    const workspace = await this.workspaceManager.resolveWorkspace(input.projectRoot, input.task);
    return {
      runnable: true,
      summary: `manual runner would use ${workspace.mode} workspace at ${workspace.workspacePath}`,
      workspacePath: workspace.workspacePath,
      nextStatus: input.task.review.required ? "review_required" : "done",
    };
  }

  async run(input: RunnerRunInput): Promise<RunnerRunResult> {
    const plan = await this.plan({ ...input, dryRun: false });
    const runId = `${input.task.taskId}-run-${nextAttempt(
      input.task.taskId,
      input.workflow.tasks.flatMap((task) => (task.taskId === input.task.taskId ? [task.taskId] : [])),
    )}`;

    return {
      accepted: true,
      nextTaskStatus: plan.nextStatus,
      runRecord: {
        runId,
        taskId: input.task.taskId,
        attempt: 1,
        status: "completed",
        runner: { type: "manual" },
        workspacePath: plan.workspacePath,
        startedAt: timestamp(),
        endedAt: timestamp(),
        promptSummary: input.task.description,
        resultSummary: input.task.review.required
          ? "manual runner recorded task for review"
          : "manual runner recorded task as complete",
        artifacts: [],
        sessionRef: {
          runtime: "manual",
        },
        events: [
          { at: timestamp(), type: "planned" },
          { at: timestamp(), type: "completed" },
        ],
      },
    };
  }
}
