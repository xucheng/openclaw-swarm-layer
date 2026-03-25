import type { QualityRubric, RubricResult, RubricScore, RunRecord, TaskNode, WorkflowState } from "../types.js";
import { rubricToDecision, scoreRubric } from "./quality-rubric.js";

export type ReviewDecision = "approve" | "reject";

export type ReviewResult = {
  workflow: WorkflowState;
  task: TaskNode;
  runRecord?: RunRecord;
};

export function enqueueReview(workflow: WorkflowState, taskId: string): WorkflowState {
  if (workflow.reviewQueue.includes(taskId)) {
    return workflow;
  }
  return {
    ...workflow,
    lifecycle: "reviewing",
    reviewQueue: [...workflow.reviewQueue, taskId],
  };
}

export function applyAcpRunStatusToWorkflow(
  workflow: WorkflowState,
  params: { taskId: string; runStatus: RunRecord["status"]; summary?: string; at?: string },
): WorkflowState {
  const task = workflow.tasks.find((entry) => entry.taskId === params.taskId);
  if (!task) {
    throw new Error(`Unknown taskId: ${params.taskId}`);
  }

  const actionTime = params.at ?? new Date().toISOString();

  function withLastAction(nextWorkflow: WorkflowState, type: string, message?: string): WorkflowState {
    return {
      ...nextWorkflow,
      lastAction: {
        at: actionTime,
        type,
        message,
      },
    };
  }

  let nextTask: TaskNode = task;
  let nextWorkflow: WorkflowState = workflow;

  if (params.runStatus === "accepted" || params.runStatus === "running") {
    nextTask = {
      ...task,
      status: "running",
    };
    nextWorkflow = {
      ...workflow,
      lifecycle: "running",
      tasks: workflow.tasks.map((entry) => (entry.taskId === task.taskId ? nextTask : entry)),
    };
    return withLastAction(nextWorkflow, `run:${params.runStatus}`, params.summary);
  }

  if (params.runStatus === "completed") {
    nextTask = {
      ...task,
      status: task.review.required ? "review_required" : "done",
      review: {
        ...task.review,
        status: task.review.required ? "pending" : task.review.status,
      },
    };
    nextWorkflow = {
      ...workflow,
      lifecycle: task.review.required ? "reviewing" : "planned",
      tasks: workflow.tasks.map((entry) => (entry.taskId === task.taskId ? nextTask : entry)),
    };
    const queued = task.review.required ? enqueueReview(nextWorkflow, task.taskId) : nextWorkflow;
    return withLastAction(queued, `run:${params.runStatus}`, params.summary);
  }

  if (params.runStatus === "failed" || params.runStatus === "timed_out") {
    nextTask = {
      ...task,
      status: "review_required",
      review: {
        ...task.review,
        status: "pending",
      },
    };
    nextWorkflow = {
      ...workflow,
      lifecycle: "reviewing",
      tasks: workflow.tasks.map((entry) => (entry.taskId === task.taskId ? nextTask : entry)),
    };
    return withLastAction(enqueueReview(nextWorkflow, task.taskId), `run:${params.runStatus}`, params.summary);
  }

  if (params.runStatus === "cancelled") {
    nextTask = {
      ...task,
      status: "blocked",
    };
    return withLastAction({
      ...workflow,
      lifecycle: "blocked",
      tasks: workflow.tasks.map((entry) => (entry.taskId === task.taskId ? nextTask : entry)),
      reviewQueue: workflow.reviewQueue.filter((entry) => entry !== task.taskId),
    }, `run:${params.runStatus}`, params.summary);
  }

  return workflow;
}

export function applyReviewDecision(
  workflow: WorkflowState,
  taskId: string,
  decision: ReviewDecision,
  note?: string,
): ReviewResult {
  const task = workflow.tasks.find((entry) => entry.taskId === taskId);
  if (!task) {
    throw new Error(`Unknown taskId: ${taskId}`);
  }

  const updatedTask: TaskNode = {
    ...task,
    status: decision === "approve" ? "done" : "blocked",
    review: {
      ...task.review,
      status: decision === "approve" ? "approved" : "rejected",
    },
  };

  const nextWorkflow: WorkflowState = {
    ...workflow,
    lifecycle: decision === "approve" ? "planned" : "blocked",
    tasks: workflow.tasks.map((entry) => (entry.taskId === taskId ? updatedTask : entry)),
    reviewQueue: workflow.reviewQueue.filter((entry) => entry !== taskId),
    lastAction: {
      at: new Date().toISOString(),
      type: `review:${decision}`,
      message: note,
    },
  };

  return {
    workflow: nextWorkflow,
    task: updatedTask,
  };
}

export function applyRubricResult(
  workflow: WorkflowState,
  taskId: string,
  rubric: QualityRubric,
  scores: RubricScore[],
): ReviewResult & { rubricResult: RubricResult } {
  const task = workflow.tasks.find((entry) => entry.taskId === taskId);
  if (!task) {
    throw new Error(`Unknown taskId: ${taskId}`);
  }

  const rubricResult = scoreRubric(rubric, scores);
  const decision = rubricToDecision(rubricResult);

  // Update task with rubric result before applying decision
  const taskWithRubric: WorkflowState = {
    ...workflow,
    tasks: workflow.tasks.map((entry) =>
      entry.taskId === taskId
        ? { ...entry, review: { ...entry.review, rubric, rubricResult } }
        : entry,
    ),
  };

  const result = applyReviewDecision(taskWithRubric, taskId, decision);

  return {
    ...result,
    rubricResult,
  };
}
