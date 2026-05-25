import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { AutopilotStore } from "../../src/autopilot/autopilot-store.js";
import { AutopilotServiceLoop } from "../../src/autopilot/service-loop.js";
import { StateWatcher } from "../../src/autopilot/state-watcher.js";
import { StateCache } from "../../src/state/state-cache.js";
import { createEmptyWorkflowState, StateStore } from "../../src/state/state-store.js";
import { FsWorkflowReader } from "../../src/state/workflow-reader.js";
import type { RunRecord } from "../../src/types.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-fs-watcher-e2e-"));
}

function makeRun(projectRoot: string, runId: string): RunRecord {
  return {
    runId,
    taskId: "task-1",
    attempt: 1,
    status: "completed",
    runner: { type: "manual" },
    workspacePath: projectRoot,
    startedAt: new Date().toISOString(),
    artifacts: [],
  };
}

describe("e2e: autopilot filesystem watcher", () => {
  it("invokes one watcher tick after a run file is written", async () => {
    const projectRoot = await makeTempProject();
    const config = {
      autopilot: {
        enabled: true,
        watcherMode: "watch" as const,
        watcher: {
          debounceMs: 50,
          safetyTickMs: 300000,
          safetyResyncMs: 3600000,
          library: "node" as const,
          ignoreInitial: true,
          useFsEventsCoalescing: false,
        },
      },
    };
    const baseStore = new StateStore(config);
    await baseStore.initProject(projectRoot);
    const cache = new StateCache(
      new FsWorkflowReader(baseStore.config, (root) => createEmptyWorkflowState(root, baseStore.config)),
    );
    await cache.start(projectRoot);
    const watcher = new StateWatcher(baseStore.resolvePaths(projectRoot), baseStore.config.autopilot.watcher);
    watcher.on("change", (event) => void cache.applyChange(event));
    const stateStore = new StateStore(baseStore.config, undefined, cache);
    const autopilotStore = new AutopilotStore(stateStore.config);
    const controller = {
      tick: vi.fn().mockResolvedValue({ ok: true, action: "observe", summary: "watched" }),
    };
    const loop = new AutopilotServiceLoop(controller as any, autopilotStore, {
      mode: "watch",
      pollingIntervalMs: 1000,
      debounceMs: 50,
      safetyTickMs: 300000,
      watcher,
    });

    try {
      await loop.start(projectRoot);
      const started = performance.now();
      const newRun = makeRun(projectRoot, "run-watch-1");
      await baseStore.writeRun(projectRoot, newRun);

      await vi.waitFor(
        () => {
          expect(controller.tick).toHaveBeenCalledWith({ projectRoot, source: "watcher" });
        },
        { timeout: 1000, interval: 20 },
      );

      expect(performance.now() - started).toBeLessThan(1000);
      await expect(stateStore.loadRuns(projectRoot)).resolves.toContainEqual(newRun);
    } finally {
      await loop.stop();
    }
  });
});
