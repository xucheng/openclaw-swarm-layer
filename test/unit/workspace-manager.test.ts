import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WorkspaceManager } from "../../src/workspace/workspace-manager.js";
import type { TaskNode } from "../../src/types.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-workspace-"));
}

describe("WorkspaceManager", () => {
  it("returns project root for shared workspaces", async () => {
    const projectRoot = await makeTempProject();
    const manager = new WorkspaceManager();
    const task = {
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
    } satisfies TaskNode;

    const result = await manager.resolveWorkspace(projectRoot, task);
    expect(result.workspacePath).toBe(projectRoot);
  });

  it("creates isolated workspace directories", async () => {
    const projectRoot = await makeTempProject();
    const manager = new WorkspaceManager();
    const task = {
      taskId: "task-2",
      specId: "spec-1",
      title: "Task 2",
      description: "Task 2",
      kind: "coding",
      deps: [],
      status: "ready",
      workspace: { mode: "isolated" },
      runner: { type: "manual" },
      review: { required: true },
    } satisfies TaskNode;

    const result = await manager.resolveWorkspace(projectRoot, task);
    expect(result.workspacePath).toContain(path.join("workspaces", "task-2"));
  });
});
