import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmInit } from "../../src/cli/swarm-init.js";
import { runSwarmPlan } from "../../src/cli/swarm-plan.js";
import { runSwarmRun } from "../../src/cli/swarm-run.js";
import { StateStore } from "../../src/state/state-store.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-subagent-dark-mode-"));
}

describe("e2e: subagent dark mode", () => {
  it("rejects subagent dispatch unless it is enabled explicitly", async () => {
    const projectRoot = await makeTempProject();
    const specPath = path.join(projectRoot, "SPEC-SUBAGENT-DARK-MODE.md");
    const stateStore = new StateStore();
    await fs.writeFile(specPath, "# Subagent Dark Mode\n\n## Goals\n- verify dark mode\n\n## Phases\n### Execute\n- try subagent\n", "utf8");

    await runSwarmInit({ project: projectRoot }, { stateStore });
    await runSwarmPlan({ project: projectRoot, spec: specPath }, { stateStore });

    const result = await runSwarmRun({ project: projectRoot, runner: "subagent" }, { stateStore });
    const runs = await stateStore.loadRuns(projectRoot);

    expect((result as any).ok).toBe(false);
    expect((result as any).action).toBe("noop");
    expect((result as any).selectedRunner).toBe("subagent");
    expect((result as any).message).toContain("legacy bridge-backed opt-in path");
    expect(runs).toEqual([]);
  });
});
