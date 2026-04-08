import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AutopilotStore } from "../../../src/autopilot/autopilot-store.js";
import { AutopilotServiceLoop } from "../../../src/autopilot/service-loop.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-autopilot-service-loop-"));
}

function createDeferred() {
  let resolve!: () => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const enabledAutopilotConfig = {
  autopilot: {
    enabled: true,
    mode: "supervised" as const,
    tickSeconds: 1,
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

describe("autopilot service loop", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("schedules recurring non-overlapping ticks", async () => {
    vi.useFakeTimers();
    const projectRoot = await makeTempProject();
    const autopilotStore = new AutopilotStore(enabledAutopilotConfig);
    const firstTick = createDeferred();
    const controller = {
      tick: vi
        .fn()
        .mockImplementationOnce(async () => {
          await firstTick.promise;
          return { ok: true, action: "observe", summary: "first" };
        })
        .mockResolvedValue({ ok: true, action: "observe", summary: "next" }),
    };
    const loop = new AutopilotServiceLoop(controller as any, autopilotStore, 1000);

    loop.start(projectRoot);
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.tick).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.tick).toHaveBeenCalledTimes(1);

    firstTick.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.tick).toHaveBeenCalledTimes(2);

    await loop.stop();
  });

  it("records service-loop failures for crash recovery audit", async () => {
    vi.useFakeTimers();
    const projectRoot = await makeTempProject();
    const autopilotStore = new AutopilotStore(enabledAutopilotConfig);
    const controller = {
      tick: vi.fn().mockRejectedValue(new Error("boom")),
    };
    const loop = new AutopilotServiceLoop(controller as any, autopilotStore, 1000);

    loop.start(projectRoot);
    await vi.advanceTimersByTimeAsync(0);
    await loop.stop();

    const state = await autopilotStore.getState(projectRoot);
    expect(state.lastDecision?.summary).toContain("service loop error: boom");
    expect(await autopilotStore.hasDecisionLog(projectRoot)).toBe(true);
  });
});
