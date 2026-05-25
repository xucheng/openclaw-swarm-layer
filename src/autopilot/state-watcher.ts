import { EventEmitter } from "node:events";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { SwarmAutopilotWatcherConfig } from "../config.js";
import { ensureDir as defaultEnsureDir } from "../lib/json-file.js";
import type { SwarmPaths } from "../lib/paths.js";

export type StateWatcherEventKind = "workflow" | "autopilot" | "progress" | "run" | "spec" | "session";
export type StateWatcherOperation = "create" | "update" | "delete";

export type StateWatcherEvent = {
  kind: StateWatcherEventKind;
  op: StateWatcherOperation;
  paths: string[];
  at: string;
  seq: number;
};

export type RawStateWatcherEvent = {
  type: string;
  path: string;
};

type ParcelWatcherModule = {
  subscribe(
    dir: string,
    callback: (err: Error | null, events: RawStateWatcherEvent[]) => void,
    opts?: Record<string, unknown>,
  ): Promise<{ unsubscribe(): Promise<void> }>;
  getEventsSince?(dir: string, snapshotPath: string): Promise<RawStateWatcherEvent[]>;
  writeSnapshot?(dir: string, snapshotPath: string): Promise<unknown>;
};

type NodeWatcherHandle = {
  close(): void;
  on(event: "error", handler: (error: Error) => void): unknown;
};

type NodeWatch = (
  dir: string,
  options: { persistent: boolean },
  listener: (eventType: string, fileName: string | Buffer | null) => void,
) => NodeWatcherHandle;

type WatchSubscription = { unsubscribe(): Promise<void> };
type EnsureDir = (dirPath: string) => Promise<void>;

type StateWatcherDependencies = {
  ensureDir?: EnsureDir;
  loadParcelWatcher?: () => Promise<ParcelWatcherModule>;
  watch?: NodeWatch;
};

export class StateWatcher extends EventEmitter {
  private readonly ensureDir: EnsureDir;
  private readonly loadParcelWatcher: () => Promise<ParcelWatcherModule>;
  private readonly watch: NodeWatch;
  private subscriptions: WatchSubscription[] = [];
  private nodeWatchers: NodeWatcherHandle[] = [];
  private buffer = new Map<string, RawStateWatcherEvent>();
  private timer?: ReturnType<typeof setTimeout>;
  private seq = 0;
  private started = false;
  private generation = 0;
  private parcelActive = false;

  constructor(
    private readonly paths: SwarmPaths,
    private readonly config: Pick<
      SwarmAutopilotWatcherConfig,
      "debounceMs" | "safetyResyncMs" | "library" | "ignoreInitial" | "useFsEventsCoalescing"
    >,
    dependencies: StateWatcherDependencies = {},
  ) {
    super();
    this.ensureDir = dependencies.ensureDir ?? defaultEnsureDir;
    this.loadParcelWatcher = dependencies.loadParcelWatcher ?? (async () => (await import("@parcel/watcher")) as unknown as ParcelWatcherModule);
    this.watch = dependencies.watch ?? ((dir, options, listener) => fs.watch(dir, options, listener) as NodeWatcherHandle);
  }

  override on(event: "change", handler: (event: StateWatcherEvent) => void): this;
  override on(event: "error", handler: (error: Error, scope: string) => void): this;
  override on(event: string, handler: (...args: any[]) => void): this {
    return super.on(event, handler);
  }

  static classifyPath(paths: SwarmPaths, filePath: string): StateWatcherEventKind | undefined {
    const normalized = StateWatcher.normalizePath(filePath);
    if (StateWatcher.isInsideDir(normalized, paths.autopilotDir)) return undefined;
    if (normalized === StateWatcher.normalizePath(paths.workflowStatePath)) return "workflow";
    if (normalized === StateWatcher.normalizePath(paths.autopilotStatePath)) return "autopilot";
    if (normalized === StateWatcher.normalizePath(paths.progressFilePath)) return "progress";
    if (StateWatcher.isInsideDir(normalized, paths.runsDir) && normalized.endsWith(".json")) return "run";
    if (StateWatcher.isInsideDir(normalized, paths.specsDir) && normalized.endsWith(".json")) return "spec";
    if (StateWatcher.isInsideDir(normalized, paths.sessionsDir) && normalized.endsWith(".json")) return "session";
    return undefined;
  }

