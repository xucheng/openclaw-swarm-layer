import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmInit } from "../../src/cli/swarm-init.js";
import { runSwarmPlan } from "../../src/cli/swarm-plan.js";
import { runSwarmRun } from "../../src/cli/swarm-run.js";
import { BridgeOpenClawSubagentAdapter } from "../../src/runtime/bridge-openclaw-subagent-adapter.js";
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
          subagentEnabled: false,
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

  it("surfaces rejected subagent bridge failures with remediation", async () => {
    const projectRoot = await makeTempProject("swarm-layer-bridge-failure-subagent-");
    const stateStore = new StateStore({
      subagent: { enabled: true },
      bridge: {
        enabled: true,
        acpFallbackEnabled: false,
        subagentEnabled: true,
        openclawRoot: "/opt/openclaw",
        versionAllow: ["2026.3.13"],
      },
    });
    await seedProject(projectRoot, stateStore, "Subagent Bridge Failure");
    const adapter = new BridgeOpenClawSubagentAdapter(
      stateStore.config,
      "/usr/bin/node",
      "/tmp/bridge.mjs",
      "/tmp/loader.mjs",
      vi.fn(async () => ({
        code: 1,
        stdout: "",
        stderr: "spawn failed with status forbidden",
      })),
    );

    await expect(runSwarmRun({ project: projectRoot, runner: "subagent" }, { stateStore, subagentAdapter: adapter })).rejects.toThrow(
      "[rejected]",
    );
  });
});
