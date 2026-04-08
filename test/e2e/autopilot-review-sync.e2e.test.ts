import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmAutopilotTick } from "../../src/cli/swarm-autopilot-tick.js";
import { runSwarmAutopilotStatus } from "../../src/cli/swarm-autopilot-status.js";
import type { OpenClawSessionAdapter } from "../../src/runtime/openclaw-session-adapter.js";
import { StateStore } from "../../src/state/state-store.js";
import type { RunRecord, WorkflowState } from "../../src/types.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-autopilot-review-sync-"));
}

describe("e2e: autopilot sync + review closure", () => {
  it("syncs an active ACP run and auto-approves a safe completed task", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore({
      autopilot: {
        enabled: true,
        mode: "supervised",
        tickSeconds: 15,
        leaseSeconds: 45,
        maxDispatchPerTick: 2,
        reviewPolicy: {
          mode: "auto_safe",
          allowlistTags: [],
          denyTags: ["security", "prod"],
        },
        recoveryPolicy: {
          stuckRunMinutes: 20,
          idleSessionMinutes: 60,
          maxRecoveriesPerTask: 1,
          cancelBeforeRetry: true,
          degradedFailureRate: 0.5,
          degradedMinTerminalRuns: 3,
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
          title: "Docs polish",
          description: "Low risk documentation cleanup",
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
      sessionRef: { runtime: "acp", sessionKey: "agent:codex:acp:e2e" },
    };
    const sessionAdapter: OpenClawSessionAdapter = {
      async spawnAcpSession() {
        throw new Error("not used");
      },
      async getAcpSessionStatus() {
        return {
          sessionKey: "agent:codex:acp:e2e",
          state: "completed",
          checkedAt: "2026-04-08T00:05:00.000Z",
          message: "done",
        };
      },
      async cancelAcpSession() {
        return { sessionKey: "agent:codex:acp:e2e" };
      },
      async closeAcpSession() {
        return { sessionKey: "agent:codex:acp:e2e" };
      },
    };

    await stateStore.initProject(projectRoot);
    await stateStore.saveWorkflow(projectRoot, workflow);
    await stateStore.writeRun(projectRoot, runRecord);

    const tick = await runSwarmAutopilotTick(
      { project: projectRoot },
      { stateStore, sessionAdapter },
    ) as any;
    const status = await runSwarmAutopilotStatus(
      { project: projectRoot },
      { stateStore },
    );
    const finalWorkflow = await stateStore.loadWorkflow(projectRoot);
    const finalRun = await stateStore.loadRun(projectRoot, "run-1");

    expect(tick.action).toBe("observe");
    expect(tick.summary).toContain("synced 1 active run");
    expect(tick.summary).toContain("auto-approved 1 review task");
    expect(finalRun?.status).toBe("completed");
    expect(finalWorkflow.lifecycle).toBe("completed");
    expect(finalWorkflow.tasks[0]?.status).toBe("done");
    expect(finalWorkflow.reviewQueue).toEqual([]);
    expect(status.autopilot.metrics.autoApproveCount).toBe(1);
  });
});
