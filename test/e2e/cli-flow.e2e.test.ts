import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmInit } from "../../src/cli/swarm-init.js";
import { runSwarmPlan } from "../../src/cli/swarm-plan.js";
import { runSwarmStatus } from "../../src/cli/swarm-status.js";
import { StateStore } from "../../src/state/state-store.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-e2e-"));
}

describe("e2e: init -> plan -> status", () => {
  it("creates state, plans tasks, and reports status", async () => {
    const projectRoot = await makeTempProject();
    const specPath = path.join(projectRoot, "SPEC-001.md");
    const stateStore = new StateStore();
    await fs.writeFile(
      specPath,
      "# E2E Spec\n\n## Goals\n- Ship v1\n\n## Constraints\n- No ACP\n\n## Acceptance Criteria\n- Status works\n\n## Phases\n### Bootstrap\n- Init repo\n- Add state store\n",
      "utf8",
    );

    const initResult = await runSwarmInit({ project: projectRoot }, { stateStore });
    const planResult = await runSwarmPlan({ project: projectRoot, spec: specPath }, { stateStore });
    const statusResult = await runSwarmStatus({ project: projectRoot }, { stateStore });

    expect(initResult.ok).toBe(true);
    expect(planResult.taskCount).toBe(2);
    expect(statusResult.workflow.activeSpecId).toBe("e2e-spec");
    expect(statusResult.workflow.readyTasks).toBe(1);
    expect(statusResult.workflow.totalTasks).toBe(2);
  });
});
