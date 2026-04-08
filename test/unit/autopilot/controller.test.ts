import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AutopilotStore } from "../../../src/autopilot/autopilot-store.js";
import { AutopilotController } from "../../../src/autopilot/controller.js";
import { createOrchestrator } from "../../../src/services/orchestrator.js";
import { StateStore } from "../../../src/state/state-store.js";
import type { OpenClawSessionAdapter } from "../../../src/runtime/openclaw-session-adapter.js";
import type { RunRecord, WorkflowState } from "../../../src/types.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-autopilot-controller-"));
}

async function seedWorkflow(projectRoot: string, stateStore: StateStore): Promise<void> {
  const workflow: WorkflowState = {
    version: 1,
    projectRoot,
    activeSpecId: "spec-1",
    lifecycle: "planned",
    tasks: [
      {
        taskId: "task-1",
        specId: "spec-1",
        title: "Task 1",
        description: "Task 1",
        kind: "coding",
        deps: [],
        status: "planned",
        workspace: { mode: "shared" },
        runner: { type: "manual" },
        review: { required: true },
      },
    ],
    reviewQueue: [],
  };
  await stateStore.initProject(projectRoot);
  await stateStore.saveWorkflow(projectRoot, workflow);
}

const defaultRecoveryPolicy = {
  stuckRunMinutes: 20,
  idleSessionMinutes: 60,
  maxRecoveriesPerTask: 1,
  cancelBeforeRetry: true,
  degradedFailureRate: 0.5,
  degradedMinTerminalRuns: 3,
  degradedTerminalWindow: 6,
};

const enabledAutopilotConfig = {
  autopilot: {
    enabled: true,
    mode: "supervised" as const,
    tickSeconds: 15,
    leaseSeconds: 45,
    maxDispatchPerTick: 2,
    reviewPolicy: {
      mode: "manual_only" as const,
      allowlistTags: [],
      denyTags: ["high-risk", "security", "prod"],
    },
    recoveryPolicy: defaultRecoveryPolicy,
  },
};

describe("autopilot controller", () => {
  it("returns dry-run pressure summary without persisting state", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore(enabledAutopilotConfig);
    const autopilotStore = new AutopilotStore(stateStore.config);
    await seedWorkflow(projectRoot, stateStore);

    const controller = new AutopilotController(stateStore, autopilotStore);
    const result = await controller.tick({ projectRoot, dryRun: true });

    expect(result.action).toBe("dry_run");
    expect(result.queuePressure.runnableTasks).toBe(1);
    expect(result.targets.runnableTaskIds).toEqual(["task-1"]);
    expect(await autopilotStore.loadState(projectRoot)).toBeNull();
  });

  it("persists a non-dry-run dispatch tick and writes the decision log", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore({
      autopilot: {
        ...enabledAutopilotConfig.autopilot,
        tickSeconds: 30,
      },
    });
    const autopilotStore = new AutopilotStore(stateStore.config);
    await seedWorkflow(projectRoot, stateStore);

    const controller = new AutopilotController(stateStore, autopilotStore);
    const result = await controller.tick({ projectRoot });
    const persisted = await autopilotStore.loadState(projectRoot);

    expect(result.action).toBe("dispatch");
    expect(persisted?.lastDecision?.action).toBe("dispatch");
    expect(persisted?.metrics.tickCount).toBe(1);
    expect(persisted?.metrics.dispatchCount).toBe(1);
    expect(await autopilotStore.hasDecisionLog(projectRoot)).toBe(true);
  });

  it("syncs active ACP runs and auto-approves safe completed reviews", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore({
      autopilot: {
        ...enabledAutopilotConfig.autopilot,
        reviewPolicy: {
          mode: "auto_safe" as const,
          allowlistTags: [],
          denyTags: ["security", "prod"],
        },
      },
    });
    const autopilotStore = new AutopilotStore(stateStore.config);
    const workflow: WorkflowState = {
      version: 1,
      projectRoot,
      activeSpecId: "spec-1",
      lifecycle: "running",
      tasks: [
        {
          taskId: "task-1",
          specId: "spec-1",
          title: "Docs update",
          description: "Low risk documentation task",
          kind: "docs",
          deps: [],
          status: "running",
          workspace: { mode: "shared" },
          runner: { type: "acp" },
          review: { required: true },
        },
      ],
      reviewQueue: [],
    };
    const runRecord: RunRecord = {
      runId: "run-1",
      taskId: "task-1",
      attempt: 1,
      status: "accepted",
      runner: { type: "acp" },
      workspacePath: projectRoot,
      startedAt: "2026-04-08T00:00:00.000Z",
      artifacts: [],
      sessionRef: { runtime: "acp", sessionKey: "agent:codex:acp:1" },
    };
    const sessionAdapter: OpenClawSessionAdapter = {
      async spawnAcpSession() {
        throw new Error("not used");
      },
      async getAcpSessionStatus() {
        return {
          sessionKey: "agent:codex:acp:1",
          state: "completed",
          checkedAt: "2026-04-08T00:05:00.000Z",
          message: "done",
        };
      },
      async cancelAcpSession() {
        return { sessionKey: "agent:codex:acp:1" };
      },
      async closeAcpSession() {
        return { sessionKey: "agent:codex:acp:1" };
      },
    };

    await stateStore.initProject(projectRoot);
    await stateStore.saveWorkflow(projectRoot, workflow);
    await stateStore.writeRun(projectRoot, runRecord);

    const controller = new AutopilotController(
      stateStore,
      autopilotStore,
      createOrchestrator({ stateStore, sessionAdapter }),
    );

    const result = await controller.tick({ projectRoot });
    const updatedWorkflow = await stateStore.loadWorkflow(projectRoot);
    const updatedRun = await stateStore.loadRun(projectRoot, "run-1");
    const persisted = await autopilotStore.getState(projectRoot);

    expect(result.action).toBe("observe");
    expect(result.summary).toContain("synced 1 active run");
    expect(result.summary).toContain("auto-approved 1 review task");
    expect(updatedRun?.status).toBe("completed");
    expect(updatedWorkflow.tasks[0]?.status).toBe("done");
    expect(updatedWorkflow.reviewQueue).toEqual([]);
    expect(persisted.metrics.autoApproveCount).toBe(1);
  });
});
