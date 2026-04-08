import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmAutopilotStatus } from "../../../src/cli/swarm-autopilot-status.js";
import { StateStore } from "../../../src/state/state-store.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-autopilot-status-"));
}

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
};

describe("autopilot status cli", () => {
  it("returns default control-plane state and queue pressure", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore(enabledAutopilotConfig);
    await stateStore.initProject(projectRoot);
    await stateStore.saveWorkflow(projectRoot, {
      version: 1,
      projectRoot,
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
    });

    const result = await runSwarmAutopilotStatus({ project: projectRoot }, { stateStore });

    expect(result.autopilot.enabled).toBe(true);
    expect(result.autopilot.desiredState).toBe("running");
    expect(result.autopilot.runtimeState).toBe("idle");
    expect(result.autopilot.queuePressure.runnableTasks).toBe(1);
    expect(result.autopilot.metrics.tickCount).toBe(0);
    expect(result.autopilot.health.degraded).toBe(false);
    expect(result.autopilot.decisionLogPath).toContain(path.join(".openclaw", "swarm", "logs", "autopilot-decisions.ndjson"));
  });
});
