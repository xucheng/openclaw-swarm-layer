import { injectEvaluatorTasks, isEvaluatorTask } from "../../../src/planning/evaluator-injection.js";
import { validateTaskGraph } from "../../../src/planning/task-graph.js";
import type { SwarmPluginConfig } from "../../../src/config.js";
import type { TaskNode } from "../../../src/types.js";

function makeTask(overrides: Partial<TaskNode> & { taskId: string }): TaskNode {
  return {
    specId: "s1",
    title: overrides.taskId,
    description: overrides.taskId,
    kind: "coding",
    deps: [],
    status: "planned",
    workspace: { mode: "shared" },
    runner: { type: "manual" },
    review: { required: true },
    ...overrides,
  };
}

const enabledConfig: Pick<SwarmPluginConfig, "evaluator"> = {
  evaluator: { enabled: true, autoInjectAfter: ["coding"] },
};

const disabledConfig: Pick<SwarmPluginConfig, "evaluator"> = {
  evaluator: { enabled: false, autoInjectAfter: ["coding"] },
};

describe("evaluator-injection", () => {
  it("injects evaluator after coding task with correct deps", () => {
    const tasks = [makeTask({ taskId: "t1", kind: "coding" })];
    const result = injectEvaluatorTasks(tasks, enabledConfig);

    expect(result).toHaveLength(2);
    expect(result[1].taskId).toBe("t1-eval");
    expect(result[1].kind).toBe("evaluate");
    expect(result[1].deps).toEqual(["t1"]);
    expect(result[1].review.required).toBe(false);
  });

  it("does not inject after non-matching task kind", () => {
    const tasks = [makeTask({ taskId: "t1", kind: "research" })];
    const result = injectEvaluatorTasks(tasks, enabledConfig);

    expect(result).toHaveLength(1);
  });

  it("produces valid task graph after injection", () => {
    const tasks = [
      makeTask({ taskId: "t1", kind: "coding" }),
      makeTask({ taskId: "t2", kind: "coding", deps: ["t1"] }),
    ];
    const result = injectEvaluatorTasks(tasks, enabledConfig);

    const validation = validateTaskGraph(result);
    expect(validation.ok).toBe(true);
  });

  it("copies contract from source task", () => {
    const contract = {
      taskId: "t1",
      negotiatedAt: "2026-01-01T00:00:00Z",
      criteria: [{ id: "c1", description: "OK", kind: "manual_check" as const }],
      frozen: false,
    };
    const tasks = [makeTask({ taskId: "t1", kind: "coding", contract })];
    const result = injectEvaluatorTasks(tasks, enabledConfig);

    expect(result[1].contract).toBeDefined();
    expect(result[1].contract!.criteria).toHaveLength(1);
  });

  it("isEvaluatorTask returns true for evaluate kind", () => {
    expect(isEvaluatorTask(makeTask({ taskId: "t1", kind: "evaluate" }))).toBe(true);
    expect(isEvaluatorTask(makeTask({ taskId: "t1", kind: "coding" }))).toBe(false);
  });

  it("does not inject when disabled", () => {
    const tasks = [makeTask({ taskId: "t1", kind: "coding" })];
    const result = injectEvaluatorTasks(tasks, disabledConfig);

    expect(result).toHaveLength(1);
  });

  it("handles multiple coding tasks with correct dep chain", () => {
    const tasks = [
      makeTask({ taskId: "t1", kind: "coding" }),
      makeTask({ taskId: "t2", kind: "coding", deps: ["t1"] }),
      makeTask({ taskId: "t3", kind: "coding", deps: ["t2"] }),
    ];
    const result = injectEvaluatorTasks(tasks, enabledConfig);

    // t1, t1-eval, t2, t2-eval, t3, t3-eval
    expect(result).toHaveLength(6);

    // t2 should now depend on t1-eval instead of t1
    const t2 = result.find((t) => t.taskId === "t2")!;
    expect(t2.deps).toEqual(["t1-eval"]);

    // t3 should now depend on t2-eval instead of t2
    const t3 = result.find((t) => t.taskId === "t3")!;
    expect(t3.deps).toEqual(["t2-eval"]);

    // Graph should still be valid
    const validation = validateTaskGraph(result);
    expect(validation.ok).toBe(true);
  });

  it("evaluator description includes contract criteria", () => {
    const contract = {
      taskId: "t1",
      negotiatedAt: "2026-01-01T00:00:00Z",
      criteria: [{ id: "c1", description: "Tests pass", kind: "test_passes" as const }],
      frozen: false,
    };
    const tasks = [makeTask({ taskId: "t1", kind: "coding", title: "Build feature", contract })];
    const result = injectEvaluatorTasks(tasks, enabledConfig);

    expect(result[1].description).toContain("Tests pass");
    expect(result[1].description).toContain("Build feature");
  });
});
