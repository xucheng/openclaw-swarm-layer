import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { StateStore } from "../../../src/state/state-store.js";
import type { WorkflowReader } from "../../../src/state/workflow-reader.js";
import type { RunRecord, WorkflowState } from "../../../src/types.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-workflow-reader-"));
}

describe("WorkflowReader delegation", () => {
  it("loads workflow and runs through an injected reader", async () => {
    const projectRoot = await makeTempProject();
    const workflow: WorkflowState = {
      version: 1,
      projectRoot,
      lifecycle: "planned",
      tasks: [],
      reviewQueue: [],
    };
    const run: RunRecord = {
      runId: "run-1",
      taskId: "task-1",
      attempt: 1,
      status: "completed",
      runner: { type: "manual" },
      workspacePath: projectRoot,
      startedAt: "2026-05-25T00:00:00.000Z",
      artifacts: [],
    };
    const reader: WorkflowReader = {
      initProject: vi.fn(async () => new StateStore().resolvePaths(projectRoot)),
      loadWorkflow: vi.fn(async () => workflow),
      loadSpecs: vi.fn(async () => []),
      loadRuns: vi.fn(async () => [run]),
      loadRun: vi.fn(async () => run),
      loadProgress: vi.fn(async () => null),
      loadSessions: vi.fn(async () => []),
    };
    const store = new StateStore({}, undefined, reader);

    await expect(store.loadWorkflow(projectRoot)).resolves.toEqual(workflow);
    await expect(store.loadRuns(projectRoot)).resolves.toEqual([run]);
    expect(reader.loadWorkflow).toHaveBeenCalledWith(projectRoot);
    expect(reader.loadRuns).toHaveBeenCalledWith(projectRoot);
  });
});
