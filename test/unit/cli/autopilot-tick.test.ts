import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmAutopilotTick } from "../../../src/cli/swarm-autopilot-tick.js";
import { StateStore } from "../../../src/state/state-store.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-autopilot-tick-"));
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

describe("autopilot tick cli", () => {
  it("returns a dry-run summary", async () => {
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

    const result = await runSwarmAutopilotTick({ project: projectRoot, dryRun: true }, { stateStore }) as any;

    expect(result.action).toBe("dry_run");
    expect(result.targets.runnableTaskIds).toEqual(["task-1"]);
  });
});
