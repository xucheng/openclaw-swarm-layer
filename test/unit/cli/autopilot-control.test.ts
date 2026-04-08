import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmAutopilotControl } from "../../../src/cli/swarm-autopilot-control.js";
import { runSwarmAutopilotStatus } from "../../../src/cli/swarm-autopilot-status.js";
import { StateStore } from "../../../src/state/state-store.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-autopilot-control-"));
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

describe("autopilot control cli", () => {
  it("pauses, resumes, stops, and restarts autopilot state", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore(enabledAutopilotConfig);
    await stateStore.initProject(projectRoot);

    const paused = await runSwarmAutopilotControl(
      { project: projectRoot, command: "pause", reason: "manual review window" },
      { stateStore },
    );
    expect(paused.autopilot.desiredState).toBe("paused");
    expect(paused.autopilot.pausedReason).toBe("manual review window");
    expect(paused.summary).toContain("paused");

    const resumed = await runSwarmAutopilotControl(
      { project: projectRoot, command: "resume", reason: "resume queue" },
      { stateStore },
    );
    expect(resumed.autopilot.desiredState).toBe("running");
    expect(resumed.autopilot.pausedReason).toBeUndefined();
    expect(resumed.autopilot.nextTickAt).toBeDefined();

    const stopped = await runSwarmAutopilotControl(
      { project: projectRoot, command: "stop", mode: "safe", reason: "handoff to operator" },
      { stateStore },
    );
    expect(stopped.autopilot.desiredState).toBe("stopped");
    expect(stopped.summary).toContain("safe mode");

    await runSwarmAutopilotControl({ project: projectRoot, command: "start" }, { stateStore });
    const status = await runSwarmAutopilotStatus({ project: projectRoot }, { stateStore });
    expect(status.autopilot.desiredState).toBe("running");
    expect(status.autopilot.decisionLogPath).toContain(path.join(".openclaw", "swarm", "logs"));
  });
});
