import { checkConcurrencySlot } from "../../../src/runtime/concurrency-gate.js";
import type { TaskNode } from "../../../src/types.js";

function makeTask(overrides: Partial<TaskNode> = {}): TaskNode {
  return {
    taskId: `task-${Math.random().toString(36).slice(2, 6)}`,
    specId: "spec-1",
    title: "Test task",
    description: "",
    kind: "coding",
    deps: [],
    status: "ready",
    workspace: { mode: "shared" },
    runner: { type: "acp" },
    review: { required: false },
    ...overrides,
  };
}

describe("concurrency-gate", () => {
  it("admits when no tasks are running", () => {
    const tasks = [makeTask({ status: "ready" }), makeTask({ status: "ready" })];
    const result = checkConcurrencySlot(tasks, 6);

    expect(result.admitted).toBe(true);
    expect(result.activeCount).toBe(0);
    expect(result.maxConcurrent).toBe(6);
  });

  it("admits when under the threshold", () => {
    const tasks = [
      makeTask({ status: "running" }),
      makeTask({ status: "running" }),
      makeTask({ status: "ready" }),
    ];
    const result = checkConcurrencySlot(tasks, 6);

    expect(result.admitted).toBe(true);
    expect(result.activeCount).toBe(2);
  });

  it("rejects when at the threshold", () => {
    const tasks = Array.from({ length: 6 }, () => makeTask({ status: "running" }));
    const result = checkConcurrencySlot(tasks, 6);

    expect(result.admitted).toBe(false);
    expect(result.activeCount).toBe(6);
  });

  it("rejects when over the threshold", () => {
    const tasks = Array.from({ length: 8 }, () => makeTask({ status: "running" }));
    const result = checkConcurrencySlot(tasks, 6);

    expect(result.admitted).toBe(false);
    expect(result.activeCount).toBe(8);
  });

  it("only counts ACP runner tasks as active", () => {
    const tasks = [
      makeTask({ status: "running", runner: { type: "acp" } }),
      makeTask({ status: "running", runner: { type: "manual" } }),
      makeTask({ status: "running", runner: { type: "manual" } }),
    ];
    const result = checkConcurrencySlot(tasks, 2);

    expect(result.admitted).toBe(true);
    expect(result.activeCount).toBe(1);
  });

  it("counts queued tasks in queueDepth", () => {
    const tasks = [
      makeTask({ status: "running" }),
      makeTask({ status: "queued" }),
      makeTask({ status: "queued" }),
    ];
    const result = checkConcurrencySlot(tasks, 6);

    expect(result.queueDepth).toBe(2);
  });
});
