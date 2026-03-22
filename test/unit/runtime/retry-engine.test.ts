import { appendRetryHistory, isRetryableStatus, shouldRetry } from "../../../src/runtime/retry-engine.js";
import type { RunRecord, TaskNode } from "../../../src/types.js";

function makeTask(retryPolicy?: TaskNode["runner"]["retryPolicy"]): TaskNode {
  return {
    taskId: "task-retry",
    specId: "spec-1",
    title: "Retry Task",
    description: "test",
    kind: "coding",
    deps: [],
    status: "failed",
    workspace: { mode: "shared" },
    runner: { type: "acp", retryPolicy },
    review: { required: true },
  };
}

function makeRun(status: RunRecord["status"], retryHistory?: RunRecord["retryHistory"]): RunRecord {
  return {
    runId: "run-1",
    taskId: "task-retry",
    attempt: (retryHistory?.length ?? 0) + 1,
    status,
    runner: { type: "acp" },
    workspacePath: "/tmp/p",
    startedAt: "2026-03-22T00:00:00.000Z",
    artifacts: [],
    retryHistory,
  };
}

describe("retry engine", () => {
  it("identifies retryable statuses from policy", () => {
    const policy = { maxAttempts: 3, backoffSeconds: 5, retryOn: ["failed" as const, "timed_out" as const] };
    expect(isRetryableStatus("failed", policy)).toBe(true);
    expect(isRetryableStatus("timed_out", policy)).toBe(true);
    expect(isRetryableStatus("cancelled", policy)).toBe(false);
    expect(isRetryableStatus("completed", policy)).toBe(false);
  });

  it("decides to retry when policy allows and attempts remain", () => {
    const task = makeTask({ maxAttempts: 3, backoffSeconds: 5, retryOn: ["failed"] });
    const run = makeRun("failed");
    const decision = shouldRetry(task, run);
    expect(decision.retry).toBe(true);
    expect(decision.reason).toContain("attempt 2 of 3");
  });

  it("decides not to retry when no policy configured", () => {
    const task = makeTask();
    const run = makeRun("failed");
    const decision = shouldRetry(task, run);
    expect(decision.retry).toBe(false);
    expect(decision.reason).toContain("no retry policy");
  });

  it("decides not to retry when status is not retryable", () => {
    const task = makeTask({ maxAttempts: 3, backoffSeconds: 5, retryOn: ["timed_out"] });
    const run = makeRun("cancelled");
    const decision = shouldRetry(task, run);
    expect(decision.retry).toBe(false);
    expect(decision.reason).toContain("not retryable");
  });

  it("decides not to retry when attempts exhausted", () => {
    const task = makeTask({ maxAttempts: 2, backoffSeconds: 5, retryOn: ["failed"] });
    const run = makeRun("failed", [
      { attempt: 1, runId: "run-0", status: "failed", at: "2026-03-22T00:00:00.000Z" },
    ]);
    const decision = shouldRetry(task, run);
    expect(decision.retry).toBe(false);
    expect(decision.reason).toContain("exhausted 2 attempts");
  });

  it("appends retry history entry", () => {
    const run = makeRun("failed", [
      { attempt: 1, runId: "run-0", status: "failed", at: "2026-03-22T00:00:00.000Z" },
    ]);
    const history = appendRetryHistory(run);
    expect(history).toHaveLength(2);
    expect(history[1]!.runId).toBe("run-1");
    expect(history[1]!.status).toBe("failed");
  });
});
