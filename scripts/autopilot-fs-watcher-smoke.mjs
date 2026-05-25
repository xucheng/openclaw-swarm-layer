import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { AutopilotStore } from "../dist/src/autopilot/autopilot-store.js";
import { AutopilotServiceLoop } from "../dist/src/autopilot/service-loop.js";
import { StateWatcher } from "../dist/src/autopilot/state-watcher.js";
import { StateCache } from "../dist/src/state/state-cache.js";
import { createEmptyWorkflowState, StateStore } from "../dist/src/state/state-store.js";
import { FsWorkflowReader } from "../dist/src/state/workflow-reader.js";

const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-watcher-smoke-"));
const config = {
  autopilot: {
    enabled: true,
    watcherMode: "watch",
    watcher: {
      debounceMs: 50,
      safetyTickMs: 300000,
      safetyResyncMs: 3600000,
      library: process.env.SWARM_WATCHER_LIBRARY === "parcel" ? "parcel" : "node",
      ignoreInitial: true,
      useFsEventsCoalescing: false,
    },
  },
};

function makeRun(runId, taskId = runId) {
  return {
    runId,
    taskId,
    attempt: 1,
    status: "completed",
    runner: { type: "manual" },
    workspacePath: projectRoot,
    startedAt: "2026-05-25T00:00:00.000Z",
    artifacts: [],
  };
}

const writerStore = new StateStore(config);
await writerStore.initProject(projectRoot);

for (let i = 0; i < 1000; i += 1) {
  await writerStore.writeRun(projectRoot, makeRun(`history-${i}`, `task-${i}`));
}

const cache = new StateCache(
  new FsWorkflowReader(writerStore.config, (root) => createEmptyWorkflowState(root, writerStore.config)),
);
await cache.start(projectRoot);
const watcher = new StateWatcher(writerStore.resolvePaths(projectRoot), writerStore.config.autopilot.watcher);
watcher.on("change", (event) => void cache.applyChange(event));
const stateStore = new StateStore(writerStore.config, undefined, cache);
const autopilotStore = new AutopilotStore(stateStore.config);

let tickResolve;
const ticked = new Promise((resolve) => {
  tickResolve = resolve;
});
const controller = {
  async tick(input) {
    tickResolve(input);
    return { ok: true, action: "observe", summary: "smoke tick" };
  },
};

const loop = new AutopilotServiceLoop(controller, autopilotStore, {
  mode: "watch",
  pollingIntervalMs: 1000,
  debounceMs: 50,
  safetyTickMs: 300000,
  watcher,
});

let tickInput;
let latencyMs;
let runs;
try {
  await loop.start(projectRoot);
  const start = performance.now();
  await writerStore.writeRun(projectRoot, {
    ...makeRun("smoke-new-run", "task-smoke"),
    startedAt: new Date().toISOString(),
  });

  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("watcher tick timeout")), 1000);
  });
  tickInput = await Promise.race([ticked, timeout]);
  latencyMs = performance.now() - start;
  runs = await stateStore.loadRuns(projectRoot);
} finally {
  await loop.stop();
}

if (tickInput.source !== "watcher") {
  throw new Error(`expected watcher source, got ${tickInput.source}`);
}
if (!runs.some((run) => run.runId === "smoke-new-run")) {
  throw new Error("cache did not observe smoke-new-run");
}
if (latencyMs > 500) {
  throw new Error(`watcher latency ${Math.round(latencyMs)}ms exceeded 500ms`);
}

console.log(
  JSON.stringify({
    ok: true,
    projectRoot,
    watcherLibrary: writerStore.config.autopilot.watcher.library,
    latencyMs: Math.round(latencyMs),
    runCount: runs.length,
  }),
);
