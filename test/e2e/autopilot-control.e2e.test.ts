import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmAutopilotControl } from "../../src/cli/swarm-autopilot-control.js";
import { runSwarmAutopilotStatus } from "../../src/cli/swarm-autopilot-status.js";
import { runSwarmAutopilotTick } from "../../src/cli/swarm-autopilot-tick.js";
import { runSwarmInit } from "../../src/cli/swarm-init.js";
import { runSwarmPlan } from "../../src/cli/swarm-plan.js";
import { StateStore } from "../../src/state/state-store.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-autopilot-control-e2e-"));
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

describe("e2e: autopilot control commands", () => {
  it("respects pause, resume, stop, and start controls during ticks", async () => {
    const projectRoot = await makeTempProject();
    const specPath = path.join(projectRoot, "SPEC-CONTROL.md");
    const stateStore = new StateStore(enabledAutopilotConfig);

    await fs.writeFile(
      specPath,
      "# Autopilot Control\n\n## Goals\n- prove control commands\n\n## Phases\n### Build\n- Implement controlled dispatch\n",
      "utf8",
    );

    await runSwarmInit({ project: projectRoot }, { stateStore });
    await runSwarmPlan({ project: projectRoot, spec: specPath }, { stateStore });

    await runSwarmAutopilotControl(
      { project: projectRoot, command: "pause", reason: "operator hold" },
      { stateStore },
    );
    const pausedTick = await runSwarmAutopilotTick({ project: projectRoot }, { stateStore }) as any;
    expect(pausedTick.action).toBe("noop");
    expect(pausedTick.summary).toContain("paused");

    await runSwarmAutopilotControl(
      { project: projectRoot, command: "resume", reason: "resume automation" },
      { stateStore },
    );
    const resumedTick = await runSwarmAutopilotTick({ project: projectRoot }, { stateStore }) as any;
    expect(resumedTick.action).toBe("dispatch");

    await runSwarmAutopilotControl(
      { project: projectRoot, command: "stop", mode: "safe", reason: "operator handoff" },
      { stateStore },
    );
    const stoppedTick = await runSwarmAutopilotTick({ project: projectRoot }, { stateStore }) as any;
    expect(stoppedTick.action).toBe("noop");
    expect(stoppedTick.summary).toContain("stopped");

    await runSwarmAutopilotControl({ project: projectRoot, command: "start" }, { stateStore });
    const status = await runSwarmAutopilotStatus({ project: projectRoot }, { stateStore });
    expect(status.autopilot.desiredState).toBe("running");
  });
});
