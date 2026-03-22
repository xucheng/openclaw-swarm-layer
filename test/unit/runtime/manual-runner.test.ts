import { ManualRunner } from "../../../src/runtime/manual-runner.js";
import type { TaskNode, WorkflowState } from "../../../src/types.js";

const task: TaskNode = {
  taskId: "task-1",
  specId: "spec-1",
  title: "Task 1",
  description: "Task 1",
  kind: "coding",
  deps: [],
  status: "ready",
  workspace: { mode: "shared" },
  runner: { type: "manual" },
  review: { required: true },
};

const workflow: WorkflowState = {
  version: 1,
  projectRoot: "/tmp/project",
  lifecycle: "planned",
  tasks: [task],
  reviewQueue: [],
};

describe("ManualRunner", () => {
  it("produces a dry-run plan", async () => {
    const runner = new ManualRunner();
    const plan = await runner.plan({ projectRoot: workflow.projectRoot, task, workflow, dryRun: true });

    expect(plan.runnable).toBe(true);
    expect(plan.workspacePath).toBe(workflow.projectRoot);
    expect(plan.nextStatus).toBe("review_required");
  });

  it("creates a completed run record", async () => {
    const runner = new ManualRunner();
    const result = await runner.run({ projectRoot: workflow.projectRoot, task, workflow });

    expect(result.accepted).toBe(true);
    expect(result.runRecord.runner.type).toBe("manual");
    expect(result.runRecord.status).toBe("completed");
  });
});
