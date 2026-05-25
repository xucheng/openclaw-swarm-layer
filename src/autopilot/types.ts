import type { SwarmPluginConfig } from "../config.js";

export type AutopilotMode = "supervised";
export type AutopilotDesiredState = "running" | "paused" | "stopped";
export type AutopilotRuntimeState = "idle" | "ticking";
export const AUTOPILOT_TICK_SOURCES = ["manual", "polling", "watcher", "safety"] as const;
export type AutopilotTickSource = (typeof AUTOPILOT_TICK_SOURCES)[number];

export function isAutopilotTickSource(value: unknown): value is AutopilotTickSource {
  return typeof value === "string" && (AUTOPILOT_TICK_SOURCES as readonly string[]).includes(value);
}

export type AutopilotDecision = {
  at: string;
  action: "dry_run" | "observe" | "dispatch" | "noop";
  summary: string;
  reason?: string;
  dryRun?: boolean;
  targets?: string[];
  source?: AutopilotTickSource;
};

export type AutopilotLease = {
  ownerId: string;
  acquiredAt: string;
  expiresAt: string;
};

export type AutopilotMetrics = {
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
  tickSourceCount: Record<AutopilotTickSource, number>;
};

export type AutopilotState = {
  version: number;
  projectRoot: string;
  desiredState: AutopilotDesiredState;
  runtimeState: AutopilotRuntimeState;
  mode: AutopilotMode;
  lastTickAt?: string;
  nextTickAt?: string;
  lastDecision?: AutopilotDecision;
  lease?: AutopilotLease;
  metrics: AutopilotMetrics;
  degradedReason?: string;
  degradedSince?: string;
  pausedReason?: string;
};

export function createDefaultAutopilotState(
  projectRoot: string,
  config: Pick<SwarmPluginConfig, "autopilot">,
): AutopilotState {
  return {
    version: 1,
    projectRoot,
    desiredState: config.autopilot.enabled ? "running" : "stopped",
    runtimeState: "idle",
    mode: config.autopilot.mode,
    metrics: {
      tickCount: 0,
      dryRunCount: 0,
      observationCount: 0,
      dispatchCount: 0,
      autoApproveCount: 0,
      retryCount: 0,
      escalationCount: 0,
      cancelCount: 0,
      closeCount: 0,
      degradedTickCount: 0,
      tickSourceCount: {
        manual: 0,
        polling: 0,
        watcher: 0,
        safety: 0,
      },
    },
  };
}
