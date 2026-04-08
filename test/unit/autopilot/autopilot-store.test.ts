import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AutopilotStore } from "../../../src/autopilot/autopilot-store.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-autopilot-store-"));
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

describe("autopilot store", () => {
  it("returns a default in-memory state when no state file exists", async () => {
    const projectRoot = await makeTempProject();
    const store = new AutopilotStore(enabledAutopilotConfig);

    const state = await store.getState(projectRoot);

    expect(state.projectRoot).toBe(projectRoot);
    expect(state.desiredState).toBe("running");
    expect(state.runtimeState).toBe("idle");
    expect(state.metrics.tickCount).toBe(0);
    expect(await store.loadState(projectRoot)).toBeNull();
  });

  it("persists state and appends decision logs", async () => {
    const projectRoot = await makeTempProject();
    const store = new AutopilotStore(enabledAutopilotConfig);
    const initial = await store.initState(projectRoot);

    await store.saveState(projectRoot, {
      ...initial,
      lastTickAt: "2026-04-08T12:00:00.000Z",
      lastDecision: {
        at: "2026-04-08T12:00:00.000Z",
        action: "observe",
        summary: "observed runnable=1, queued=0, review=0",
      },
      metrics: {
        ...initial.metrics,
        tickCount: 1,
        observationCount: 1,
      },
    });
    await store.appendDecision(projectRoot, {
      tickId: "tick-1",
      at: "2026-04-08T12:00:00.000Z",
      action: "observe",
      summary: "observed runnable=1, queued=0, review=0",
    });

    const persisted = await store.loadState(projectRoot);
    const decisionLog = await fs.readFile(store.resolvePaths(projectRoot).autopilotDecisionLogPath, "utf8");

    expect(persisted?.metrics.tickCount).toBe(1);
    expect(persisted?.lastDecision?.action).toBe("observe");
    expect(decisionLog).toContain('"tickId":"tick-1"');
    expect(await store.hasDecisionLog(projectRoot)).toBe(true);
  });
});
