import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { planTasksFromSpec } from "../../src/planning/planner.js";
import { AcpRunner } from "../../src/runtime/acp-runner.js";
import type { OpenClawSessionAdapter } from "../../src/runtime/openclaw-session-adapter.js";
import { RunnerRegistry } from "../../src/runtime/runner-registry.js";
import { createOrchestrator } from "../../src/services/orchestrator.js";
import { StateStore } from "../../src/state/state-store.js";
import type { SpecDoc } from "../../src/types.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-acp-accepted-"));
}

describe("e2e: acp accepted run", () => {
  it("writes an accepted run record and keeps workflow running", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore();
    const spec: SpecDoc = {
      specId: "spec-acp",
      title: "ACP Spec",
      sourcePath: path.join(projectRoot, "SPEC.md"),
      projectRoot,
      goals: ["Run ACP"],
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

    const adapter: OpenClawSessionAdapter = {
      async spawnAcpSession() {
        return {
          sessionKey: "agent:codex:acp:e2e",
          backend: "acpx",
          backendSessionId: "backend-e2e",
        };
      },
      async getAcpSessionStatus() {
        return {
          sessionKey: "agent:codex:acp:e2e",
          state: "running",
        };
      },
      async cancelAcpSession() {
        return { sessionKey: "agent:codex:acp:e2e" };
      },
      async closeAcpSession() {
        return { sessionKey: "agent:codex:acp:e2e" };
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
      adapter,
    );
    const orchestrator = createOrchestrator({
      stateStore,
      runnerRegistry: new RunnerRegistry([acpRunner]),
    });

    const result = await orchestrator.runOnce({ projectRoot, runnerOverride: "acp" });
    const workflow = await stateStore.loadWorkflow(projectRoot);
    const runs = await stateStore.loadRuns(projectRoot);

    expect(result.ok).toBe(true);
    expect(result.action).toBe("dispatched");
    expect(workflow.lifecycle).toBe("running");
    expect(workflow.tasks[0]?.status).toBe("running");
    expect(workflow.reviewQueue).toEqual([]);
    expect(runs[0]?.sessionRef?.sessionKey).toBe("agent:codex:acp:e2e");
    expect(runs[0]?.events?.map((event) => event.type)).toEqual(["spawn_requested", "spawn_accepted"]);
  });
});
