import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmInit } from "../../src/cli/swarm-init.js";
import { runSwarmRun } from "../../src/cli/swarm-run.js";
import { runSwarmStatus } from "../../src/cli/swarm-status.js";
import { StateStore } from "../../src/state/state-store.js";
import type { TaskNode } from "../../src/types.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-parallel-"));
}

function makeIndependentTasks(count: number): TaskNode[] {
  return Array.from({ length: count }, (_, i) => ({
    taskId: `task-${i + 1}`,
    specId: "spec-1",
    title: `Task ${i + 1}`,
    description: `Task ${i + 1}`,
    kind: "coding" as const,
    deps: [],
    status: "ready" as const,
    workspace: { mode: "shared" as const },
    runner: { type: "manual" as const },
    review: { required: false },
  }));
}

describe("e2e: parallel dispatch", () => {
  it("dispatches multiple tasks with --parallel", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore({
      acp: { maxConcurrent: 6 } as any,
    });

    await stateStore.initProject(projectRoot);
    await stateStore.saveWorkflow(projectRoot, {
      version: 1,
      projectRoot,
      activeSpecId: "spec-1",
      lifecycle: "planned",
      tasks: makeIndependentTasks(5),
      reviewQueue: [],
    });

    const result = await runSwarmRun(
      { project: projectRoot, parallel: 3 },
      { stateStore },
    ) as any;

    expect(result.stats.dispatchAdmitted).toBe(3);
    expect(result.stats.dispatchQueued).toBe(0);
    expect(result.results).toHaveLength(3);
  });

  it("dispatches all ready with --allReady and respects maxConcurrent", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore({
      acp: { maxConcurrent: 3 } as any,
    });

    // Start with 1 already running ACP task
    const tasks = makeIndependentTasks(5);
    tasks[0] = { ...tasks[0]!, status: "running", runner: { type: "acp" } };

    await stateStore.initProject(projectRoot);
    await stateStore.saveWorkflow(projectRoot, {
      version: 1,
      projectRoot,
      activeSpecId: "spec-1",
      lifecycle: "running",
      tasks,
      reviewQueue: [],
    });

    const result = await runSwarmRun(
      { project: projectRoot, allReady: true },
      { stateStore },
    ) as any;

    // 3 max - 1 running = 2 admitted, 2 queued
    expect(result.stats.dispatchAdmitted).toBe(2);
    expect(result.stats.dispatchQueued).toBe(2);

    // Verify queued tasks appear in status
    const status = await runSwarmStatus({ project: projectRoot }, { stateStore });
    expect(status.workflow.queuedTasks).toBe(2);
  });

  it("shows dispatch stats in result message", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore({
      acp: { maxConcurrent: 2 } as any,
    });

    await stateStore.initProject(projectRoot);
    await stateStore.saveWorkflow(projectRoot, {
      version: 1,
      projectRoot,
      activeSpecId: "spec-1",
      lifecycle: "planned",
      tasks: makeIndependentTasks(4),
      reviewQueue: [],
    });

    const result = await runSwarmRun(
      { project: projectRoot, allReady: true },
      { stateStore },
    ) as any;

    expect(result.stats.dispatchRequested).toBe(4);
    expect(result.stats.dispatchAdmitted).toBe(2);
    expect(result.stats.dispatchQueued).toBe(2);
    expect(result.message).toContain("dispatched 2");
    expect(result.message).toContain("queued 2");
  });
});
