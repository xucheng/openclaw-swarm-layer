import type { SwarmPluginConfig } from "../config.js";
import type { RunRecord } from "../types.js";
import type { AutopilotState, AutopilotTickSource } from "./types.js";

const TERMINAL_RUN_STATUSES = new Set<RunRecord["status"]>(["completed", "failed", "timed_out", "cancelled"]);
const FAILURE_RUN_STATUSES = new Set<RunRecord["status"]>(["failed", "timed_out", "cancelled"]);
const AUTOPILOT_TICK_SOURCES: readonly AutopilotTickSource[] = ["manual", "polling", "watcher", "safety"];

export type AutopilotHealthSummary = {
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

export function createDefaultTickSourceCount(): Record<AutopilotTickSource, number> {
  return {
    manual: 0,
    polling: 0,
    watcher: 0,
    safety: 0,
  };
}

export function mergeTickSourceCount(
  sourceCount?: Partial<Record<AutopilotTickSource, number>>,
): Record<AutopilotTickSource, number> {
  const merged = createDefaultTickSourceCount();
  if (!sourceCount) {
    return merged;
  }
  for (const source of AUTOPILOT_TICK_SOURCES) {
    const count = sourceCount[source];
    if (typeof count === "number" && Number.isFinite(count) && count >= 0) {
      merged[source] = count;
    }
  }
  return merged;
}

function hasRecoveryIntervention(runRecord: RunRecord): boolean {
  return (runRecord.events ?? []).some((event) => event.type.startsWith("recovery_"));
}

export function selectRecentTerminalSessionRuns(
  runs: RunRecord[],
  config: Pick<SwarmPluginConfig, "autopilot">,
): RunRecord[] {
  return [...runs]
    .filter((runRecord) => runRecord.runner.type !== "manual" && TERMINAL_RUN_STATUSES.has(runRecord.status))
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    .slice(0, config.autopilot.recoveryPolicy.degradedTerminalWindow);
}

export function buildAutopilotHealthSummary(
  runs: RunRecord[],
  state: Pick<AutopilotState, "degradedReason">,
  config: Pick<SwarmPluginConfig, "autopilot">,
): AutopilotHealthSummary {
  const terminalRuns = selectRecentTerminalSessionRuns(runs, config);
  const failedRuns = terminalRuns.filter((runRecord) => FAILURE_RUN_STATUSES.has(runRecord.status)).length;
  const successfulRuns = terminalRuns.filter((runRecord) => runRecord.status === "completed").length;
  const intervenedRuns = terminalRuns.filter((runRecord) => hasRecoveryIntervention(runRecord)).length;
  const failureRate = terminalRuns.length > 0 ? failedRuns / terminalRuns.length : 0;
  const interventionRate = terminalRuns.length > 0 ? intervenedRuns / terminalRuns.length : 0;
  const degraded =
    terminalRuns.length >= config.autopilot.recoveryPolicy.degradedMinTerminalRuns &&
    failureRate >= config.autopilot.recoveryPolicy.degradedFailureRate;
  const degradedReason = degraded
    ? `failure rate ${Math.round(failureRate * 100)}% across ${terminalRuns.length} terminal runs breached policy threshold ${Math.round(config.autopilot.recoveryPolicy.degradedFailureRate * 100)}%`
    : state.degradedReason;

  return {
    terminalWindow: config.autopilot.recoveryPolicy.degradedTerminalWindow,
    terminalRuns: terminalRuns.length,
    successfulRuns,
    failedRuns,
    intervenedRuns,
    failureRate,
    interventionRate,
    degraded,
    degradedReason: degraded ? degradedReason : undefined,
  };
}
