import type { SwarmPluginConfig } from "../config.js";
import type { SessionRecord, TaskNode, RunRecord, WorkflowState } from "../types.js";

const ACTIVE_RUN_STATUSES = new Set<RunRecord["status"]>(["accepted", "running"]);

export type AutopilotRecoveryAction =
  | {
      kind: "safe_cancel";
      taskId: string;
      runId: string;
      reason: string;
      recoveryCount: number;
      retryAfterCancel: boolean;
      terminalStatus: Extract<RunRecord["status"], "cancelled" | "timed_out">;
    }
  | {
      kind: "safe_close";
      sessionId: string;
      runId?: string;
      reason: string;
    }
  | {
      kind: "escalate";
      taskId?: string;
      runId?: string;
      sessionId?: string;
      reason: string;
    };

export type AutopilotRecoveryPlan = {
  actions: AutopilotRecoveryAction[];
  stats: {
    stuckRuns: number;
    staleSessions: number;
    escalationsPlanned: number;
  };
};

type RecoveryPlannerInput = {
  workflow: WorkflowState;
  runs: RunRecord[];
  sessions: SessionRecord[];
  config: Pick<SwarmPluginConfig, "autopilot">;
  now?: string;
};

function ageMinutes(fromIso: string, toIso: string): number {
  return (Date.parse(toIso) - Date.parse(fromIso)) / 60_000;
}

function findLatestRunByTask(taskId: string, runs: RunRecord[]): RunRecord | undefined {
  return [...runs]
    .filter((runRecord) => runRecord.taskId === taskId)
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0];
}

function countRecoveryAttemptsForTask(taskId: string, runs: RunRecord[]): number {
  return runs
    .filter((runRecord) => runRecord.taskId === taskId)
    .flatMap((runRecord) => runRecord.events ?? [])
    .filter((event) => event.type === "recovery_cancelled")
    .length;
}

function canRetryAfterCancel(task: TaskNode, config: Pick<SwarmPluginConfig, "autopilot">, recoveryCount: number): boolean {
  if (!config.autopilot.recoveryPolicy.cancelBeforeRetry) {
    return false;
  }
  if (recoveryCount >= config.autopilot.recoveryPolicy.maxRecoveriesPerTask) {
    return false;
  }
  const retryPolicy = task.runner.retryPolicy;
  if (!retryPolicy) {
    return false;
  }
  return retryPolicy.retryOn.includes("timed_out");
}

export function planAutopilotRecovery(input: RecoveryPlannerInput): AutopilotRecoveryPlan {
  const now = input.now ?? new Date().toISOString();
  const actions: AutopilotRecoveryAction[] = [];
  let stuckRuns = 0;
  let staleSessions = 0;

  for (const task of input.workflow.tasks) {
    if (task.status !== "running") {
      continue;
    }
    const latestRun = findLatestRunByTask(task.taskId, input.runs);
    if (!latestRun || latestRun.runner.type === "manual" || !ACTIVE_RUN_STATUSES.has(latestRun.status)) {
      continue;
    }

    const age = ageMinutes(latestRun.startedAt, now);
    if (age <= input.config.autopilot.recoveryPolicy.stuckRunMinutes) {
      continue;
    }

    stuckRuns += 1;
    const recoveryCount = countRecoveryAttemptsForTask(task.taskId, input.runs);
    if (recoveryCount >= input.config.autopilot.recoveryPolicy.maxRecoveriesPerTask) {
      actions.push({
        kind: "escalate",
        taskId: task.taskId,
        runId: latestRun.runId,
        reason: `stuck run exceeded recovery budget (${recoveryCount}/${input.config.autopilot.recoveryPolicy.maxRecoveriesPerTask})`,
      });
      continue;
    }

    actions.push({
      kind: "safe_cancel",
      taskId: task.taskId,
      runId: latestRun.runId,
      recoveryCount,
      retryAfterCancel: canRetryAfterCancel(task, input.config, recoveryCount),
      terminalStatus: canRetryAfterCancel(task, input.config, recoveryCount) ? "timed_out" : "cancelled",
      reason: `run has remained ${latestRun.status} for ${Math.floor(age)}m (threshold=${input.config.autopilot.recoveryPolicy.stuckRunMinutes}m)`,
    });
  }

  for (const session of input.sessions) {
    if (session.mode !== "persistent" || session.state !== "idle") {
      continue;
    }
    const age = ageMinutes(session.updatedAt, now);
    if (age <= input.config.autopilot.recoveryPolicy.idleSessionMinutes) {
      continue;
    }

    staleSessions += 1;
    if (session.runner === "acp") {
      actions.push({
        kind: "safe_close",
        sessionId: session.sessionId,
        runId: session.lastRunId,
        reason: `idle persistent session has been idle for ${Math.floor(age)}m (threshold=${input.config.autopilot.recoveryPolicy.idleSessionMinutes}m)`,
      });
    } else {
      actions.push({
        kind: "escalate",
        sessionId: session.sessionId,
        runId: session.lastRunId,
        reason: `idle session exceeded stale threshold but no safe close surface is available`,
      });
    }
  }

  return {
    actions,
    stats: {
      stuckRuns,
      staleSessions,
      escalationsPlanned: actions.filter((action) => action.kind === "escalate").length,
    },
  };
}
