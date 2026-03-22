import fs from "node:fs/promises";
import path from "node:path";
import type { TaskNode } from "../types.js";

export type WorkspaceResolution = {
  workspacePath: string;
  mode: "shared" | "isolated";
};

export class WorkspaceManager {
  async resolveWorkspace(projectRoot: string, task: TaskNode): Promise<WorkspaceResolution> {
    if (task.workspace.mode === "isolated") {
      const workspacePath = path.join(projectRoot, ".openclaw", "swarm", "workspaces", task.taskId);
      await fs.mkdir(workspacePath, { recursive: true });
      return {
        workspacePath,
        mode: "isolated",
      };
    }

    return {
      workspacePath: projectRoot,
      mode: "shared",
    };
  }
}
