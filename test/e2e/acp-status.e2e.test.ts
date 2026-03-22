import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmSessionStatus } from "../../src/cli/swarm-session-status.js";
import { planTasksFromSpec } from "../../src/planning/planner.js";
import { AcpRunner } from "../../src/runtime/acp-runner.js";
import type { OpenClawSessionAdapter } from "../../src/runtime/openclaw-session-adapter.js";
import { RunnerRegistry } from "../../src/runtime/runner-registry.js";
import { createOrchestrator } from "../../src/services/orchestrator.js";
import { StateStore } from "../../src/state/state-store.js";
import type { SpecDoc } from "../../src/types.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-acp-status-"));
}

describe("e2e: acp accepted -> status sync", () => {
  it("syncs an accepted acp run into running status", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore();
    const spec: SpecDoc = {
      specId: "spec-acp-status",
      title: "ACP Status Spec",
      sourcePath: path.join(projectRoot, "SPEC.md"),
      projectRoot,
      goals: ["Run ACP and sync status"],
      constraints: [],
      acceptanceCriteria: [],
      phases: [{ phaseId: "phase-1", title: "Execute", tasks: ["Use ACP"] }],
    };
    const tasks = planTasksFromSpec(spec, { reviewRequiredByDefault: true });
    await stateStore.initProject(projectRoot);
    await stateStore.saveWorkflow(projectRoot, {
      version: 1,
      projectRoot,
      activeSpecId: spec.specId,
      lifecycle: "planned",
      tasks,
      reviewQueue: [],
    });

    const sessionAdapter: OpenClawSessionAdapter = {
      async spawnAcpSession() {
        return {
          sessionKey: "agent:codex:acp:e2e-status",
          backend: "acpx",
        };
      },
      async getAcpSessionStatus() {
        return {
          sessionKey: "agent:codex:acp:e2e-status",
          state: "running",
          checkedAt: "2026-03-20T00:03:00.000Z",
          message: "still running",
        };
      },
      async cancelAcpSession() {
        return { sessionKey: "agent:codex:acp:e2e-status" };
      },
      async closeAcpSession() {
        return { sessionKey: "agent:codex:acp:e2e-status" };
      },
    };
    const acpRunner = new AcpRunner(
      {
        acp: {
          enabled: true,
          defaultAgentId: "codex",
          allowedAgents: ["codex"],
          defaultMode: "run",
          allowThreadBinding: false,
          defaultTimeoutSeconds: 600,
          experimentalControlPlaneAdapter: false,
        },
      },
      sessionAdapter,
    );
    const orchestrator = createOrchestrator({
      stateStore,
      runnerRegistry: new RunnerRegistry([acpRunner]),
    });

    const runResult = await orchestrator.runOnce({ projectRoot, runnerOverride: "acp" });
    const runId = runResult.runIds?.[0];
    expect(runId).toBeTruthy();

    const status = await runSwarmSessionStatus(
      { project: projectRoot, run: runId! },
      { stateStore, sessionAdapter },
    );
    const savedRun = await stateStore.loadRun(projectRoot, runId!);

    expect((status as any).status).toBe("running");
    expect(savedRun?.status).toBe("running");
    expect(savedRun?.events?.some((event) => event.type === "status_polled")).toBe(true);
  });
});
