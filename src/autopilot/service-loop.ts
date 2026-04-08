import { randomUUID } from "node:crypto";
import type { OpenClawPluginServiceContext } from "openclaw/plugin-sdk/core";
import { AutopilotStore } from "./autopilot-store.js";
import { AutopilotController } from "./controller.js";

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

export class AutopilotServiceLoop {
  private timer?: TimerHandle;
  private projectRoot?: string;
  private running = false;
  private inFlight?: Promise<void>;

  constructor(
    private readonly controller: Pick<AutopilotController, "tick">,
    private readonly autopilotStore: AutopilotStore,
    private readonly intervalMs: number,
    private readonly logger?: Pick<OpenClawPluginServiceContext["logger"], "info" | "warn" | "error">,
    private readonly scheduler: AutopilotServiceLoopScheduler = defaultScheduler,
  ) {}

  start(projectRoot: string): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.projectRoot = projectRoot;
    this.scheduleNext(0);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      this.scheduler.clearTimeout(this.timer);
      this.timer = undefined;
    }
    await this.inFlight;
  }

  private scheduleNext(delayMs: number): void {
    if (!this.running || !this.projectRoot) {
      return;
    }
    this.timer = this.scheduler.setTimeout(() => {
      void this.runOnce();
    }, delayMs);
  }

  private async runOnce(): Promise<void> {
    if (!this.running || !this.projectRoot || this.inFlight) {
      return;
    }
    this.inFlight = this.executeTick(this.projectRoot)
      .catch(async (error) => {
        await this.recordFailure(this.projectRoot as string, error);
      })
      .finally(() => {
        this.inFlight = undefined;
        if (this.running) {
          this.scheduleNext(this.intervalMs);
        }
      });
    await this.inFlight;
  }

  private async executeTick(projectRoot: string): Promise<void> {
    const result = await this.controller.tick({ projectRoot });
    this.logger?.info?.(
      `[swarm-autopilot] tick action=${result.action} project=${projectRoot} summary=${result.summary}`,
    );
  }

  private async recordFailure(projectRoot: string, error: unknown): Promise<void> {
    const current = await this.autopilotStore.getState(projectRoot);
    const at = this.scheduler.now();
    const summary = error instanceof Error ? error.message : String(error);
    const nextState = {
      ...current,
      runtimeState: "idle" as const,
      lease: undefined,
      nextTickAt: new Date(new Date(at).getTime() + this.intervalMs).toISOString(),
      lastDecision: {
        at,
        action: "noop" as const,
        summary: `service loop error: ${summary}`,
        reason: "autopilot service loop tick failed",
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
}
