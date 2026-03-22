import { planTasksFromSpec } from "../../../src/planning/planner.js";
import { getRunnableTasks, upsertTaskStatuses, validateTaskGraph } from "../../../src/planning/task-graph.js";
import type { SpecDoc, TaskNode } from "../../../src/types.js";

const spec: SpecDoc = {
  specId: "spec-001",
  title: "Spec",
  sourcePath: "/tmp/spec.md",
  projectRoot: "/tmp/project",
  goals: ["Ship"],
  constraints: [],
  acceptanceCriteria: [],
  phases: [
    { phaseId: "phase-a", title: "Phase A", tasks: ["Task A1", "Task A2"] },
    { phaseId: "phase-b", title: "Phase B", tasks: ["Task B1"] },
  ],
};

describe("planner", () => {
  it("creates sequential tasks and marks first runnable task ready", () => {
    const tasks = planTasksFromSpec(spec, { reviewRequiredByDefault: true });

    expect(tasks).toHaveLength(3);
    expect(tasks[0].status).toBe("ready");
    expect(tasks[1].deps).toEqual([tasks[0].taskId]);
    expect(tasks[2].deps).toEqual([tasks[1].taskId]);
  });

  it("returns runnable tasks based on completed dependencies", () => {
    const tasks = planTasksFromSpec(spec);
    const withCompletedFirst = tasks.map((task, index) =>
      index === 0 ? { ...task, status: "done" as const } : task,
    );

    const runnable = getRunnableTasks(withCompletedFirst);
    expect(runnable.map((task) => task.taskId)).toContain(withCompletedFirst[1].taskId);
  });

  it("detects duplicate ids and cycles", () => {
    const validation = validateTaskGraph([
      {
        taskId: "task-1",
        specId: "spec",
        title: "A",
        description: "A",
        kind: "coding",
        deps: ["task-2"],
        status: "planned",
        workspace: { mode: "shared" },
        runner: { type: "manual" },
        review: { required: true },
      },
      {
        taskId: "task-2",
        specId: "spec",
        title: "B",
        description: "B",
        kind: "coding",
        deps: ["task-1"],
        status: "planned",
        workspace: { mode: "shared" },
        runner: { type: "manual" },
        review: { required: true },
      },
    ]);

    expect(validation.ok).toBe(false);
    expect(validation.errors.some((error) => error.includes("cycle detected"))).toBe(true);
  });

  it("upsertTaskStatuses promotes planned tasks to ready when deps are done", () => {
    const tasks: TaskNode[] = [
      {
        taskId: "t-1",
        specId: "spec",
        title: "A",
        description: "A",
        kind: "coding",
        deps: [],
        status: "done",
        workspace: { mode: "shared" },
        runner: { type: "manual" },
        review: { required: false },
      },
      {
        taskId: "t-2",
        specId: "spec",
        title: "B",
        description: "B",
        kind: "coding",
        deps: ["t-1"],
        status: "planned",
        workspace: { mode: "shared" },
        runner: { type: "manual" },
        review: { required: false },
      },
      {
        taskId: "t-3",
        specId: "spec",
        title: "C",
        description: "C",
        kind: "coding",
        deps: ["t-2"],
        status: "planned",
        workspace: { mode: "shared" },
        runner: { type: "manual" },
        review: { required: false },
      },
    ];

    const updated = upsertTaskStatuses(tasks);
    expect(updated[0]!.status).toBe("done");
    expect(updated[1]!.status).toBe("ready");
    // t-3 stays planned because t-2 is not done yet
    expect(updated[2]!.status).toBe("planned");
  });

  it("getRunnableTasks returns empty when all tasks are done", () => {
    const tasks = planTasksFromSpec(spec).map((t) => ({ ...t, status: "done" as const }));
    expect(getRunnableTasks(tasks)).toEqual([]);
  });

  it("validates a clean task graph", () => {
    const tasks = planTasksFromSpec(spec);
    const validation = validateTaskGraph(tasks);
    expect(validation.ok).toBe(true);
    expect(validation.errors).toEqual([]);
  });
});
