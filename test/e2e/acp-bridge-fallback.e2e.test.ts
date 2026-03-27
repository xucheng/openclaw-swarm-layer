import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmInit } from "../../src/cli/swarm-init.js";
import { runSwarmPlan } from "../../src/cli/swarm-plan.js";
import { runSwarmRun } from "../../src/cli/swarm-run.js";
import { BridgeOpenClawSessionAdapter } from "../../src/runtime/bridge-openclaw-session-adapter.js";
import { StateStore } from "../../src/state/state-store.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-acp-bridge-"));
}

describe("e2e: bridge-backed ACP runner path", () => {
  it("uses the bridge-backed session adapter when ACP bridge fallback is enabled", async () => {
    const projectRoot = await makeTempProject();
    const specPath = path.join(projectRoot, "SPEC-BRIDGE.md");
    const stateStore = new StateStore({
      bridge: {
        enabled: true,
        acpFallbackEnabled: true,
        subagentEnabled: false,
        openclawRoot: "/opt/openclaw",
        versionAllow: ["2026.2.26"],
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
    });
    const bridgeRunner = vi.fn(async () => ({
      code: 0,
      stdout: JSON.stringify({
        ok: true,
        version: "2026.2.26",
        result: {
          sessionKey: "agent:codex:acp:bridge",
          backend: "acpx",
          acceptedAt: "2026-03-21T00:00:00.000Z",
        },
      }),
      stderr: "",
      pid: 1,
      signal: null,
      killed: false,
    }));
    const sessionAdapter = new BridgeOpenClawSessionAdapter(
      undefined,
      stateStore.config,
      "/usr/bin/node",
      "/tmp/openclaw-exec-bridge.mjs",
      "/tmp/tsx-loader.mjs",
      bridgeRunner,
    );
    await fs.writeFile(specPath, "# Bridge Spec\n\n## Goals\n- use ACP bridge\n\n## Phases\n### Execute\n- Use bridge\n", "utf8");

    await runSwarmInit({ project: projectRoot }, { stateStore });
    await runSwarmPlan({ project: projectRoot, spec: specPath }, { stateStore });
    const result = await runSwarmRun({ project: projectRoot, runner: "acp" }, { stateStore, sessionAdapter });
    const runs = await stateStore.loadRuns(projectRoot);

    expect((result as any).action).toBe("dispatched");
    expect(runs[0]?.sessionRef?.sessionKey).toBe("agent:codex:acp:bridge");
    expect(bridgeRunner).toHaveBeenCalledTimes(1);
  });
});
