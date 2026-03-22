import { buildSubagentSpawnParams, preflightSubagentTask } from "../../../src/runtime/subagent-mapping.js";
import type { TaskNode, WorkflowState } from "../../../src/types.js";

const task: TaskNode = {
  taskId: "task-subagent",
  specId: "spec-1",
  title: "Subagent Task",
  description: "Run in a subagent",
  kind: "coding",
  deps: [],
  status: "ready",
  workspace: { mode: "shared" },
  runner: { type: "subagent" },
  review: { required: true },
};

const workflow: WorkflowState = {
  version: 1,
  projectRoot: "/tmp/project",
  lifecycle: "planned",
  tasks: [task],
  reviewQueue: [],
};

describe("subagent mapping", () => {
  it("builds subagent spawn params from task defaults", () => {
    const params = buildSubagentSpawnParams(task, workflow);
    expect(params).toEqual({
      task: "Run in a subagent",
      label: "task-subagent:Subagent Task",
      agentId: undefined,
      mode: "run",
      thread: false,
      runTimeoutSeconds: undefined,
    });
  });

  it("rejects session mode without thread request", () => {
    const result = preflightSubagentTask({
      ...task,
      runner: { type: "subagent", mode: "session" },
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('subagent mode "session" requires threadRequested=true');
  });
});
