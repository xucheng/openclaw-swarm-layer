import { AutopilotStore } from "../autopilot/autopilot-store.js";
import { buildAutopilotHealthSummary } from "../autopilot/metrics.js";
import { getQueuedTasks, getRunnableTasks } from "../planning/task-graph.js";
import { resolveStateStore, type SwarmCliContext } from "./context.js";

export type SwarmAutopilotStatusResult = {
  ok: true;
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

export async function runSwarmAutopilotStatus(
  options: { project: string },
  context?: SwarmCliContext,
): Promise<SwarmAutopilotStatusResult> {
  const stateStore = resolveStateStore(context);
  const workflow = await stateStore.loadWorkflow(options.project);
  const runs = await stateStore.loadRuns(options.project);
  const autopilotStore = new AutopilotStore(stateStore.config);
  const autopilotState = await autopilotStore.getState(options.project);
  const health = buildAutopilotHealthSummary(runs, autopilotState, stateStore.config);

  return {
    ok: true,
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
      health,
      decisionLogPath: autopilotStore.resolvePaths(options.project).autopilotDecisionLogPath,
    },
  };
}
