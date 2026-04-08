import type { OpenClawSubagentAdapter } from "../../../src/runtime/openclaw-subagent-adapter.js";
import { SubagentRunner } from "../../../src/runtime/subagent-runner.js";
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

describe("SubagentRunner", () => {
  it("produces a dry-run plan", async () => {
    const runner = new SubagentRunner();
    const plan = await runner.plan({ projectRoot: workflow.projectRoot, task, workflow, dryRun: true });

    expect(plan.runnable).toBe(true);
    expect(plan.summary).toContain("subagent runner is prepared");
    expect(plan.nextStatus).toBe("running");
  });

  it("creates an accepted run record when a subagent adapter is provided", async () => {
    const adapter: OpenClawSubagentAdapter = {
      async spawnSubagent() {
        return {
          childSessionKey: "agent:main:subagent:123",
          runId: "sub-run-123",
          mode: "run",
          acceptedAt: "2026-03-21T00:00:00.000Z",
          note: "auto-announces on completion",
        };
      },
      async getSubagentRunStatus() {
        return {
          childSessionKey: "agent:main:subagent:123",
          state: "running",
        };
      },
      async killSubagentRun() {
        return {
          childSessionKey: "agent:main:subagent:123",
        };
      },
    };
    const runner = new SubagentRunner(adapter);

    const result = await runner.run({ projectRoot: workflow.projectRoot, task, workflow });

    expect(result.accepted).toBe(true);
    expect(result.nextTaskStatus).toBe("running");
    expect(result.runRecord.runner.type).toBe("subagent");
    expect(result.runRecord.sessionRef?.sessionKey).toBe("agent:main:subagent:123");
  });

  it("syncs subagent runs through the adapter", async () => {
    const adapter: OpenClawSubagentAdapter = {
      async spawnSubagent() {
        throw new Error("not used");
      },
      async getSubagentRunStatus() {
        return {
          childSessionKey: "agent:main:subagent:sync",
          state: "completed",
          checkedAt: "2026-03-21T00:05:00.000Z",
          outputText: "done",
        };
      },
      async killSubagentRun() {
        return {
          childSessionKey: "agent:main:subagent:sync",
        };
      },
    };
    const runner = new SubagentRunner(adapter);

    const result = await runner.sync({
      projectRoot: workflow.projectRoot,
      task,
      runRecord: {
        runId: "sub-run-sync",
        taskId: task.taskId,
        attempt: 1,
        status: "running",
        runner: { type: "subagent" },
        workspacePath: workflow.projectRoot,
        startedAt: "2026-03-21T00:00:00.000Z",
        artifacts: [],
        sessionRef: { runtime: "subagent", sessionKey: "agent:main:subagent:sync" },
      },
    });

    expect(result.runRecord.status).toBe("completed");
    expect(result.checkedAt).toBe("2026-03-21T00:05:00.000Z");
    expect(result.remoteState).toBe("completed");
  });
});
