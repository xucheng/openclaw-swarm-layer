import type { RuntimePolicySnapshot } from "../config.js";
import { AutopilotStore } from "../autopilot/autopilot-store.js";
import { buildAutopilotHealthSummary } from "../autopilot/metrics.js";
import { describeAcpExecutionPosture, resolveRuntimePolicySnapshot } from "../config.js";
import { buildAcpBridgeExitGate, formatAcpBridgeExitGateNotes, type AcpBridgeExitGate } from "../runtime/acp-bridge-exit-gate.js";
import { buildAttentionItems, buildOperatorHighlights, buildRecommendedActions, buildReviewQueueItems } from "../reporting/operator-summary.js";
import { summarizeSessionReuseForTask } from "../session/session-selector.js";
import { resolveSessionStore, resolveStateStore, type SwarmCliContext } from "./context.js";
import { getQueuedTasks, getRunnableTasks } from "../planning/task-graph.js";

export type SwarmStatusResult = {
  ok: true;
  runtime: RuntimePolicySnapshot;
  acpBridgeExitGate: AcpBridgeExitGate;
  notes: string[];
  workflow: {
    lifecycle: string;
    activeSpecId?: string;
    totalTasks: number;
    readyTasks: number;
    queuedTasks: number;
    runningTasks: number;
    blockedTasks: number;
    reviewQueueSize: number;
    lastAction?: {
      at: string;
      type: string;
      message?: string;
    };
  };
  reviewQueue: Array<{
    taskId: string;
    title?: string;
    status?: string;
    latestRunId?: string;
    latestRunStatus?: string;
    latestRunSummary?: string;
    recommendedAction?: string;
  }>;
  attention: Array<{
    kind: string;
    taskId: string;
    title?: string;
    message: string;
    latestRunId?: string;
    latestRunStatus?: string;
    latestRunSummary?: string;
    recommendedAction: string;
  }>;
  recentRuns: Array<{
    runId: string;
    taskId: string;
    runner: string;
    status: string;
    resultSummary?: string;
  }>;
  highlights: Array<{
    kind: string;
    runId: string;
    taskId: string;
    runner: string;
    summary?: string;
    recommendedAction: string;
  }>;
  recommendedActions: string[];
  sessions: {
    total: number;
    active: number;
    idle: number;
    closed: number;
    failed: number;
    orphaned: number;
  };
  recentSessions: Array<{
    sessionId: string;
    runner: string;
    mode: string;
    state: string;
    summary?: string;
    lastRunId?: string;
  }>;
  reusableSessionCandidates: Array<{
    taskId: string;
    title?: string;
    policy: string;
    eligible: boolean;
    bindingKey?: string;
    selectedSessionId?: string;
    reason: string;
  }>;
  autopilot: {
    enabled: boolean;
    mode: string;
    desiredState: string;
    runtimeState: string;
    pausedReason?: string;
    lastTickAt?: string;
    nextTickAt?: string;
    degradedReason?: string;
    degradedSince?: string;
    lastDecision?: {
      at: string;
      action: string;
      summary: string;
      reason?: string;
      dryRun?: boolean;
    };
    queuePressure: {
      runnableTasks: number;
      queuedTasks: number;
      runningTasks: number;
      reviewQueueSize: number;
    };
    metrics: {
      tickCount: number;
      dryRunCount: number;
      observationCount: number;
      dispatchCount: number;
      autoApproveCount: number;
      retryCount: number;
      escalationCount: number;
      cancelCount: number;
      closeCount: number;
      degradedTickCount: number;
    };
    health: {
      terminalWindow: number;
      terminalRuns: number;
      successfulRuns: number;
      failedRuns: number;
      intervenedRuns: number;
      failureRate: number;
      interventionRate: number;
      degraded: boolean;
      degradedReason?: string;
    };
    decisionLogPath: string;
  };
};

