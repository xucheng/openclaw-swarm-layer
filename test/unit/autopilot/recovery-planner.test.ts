import { planAutopilotRecovery } from "../../../src/autopilot/recovery-planner.js";
import { defaultSwarmPluginConfig } from "../../../src/config.js";
import type { RunRecord, SessionRecord, WorkflowState } from "../../../src/types.js";

function makeWorkflow(): WorkflowState {
  return {
    version: 1,
    projectRoot: "/tmp/project",
    lifecycle: "running",
    tasks: [
      {
        taskId: "task-1",
        specId: "spec-1",
        title: "Task 1",
        description: "Task 1",
        kind: "coding",
        deps: [],
        status: "running",
        workspace: { mode: "shared" },
        runner: {
          type: "acp",
          retryPolicy: { maxAttempts: 3, backoffSeconds: 0, retryOn: ["timed_out"] },
        },
        review: { required: true },
      },
    ],
    reviewQueue: [],
  };
}

function makeRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    runId: "run-1",
    taskId: "task-1",
    attempt: 1,
    status: "running",
    runner: { type: "acp" },
    workspacePath: "/tmp/project",
    startedAt: "2026-04-08T00:00:00.000Z",
    artifacts: [],
    sessionRef: { runtime: "acp", sessionKey: "agent:codex:acp:1" },
    ...overrides,
  };
}

describe("autopilot recovery planner", () => {
  it("plans safe_cancel with retry for stuck runs under budget", () => {
    const result = planAutopilotRecovery({
      workflow: makeWorkflow(),
      runs: [makeRun()],
      sessions: [],
      config: {
        autopilot: {
          ...defaultSwarmPluginConfig.autopilot,
          recoveryPolicy: {
            ...defaultSwarmPluginConfig.autopilot.recoveryPolicy,
            stuckRunMinutes: 5,
          },
        },
      },
      now: "2026-04-08T00:10:00.000Z",
    });

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      kind: "safe_cancel",
      taskId: "task-1",
      retryAfterCancel: true,
      terminalStatus: "timed_out",
    });
  });

  it("escalates stuck runs that already exhausted recovery budget", () => {
    const result = planAutopilotRecovery({
      workflow: makeWorkflow(),
      runs: [
        makeRun({
          events: [{ at: "2026-04-08T00:04:00.000Z", type: "recovery_cancelled" }],
        }),
      ],
      sessions: [],
      config: {
        autopilot: {
          ...defaultSwarmPluginConfig.autopilot,
          recoveryPolicy: {
            ...defaultSwarmPluginConfig.autopilot.recoveryPolicy,
            maxRecoveriesPerTask: 1,
            stuckRunMinutes: 5,
          },
        },
      },
      now: "2026-04-08T00:10:00.000Z",
    });

    expect(result.actions[0]).toMatchObject({
      kind: "escalate",
      taskId: "task-1",
    });
  });

  it("plans safe_close for stale ACP idle sessions", () => {
    const session: SessionRecord = {
      sessionId: "acp-session-1",
      runner: "acp",
      projectRoot: "/tmp/project",
      scope: { bindingKey: "feature-a" },
      mode: "persistent",
      state: "idle",
      createdAt: "2026-04-08T00:00:00.000Z",
      updatedAt: "2026-04-08T00:00:00.000Z",
      providerRef: { sessionKey: "agent:codex:acp:1" },
      lastRunId: "run-1",
    };

    const result = planAutopilotRecovery({
      workflow: { ...makeWorkflow(), tasks: [] },
      runs: [],
      sessions: [session],
      config: {
        autopilot: {
          ...defaultSwarmPluginConfig.autopilot,
          recoveryPolicy: {
            ...defaultSwarmPluginConfig.autopilot.recoveryPolicy,
            idleSessionMinutes: 30,
          },
        },
      },
      now: "2026-04-08T01:00:00.000Z",
    });

    expect(result.actions[0]).toMatchObject({
      kind: "safe_close",
      sessionId: "acp-session-1",
    });
  });
});
