import { applyAcpRunStatusToWorkflow } from "../../../src/review/review-gate.js";
import type { TaskNode, WorkflowState } from "../../../src/types.js";

function makeWorkflow(taskOverrides?: Partial<TaskNode>): WorkflowState {
  return {
    version: 1,
    projectRoot: "/tmp/project",
    lifecycle: "running",
    tasks: [
      {
        taskId: "task-1",
        specId: "spec-1",
        title: "Task 1",
        description: "Task 1",
        kind: "coding",
        deps: [],
        status: "running",
        workspace: { mode: "shared" },
        runner: { type: "acp" },
        review: { required: true },
        ...taskOverrides,
      },
    ],
    reviewQueue: [],
  };
}

describe("ACP review sync", () => {
  it("moves completed runs into review when review is required", () => {
    const next = applyAcpRunStatusToWorkflow(makeWorkflow(), { taskId: "task-1", runStatus: "completed" });
    expect(next.lifecycle).toBe("reviewing");
    expect(next.tasks[0]?.status).toBe("review_required");
    expect(next.reviewQueue).toEqual(["task-1"]);
  });

  it("marks completed task as done when review is not required", () => {
    const next = applyAcpRunStatusToWorkflow(makeWorkflow({ review: { required: false } }), {
      taskId: "task-1",
      runStatus: "completed",
    });
    expect(next.lifecycle).toBe("completed");
    expect(next.tasks[0]?.status).toBe("done");
    expect(next.reviewQueue).toEqual([]);
  });

  it("keeps workflow planned when a no-review completion leaves more work", () => {
    const next = applyAcpRunStatusToWorkflow({
      ...makeWorkflow({ review: { required: false } }),
      lifecycle: "running",
      tasks: [
        {
          taskId: "task-1",
          specId: "spec-1",
          title: "Task 1",
          description: "Task 1",
          kind: "coding",
          deps: [],
          status: "running",
          workspace: { mode: "shared" },
          runner: { type: "acp" },
          review: { required: false },
        },
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
    }, {
      taskId: "task-1",
      runStatus: "completed",
    });

    expect(next.lifecycle).toBe("planned");
    expect(next.tasks[0]?.status).toBe("done");
  });

  it("sets task to running on accepted status", () => {
    const next = applyAcpRunStatusToWorkflow(makeWorkflow({ status: "ready" }), {
      taskId: "task-1",
      runStatus: "accepted",
      summary: "run accepted",
    });
    expect(next.lifecycle).toBe("running");
    expect(next.tasks[0]?.status).toBe("running");
    expect(next.lastAction?.type).toBe("run:accepted");
    expect(next.lastAction?.message).toBe("run accepted");
  });

  it("sets task to running on running status", () => {
    const next = applyAcpRunStatusToWorkflow(makeWorkflow(), {
      taskId: "task-1",
      runStatus: "running",
    });
    expect(next.lifecycle).toBe("running");
    expect(next.tasks[0]?.status).toBe("running");
    expect(next.lastAction?.type).toBe("run:running");
  });

  it("moves failed runs into review", () => {
    const next = applyAcpRunStatusToWorkflow(makeWorkflow(), {
      taskId: "task-1",
      runStatus: "failed",
      summary: "agent crashed",
    });
    expect(next.lifecycle).toBe("reviewing");
    expect(next.tasks[0]?.status).toBe("review_required");
    expect(next.reviewQueue).toEqual(["task-1"]);
    expect(next.lastAction?.type).toBe("run:failed");
    expect(next.lastAction?.message).toBe("agent crashed");
  });

  it("moves timed_out runs into review", () => {
    const next = applyAcpRunStatusToWorkflow(makeWorkflow(), {
      taskId: "task-1",
      runStatus: "timed_out",
    });
    expect(next.lifecycle).toBe("reviewing");
    expect(next.tasks[0]?.status).toBe("review_required");
    expect(next.reviewQueue).toEqual(["task-1"]);
    expect(next.lastAction?.type).toBe("run:timed_out");
  });

  it("blocks cancelled runs and removes from review queue", () => {
    const wf = { ...makeWorkflow(), reviewQueue: ["task-1"] };
    const next = applyAcpRunStatusToWorkflow(wf, { taskId: "task-1", runStatus: "cancelled" });
    expect(next.lifecycle).toBe("blocked");
    expect(next.tasks[0]?.status).toBe("blocked");
    expect(next.reviewQueue).toEqual([]);
  });

  it("throws on unknown taskId", () => {
    expect(() =>
      applyAcpRunStatusToWorkflow(makeWorkflow(), { taskId: "missing", runStatus: "completed" }),
    ).toThrow("Unknown taskId: missing");
  });

  it("returns workflow unchanged for unrecognized run status", () => {
    const wf = makeWorkflow();
    const next = applyAcpRunStatusToWorkflow(wf, {
      taskId: "task-1",
      runStatus: "planned" as unknown as "completed",
    });
    expect(next).toEqual(wf);
  });
});
