import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmInit } from "../../src/cli/swarm-init.js";
import { runSwarmPlan } from "../../src/cli/swarm-plan.js";
import { runSwarmRun } from "../../src/cli/swarm-run.js";
import { BridgeOpenClawSubagentAdapter } from "../../src/runtime/bridge-openclaw-subagent-adapter.js";
import { StateStore } from "../../src/state/state-store.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-subagent-bridge-e2e-"));
}

describe("e2e: bridge-backed subagent runner path", () => {
  it("uses the bridge-backed subagent adapter when bridge mode is enabled", async () => {
    const projectRoot = await makeTempProject();
    const specPath = path.join(projectRoot, "SPEC-SUBAGENT-BRIDGE.md");
    const stateStore = new StateStore({
      bridge: {
        enabled: true,
        nodePath: "/usr/bin/node",
        openclawRoot: "/opt/openclaw",
        versionAllow: ["2026.3.13"],
      },
    });
    const bridgeRunner = vi.fn(async () => ({
      code: 0,
      stdout: JSON.stringify({
        ok: true,
        version: "2026.3.13",
        result: {
          childSessionKey: "agent:main:subagent:bridge",
          runId: "sub-run-bridge",
          mode: "run",
          note: "subagent bridge accepted",
        },
      }),
      stderr: "",
    }));
    const subagentAdapter = new BridgeOpenClawSubagentAdapter(
      stateStore.config,
      "/usr/bin/node",
      "/tmp/openclaw-exec-bridge.mjs",
      "/tmp/tsx-loader.mjs",
      bridgeRunner,
    );
    await fs.writeFile(specPath, "# Subagent Bridge Spec\n\n## Goals\n- use subagent bridge\n\n## Phases\n### Execute\n- Bridge delegate\n", "utf8");

    await runSwarmInit({ project: projectRoot }, { stateStore });
    await runSwarmPlan({ project: projectRoot, spec: specPath }, { stateStore });
    const result = await runSwarmRun(
      { project: projectRoot, runner: "subagent" },
      { stateStore, subagentAdapter },
    );
    const runs = await stateStore.loadRuns(projectRoot);

    expect((result as any).action).toBe("dispatched");
    expect(runs[0]?.sessionRef?.sessionKey).toBe("agent:main:subagent:bridge");
    expect(bridgeRunner).toHaveBeenCalledTimes(1);
  });
});
