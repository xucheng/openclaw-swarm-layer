import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmAutopilotTick } from "../../src/cli/swarm-autopilot-tick.js";
import { StateStore } from "../../src/state/state-store.js";
import type { RunRecord, WorkflowState } from "../../src/types.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-autopilot-degraded-"));
}

function makeFailedRun(projectRoot: string, runId: string, status: RunRecord["status"]): RunRecord {
  return {
    runId,
    taskId: `done-${runId}`,
    attempt: 1,
    status,
    runner: { type: "acp" },
    workspacePath: projectRoot,
    startedAt: `2026-04-08T00:0${runId}:00.000Z`,
    endedAt: `2026-04-08T00:0${runId}:30.000Z`,
    artifacts: [],
    sessionRef: { runtime: "acp", sessionKey: `agent:codex:acp:${runId}` },
  };
}

describe("e2e: autopilot degraded mode", () => {
  it("holds new dispatch when recent terminal failure rate breaches policy", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore({
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
          stuckRunMinutes: 20,
          idleSessionMinutes: 60,
          maxRecoveriesPerTask: 1,
          cancelBeforeRetry: true,
          degradedFailureRate: 0.5,
          degradedMinTerminalRuns: 3,
          degradedTerminalWindow: 4,
        },
      },
    });
    const workflow: WorkflowState = {
      version: 1,
      projectRoot,
      activeSpecId: "spec-1",
      lifecycle: "planned",
      tasks: [
        {
          taskId: "task-1",
          specId: "spec-1",
          title: "Ready task",
          description: "Should not dispatch while degraded",
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
    await stateStore.writeRun(projectRoot, makeFailedRun(projectRoot, "1", "failed"));
    await stateStore.writeRun(projectRoot, makeFailedRun(projectRoot, "2", "timed_out"));
    await stateStore.writeRun(projectRoot, makeFailedRun(projectRoot, "3", "completed"));

    const tick = await runSwarmAutopilotTick({ project: projectRoot }, { stateStore }) as any;
    const finalWorkflow = await stateStore.loadWorkflow(projectRoot);
    const runs = await stateStore.loadRuns(projectRoot);

    expect(tick.summary).toContain("degraded mode holding dispatch");
    expect(tick.autopilot.degradedReason).toContain("failure rate");
    expect(finalWorkflow.tasks[0]?.status).toBe("planned");
    expect(runs).toHaveLength(3);
  });
});
