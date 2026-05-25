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

function makeWatcher() {
  const handlers = new Map<string, Array<(...args: any[]) => void>>();
  const watcher = {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return watcher;
    }),
    emitChange(event = { kind: "run", op: "update", paths: [], at: "2026-05-25T00:00:00.000Z", seq: 1 }) {
      for (const handler of handlers.get("change") ?? []) handler(event);
    },
    emitError(error = new Error("watch failed"), scope = "/tmp/watch") {
      for (const handler of handlers.get("error") ?? []) handler(error, scope);
    },
  };
  return watcher;
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

  it("schedules recurring non-overlapping polling ticks", async () => {
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
    const loop = new AutopilotServiceLoop(controller as any, autopilotStore, {
      mode: "polling",
      pollingIntervalMs: 1000,
      debounceMs: 100,
      safetyTickMs: 300000,
    });

    await loop.start(projectRoot);
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.tick).toHaveBeenCalledTimes(1);
    expect(controller.tick).toHaveBeenNthCalledWith(1, { projectRoot, source: "polling" });

    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.tick).toHaveBeenCalledTimes(1);

    firstTick.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1000);
    expect(controller.tick).toHaveBeenCalledTimes(2);
    expect(controller.tick).toHaveBeenNthCalledWith(2, { projectRoot, source: "polling" });

    await loop.stop();
  });

  it("records service-loop failures for crash recovery audit", async () => {
    vi.useFakeTimers();
    const projectRoot = await makeTempProject();
    const autopilotStore = new AutopilotStore(enabledAutopilotConfig);
    const controller = {
      tick: vi.fn().mockRejectedValue(new Error("boom")),
    };
    const loop = new AutopilotServiceLoop(controller as any, autopilotStore, {
      mode: "polling",
      pollingIntervalMs: 1000,
      debounceMs: 100,
      safetyTickMs: 300000,
    });

    await loop.start(projectRoot);
    await vi.advanceTimersByTimeAsync(0);
    await loop.stop();

    const state = await autopilotStore.getState(projectRoot);
    expect(state.lastDecision?.summary).toContain("service loop error: boom");
    expect(state.lastDecision?.source).toBe("polling");
    expect(await autopilotStore.hasDecisionLog(projectRoot)).toBe(true);
  });

  it("runs a watcher-triggered tick after debounce without polling first", async () => {
    vi.useFakeTimers();
    const projectRoot = await makeTempProject();
    const autopilotStore = new AutopilotStore(enabledAutopilotConfig);
    const controller = {
      tick: vi.fn().mockResolvedValue({ ok: true, action: "observe", summary: "watcher" }),
    };
    const watcher = makeWatcher();
    const loop = new AutopilotServiceLoop(controller as any, autopilotStore, {
      mode: "watch",
      pollingIntervalMs: 1000,
      debounceMs: 100,
      safetyTickMs: 300000,
      watcher: watcher as any,
    });

    await loop.start(projectRoot);
    expect(watcher.start).toHaveBeenCalledTimes(1);
    expect(controller.tick).toHaveBeenCalledTimes(0);

    watcher.emitChange();
    await vi.advanceTimersByTimeAsync(99);
    expect(controller.tick).toHaveBeenCalledTimes(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(controller.tick).toHaveBeenCalledWith({ projectRoot, source: "watcher" });

    await loop.stop();
  });

  it("runs hybrid polling at the low-frequency polling interval", async () => {
    vi.useFakeTimers();
    const projectRoot = await makeTempProject();
    const autopilotStore = new AutopilotStore(enabledAutopilotConfig);
    const controller = {
      tick: vi.fn().mockResolvedValue({ ok: true, action: "observe", summary: "hybrid" }),
    };
    const watcher = makeWatcher();
    const loop = new AutopilotServiceLoop(controller as any, autopilotStore, {
      mode: "hybrid",
      pollingIntervalMs: 1000,
      debounceMs: 100,
      safetyTickMs: 300000,
      watcher: watcher as any,
    });

    await loop.start(projectRoot);
    await vi.advanceTimersByTimeAsync(4999);
    expect(controller.tick).toHaveBeenCalledTimes(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(controller.tick).toHaveBeenCalledWith({ projectRoot, source: "polling" });

    await loop.stop();
  });

  it("runs safety ticks in watch mode", async () => {
    vi.useFakeTimers();
    const projectRoot = await makeTempProject();
    const autopilotStore = new AutopilotStore(enabledAutopilotConfig);
    const controller = {
      tick: vi.fn().mockResolvedValue({ ok: true, action: "observe", summary: "safety" }),
    };
    const watcher = makeWatcher();
    const loop = new AutopilotServiceLoop(controller as any, autopilotStore, {
      mode: "watch",
      pollingIntervalMs: 1000,
      debounceMs: 100,
      safetyTickMs: 1000,
      watcher: watcher as any,
    });

    await loop.start(projectRoot);
    await vi.advanceTimersByTimeAsync(1000);

    expect(controller.tick).toHaveBeenCalledWith({ projectRoot, source: "safety" });

    await loop.stop();
  });

  it("logs watcher errors and triggers a safety tick", async () => {
    vi.useFakeTimers();
    const projectRoot = await makeTempProject();
    const autopilotStore = new AutopilotStore(enabledAutopilotConfig);
    const controller = {
      tick: vi.fn().mockResolvedValue({ ok: true, action: "observe", summary: "error safety" }),
    };
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const watcher = makeWatcher();
    const loop = new AutopilotServiceLoop(controller as any, autopilotStore, {
      mode: "watch",
      pollingIntervalMs: 1000,
      debounceMs: 100,
      safetyTickMs: 300000,
      watcher: watcher as any,
    }, logger);

    await loop.start(projectRoot);
    watcher.emitError(new Error("native watcher failed"), "/tmp/swarm");
    await vi.advanceTimersByTimeAsync(100);

    expect(logger.warn).toHaveBeenCalledWith(
      "[swarm-autopilot] watcher error scope=/tmp/swarm: native watcher failed",
    );
    expect(controller.tick).toHaveBeenCalledWith({ projectRoot, source: "safety" });

    await loop.stop();
  });

  it("queues one follow-up tick when watcher events arrive during an in-flight tick", async () => {
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
    const watcher = makeWatcher();
    const loop = new AutopilotServiceLoop(controller as any, autopilotStore, {
      mode: "watch",
      pollingIntervalMs: 1000,
      debounceMs: 100,
      safetyTickMs: 300000,
      watcher: watcher as any,
    });

    await loop.start(projectRoot);
    watcher.emitChange({ kind: "run", op: "update", paths: [], at: "2026-05-25T00:00:00.000Z", seq: 1 });
    await vi.advanceTimersByTimeAsync(100);
    expect(controller.tick).toHaveBeenCalledTimes(1);

    watcher.emitChange({ kind: "run", op: "update", paths: [], at: "2026-05-25T00:00:00.100Z", seq: 2 });
    watcher.emitChange({ kind: "workflow", op: "update", paths: [], at: "2026-05-25T00:00:00.101Z", seq: 3 });
    await vi.advanceTimersByTimeAsync(100);
    expect(controller.tick).toHaveBeenCalledTimes(1);

    firstTick.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.tick).toHaveBeenCalledTimes(2);
    expect(controller.tick).toHaveBeenNthCalledWith(2, { projectRoot, source: "watcher" });

    await loop.stop();
  });

  it("throws when watch modes start without a watcher", async () => {
    const projectRoot = await makeTempProject();
    const autopilotStore = new AutopilotStore(enabledAutopilotConfig);
    const controller = {
      tick: vi.fn().mockResolvedValue({ ok: true, action: "observe", summary: "missing" }),
    };
    const loop = new AutopilotServiceLoop(controller as any, autopilotStore, {
      mode: "watch",
      pollingIntervalMs: 1000,
      debounceMs: 100,
      safetyTickMs: 300000,
    });

    await expect(loop.start(projectRoot)).rejects.toThrow("autopilot watcherMode=watch requires a StateWatcher");
    await loop.stop();
  });

  it("stops watcher timers without running post-stop ticks", async () => {
    vi.useFakeTimers();
    const projectRoot = await makeTempProject();
    const autopilotStore = new AutopilotStore(enabledAutopilotConfig);
    const controller = {
      tick: vi.fn().mockResolvedValue({ ok: true, action: "observe", summary: "stopped" }),
    };
    const watcher = makeWatcher();
    const loop = new AutopilotServiceLoop(controller as any, autopilotStore, {
      mode: "watch",
      pollingIntervalMs: 1000,
      debounceMs: 100,
      safetyTickMs: 1000,
      watcher: watcher as any,
    });

    await loop.start(projectRoot);
    watcher.emitChange();
    await loop.stop();
    await vi.advanceTimersByTimeAsync(300000);
    watcher.emitChange();
    await vi.advanceTimersByTimeAsync(100);

    expect(watcher.stop).toHaveBeenCalledTimes(1);
    expect(controller.tick).toHaveBeenCalledTimes(0);
  });
});
