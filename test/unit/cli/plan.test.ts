import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmInit } from "../../../src/cli/swarm-init.js";
import { runSwarmPlan } from "../../../src/cli/swarm-plan.js";
import { StateStore } from "../../../src/state/state-store.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-plan-"));
}

describe("swarm plan cli", () => {
  it("uses stateStore config for ACP-preferred planning and runtime policy", async () => {
    const projectRoot = await makeTempProject();
    const specPath = path.join(projectRoot, "SPEC-PLAN.md");
    const stateStore = new StateStore({
      acp: {
        enabled: true,
        defaultAgentId: "codex",
        allowedAgents: ["codex"],
        defaultMode: "run",
        allowThreadBinding: false,
        defaultTimeoutSeconds: 600,
        experimentalControlPlaneAdapter: false,
      },
    }, { runtimeVersion: "2026.3.24" });
    await fs.writeFile(specPath, "# Plan Spec\n\n## Goals\n- default to ACP\n\n## Phases\n### Execute\n- Ship the change\n", "utf8");

    await runSwarmInit({ project: projectRoot }, { stateStore });
    const result = await runSwarmPlan(
      { project: projectRoot, spec: specPath },
      { stateStore, config: { defaultRunner: "manual" } },
    );
    const workflow = await stateStore.loadWorkflow(projectRoot);

    expect(result.runtime.configuredDefaultRunner).toBe("auto");
    expect(result.runtime.resolvedDefaultRunner).toBe("acp");
    expect(result.runtime.allowedRunners).toEqual(["manual", "acp"]);
    expect(workflow.runtime?.defaultRunner).toBe("acp");
    expect(workflow.runtime?.allowedRunners).toEqual(["manual", "acp"]);
    expect(workflow.tasks.every((task) => task.runner.type === "acp")).toBe(true);
  });
});
