import { applyReviewDecision, enqueueReview } from "../../../src/review/review-gate.js";
import type { WorkflowState } from "../../../src/types.js";

const workflow: WorkflowState = {
  version: 1,
  projectRoot: "/tmp/project",
  activeSpecId: "spec-1",
  lifecycle: "reviewing",
  tasks: [
    {
      taskId: "task-1",
      specId: "spec-1",
      title: "Task 1",
      description: "Task 1",
      kind: "coding",
      deps: [],
      status: "review_required",
      workspace: { mode: "shared" },
      runner: { type: "manual" },
      review: { required: true, status: "pending" },
    },
  ],
  reviewQueue: [],
};

describe("review gate", () => {
  it("adds tasks to the review queue once", () => {
    const queued = enqueueReview(workflow, "task-1");
    const duplicated = enqueueReview(queued, "task-1");

    expect(queued.reviewQueue).toEqual(["task-1"]);
    expect(duplicated.reviewQueue).toEqual(["task-1"]);
  });

  it("approves and rejects review decisions", () => {
    const queued = enqueueReview(workflow, "task-1");
    const approved = applyReviewDecision(queued, "task-1", "approve");
    const rejected = applyReviewDecision(queued, "task-1", "reject");

    expect(approved.task.status).toBe("done");
    expect(approved.workflow.lifecycle).toBe("completed");
    expect(approved.workflow.reviewQueue).toEqual([]);
    expect(rejected.task.status).toBe("blocked");
  });

  it("returns to planned after approval when other tasks remain", () => {
    const queued: WorkflowState = {
      ...enqueueReview(workflow, "task-1"),
      tasks: [
        ...workflow.tasks,
        {
          taskId: "task-2",
          specId: "spec-1",
          title: "Task 2",
          description: "Task 2",
          kind: "coding",
          deps: ["task-1"],
          status: "planned",
          workspace: { mode: "shared" },
          runner: { type: "manual" },
          review: { required: false },
        },
      ],
    };

    const approved = applyReviewDecision(queued, "task-1", "approve");

    expect(approved.workflow.lifecycle).toBe("planned");
  });

  it("reject without options preserves existing blocked behavior", () => {
    const queued = enqueueReview(workflow, "task-1");
    const rejected = applyReviewDecision(queued, "task-1", "reject", "bad output");

    expect(rejected.task.status).toBe("blocked");
    expect(rejected.task.review.status).toBe("rejected");
    expect(rejected.workflow.lifecycle).toBe("blocked");
  });

  it("reject with blocked policy goes to blocked", () => {
    const queued = enqueueReview(workflow, "task-1");
    const rejected = applyReviewDecision(queued, "task-1", "reject", "bad output", {
      rejectPolicy: "blocked",
    });

    expect(rejected.task.status).toBe("blocked");
  });

  it("reject with ready_retry policy sets status to ready", () => {
    const queued = enqueueReview(workflow, "task-1");
    const rejected = applyReviewDecision(queued, "task-1", "reject", "needs revision", {
      rejectPolicy: "ready_retry",
      maxRejectRetries: 3,
    });

    expect(rejected.task.status).toBe("ready");
    expect(rejected.task.retryCount).toBe(1);
    expect(rejected.task.lastRejectReason).toBe("needs revision");
    expect(rejected.task.review.status).toBe("rejected");
    expect(rejected.workflow.lifecycle).toBe("planned");
    expect(rejected.workflow.reviewQueue).toEqual([]);
    expect(rejected.workflow.lastAction?.type).toBe("review:reject_retry");
  });

  it("reject with ready_retry increments retryCount on successive rejects", () => {
    const queued = enqueueReview(workflow, "task-1");

    // First rejection
    const first = applyReviewDecision(queued, "task-1", "reject", "round 1", {
      rejectPolicy: "ready_retry",
      maxRejectRetries: 3,
    });
    expect(first.task.retryCount).toBe(1);

    // Second rejection (feed back the task with updated retryCount)
    const secondWorkflow: WorkflowState = {
      ...first.workflow,
      lifecycle: "reviewing",
      tasks: first.workflow.tasks.map((t) =>
        t.taskId === "task-1" ? { ...t, status: "review_required" as const } : t,
      ),
      reviewQueue: ["task-1"],
    };
    const second = applyReviewDecision(secondWorkflow, "task-1", "reject", "round 2", {
      rejectPolicy: "ready_retry",
      maxRejectRetries: 3,
    });
    expect(second.task.retryCount).toBe(2);
    expect(second.task.status).toBe("ready");
  });

  it("reject with ready_retry falls to blocked when maxRejectRetries exceeded", () => {
    const taskAtLimit: WorkflowState = {
      ...workflow,
      tasks: workflow.tasks.map((t) => ({
        ...t,
        retryCount: 3,
      })),
      reviewQueue: ["task-1"],
    };

    const result = applyReviewDecision(taskAtLimit, "task-1", "reject", "still bad", {
      rejectPolicy: "ready_retry",
      maxRejectRetries: 3,
    });

    expect(result.task.status).toBe("blocked");
    expect(result.task.retryCount).toBe(4);
    expect(result.workflow.lifecycle).toBe("blocked");
    expect(result.workflow.lastAction?.type).toBe("review:reject_exhausted");
    expect(result.workflow.lastAction?.message).toContain("exceeded max reject retries");
  });
});
