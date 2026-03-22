import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmSessionCancel } from "../../src/cli/swarm-session-cancel.js";
import { runSwarmSessionStatus } from "../../src/cli/swarm-session-status.js";
import { planTasksFromSpec } from "../../src/planning/planner.js";
import { AcpRunner } from "../../src/runtime/acp-runner.js";
import type { OpenClawSessionAdapter } from "../../src/runtime/openclaw-session-adapter.js";
import { RunnerRegistry } from "../../src/runtime/runner-registry.js";
import { createOrchestrator } from "../../src/services/orchestrator.js";
import { StateStore } from "../../src/state/state-store.js";
import type { SpecDoc } from "../../src/types.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-acp-terminal-"));
}

describe("e2e: acp terminal sync and cancel", () => {
  it("moves completed ACP runs into review and supports cancel flow", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore();
    const spec: SpecDoc = {
      specId: "spec-acp-terminal",
      title: "ACP Terminal Spec",
      sourcePath: path.join(projectRoot, "SPEC.md"),
      projectRoot,
      goals: ["Run ACP and complete"],
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

    let currentState: "running" | "completed" = "running";
    const sessionAdapter: OpenClawSessionAdapter = {
      async spawnAcpSession() {
        return { sessionKey: "agent:codex:acp:terminal", backend: "acpx" };
      },
      async getAcpSessionStatus() {
        return {
          sessionKey: "agent:codex:acp:terminal",
          state: currentState,
          checkedAt: "2026-03-20T00:05:00.000Z",
          message: currentState === "completed" ? "completed" : "running",
        };
      },
      async cancelAcpSession() {
        return { sessionKey: "agent:codex:acp:terminal", cancelledAt: "2026-03-20T00:06:00.000Z", message: "cancelled" };
      },
      async closeAcpSession() {
        return { sessionKey: "agent:codex:acp:terminal", closedAt: "2026-03-20T00:07:00.000Z", message: "closed" };
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
    const runId = runResult.runIds?.[0]!;

    currentState = "completed";
    const statusResult = await runSwarmSessionStatus({ project: projectRoot, run: runId }, { stateStore, sessionAdapter });
    const workflowAfterComplete = await stateStore.loadWorkflow(projectRoot);
    expect((statusResult as any).status).toBe("completed");
    expect((statusResult as any).resultSummary).toContain("Completed: ACP session finished");
    expect(workflowAfterComplete.lifecycle).toBe("reviewing");
    expect(workflowAfterComplete.reviewQueue).toEqual(["phase-1-task-1"]);
    const completedReport = await fs.readFile((statusResult as any).localReportPath, "utf8");
    expect(completedReport).toContain("Review queue: 1");
    expect(completedReport).toContain("Last action: run:completed");
    expect(completedReport).toContain("## Review Queue");
    expect(completedReport).toContain("## Attention");
    expect(completedReport).toContain("[review]");
    expect(completedReport).toContain("Action:");
    expect(completedReport).toContain("## Highlights");
    expect(completedReport).toContain("## Recommended Actions");

    await stateStore.saveWorkflow(projectRoot, {
      ...workflowAfterComplete,
      lifecycle: "running",
      reviewQueue: [],
      tasks: workflowAfterComplete.tasks.map((task) => ({ ...task, status: "running", review: { required: true } })),
    });
    await stateStore.writeRun(projectRoot, {
      ...(await stateStore.loadRun(projectRoot, runId))!,
      status: "running",
      endedAt: undefined,
    });

    const cancelResult = await runSwarmSessionCancel(
      { project: projectRoot, run: runId, reason: "operator stop" },
      { stateStore, sessionAdapter },
    );
    const workflowAfterCancel = await stateStore.loadWorkflow(projectRoot);
    expect((cancelResult as any).status).toBe("cancelled");
    expect((cancelResult as any).resultSummary).toContain("cancelled");
    expect(workflowAfterCancel.lifecycle).toBe("blocked");
    expect(workflowAfterCancel.tasks[0]?.status).toBe("blocked");
    const cancelledReport = await fs.readFile((cancelResult as any).localReportPath, "utf8");
    expect(cancelledReport).toContain("Lifecycle: blocked");
    expect(cancelledReport).toContain("Last action: run:cancelled");
    expect(cancelledReport).toContain("[blocked]");
    expect(cancelledReport).toContain("## Highlights");
    expect(cancelledReport).toContain("## Recommended Actions");
  });
});
