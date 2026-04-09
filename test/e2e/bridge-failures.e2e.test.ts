import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmInit } from "../../src/cli/swarm-init.js";
import { runSwarmPlan } from "../../src/cli/swarm-plan.js";
import { runSwarmRun } from "../../src/cli/swarm-run.js";
import { StateStore } from "../../src/state/state-store.js";

async function makeTempProject(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function seedProject(projectRoot: string, stateStore: StateStore, specName: string) {
  const specPath = path.join(projectRoot, `${specName}.md`);
  await fs.writeFile(specPath, `# ${specName}\n\n## Goals\n- test runtime failure\n\n## Phases\n### Execute\n- delegate\n`, "utf8");
  await runSwarmInit({ project: projectRoot }, { stateStore });
  await runSwarmPlan({ project: projectRoot, spec: specPath }, { stateStore });
}

describe("e2e: runtime failure classification", () => {
  it("surfaces unsupported ACP execution when the public path is unavailable", async () => {
    const projectRoot = await makeTempProject("swarm-layer-acp-unsupported-");
    const stateStore = new StateStore(
      {
        acp: {
          enabled: true,
          backendId: "acpx",
          defaultAgentId: "codex",
          allowedAgents: ["codex"],
          defaultMode: "run",
          allowThreadBinding: false,
          experimentalControlPlaneAdapter: false,
        },
        bridge: {
          enabled: false,
          acpFallbackEnabled: true,
          versionAllow: [],
        },
      },
      { runtimeVersion: "2026.3.13" },
    );
    await seedProject(projectRoot, stateStore, "ACP Unsupported");

    await expect(runSwarmRun({ project: projectRoot, runner: "acp" }, { stateStore })).rejects.toThrow(
      "public-ACP-capable build",
    );
  });

});
