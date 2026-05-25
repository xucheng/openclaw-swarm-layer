import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { StateWatcher, type RawStateWatcherEvent, type StateWatcherEvent } from "../../../src/autopilot/state-watcher.js";
import { resolveSwarmPaths } from "../../../src/lib/paths.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-state-watcher-"));
}

function createWatcherConfig(overrides: Partial<ConstructorParameters<typeof StateWatcher>[1]> = {}): ConstructorParameters<typeof StateWatcher>[1] {
  return {
    debounceMs: 100,
    safetyResyncMs: 3600000,
    library: "node",
    ignoreInitial: true,
    useFsEventsCoalescing: false,
    ...overrides,
  };
}

describe("StateWatcher", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("maps raw state paths to normalized event kinds", () => {
    const paths = resolveSwarmPaths("/tmp/project", {});

    expect(paths.autopilotDir).toBe(path.join(paths.swarmRoot, ".autopilot"));
    expect(paths.autopilotWatcherSnapshotPath).toBe(path.join(paths.autopilotDir, "watcher.snapshot"));
    expect(StateWatcher.classifyPath(paths, paths.workflowStatePath)).toBe("workflow");
    expect(StateWatcher.classifyPath(paths, paths.autopilotStatePath)).toBe("autopilot");
    expect(StateWatcher.classifyPath(paths, paths.progressFilePath)).toBe("progress");
    expect(StateWatcher.classifyPath(paths, path.join(paths.runsDir, "run-1.json"))).toBe("run");
    expect(StateWatcher.classifyPath(paths, path.join(paths.specsDir, "spec-1.json"))).toBe("spec");
    expect(StateWatcher.classifyPath(paths, path.join(paths.sessionsDir, "session-1.json"))).toBe("session");
    expect(StateWatcher.classifyPath(paths, path.join(paths.logsDir, "autopilot-decisions.ndjson"))).toBeUndefined();
    expect(StateWatcher.classifyPath(paths, path.join(paths.runsDir, "run-1.txt"))).toBeUndefined();
    expect(StateWatcher.classifyPath(paths, path.join(paths.autopilotDir, "watcher.snapshot"))).toBeUndefined();
  });

  it("debounces raw events into coalesced normalized changes", async () => {
    vi.useFakeTimers();
    const paths = resolveSwarmPaths("/tmp/project", {});
    const watcher = new StateWatcher(paths, createWatcherConfig());
    const changes: StateWatcherEvent[] = [];
    watcher.on("change", (event) => changes.push(event));

    const runPath = path.join(paths.runsDir, "run-1.json");
    const specPath = path.join(paths.specsDir, "spec-1.json");
    watcher.pushRawEventsForTest([
      { type: "update", path: runPath },
      { type: "update", path: specPath },
    ]);
    watcher.pushRawEventsForTest([{ type: "update", path: runPath }]);
    await vi.advanceTimersByTimeAsync(100);

    expect(changes).toHaveLength(2);
    expect(changes[0]).toMatchObject({ kind: "run", op: "update", paths: [path.resolve(runPath)], seq: 1 });
    expect(changes[1]).toMatchObject({ kind: "spec", op: "update", paths: [path.resolve(specPath)], seq: 2 });
    expect(watcher.lastSeq()).toBe(2);
  });

  it("increments sequence numbers across debounce windows", async () => {
    vi.useFakeTimers();
    const paths = resolveSwarmPaths("/tmp/project", {});
    const watcher = new StateWatcher(paths, createWatcherConfig({ debounceMs: 25 }));
    const changes: StateWatcherEvent[] = [];
    watcher.on("change", (event) => changes.push(event));

    watcher.pushRawEventsForTest([{ type: "create", path: path.join(paths.runsDir, "run-1.json") }]);
    await vi.advanceTimersByTimeAsync(25);
    watcher.pushRawEventsForTest([{ type: "delete", path: path.join(paths.runsDir, "run-2.json") }]);
    await vi.advanceTimersByTimeAsync(25);

    expect(changes.map((event) => event.seq)).toEqual([1, 2]);
    expect(changes.map((event) => event.op)).toEqual(["create", "delete"]);
    expect(watcher.lastSeq()).toBe(2);
  });

  it("ignores internal, atomic, lock, backup, and unrelated paths", async () => {
    vi.useFakeTimers();
    const paths = resolveSwarmPaths("/tmp/project", {});
    const watcher = new StateWatcher(paths, createWatcherConfig({ debounceMs: 10 }));
    const changes: StateWatcherEvent[] = [];
    watcher.on("change", (event) => changes.push(event));

    watcher.pushRawEventsForTest([
      { type: "update", path: path.join(paths.autopilotDir, "watcher.snapshot") },
      { type: "update", path: `${paths.workflowStatePath}.lock` },
      { type: "update", path: path.join(paths.runsDir, ".tmp-run.json") },
      { type: "update", path: path.join(paths.runsDir, ".~atomic-run.json") },
      { type: "update", path: path.join(paths.runsDir, "run-1.json.bak") },
      { type: "update", path: path.join(paths.logsDir, "autopilot-decisions.ndjson") },
    ]);
    await vi.advanceTimersByTimeAsync(10);

    expect(changes).toEqual([]);
    expect(watcher.lastSeq()).toBe(0);
  });

  it("clears pending debounce and closes node watchers on stop", async () => {
    vi.useFakeTimers();
    const projectRoot = await makeTempProject();
    const paths = resolveSwarmPaths(projectRoot, {});
    const close = vi.fn();
    const watch = vi.fn(() => Object.assign(new EventEmitter(), { close }));
    const watcher = new StateWatcher(paths, createWatcherConfig({ debounceMs: 50 }), { watch });
    const changes: StateWatcherEvent[] = [];
    watcher.on("change", (event) => changes.push(event));

    await watcher.start();
    expect(watch).toHaveBeenCalledTimes(4);

    watcher.pushRawEventsForTest([{ type: "update", path: path.join(paths.runsDir, "run-1.json") }]);
    await watcher.stop();
    await vi.advanceTimersByTimeAsync(50);

    expect(changes).toEqual([]);
    expect(close).toHaveBeenCalledTimes(4);
  });

  it("ignores runtime callbacks that arrive after stop", async () => {
    vi.useFakeTimers();
    const projectRoot = await makeTempProject();
    const paths = resolveSwarmPaths(projectRoot, {});
    const callbacks: Array<(eventType: string, fileName: string | Buffer | null) => void> = [];
    const close = vi.fn();
    const watch = vi.fn((_dir: string, _options: { persistent: boolean }, listener: (eventType: string, fileName: string | Buffer | null) => void) => {
      callbacks.push(listener);
      return Object.assign(new EventEmitter(), { close });
    });
    const watcher = new StateWatcher(paths, createWatcherConfig({ debounceMs: 25 }), { watch });
    const changes: StateWatcherEvent[] = [];
    watcher.on("change", (event) => changes.push(event));

    await watcher.start();
    await watcher.stop();
    callbacks[1]("change", "run-1.json");
    await vi.advanceTimersByTimeAsync(25);

    expect(changes).toEqual([]);
    expect(watcher.lastSeq()).toBe(0);
    expect(close).toHaveBeenCalledTimes(4);
  });

  it("rolls back partial node watcher startup and allows retry", async () => {
    const paths = resolveSwarmPaths(await makeTempProject(), {});
    const startupError = new Error("watch failed");
    const closes: Array<ReturnType<typeof vi.fn>> = [];
    let failSecondWatcher = true;
    let callInAttempt = 0;
    const watch = vi.fn(() => {
      callInAttempt += 1;
      if (failSecondWatcher && callInAttempt === 2) {
        throw startupError;
      }
      const close = vi.fn();
      closes.push(close);
      return Object.assign(new EventEmitter(), { close });
    });
    const watcher = new StateWatcher(paths, createWatcherConfig(), { watch });

    await expect(watcher.start()).rejects.toThrow(startupError);
    expect(closes).toHaveLength(1);
    expect(closes[0]).toHaveBeenCalledTimes(1);

    failSecondWatcher = false;
    callInAttempt = 0;
    await expect(watcher.start()).resolves.toBeUndefined();
    await watcher.stop();

    expect(watch).toHaveBeenCalledTimes(6);
    expect(closes).toHaveLength(5);
    expect(closes.slice(1)).toHaveLength(4);
    expect(closes.slice(1).every((close) => close.mock.calls.length === 1)).toBe(true);
  });

  it("falls back to node watchers when parcel startup fails in auto mode", async () => {
    const projectRoot = await makeTempProject();
    const paths = resolveSwarmPaths(projectRoot, {});
    const close = vi.fn();
    const watch = vi.fn(() => Object.assign(new EventEmitter(), { close }));
    const parcelError = new Error("parcel unavailable");
    const watcher = new StateWatcher(paths, createWatcherConfig({ library: "auto" }), {
      loadParcelWatcher: async () => ({
        subscribe: async () => {
          throw parcelError;
        },
      }),
      watch,
    });
    const errors: Array<{ error: Error; scope: string }> = [];
    watcher.on("error", (error, scope) => errors.push({ error, scope }));

    await watcher.start();
    await watcher.stop();

    expect(errors).toEqual([{ error: parcelError, scope: paths.swarmRoot }]);
    expect(watch).toHaveBeenCalledTimes(4);
    expect(close).toHaveBeenCalledTimes(4);
  });

  it("falls back in auto mode even when no error listener is attached", async () => {
    const paths = resolveSwarmPaths(await makeTempProject(), {});
    const close = vi.fn();
    const watch = vi.fn(() => Object.assign(new EventEmitter(), { close }));
    const watcher = new StateWatcher(paths, createWatcherConfig({ library: "auto" }), {
      loadParcelWatcher: async () => ({
        subscribe: async () => {
          throw new Error("parcel unavailable");
        },
      }),
      watch,
    });

    await expect(watcher.start()).resolves.toBeUndefined();
    await watcher.stop();

    expect(watch).toHaveBeenCalledTimes(4);
    expect(close).toHaveBeenCalledTimes(4);
  });

  it("replays fresh parcel snapshots and writes a snapshot on stop", async () => {
    vi.useFakeTimers();
    const paths = resolveSwarmPaths(await makeTempProject(), {});
    await fs.mkdir(paths.autopilotDir, { recursive: true });
    await fs.writeFile(paths.autopilotWatcherSnapshotPath, "snapshot", "utf8");
    const unsubscribe = vi.fn(async () => undefined);
    const getEventsSince = vi.fn(async () => [{ type: "update", path: paths.workflowStatePath }]);
    const writeSnapshot = vi.fn(async () => "snapshot");
    const watcher = new StateWatcher(paths, createWatcherConfig({ library: "parcel", debounceMs: 10 }), {
      loadParcelWatcher: async () => ({
        subscribe: async () => ({ unsubscribe }),
        getEventsSince,
        writeSnapshot,
      }),
    });
    const changes: StateWatcherEvent[] = [];
    watcher.on("change", (event) => changes.push(event));

    await watcher.start();
    await vi.advanceTimersByTimeAsync(10);
    await watcher.stop();

    expect(getEventsSince).toHaveBeenCalledWith(paths.swarmRoot, paths.autopilotWatcherSnapshotPath);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "workflow", op: "update", paths: [paths.workflowStatePath], seq: 1 });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(writeSnapshot).toHaveBeenCalledWith(paths.swarmRoot, paths.autopilotWatcherSnapshotPath);
  });

  it("throws parcel startup failures when parcel mode is explicit", async () => {
    const paths = resolveSwarmPaths(await makeTempProject(), {});
    const parcelError = new Error("parcel unavailable");
    const watcher = new StateWatcher(paths, createWatcherConfig({ library: "parcel" }), {
      loadParcelWatcher: async () => ({
        subscribe: async () => {
          throw parcelError;
        },
      }),
    });

    await expect(watcher.start()).rejects.toThrow(parcelError);
  });
});
