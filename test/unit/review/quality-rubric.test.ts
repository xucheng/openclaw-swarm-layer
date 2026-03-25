import { createDefaultRubric, validateRubric, scoreRubric, rubricToDecision } from "../../../src/review/quality-rubric.js";
import { applyRubricResult } from "../../../src/review/review-gate.js";
import type { TaskNode, WorkflowState } from "../../../src/types.js";

function makeTask(overrides: Partial<TaskNode> & { taskId: string }): TaskNode {
  return {
    specId: "s1",
    title: overrides.taskId,
    description: overrides.taskId,
    kind: "coding",
    deps: [],
    status: "review_required",
    workspace: { mode: "shared" },
    runner: { type: "manual" },
    review: { required: true, status: "pending" },
    ...overrides,
  };
}

function makeWorkflow(tasks: TaskNode[]): WorkflowState {
  return {
    version: 1,
    projectRoot: "/tmp/proj",
    lifecycle: "reviewing",
    tasks,
    reviewQueue: tasks.map((t) => t.taskId),
  };
}

describe("quality-rubric", () => {
  it("createDefaultRubric returns valid rubric", () => {
    const rubric = createDefaultRubric();
    const validation = validateRubric(rubric);
    expect(validation.ok).toBe(true);
    expect(rubric.dimensions).toHaveLength(4);
    expect(rubric.passingThreshold).toBe(6.0);
  });

  it("validateRubric catches weights not summing to 1.0", () => {
    const rubric = {
      dimensions: [
        { name: "a", weight: 0.5 },
        { name: "b", weight: 0.3 },
      ],
      passingThreshold: 6.0,
    };
    const result = validateRubric(rubric);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("sum to 1.0");
  });

  it("validateRubric catches negative weights", () => {
    const rubric = {
      dimensions: [
        { name: "a", weight: 1.5 },
        { name: "b", weight: -0.5 },
      ],
      passingThreshold: 6.0,
    };
    const result = validateRubric(rubric);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("negative"))).toBe(true);
  });

  it("scoreRubric computes correct weighted average", () => {
    const rubric = createDefaultRubric();
    const scores = [
      { dimension: "functionality", score: 8 },
      { dimension: "correctness", score: 7 },
      { dimension: "design", score: 6 },
      { dimension: "craft", score: 5 },
    ];
    const result = scoreRubric(rubric, scores);
    // 8*0.3 + 7*0.3 + 6*0.2 + 5*0.2 = 2.4 + 2.1 + 1.2 + 1.0 = 6.7
    expect(result.weightedTotal).toBe(6.7);
    expect(result.passing).toBe(true);
  });

  it("score below threshold is not passing", () => {
    const rubric = createDefaultRubric();
    const scores = [
      { dimension: "functionality", score: 4 },
      { dimension: "correctness", score: 4 },
      { dimension: "design", score: 4 },
      { dimension: "craft", score: 4 },
    ];
    const result = scoreRubric(rubric, scores);
    expect(result.weightedTotal).toBe(4.0);
    expect(result.passing).toBe(false);
  });

  it("rubricToDecision maps passing to approve, failing to reject", () => {
    expect(rubricToDecision({ scores: [], weightedTotal: 7, passing: true, evaluatedAt: "" })).toBe("approve");
    expect(rubricToDecision({ scores: [], weightedTotal: 3, passing: false, evaluatedAt: "" })).toBe("reject");
  });

  it("applyRubricResult transitions task status and stores rubricResult", () => {
    const task = makeTask({ taskId: "t1" });
    const workflow = makeWorkflow([task]);
    const rubric = createDefaultRubric();
    const scores = [
      { dimension: "functionality", score: 8 },
      { dimension: "correctness", score: 8 },
      { dimension: "design", score: 7 },
      { dimension: "craft", score: 7 },
    ];

    const result = applyRubricResult(workflow, "t1", rubric, scores);

    expect(result.rubricResult.passing).toBe(true);
    expect(result.task.status).toBe("done");
    expect(result.task.review.status).toBe("approved");
    expect(result.task.review.rubricResult).toBeDefined();
    expect(result.task.review.rubricResult!.weightedTotal).toBeGreaterThan(6);
  });

  it("applyRubricResult rejects when score is below threshold", () => {
    const task = makeTask({ taskId: "t1" });
    const workflow = makeWorkflow([task]);
    const rubric = createDefaultRubric();
    const scores = [
      { dimension: "functionality", score: 3 },
      { dimension: "correctness", score: 3 },
      { dimension: "design", score: 3 },
      { dimension: "craft", score: 3 },
    ];

    const result = applyRubricResult(workflow, "t1", rubric, scores);

    expect(result.rubricResult.passing).toBe(false);
    expect(result.task.status).toBe("blocked");
    expect(result.task.review.status).toBe("rejected");
  });
});
