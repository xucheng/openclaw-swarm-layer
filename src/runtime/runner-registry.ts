import { AcpRunner } from "./acp-runner.js";
import { ManualRunner } from "./manual-runner.js";
import { UnsupportedOpenClawSessionAdapter } from "./openclaw-session-adapter.js";
import type { TaskRunner } from "./task-runner.js";

export class RunnerRegistry {
  private readonly runners = new Map<TaskRunner["kind"], TaskRunner>();

  constructor(runners?: TaskRunner[]) {
    const defaults = runners ?? [
      new ManualRunner(),
      new AcpRunner(undefined, new UnsupportedOpenClawSessionAdapter()),
    ];
    defaults.forEach((runner) => {
      this.runners.set(runner.kind, runner);
    });
  }

  has(kind: TaskRunner["kind"]): boolean {
    return this.runners.has(kind);
  }

  resolve(kind: TaskRunner["kind"]): TaskRunner {
    const runner = this.runners.get(kind);
    if (!runner) {
      throw new Error(`Unknown runner: ${kind}`);
    }
    return runner;
  }
}
