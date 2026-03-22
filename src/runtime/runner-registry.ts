import { AcpRunner } from "./acp-runner.js";
import { ManualRunner } from "./manual-runner.js";
import { UnsupportedOpenClawSessionAdapter } from "./openclaw-session-adapter.js";
import { UnsupportedOpenClawSubagentAdapter } from "./openclaw-subagent-adapter.js";
import { SubagentRunner } from "./subagent-runner.js";
import type { TaskRunner } from "./task-runner.js";

export class RunnerRegistry {
  private readonly runners = new Map<TaskRunner["kind"], TaskRunner>();

  constructor(runners?: TaskRunner[]) {
    const defaults = runners ?? [
      new ManualRunner(),
      new AcpRunner(undefined, new UnsupportedOpenClawSessionAdapter()),
      new SubagentRunner(new UnsupportedOpenClawSubagentAdapter()),
    ];
    defaults.forEach((runner) => {
      this.runners.set(runner.kind, runner);
    });
  }

  resolve(kind: TaskRunner["kind"]): TaskRunner {
    const runner = this.runners.get(kind);
    if (!runner) {
      throw new Error(`Unknown runner: ${kind}`);
    }
    return runner;
  }
}
