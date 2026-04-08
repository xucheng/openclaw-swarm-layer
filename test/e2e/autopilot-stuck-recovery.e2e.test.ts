import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmAutopilotTick } from "../../src/cli/swarm-autopilot-tick.js";
import type { OpenClawSessionAdapter } from "../../src/runtime/openclaw-session-adapter.js";
import { StateStore } from "../../src/state/state-store.js";
import type { RunRecord, WorkflowState } from "../../src/types.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-autopilot-stuck-recovery-"));
}

describe("e2e: autopilot stuck recovery", () => {
  it("cancels a stuck ACP run and re-dispatches it when retry policy allows timed_out", async () => {
    const projectRoot = await makeTempProject();
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
      autopilot: {
        enabled: true,
        mode: "supervised",
        tickSeconds: 15,
        leaseSeconds: 45,
        maxDispatchPerTick: 2,
        reviewPolicy: {
          mode: "manual_only",
          allowlistTags: [],
          denyTags: ["security", "prod"],
        },
        recoveryPolicy: {
          stuckRunMinutes: 5,
          idleSessionMinutes: 60,
          maxRecoveriesPerTask: 2,
          cancelBeforeRetry: true,
          degradedFailureRate: 0.9,
          degradedMinTerminalRuns: 5,
          degradedTerminalWindow: 6,
        },
      },
    });
    const workflow: WorkflowState = {
      version: 1,
      projectRoot,
      activeSpecId: "spec-1",
      lifecycle: "running",
      tasks: [
        {
          taskId: "task-1",
          specId: "spec-1",
          title: "Recover task",
          description: "Recover a stuck ACP task",
          kind: "coding",
          deps: [],
          status: "running",
          workspace: { mode: "shared" },
          runner: {
            type: "acp",
            retryPolicy: { maxAttempts: 3, backoffSeconds: 0, retryOn: ["timed_out"] },
          },
          review: { required: true },
        },
      ],
      reviewQueue: [],
    };
    const stuckRun: RunRecord = {
      runId: "run-stuck-1",
      taskId: "task-1",
      attempt: 1,
      status: "running",
      runner: { type: "acp" },
      workspacePath: projectRoot,
      startedAt: "2026-04-08T00:00:00.000Z",
      artifacts: [],
      sessionRef: { runtime: "acp", sessionKey: "agent:codex:acp:stuck" },
    };
    let spawnCount = 0;
    const sessionAdapter: OpenClawSessionAdapter = {
      async spawnAcpSession() {
        spawnCount += 1;
        return {
          sessionKey: `agent:codex:acp:retry-${spawnCount}`,
          backend: "acpx",
          acceptedAt: "2026-04-08T00:06:00.000Z",
        };
      },
      async getAcpSessionStatus() {
        return {
          sessionKey: "agent:codex:acp:stuck",
          state: "running",
          checkedAt: "2026-04-08T00:06:00.000Z",
          message: "still running",
        };
      },
      async cancelAcpSession() {
        return {
          sessionKey: "agent:codex:acp:stuck",
          cancelledAt: "2026-04-08T00:06:00.000Z",
          message: "cancelled by recovery",
        };
      },
      async closeAcpSession() {
        return { sessionKey: "agent:codex:acp:stuck" };
      },
    };

    await stateStore.initProject(projectRoot);
    await stateStore.saveWorkflow(projectRoot, workflow);
    await stateStore.writeRun(projectRoot, stuckRun);

    const tick = await runSwarmAutopilotTick(
      { project: projectRoot },
      { stateStore, sessionAdapter },
    ) as any;
    const finalWorkflow = await stateStore.loadWorkflow(projectRoot);
    const runs = await stateStore.loadRuns(projectRoot);

    expect(tick.summary).toContain("cancelled stuck run task-1");
    expect(spawnCount).toBe(1);
    expect(finalWorkflow.tasks[0]?.status).toBe("running");
    expect(runs.some((run) => run.runId === "run-stuck-1" && run.status === "timed_out")).toBe(true);
    expect(runs.some((run) => run.runId !== "run-stuck-1" && run.status === "accepted")).toBe(true);
    expect(tick.autopilot.metrics.cancelCount).toBe(1);
    expect(tick.autopilot.metrics.retryCount).toBeGreaterThanOrEqual(1);
  });
});
