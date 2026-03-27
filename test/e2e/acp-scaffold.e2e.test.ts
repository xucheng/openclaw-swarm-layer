import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmInit } from "../../src/cli/swarm-init.js";
import { runSwarmPlan } from "../../src/cli/swarm-plan.js";
import { runSwarmRun } from "../../src/cli/swarm-run.js";
import { runSwarmStatus } from "../../src/cli/swarm-status.js";
import { StateStore } from "../../src/state/state-store.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-acp-e2e-"));
}

describe("e2e: acp scaffold", () => {
  it("uses ACP as the default dry-run path when policy resolves from auto", async () => {
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
    }, { runtimeVersion: "2026.3.24" });
    await fs.writeFile(specPath, "# ACP Spec\n\n## Goals\n- Prepare M5\n\n## Phases\n### Execute\n- Run in ACP\n", "utf8");

    await runSwarmInit({ project: projectRoot }, { stateStore });
    const planResult = await runSwarmPlan({ project: projectRoot, spec: specPath }, { stateStore });
    const statusResult = await runSwarmStatus({ project: projectRoot }, { stateStore });
    const result = await runSwarmRun({ project: projectRoot, dryRun: true }, { stateStore });

    expect(planResult.runtime.configuredDefaultRunner).toBe("auto");
    expect(planResult.runtime.resolvedDefaultRunner).toBe("acp");
    expect(statusResult.runtime.workflowDefaultRunner).toBe("acp");
    expect(statusResult.runtime.allowedRunners).toEqual(["manual", "acp"]);
    expect((result as any).action).toBe("planned");
    expect((result as any).selectedRunner).toBe("acp");
    expect((result as any).runtime.resolvedDefaultRunner).toBe("acp");
    expect((result as any).message).toContain("acp runner is scaffolded");
  });
});
