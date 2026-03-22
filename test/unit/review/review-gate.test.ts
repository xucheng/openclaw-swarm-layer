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
    expect(approved.workflow.reviewQueue).toEqual([]);
    expect(rejected.task.status).toBe("blocked");
  });
});
