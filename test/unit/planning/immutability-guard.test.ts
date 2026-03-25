import { validateTaskImmutability } from "../../../src/planning/immutability-guard.js";
import type { TaskNode } from "../../../src/types.js";

function makeTask(overrides: Partial<TaskNode> & { taskId: string }): TaskNode {
  return {
    specId: "s1",
    title: overrides.taskId,
    description: `Desc for ${overrides.taskId}`,
    kind: "coding",
    deps: [],
    status: "planned",
    workspace: { mode: "shared" },
    runner: { type: "manual" },
    review: { required: true },
    ...overrides,
  };
}

describe("validateTaskImmutability", () => {
  it("allows changing status", () => {
    const prev = [makeTask({ taskId: "t1", status: "planned" })];
    const next = [makeTask({ taskId: "t1", status: "running" })];
    const result = validateTaskImmutability(prev, next);
    expect(result.ok).toBe(true);
  });

  it("allows changing review.status", () => {
    const prev = [makeTask({ taskId: "t1", review: { required: true } })];
    const next = [makeTask({ taskId: "t1", review: { required: true, status: "approved" } })];
    const result = validateTaskImmutability(prev, next);
    expect(result.ok).toBe(true);
  });

  it("allows changing contract.criteria[].passes", () => {
    const prev = [makeTask({
      taskId: "t1",
      contract: {
        taskId: "t1",
        negotiatedAt: "2026-01-01T00:00:00Z",
        criteria: [{ id: "c1", description: "OK", kind: "manual_check", passes: undefined }],
        frozen: false,
      },
    })];
    const next = [makeTask({
      taskId: "t1",
      contract: {
        taskId: "t1",
        negotiatedAt: "2026-01-01T00:00:00Z",
        criteria: [{ id: "c1", description: "OK", kind: "manual_check", passes: true }],
        frozen: false,
      },
    })];
    const result = validateTaskImmutability(prev, next);
    expect(result.ok).toBe(true);
  });

  it("rejects changing title", () => {
    const prev = [makeTask({ taskId: "t1", title: "Original" })];
    const next = [makeTask({ taskId: "t1", title: "Modified" })];
    const result = validateTaskImmutability(prev, next);
    expect(result.ok).toBe(false);
    expect(result.violations).toContain("Immutable field changed: t1.title");
  });

  it("rejects changing description", () => {
    const prev = [makeTask({ taskId: "t1", description: "Original" })];
    const next = [makeTask({ taskId: "t1", description: "Modified" })];
    const result = validateTaskImmutability(prev, next);
    expect(result.ok).toBe(false);
    expect(result.violations).toContain("Immutable field changed: t1.description");
  });

  it("rejects changing deps", () => {
    const prev = [makeTask({ taskId: "t1", deps: [] })];
    const next = [makeTask({ taskId: "t1", deps: ["t0"] })];
    const result = validateTaskImmutability(prev, next);
    expect(result.ok).toBe(false);
    expect(result.violations).toContain("Immutable field changed: t1.deps");
  });

  it("rejects changing runner.type", () => {
    const prev = [makeTask({ taskId: "t1", runner: { type: "manual" } })];
    const next = [makeTask({ taskId: "t1", runner: { type: "acp" } })];
    const result = validateTaskImmutability(prev, next);
    expect(result.ok).toBe(false);
    expect(result.violations).toContain("Immutable field changed: t1.runner");
  });

  it("rejects removing a task", () => {
    const prev = [makeTask({ taskId: "t1" }), makeTask({ taskId: "t2" })];
    const next = [makeTask({ taskId: "t1" })];
    const result = validateTaskImmutability(prev, next);
    expect(result.ok).toBe(false);
    expect(result.violations).toContain("Task removed: t2");
  });

  it("allows adding a new task", () => {
    const prev = [makeTask({ taskId: "t1" })];
    const next = [makeTask({ taskId: "t1" }), makeTask({ taskId: "t2" })];
    const result = validateTaskImmutability(prev, next);
    expect(result.ok).toBe(true);
  });

  it("allows empty previous (first save)", () => {
    const prev: TaskNode[] = [];
    const next = [makeTask({ taskId: "t1" })];
    const result = validateTaskImmutability(prev, next);
    expect(result.ok).toBe(true);
  });
});
