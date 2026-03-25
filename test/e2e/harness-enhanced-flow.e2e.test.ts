import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmInit } from "../../src/cli/swarm-init.js";
import { runSwarmPlan } from "../../src/cli/swarm-plan.js";
import { runSwarmReview } from "../../src/cli/swarm-review.js";
import { runSwarmRun } from "../../src/cli/swarm-run.js";
import { runSwarmStatus } from "../../src/cli/swarm-status.js";
import { defaultAssumptions } from "../../src/planning/assumption-metadata.js";
import { createDefaultRubric } from "../../src/review/quality-rubric.js";
import { applyRubricResult } from "../../src/review/review-gate.js";
import { runBootstrap } from "../../src/session/session-bootstrap.js";
import { StateStore } from "../../src/state/state-store.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-harness-e2e-"));
}

const SPEC_WITH_CRITERIA = `# Harness E2E Spec

## Goals
- Validate enhanced harness features

## Acceptance Criteria
- All tasks pass
- Progress file generated

## Phases
### Setup
- Initialize project structure
### Build
- Implement core feature
`;

describe("e2e: enhanced harness flow", () => {
  it("full flow: plan with contract → evaluator injection → run → rubric review → progress", async () => {
    const projectRoot = await makeTempProject();
    const specPath = path.join(projectRoot, "SPEC-HARNESS.md");

    // Enhanced config: evaluator enabled, immutability enforced, bootstrap enabled
    const enhancedConfig = {
      evaluator: { enabled: true, autoInjectAfter: ["coding"] as const },
      enforceTaskImmutability: true,
      bootstrap: { enabled: true },
    };
    const stateStore = new StateStore(enhancedConfig);
    const context = { stateStore, config: enhancedConfig };

    await fs.writeFile(specPath, SPEC_WITH_CRITERIA, "utf8");

    // 1. Init + Plan
    await runSwarmInit({ project: projectRoot }, context);
    const planResult = await runSwarmPlan({ project: projectRoot, spec: specPath }, context);

    // Verify evaluator tasks injected (each coding task gets an eval task)
    // 2 coding tasks from spec → 2 eval tasks → 4 total
    expect(planResult.taskCount).toBe(4);

    // Load workflow and verify sprint contract on first coding task
    const workflow = await stateStore.loadWorkflow(projectRoot);
    const codingTasks = workflow.tasks.filter((t) => t.kind === "coding");
    const evalTasks = workflow.tasks.filter((t) => t.kind === "evaluate");
    expect(codingTasks).toHaveLength(2);
    expect(evalTasks).toHaveLength(2);

    // First coding task should have a sprint contract
    expect(codingTasks[0].contract).toBeDefined();
    expect(codingTasks[0].contract!.criteria.length).toBeGreaterThan(0);

    // Evaluator tasks should depend on their source coding tasks
    expect(evalTasks[0].deps).toContain(codingTasks[0].taskId);

    // 2. Run bootstrap
    const bootstrapResult = await runBootstrap(projectRoot, stateStore);
    expect(bootstrapResult.ok).toBe(true);
    expect(bootstrapResult.resumedFromProgress).toBe(false);
    expect(bootstrapResult.selectedTaskId).toBeDefined();

    // 3. Run first coding task
    const firstTaskId = codingTasks[0].taskId;
    const run1 = await runSwarmRun({ project: projectRoot, task: firstTaskId }, context);
    expect((run1 as any).action).toBe("review_required");

    // 4. Apply rubric review (approve via rubric scoring)
    const workflowAfterRun = await stateStore.loadWorkflow(projectRoot);
    const rubric = createDefaultRubric();
    const scores = [
      { dimension: "functionality", score: 8 },
      { dimension: "correctness", score: 8 },
      { dimension: "design", score: 7 },
      { dimension: "craft", score: 7 },
    ];
    const rubricReview = applyRubricResult(workflowAfterRun, firstTaskId, rubric, scores);
    expect(rubricReview.rubricResult.passing).toBe(true);
    expect(rubricReview.task.status).toBe("done");
    expect(rubricReview.task.review.rubricResult).toBeDefined();
    expect(rubricReview.task.review.rubricResult!.weightedTotal).toBeGreaterThan(6);
    await stateStore.saveWorkflow(projectRoot, rubricReview.workflow);

    // 5. Progress file should exist after run
    const progress = await stateStore.loadProgress(projectRoot);
    expect(progress).not.toBeNull();

    // 6. Re-run bootstrap → should detect previous progress
    const bootstrap2 = await runBootstrap(projectRoot, stateStore);
    expect(bootstrap2.ok).toBe(true);
    expect(bootstrap2.resumedFromProgress).toBe(true);

    // 7. Verify immutability guard: attempt to mutate task title should throw
    const currentWorkflow = await stateStore.loadWorkflow(projectRoot);
    const mutated = {
      ...currentWorkflow,
      tasks: currentWorkflow.tasks.map((t) =>
        t.taskId === firstTaskId ? { ...t, title: "MUTATED TITLE" } : t,
      ),
    };
    await expect(stateStore.saveWorkflow(projectRoot, mutated)).rejects.toThrow(/immutability/i);

    // 8. Verify assumptions can be stored on workflow
    const withAssumptions = {
      ...currentWorkflow,
      assumptions: defaultAssumptions(),
    };
    await stateStore.saveWorkflow(projectRoot, withAssumptions);
    const reloaded = await stateStore.loadWorkflow(projectRoot);
    expect(reloaded.assumptions).toBeDefined();
    expect(reloaded.assumptions!.length).toBeGreaterThan(0);
  });

  it("backward compatibility: existing flow works with no enhanced features", async () => {
    const projectRoot = await makeTempProject();
    const specPath = path.join(projectRoot, "SPEC-COMPAT.md");
    const stateStore = new StateStore();

    await fs.writeFile(
      specPath,
      "# Compat Spec\n\n## Goals\n- Ship\n\n## Phases\n### Build\n- Implement feature\n",
      "utf8",
    );

    // Standard flow: init → plan → run → review → status
    await runSwarmInit({ project: projectRoot }, { stateStore });
    const planResult = await runSwarmPlan({ project: projectRoot, spec: specPath }, { stateStore });

    // No evaluator injection (disabled by default)
    expect(planResult.taskCount).toBe(1);

    const workflow = await stateStore.loadWorkflow(projectRoot);
    expect(workflow.tasks[0].kind).toBe("coding");
    // No contract (spec has no acceptance criteria)
    expect(workflow.tasks[0].contract).toBeUndefined();
    // No assumptions
    expect(workflow.assumptions).toBeUndefined();

    // Run and review
    await runSwarmRun({ project: projectRoot }, { stateStore });
    await runSwarmReview(
      { project: projectRoot, task: workflow.tasks[0].taskId, approve: true },
      { stateStore },
    );

    const status = await runSwarmStatus({ project: projectRoot }, { stateStore });
    expect(status.workflow.reviewQueueSize).toBe(0);
  });
});
