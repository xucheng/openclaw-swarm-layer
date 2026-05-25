import { randomUUID } from "node:crypto";
import type { OpenClawPluginServiceContext } from "openclaw/plugin-sdk/core";
import { AutopilotStore } from "./autopilot-store.js";
import { AutopilotController } from "./controller.js";
import type { AutopilotTickSource } from "./types.js";

type TimerHandle = ReturnType<typeof setTimeout>;

export type AutopilotServiceLoopScheduler = {
  setTimeout(fn: () => void, delayMs: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
  now(): string;
};

const defaultScheduler: AutopilotServiceLoopScheduler = {
  setTimeout: (fn, delayMs) => setTimeout(fn, delayMs),
  clearTimeout: (handle) => clearTimeout(handle),
  now: () => new Date().toISOString(),
};

const sourcePriority: Record<AutopilotTickSource, number> = {
  manual: 0,
  polling: 1,
  watcher: 2,
  safety: 3,
};

export type AutopilotServiceLoopMode = "polling" | "watch" | "hybrid";

export type AutopilotServiceLoopWatcher = {
  start(): Promise<void>;
  stop(): Promise<void>;
  on(event: "change", handler: () => void): unknown;
  on(event: "error", handler: (error: Error, scope: string) => void): unknown;
};

export type AutopilotServiceLoopOptions = {
  mode: AutopilotServiceLoopMode;
  pollingIntervalMs: number;
  debounceMs: number;
  safetyTickMs: number;
  watcher?: AutopilotServiceLoopWatcher;
};

export class AutopilotServiceLoop {
  private pollingTimer?: TimerHandle;
  private safetyTimer?: TimerHandle;
  private debounceTimer?: TimerHandle;
  private debounceSource?: AutopilotTickSource;
  private followUpSource?: AutopilotTickSource;
  private projectRoot?: string;
  private running = false;
  private inFlight?: Promise<void>;
  private watcherListenersAttached = false;

  constructor(
    private readonly controller: Pick<AutopilotController, "tick">,
    private readonly autopilotStore: AutopilotStore,
    private readonly options: AutopilotServiceLoopOptions,
    private readonly logger?: Pick<OpenClawPluginServiceContext["logger"], "info" | "warn" | "error">,
    private readonly scheduler: AutopilotServiceLoopScheduler = defaultScheduler,
  ) {}

  async start(projectRoot: string): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    this.projectRoot = projectRoot;
    try {
      if (this.options.mode === "polling") {
        this.schedulePolling(0);
        return;
      }

      if (!this.options.watcher) {
        throw new Error(`autopilot watcherMode=${this.options.mode} requires a StateWatcher`);
      }

      this.attachWatcherListeners(this.options.watcher);
      await this.options.watcher.start();
      if (!this.running) {
        return;
      }
      this.scheduleSafety(this.options.safetyTickMs);
      if (this.options.mode === "hybrid") {
        this.schedulePolling(this.hybridPollingIntervalMs());
      }
    } catch (error) {
      this.running = false;
      this.projectRoot = undefined;
      this.clearTimers();
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    this.followUpSource = undefined;
    this.clearTimers();
    await this.options.watcher?.stop();
    await this.inFlight;
    this.projectRoot = undefined;
  }

  private attachWatcherListeners(watcher: AutopilotServiceLoopWatcher): void {
    if (this.watcherListenersAttached) {
      return;
    }
    watcher.on("change", () => this.trigger("watcher"));
    watcher.on("error", (error, scope) => {
      this.logger?.warn?.(`[swarm-autopilot] watcher error scope=${scope}: ${error.message}`);
      this.trigger("safety");
    });
    this.watcherListenersAttached = true;
  }

  private schedulePolling(delayMs: number): void {
    if (!this.running || !this.projectRoot) {
      return;
    }
    this.pollingTimer = this.scheduler.setTimeout(() => {
      this.pollingTimer = undefined;
      void this.runOnce("polling").finally(() => {
        if (this.running && (this.options.mode === "polling" || this.options.mode === "hybrid")) {
          this.schedulePolling(this.options.mode === "hybrid" ? this.hybridPollingIntervalMs() : this.options.pollingIntervalMs);
        }
      });
    }, delayMs);
  }

  private scheduleSafety(delayMs: number): void {
    if (!this.running || !this.projectRoot || this.options.mode === "polling") {
      return;
    }
    this.safetyTimer = this.scheduler.setTimeout(() => {
      this.safetyTimer = undefined;
      void this.runOnce("safety").finally(() => {
        if (this.running && this.options.mode !== "polling") {
          this.scheduleSafety(this.options.safetyTickMs);
        }
      });
    }, delayMs);
  }

  private trigger(source: AutopilotTickSource): void {
    if (!this.running || !this.projectRoot) {
      return;
    }
    this.debounceSource = this.pickHigherPrioritySource(this.debounceSource, source);
    if (this.debounceTimer) {
      return;
    }
    this.debounceTimer = this.scheduler.setTimeout(() => {
      const debouncedSource = this.debounceSource ?? source;
      this.debounceTimer = undefined;
      this.debounceSource = undefined;
      void this.runOnce(debouncedSource);
    }, this.options.debounceMs);
  }

  private async runOnce(source: AutopilotTickSource): Promise<void> {
    if (!this.running || !this.projectRoot) {
      return;
    }
    if (this.inFlight) {
      this.followUpSource = this.pickHigherPrioritySource(this.followUpSource, source);
      await this.inFlight;
      return;
    }

    const projectRoot = this.projectRoot;
    let chain: Promise<void>;
    chain = this.runTickChain(projectRoot, source).finally(() => {
      if (this.inFlight === chain) {
        this.inFlight = undefined;
      }
    });
    this.inFlight = chain;
    await chain;
  }

  private async runTickChain(projectRoot: string, initialSource: AutopilotTickSource): Promise<void> {
    let source: AutopilotTickSource | undefined = initialSource;
    while (this.running && source) {
      const activeSource = source;
      source = undefined;
      try {
        await this.executeTick(projectRoot, activeSource);
      } catch (error) {
        await this.recordFailure(projectRoot, error, activeSource);
      }
      if (!this.running) {
        this.followUpSource = undefined;
        return;
      }
      source = this.followUpSource;
      this.followUpSource = undefined;
    }
  }

  private async executeTick(projectRoot: string, source: AutopilotTickSource): Promise<void> {
    const result = await this.controller.tick({ projectRoot, source });
    this.logger?.info?.(
      `[swarm-autopilot] tick source=${source} action=${result.action} project=${projectRoot} summary=${result.summary}`,
    );
  }

  private async recordFailure(projectRoot: string, error: unknown, source: AutopilotTickSource): Promise<void> {
    const current = await this.autopilotStore.getState(projectRoot);
    const at = this.scheduler.now();
    const summary = error instanceof Error ? error.message : String(error);
    const nextState = {
      ...current,
      runtimeState: "idle" as const,
      lease: undefined,
      nextTickAt: new Date(new Date(at).getTime() + this.failureRetryDelayMs(source)).toISOString(),
      lastDecision: {
        at,
        action: "noop" as const,
        summary: `service loop error: ${summary}`,
        reason: "autopilot service loop tick failed",
        source,
        targets: [],
      },
    };
    await this.autopilotStore.saveState(projectRoot, nextState);
    await this.autopilotStore.appendDecision(projectRoot, {
      tickId: `service-error-${randomUUID()}`,
      ...nextState.lastDecision,
    });
    this.logger?.error?.(`[swarm-autopilot] tick failed project=${projectRoot}: ${summary}`);
  }

  private clearTimers(): void {
    for (const timer of [this.pollingTimer, this.safetyTimer, this.debounceTimer]) {
      if (timer) {
        this.scheduler.clearTimeout(timer);
      }
    }
    this.pollingTimer = undefined;
    this.safetyTimer = undefined;
    this.debounceTimer = undefined;
    this.debounceSource = undefined;
  }

  private hybridPollingIntervalMs(): number {
    return this.options.pollingIntervalMs * 5;
  }

  private failureRetryDelayMs(source: AutopilotTickSource): number {
    if (source === "polling") {
      return this.options.mode === "hybrid" ? this.hybridPollingIntervalMs() : this.options.pollingIntervalMs;
    }
    if (source === "watcher" || source === "safety") {
      return this.options.safetyTickMs;
    }
    return this.options.pollingIntervalMs;
  }

  private pickHigherPrioritySource(
    current: AutopilotTickSource | undefined,
    next: AutopilotTickSource,
  ): AutopilotTickSource {
    if (!current) {
      return next;
    }
    return sourcePriority[next] > sourcePriority[current] ? next : current;
  }
}
