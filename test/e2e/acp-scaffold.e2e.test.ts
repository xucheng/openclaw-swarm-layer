import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmInit } from "../../src/cli/swarm-init.js";
import { runSwarmPlan } from "../../src/cli/swarm-plan.js";
import { runSwarmRun } from "../../src/cli/swarm-run.js";
import { StateStore } from "../../src/state/state-store.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-acp-e2e-"));
}

describe("e2e: acp scaffold", () => {
  it("supports acp dry-run without enabling execution", async () => {
    const projectRoot = await makeTempProject();
    const specPath = path.join(projectRoot, "SPEC-ACP.md");
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
    });
    await fs.writeFile(specPath, "# ACP Spec\n\n## Goals\n- Prepare M2\n\n## Phases\n### Execute\n- Run in ACP\n", "utf8");

    await runSwarmInit({ project: projectRoot }, { stateStore });
    await runSwarmPlan({ project: projectRoot, spec: specPath }, { stateStore });

    const result = await runSwarmRun({ project: projectRoot, dryRun: true, runner: "acp" }, { stateStore });

    expect((result as any).action).toBe("planned");
    expect((result as any).message).toContain("acp runner is scaffolded");
  });
});
