import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmInit } from "../../src/cli/swarm-init.js";
import { runSwarmPlan } from "../../src/cli/swarm-plan.js";
import { runSwarmRun } from "../../src/cli/swarm-run.js";
import { StateStore } from "../../src/state/state-store.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-acp-legacy-bridge-"));
}

describe("e2e: ACP legacy bridge config", () => {
  it("ignores legacy ACP bridge config and keeps auto on manual when the public path is unavailable", async () => {
    const projectRoot = await makeTempProject();
    const specPath = path.join(projectRoot, "SPEC-LEGACY-ACP-BRIDGE.md");
    const stateStore = new StateStore(
      {
        bridge: {
          enabled: false,
          acpFallbackEnabled: true,
          openclawRoot: "/opt/openclaw",
          versionAllow: ["2026.3.13"],
        },
        acp: {
          enabled: true,
          backendId: "acpx",
          defaultAgentId: "codex",
          allowedAgents: ["codex"],
          defaultMode: "run",
          allowThreadBinding: false,
          defaultTimeoutSeconds: 60,
          experimentalControlPlaneAdapter: false,
        },
      },
      { runtimeVersion: "2026.3.13" },
    );
    await fs.writeFile(specPath, "# Legacy ACP Bridge Spec\n\n## Goals\n- stay manual\n", "utf8");

    await runSwarmInit({ project: projectRoot }, { stateStore });
    const planResult = await runSwarmPlan({ project: projectRoot, spec: specPath }, { stateStore });
    const result = await runSwarmRun({ project: projectRoot, dryRun: true }, { stateStore });

    expect(planResult.runtime.resolvedDefaultRunner).toBe("manual");
    expect((result as any).runtime.resolvedDefaultRunner).toBe("manual");
  });
});
