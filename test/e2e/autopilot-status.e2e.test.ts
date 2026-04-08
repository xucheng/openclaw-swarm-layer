import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmAutopilotStatus } from "../../src/cli/swarm-autopilot-status.js";
import { runSwarmAutopilotTick } from "../../src/cli/swarm-autopilot-tick.js";
import { runSwarmInit } from "../../src/cli/swarm-init.js";
import { runSwarmPlan } from "../../src/cli/swarm-plan.js";
import { StateStore } from "../../src/state/state-store.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-autopilot-e2e-"));
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

describe("e2e: autopilot status and tick", () => {
  it("shows default autopilot posture and persists a dispatch tick", async () => {
    const projectRoot = await makeTempProject();
    const specPath = path.join(projectRoot, "SPEC-AUTOPILOT.md");
    const stateStore = new StateStore(enabledAutopilotConfig);

    await fs.writeFile(
      specPath,
      "# Autopilot Spec\n\n## Goals\n- test autopilot\n\n## Phases\n### Build\n- Implement autopilot skeleton\n",
      "utf8",
    );

    await runSwarmInit({ project: projectRoot }, { stateStore });
    await runSwarmPlan({ project: projectRoot, spec: specPath }, { stateStore });

    const statusBefore = await runSwarmAutopilotStatus({ project: projectRoot }, { stateStore });
    expect(statusBefore.autopilot.desiredState).toBe("running");
    expect(statusBefore.autopilot.queuePressure.runnableTasks).toBe(1);

    const dryRun = await runSwarmAutopilotTick({ project: projectRoot, dryRun: true }, { stateStore }) as any;
    expect(dryRun.action).toBe("dry_run");
    expect(dryRun.targets.runnableTaskIds.length).toBeGreaterThan(0);

    const observed = await runSwarmAutopilotTick({ project: projectRoot }, { stateStore }) as any;
    expect(observed.action).toBe("dispatch");

    const statusAfter = await runSwarmAutopilotStatus({ project: projectRoot }, { stateStore });
    expect(statusAfter.autopilot.metrics.tickCount).toBe(1);
    expect(statusAfter.autopilot.lastDecision?.action).toBe("dispatch");
  });
});
