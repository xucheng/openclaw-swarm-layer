import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmInit } from "../../src/cli/swarm-init.js";
import { runSwarmPlan } from "../../src/cli/swarm-plan.js";
import { runSwarmReview } from "../../src/cli/swarm-review.js";
import { runSwarmRun } from "../../src/cli/swarm-run.js";
import { runSwarmStatus } from "../../src/cli/swarm-status.js";
import { StateStore } from "../../src/state/state-store.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-reject-retry-"));
}

describe("e2e: reject -> retry flow", () => {
  it("reject with ready_retry returns task to ready and allows re-run", async () => {
    const projectRoot = await makeTempProject();
    const specPath = path.join(projectRoot, "SPEC-RETRY.md");
    const stateStore = new StateStore({
      review: { rejectPolicy: "ready_retry", maxRejectRetries: 3 },
    });
    await fs.writeFile(
      specPath,
      "# Retry Spec\n\n## Goals\n- Ship\n\n## Phases\n### Build\n- Implement feature\n",
      "utf8",
    );

    await runSwarmInit({ project: projectRoot }, { stateStore });
    await runSwarmPlan({ project: projectRoot, spec: specPath }, { stateStore });

    // First run
    const run1 = await runSwarmRun({ project: projectRoot }, { stateStore });
    expect((run1 as any).action).toBe("review_required");

    // Reject — should return to ready with ready_retry policy
    const taskId = "build-task-1";
    const review1 = await runSwarmReview(
      { project: projectRoot, task: taskId, reject: true, note: "needs work" },
      { stateStore },
    );
    expect((review1 as any).status).toBe("ready");

    // Verify the task state
    const workflow1 = await stateStore.loadWorkflow(projectRoot);
    const task1 = workflow1.tasks.find((t) => t.taskId === taskId);
    expect(task1?.retryCount).toBe(1);
    expect(task1?.lastRejectReason).toBe("needs work");
    expect(task1?.status).toBe("ready");

    // Re-run the task
    const run2 = await runSwarmRun({ project: projectRoot }, { stateStore });
    expect((run2 as any).action).toBe("review_required");

    // Approve this time
    const review2 = await runSwarmReview(
      { project: projectRoot, task: taskId, approve: true },
      { stateStore },
    );
    expect((review2 as any).status).toBe("done");

    const finalStatus = await runSwarmStatus({ project: projectRoot }, { stateStore });
    expect(finalStatus.workflow.reviewQueueSize).toBe(0);
  });

  it("reject exceeding maxRejectRetries results in blocked", async () => {
    const projectRoot = await makeTempProject();
    const specPath = path.join(projectRoot, "SPEC-EXHAUST.md");
    const stateStore = new StateStore({
      review: { rejectPolicy: "ready_retry", maxRejectRetries: 1 },
    });
    await fs.writeFile(
      specPath,
      "# Exhaust Spec\n\n## Goals\n- Ship\n\n## Phases\n### Build\n- Implement feature\n",
      "utf8",
    );

    await runSwarmInit({ project: projectRoot }, { stateStore });
    await runSwarmPlan({ project: projectRoot, spec: specPath }, { stateStore });

    const taskId = "build-task-1";

    // Run and reject once (retry count goes to 1)
    await runSwarmRun({ project: projectRoot }, { stateStore });
    const review1 = await runSwarmReview(
      { project: projectRoot, task: taskId, reject: true, note: "round 1" },
      { stateStore },
    );
    expect((review1 as any).status).toBe("ready");

    // Run and reject again (now at limit, should block)
    await runSwarmRun({ project: projectRoot }, { stateStore });
    const review2 = await runSwarmReview(
      { project: projectRoot, task: taskId, reject: true, note: "round 2" },
      { stateStore },
    );
    expect((review2 as any).status).toBe("blocked");

    const workflow = await stateStore.loadWorkflow(projectRoot);
    const task = workflow.tasks.find((t) => t.taskId === taskId);
    expect(task?.retryCount).toBe(2);
    expect(workflow.lifecycle).toBe("blocked");
  });

  it("--retry-now forces retry regardless of limit", async () => {
    const projectRoot = await makeTempProject();
    const specPath = path.join(projectRoot, "SPEC-FORCE.md");
    const stateStore = new StateStore({
      review: { rejectPolicy: "ready_retry", maxRejectRetries: 1 },
    });
    await fs.writeFile(
      specPath,
      "# Force Spec\n\n## Goals\n- Ship\n\n## Phases\n### Build\n- Implement feature\n",
      "utf8",
    );

    await runSwarmInit({ project: projectRoot }, { stateStore });
    await runSwarmPlan({ project: projectRoot, spec: specPath }, { stateStore });

    const taskId = "build-task-1";

    // Exhaust normal retry limit
    await runSwarmRun({ project: projectRoot }, { stateStore });
    await runSwarmReview(
      { project: projectRoot, task: taskId, reject: true, note: "round 1" },
      { stateStore },
    );

    await runSwarmRun({ project: projectRoot }, { stateStore });

    // Use --retryNow to force retry even at limit
    const forceReview = await runSwarmReview(
      { project: projectRoot, task: taskId, reject: true, retryNow: true, note: "force retry" },
      { stateStore },
    );
    expect((forceReview as any).status).toBe("ready");
  });
});
