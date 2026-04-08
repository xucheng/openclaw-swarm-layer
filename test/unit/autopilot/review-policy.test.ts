import { applyAutopilotReviewPolicy } from "../../../src/autopilot/review-policy.js";
import type { RunRecord, TaskNode, WorkflowState } from "../../../src/types.js";

function makeWorkflow(task: Partial<TaskNode> = {}): WorkflowState {
  return {
    version: 1,
    projectRoot: "/tmp/project",
    activeSpecId: "spec-1",
    lifecycle: "reviewing",
    tasks: [
      {
        taskId: "task-1",
        specId: "spec-1",
        title: "Implement dashboard docs",
        description: "Low risk documentation follow-up",
        kind: "docs",
        deps: [],
        status: "review_required",
        workspace: { mode: "shared" },
        runner: { type: "acp" },
        review: { required: true, status: "pending" },
        ...task,
      },
    ],
    reviewQueue: ["task-1"],
  };
}

function makeRun(status: RunRecord["status"], overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    runId: "run-1",
    taskId: "task-1",
    attempt: 1,
    status,
    runner: { type: "acp" },
    workspacePath: "/tmp/project",
    startedAt: "2026-04-08T00:00:00.000Z",
    endedAt: status === "completed" ? "2026-04-08T00:05:00.000Z" : undefined,
    resultSummary: status === "completed" ? "completed docs update" : "run failed",
    artifacts: [],
    ...overrides,
  };
}

const defaultRecoveryPolicy = {
  stuckRunMinutes: 20,
  idleSessionMinutes: 60,
  maxRecoveriesPerTask: 1,
  cancelBeforeRetry: true,
  degradedFailureRate: 0.5,
  degradedMinTerminalRuns: 3,
  degradedTerminalWindow: 6,
};

describe("autopilot review policy", () => {
  it("auto_safe approves completed low-risk tasks", () => {
    const result = applyAutopilotReviewPolicy(
      makeWorkflow(),
      [makeRun("completed")],
      {
        autopilot: {
          enabled: true,
          mode: "supervised",
          tickSeconds: 15,
          leaseSeconds: 45,
          maxDispatchPerTick: 2,
          reviewPolicy: {
            mode: "auto_safe",
            allowlistTags: [],
            denyTags: ["security", "prod"],
          },
          recoveryPolicy: defaultRecoveryPolicy,
        },
        review: {
          rejectPolicy: "ready_retry",
          maxRejectRetries: 2,
        },
      },
    );

    expect(result.workflow.tasks[0]?.status).toBe("done");
    expect(result.workflow.reviewQueue).toEqual([]);
    expect(result.counts.autoApproved).toBe(1);
  });

  it("auto_allowlist escalates tasks that do not match the allowlist", () => {
    const result = applyAutopilotReviewPolicy(
      makeWorkflow({ title: "Implement dashboard docs" }),
      [makeRun("completed")],
      {
        autopilot: {
          enabled: true,
          mode: "supervised",
          tickSeconds: 15,
          leaseSeconds: 45,
          maxDispatchPerTick: 2,
          reviewPolicy: {
            mode: "auto_allowlist",
            allowlistTags: ["allowlisted"],
            denyTags: [],
          },
          recoveryPolicy: defaultRecoveryPolicy,
        },
        review: {
          rejectPolicy: "ready_retry",
          maxRejectRetries: 2,
        },
      },
    );

    expect(result.workflow.tasks[0]?.status).toBe("review_required");
    expect(result.workflow.reviewQueue).toEqual(["task-1"]);
    expect(result.counts.escalated).toBe(1);
  });

  it("auto-rejects non-completed runs using the configured retry policy", () => {
    const result = applyAutopilotReviewPolicy(
      makeWorkflow(),
      [makeRun("failed", { resultSummary: "test suite failed" })],
      {
        autopilot: {
          enabled: true,
          mode: "supervised",
          tickSeconds: 15,
          leaseSeconds: 45,
          maxDispatchPerTick: 2,
          reviewPolicy: {
            mode: "auto_safe",
            allowlistTags: [],
            denyTags: [],
          },
          recoveryPolicy: defaultRecoveryPolicy,
        },
        review: {
          rejectPolicy: "ready_retry",
          maxRejectRetries: 2,
        },
      },
    );

    expect(result.workflow.tasks[0]?.status).toBe("ready");
    expect(result.workflow.reviewQueue).toEqual([]);
    expect(result.counts.retryQueued).toBe(1);
  });

  it("manual_only leaves review queue untouched", () => {
    const result = applyAutopilotReviewPolicy(
      makeWorkflow(),
      [makeRun("completed")],
      {
        autopilot: {
          enabled: true,
          mode: "supervised",
          tickSeconds: 15,
          leaseSeconds: 45,
          maxDispatchPerTick: 2,
          reviewPolicy: {
            mode: "manual_only",
            allowlistTags: [],
            denyTags: [],
          },
          recoveryPolicy: defaultRecoveryPolicy,
        },
        review: {
          rejectPolicy: "ready_retry",
          maxRejectRetries: 2,
        },
      },
    );

    expect(result.workflow.tasks[0]?.status).toBe("review_required");
    expect(result.workflow.reviewQueue).toEqual(["task-1"]);
    expect(result.decisions).toEqual([]);
  });
});