export async function runSwarmStatus(
  options: { project: string },
  context?: SwarmCliContext,
): Promise<SwarmStatusResult> {
  const stateStore = resolveStateStore(context);
  const sessionStore = resolveSessionStore(context);
  const workflow = await stateStore.loadWorkflow(options.project);
  const runs = await stateStore.loadRuns(options.project);
  const sessions = await sessionStore.listSessions(options.project);
  const autopilotStore = new AutopilotStore(stateStore.config);
  const autopilotState = await autopilotStore.getState(options.project);
  const autopilotHealth = buildAutopilotHealthSummary(runs, autopilotState, stateStore.config);
  const summary = stateStore.summarizeWorkflow(workflow);
  const runtime = resolveRuntimePolicySnapshot(stateStore.config, workflow.runtime, { runtimeVersion: stateStore.runtimeVersion });
  const acpBridgeExitGate = buildAcpBridgeExitGate(stateStore.runtimeVersion, {
    publicControlPlaneExportReady: null,
    evidenceMode: "runtime-version-only",
  });

  return {
    ok: true,
    runtime,
    acpBridgeExitGate,
    notes: [
      `Default runner resolution: ${runtime.configuredDefaultRunner} -> ${runtime.resolvedDefaultRunner} on this install.`,
      `Manual runner remains the safe explicit fallback.`,
      `ACP execution posture: ${describeAcpExecutionPosture(stateStore.config)}.`,
      ...formatAcpBridgeExitGateNotes(acpBridgeExitGate),
    ],
    workflow: {
      ...summary,
      lastAction: workflow.lastAction,
    },
    reviewQueue: buildReviewQueueItems(workflow, runs),
    attention: buildAttentionItems(workflow, runs),
    highlights: buildOperatorHighlights(runs),
    recommendedActions: buildRecommendedActions(workflow, runs),
    sessions: {
      total: sessions.length,
      active: sessions.filter((session) => session.state === "active").length,
      idle: sessions.filter((session) => session.state === "idle").length,
      closed: sessions.filter((session) => session.state === "closed").length,
      failed: sessions.filter((session) => session.state === "failed").length,
      orphaned: sessions.filter((session) => session.state === "orphaned").length,
    },
    recentSessions: [...sessions]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 5)
      .map((session) => ({
        sessionId: session.sessionId,
        runner: session.runner,
        mode: session.mode,
        state: session.state,
        summary: session.summary,
        lastRunId: session.lastRunId,
      })),
    reusableSessionCandidates: workflow.tasks.map((task) => ({
      taskId: task.taskId,
      title: task.title,
      ...summarizeSessionReuseForTask(task, sessions),
    })),
    recentRuns: [...runs]
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      .slice(0, 5)
      .map((run) => ({
        runId: run.runId,
        taskId: run.taskId,
        runner: run.runner.type,
        status: run.status,
        resultSummary: run.resultSummary,
      })),
    autopilot: {
      enabled: stateStore.config.autopilot.enabled,
      mode: autopilotState.mode,
      desiredState: autopilotState.desiredState,
      runtimeState: autopilotState.runtimeState,
      pausedReason: autopilotState.pausedReason,
      lastTickAt: autopilotState.lastTickAt,
      nextTickAt: autopilotState.nextTickAt,
      degradedReason: autopilotState.degradedReason,
      degradedSince: autopilotState.degradedSince,
      lastDecision: autopilotState.lastDecision,
      queuePressure: {
        runnableTasks: getRunnableTasks(workflow.tasks).length,
        queuedTasks: getQueuedTasks(workflow.tasks).length,
        runningTasks: workflow.tasks.filter((task) => task.status === "running").length,
        reviewQueueSize: workflow.reviewQueue.length,
      },
      metrics: autopilotState.metrics,
      health: autopilotHealth,
      decisionLogPath: autopilotStore.resolvePaths(options.project).autopilotDecisionLogPath,
    },
  };
}