  lastSeq(): number {
    return this.seq;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const generation = ++this.generation;

    try {
      await this.ensureDir(this.paths.autopilotDir);
      if (!this.isRuntimeCallbackActive(generation)) return;
      await this.replaySnapshot(generation);
      if (!this.isRuntimeCallbackActive(generation)) return;

      if (this.config.library === "node") {
        await this.startNodeWatchers(generation);
        return;
      }

      try {
        await this.startParcelWatcher(generation);
      } catch (error) {
        if (!this.isRuntimeCallbackActive(generation)) return;
        if (this.config.library === "parcel") {
          throw error;
        }
        this.emitWatcherError(error instanceof Error ? error : new Error(String(error)), this.paths.swarmRoot);
        await this.startNodeWatchers(generation);
      }
    } catch (error) {
      if (!this.isGenerationCurrent(generation)) return;
      await this.rollbackFailedStart();
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    this.generation += 1;
    this.clearPending();
    await this.closeRuntimeResources({ writeParcelSnapshot: true });
  }

  pushRawEventsForTest(events: RawStateWatcherEvent[]): void {
    this.pushRawEvents(events);
  }

  private async rollbackFailedStart(): Promise<void> {
    this.started = false;
    this.generation += 1;
    this.clearPending();
    await this.closeRuntimeResources({ writeParcelSnapshot: false });
  }

  private async closeRuntimeResources(options: { writeParcelSnapshot: boolean }): Promise<void> {
    await Promise.all(this.subscriptions.map((subscription) => subscription.unsubscribe()));
    this.subscriptions = [];
    for (const watcher of this.nodeWatchers) {
      watcher.close();
    }
    this.nodeWatchers = [];
    if (this.parcelActive && options.writeParcelSnapshot) {
      await this.writeSnapshot();
    }
    this.parcelActive = false;
  }

  private async startParcelWatcher(generation: number): Promise<void> {
    const watcher = await this.loadParcelWatcher();
    if (!this.isRuntimeCallbackActive(generation)) return;
    const subscription = await watcher.subscribe(
      this.paths.swarmRoot,
      (err, events) => {
        if (!this.isRuntimeCallbackActive(generation)) return;
        if (err) {
          this.emitWatcherError(err, this.paths.swarmRoot);
          return;
        }
        this.pushRawEvents(events);
      },
      {
        ignore: [this.paths.autopilotDir],
        useFsEventsCoalescing: this.config.useFsEventsCoalescing,
      },
    );
    if (!this.isRuntimeCallbackActive(generation)) {
      await subscription.unsubscribe();
      return;
    }
    this.subscriptions.push(subscription);
    this.parcelActive = true;
  }

  private async startNodeWatchers(generation: number): Promise<void> {
    await Promise.all([
      this.ensureDir(this.paths.swarmRoot),
      this.ensureDir(this.paths.runsDir),
      this.ensureDir(this.paths.specsDir),
      this.ensureDir(this.paths.sessionsDir),
    ]);
    if (!this.isRuntimeCallbackActive(generation)) return;
    const dirs = [this.paths.swarmRoot, this.paths.runsDir, this.paths.specsDir, this.paths.sessionsDir];
    const opened: NodeWatcherHandle[] = [];
    try {
      for (const dir of dirs) {
        const watcher = this.watch(dir, { persistent: false }, (eventType, fileName) => {
          if (!this.isRuntimeCallbackActive(generation) || !fileName) return;
          this.pushRawEvents([{ type: eventType, path: path.join(dir, fileName.toString()) }]);
        });
        if (!this.isRuntimeCallbackActive(generation)) {
          watcher.close();
          return;
        }
        this.nodeWatchers.push(watcher);
        opened.push(watcher);
        watcher.on("error", (error) => {
          if (this.isRuntimeCallbackActive(generation)) {
            this.emitWatcherError(error, dir);
          }
        });
      }
    } catch (error) {
      for (const watcher of opened) {
        watcher.close();
      }
      this.nodeWatchers = this.nodeWatchers.filter((watcher) => !opened.includes(watcher));
      throw error;
    }
  }

  private async replaySnapshot(generation: number): Promise<void> {
    if (this.config.library === "node") return;
    if (!this.isRuntimeCallbackActive(generation)) return;
    if (!(await this.isSnapshotFresh())) return;
    if (!this.isRuntimeCallbackActive(generation)) return;
    try {
      const watcher = await this.loadParcelWatcher();
      if (!this.isRuntimeCallbackActive(generation)) return;
      const events = await watcher.getEventsSince?.(this.paths.swarmRoot, this.paths.autopilotWatcherSnapshotPath);
      if (!this.isRuntimeCallbackActive(generation)) return;
      if (events && events.length > 0) {
        this.pushRawEvents(events);
      }
    } catch (error) {
      this.emitWatcherError(error instanceof Error ? error : new Error(String(error)), this.paths.autopilotWatcherSnapshotPath);
    }
  }

  private async writeSnapshot(): Promise<void> {
    if (this.config.library === "node") return;
    try {
      const watcher = await this.loadParcelWatcher();
      await watcher.writeSnapshot?.(this.paths.swarmRoot, this.paths.autopilotWatcherSnapshotPath);
    } catch (error) {
      this.emitWatcherError(error instanceof Error ? error : new Error(String(error)), this.paths.autopilotWatcherSnapshotPath);
    }
  }

  private async isSnapshotFresh(): Promise<boolean> {
    try {
      const stat = await fsp.stat(this.paths.autopilotWatcherSnapshotPath);
      return Date.now() - stat.mtimeMs <= this.config.safetyResyncMs;
    } catch {
      return false;
    }
  }

  private pushRawEvents(events: RawStateWatcherEvent[]): void {
    for (const event of events) {
      if (this.shouldIgnore(event.path)) continue;
      const kind = StateWatcher.classifyPath(this.paths, event.path);
      if (!kind) continue;
      this.buffer.set(StateWatcher.normalizePath(event.path), event);
    }
    if (this.buffer.size === 0 || this.timer) return;
    this.timer = setTimeout(() => this.flush(), this.config.debounceMs);
  }

  private isRuntimeCallbackActive(generation: number): boolean {
    return this.started && this.isGenerationCurrent(generation);
  }

  private isGenerationCurrent(generation: number): boolean {
    return this.generation === generation;
  }

  private clearPending(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.buffer.clear();
  }

  private emitWatcherError(error: Error, scope: string): void {
    if (this.listenerCount("error") > 0) {
      this.emit("error", error, scope);
    }
  }

  private flush(): void {
    this.timer = undefined;
    const grouped = new Map<StateWatcherEventKind, RawStateWatcherEvent[]>();
    for (const event of this.buffer.values()) {
      const kind = StateWatcher.classifyPath(this.paths, event.path);
      if (!kind) continue;
      const existing = grouped.get(kind) ?? [];
      existing.push(event);
      grouped.set(kind, existing);
    }
    this.buffer.clear();

    for (const [kind, events] of grouped) {
      this.seq += 1;
      this.emit("change", {
        kind,
        op: this.coalesceOperation(events),
        paths: Array.from(new Set(events.map((event) => StateWatcher.normalizePath(event.path)))).sort(),
        at: new Date().toISOString(),
        seq: this.seq,
      } satisfies StateWatcherEvent);
    }
  }

  private coalesceOperation(events: RawStateWatcherEvent[]): StateWatcherOperation {
    const operations = new Set(events.map((event) => this.normalizeOperation(event.type)));
    if (operations.size === 1) {
      return Array.from(operations)[0];
    }
    return "update";
  }

  private normalizeOperation(type: string): StateWatcherOperation {
    if (type === "create" || type === "delete" || type === "update") {
      return type;
    }
    return "update";
  }

  private shouldIgnore(filePath: string): boolean {
    const normalized = StateWatcher.normalizePath(filePath);
    const basename = path.basename(normalized);
    return (
      StateWatcher.isInsideDir(normalized, this.paths.autopilotDir) ||
      basename.endsWith(".lock") ||
      basename.startsWith(".tmp") ||
      basename.startsWith(".~atomic-") ||
      basename.includes(".tmp-") ||
      basename.endsWith(".bak")
    );
  }

  private static isInsideDir(filePath: string, dirPath: string): boolean {
    const relative = path.relative(StateWatcher.normalizePath(dirPath), StateWatcher.normalizePath(filePath));
    return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
  }

  private static normalizePath(filePath: string): string {
    const resolved = path.resolve(filePath);
    try {
      return fs.realpathSync.native(resolved);
    } catch {
      try {
        return path.join(fs.realpathSync.native(path.dirname(resolved)), path.basename(resolved));
      } catch {
        return resolved;
      }
    }
  }
}
