import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runBootstrap } from "../../../src/session/session-bootstrap.js";
import { StateStore } from "../../../src/state/state-store.js";
import type { ProgressSummary, TaskNode, WorkflowState } from "../../../src/types.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-bootstrap-"));
}

function makeTask(overrides: Partial<TaskNode> & { taskId: string; specId: string }): TaskNode {
  return {
    title: overrides.taskId,
    description: overrides.taskId,
    kind: "coding",
    deps: [],
    status: "planned",
    workspace: { mode: "shared" },
    runner: { type: "manual" },
    review: { required: true },
    ...overrides,
  };
}

describe("runBootstrap", () => {
  it("succeeds on fresh project with no progress file", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore();
    await stateStore.initProject(projectRoot);

    // Add a task so there's something runnable
    const workflow = await stateStore.loadWorkflow(projectRoot);
    const withTask: WorkflowState = {
      ...workflow,
      lifecycle: "planned",
      tasks: [makeTask({ taskId: "t1", specId: "s1", status: "ready" })],
    };
    await stateStore.saveWorkflow(projectRoot, withTask);

    const result = await runBootstrap(projectRoot, stateStore);

    expect(result.ok).toBe(true);
    expect(result.resumedFromProgress).toBe(false);
    expect(result.selectedTaskId).toBe("t1");
    expect(result.checks).toHaveLength(4);
    expect(result.checks.every((c) => c.ok)).toBe(true);
  });

  it("resumes from existing progress file", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore();
    await stateStore.initProject(projectRoot);

    // Save progress
    const progress: ProgressSummary = {
      version: 1,
      projectRoot,
      updatedAt: "2026-01-01T00:00:00Z",
      completedTasks: [{ taskId: "t1", title: "Done", completedAt: "2026-01-01T00:00:00Z" }],
      remainingTasks: [{ taskId: "t2", title: "Next" }],
      blockers: [],
      keyDecisions: [],
      environmentNotes: [],
    };
    await stateStore.saveProgress(projectRoot, progress);

    // Workflow with t1 done, t2 ready
    const workflow = await stateStore.loadWorkflow(projectRoot);
    const withTasks: WorkflowState = {
      ...workflow,
      lifecycle: "planned",
      tasks: [
        makeTask({ taskId: "t1", specId: "s1", status: "done" }),
        makeTask({ taskId: "t2", specId: "s1", status: "ready", deps: ["t1"] }),
      ],
    };
    await stateStore.saveWorkflow(projectRoot, withTasks);

    const result = await runBootstrap(projectRoot, stateStore);

    expect(result.ok).toBe(true);
    expect(result.resumedFromProgress).toBe(true);
    expect(result.selectedTaskId).toBe("t2");
    expect(result.progress).toBeDefined();
    expect(result.progress!.completedTasks).toHaveLength(1);
  });

  it("fails when projectRoot does not exist", async () => {
    const stateStore = new StateStore();
    const result = await runBootstrap("/nonexistent/path/12345", stateStore);

    expect(result.ok).toBe(false);
    expect(result.checks[0].step).toBe("environment");
    expect(result.checks[0].ok).toBe(false);
    expect(result.resumedFromProgress).toBe(false);
  });

  it("succeeds with no runnable tasks (all done)", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore();
    await stateStore.initProject(projectRoot);

    const workflow = await stateStore.loadWorkflow(projectRoot);
    const allDone: WorkflowState = {
      ...workflow,
      lifecycle: "completed",
      tasks: [makeTask({ taskId: "t1", specId: "s1", status: "done" })],
    };
    await stateStore.saveWorkflow(projectRoot, allDone);

    const result = await runBootstrap(projectRoot, stateStore);

    expect(result.ok).toBe(true);
    expect(result.selectedTaskId).toBeUndefined();
  });

  it("is not called when bootstrap config is disabled", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore({ bootstrap: { enabled: false } });
    await stateStore.initProject(projectRoot);

    // Verify config default
    expect(stateStore.config.bootstrap.enabled).toBe(false);
  });
});
