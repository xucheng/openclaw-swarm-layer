import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmInit } from "../../src/cli/swarm-init.js";
import { runSwarmPlan } from "../../src/cli/swarm-plan.js";
import { runSwarmRun } from "../../src/cli/swarm-run.js";
import { BridgeOpenClawSessionAdapter } from "../../src/runtime/bridge-openclaw-session-adapter.js";
import { BridgeOpenClawSubagentAdapter } from "../../src/runtime/bridge-openclaw-subagent-adapter.js";
import { StateStore } from "../../src/state/state-store.js";

async function makeTempProject(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function seedProject(projectRoot: string, stateStore: StateStore, specName: string) {
  const specPath = path.join(projectRoot, `${specName}.md`);
  await fs.writeFile(specPath, `# ${specName}\n\n## Goals\n- test bridge failure\n\n## Phases\n### Execute\n- delegate\n`, "utf8");
  await runSwarmInit({ project: projectRoot }, { stateStore });
  await runSwarmPlan({ project: projectRoot, spec: specPath }, { stateStore });
}

describe("e2e: bridge failure classification", () => {
  it("surfaces backend-unavailable ACP bridge failures with remediation", async () => {
    const projectRoot = await makeTempProject("swarm-layer-bridge-failure-acp-");
    const stateStore = new StateStore({
      bridge: {
        enabled: true,
        acpFallbackEnabled: true,
        subagentEnabled: false,
        openclawRoot: "/opt/openclaw",
        versionAllow: ["2026.3.13"],
      },
      acp: { enabled: true, backendId: "acpx", defaultAgentId: "codex", allowedAgents: ["codex"], defaultMode: "run", allowThreadBinding: false, experimentalControlPlaneAdapter: false },
    });
    await seedProject(projectRoot, stateStore, "ACP Bridge Failure");
    const adapter = new BridgeOpenClawSessionAdapter(
      undefined,
      stateStore.config,
      "/usr/bin/node",
      "/tmp/bridge.mjs",
      "/tmp/loader.mjs",
      vi.fn(async () => ({
        code: 1,
        stdout: "",
        stderr: "ACP runtime backend is currently unavailable. Try again in a moment. (backend: acpx)",
      })),
    );

    await expect(runSwarmRun({ project: projectRoot, runner: "acp" }, { stateStore, sessionAdapter: adapter })).rejects.toThrow(
      "[backend-unavailable]",
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

  it("surfaces timeout ACP bridge failures with remediation", async () => {
    const projectRoot = await makeTempProject("swarm-layer-bridge-failure-timeout-");
    const stateStore = new StateStore({
      bridge: {
        enabled: true,
        acpFallbackEnabled: true,
        subagentEnabled: false,
        openclawRoot: "/opt/openclaw",
        versionAllow: ["2026.3.13"],
      },
      acp: { enabled: true, backendId: "acpx", defaultAgentId: "codex", allowedAgents: ["codex"], defaultMode: "run", allowThreadBinding: false, experimentalControlPlaneAdapter: false },
    });
    await seedProject(projectRoot, stateStore, "ACP Bridge Timeout");
    const adapter = new BridgeOpenClawSessionAdapter(
      undefined,
      stateStore.config,
      "/usr/bin/node",
      "/tmp/bridge.mjs",
      "/tmp/loader.mjs",
      vi.fn(async () => ({
        code: 1,
        stdout: "",
        stderr: "bridge timed out after 120000ms",
      })),
    );

    await expect(runSwarmRun({ project: projectRoot, runner: "acp" }, { stateStore, sessionAdapter: adapter })).rejects.toThrow(
      "[timeout]",
    );
  });

  it("surfaces version drift ACP bridge failures with remediation", async () => {
    const projectRoot = await makeTempProject("swarm-layer-bridge-failure-version-");
    const stateStore = new StateStore({
      bridge: {
        enabled: true,
        acpFallbackEnabled: true,
        subagentEnabled: false,
        openclawRoot: "/opt/openclaw",
        versionAllow: ["2026.3.13"],
      },
      acp: { enabled: true, backendId: "acpx", defaultAgentId: "codex", allowedAgents: ["codex"], defaultMode: "run", allowThreadBinding: false, experimentalControlPlaneAdapter: false },
    });
    await seedProject(projectRoot, stateStore, "ACP Bridge Version Drift");
    const adapter = new BridgeOpenClawSessionAdapter(
      undefined,
      stateStore.config,
      "/usr/bin/node",
      "/tmp/bridge.mjs",
      "/tmp/loader.mjs",
      vi.fn(async () => ({
        code: 1,
        stdout: "",
        stderr: "OpenClaw version 2026.4.0 is not in bridge allowlist (2026.3.13)",
      })),
    );

    await expect(runSwarmRun({ project: projectRoot, runner: "acp" }, { stateStore, sessionAdapter: adapter })).rejects.toThrow(
      "[version-drift]",
    );
  });
});
