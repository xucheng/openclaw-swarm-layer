import type { SwarmPluginConfig } from "../config.js";
import { AutopilotStore } from "./autopilot-store.js";
import type { AutopilotDecision, AutopilotDesiredState, AutopilotState } from "./types.js";

export type AutopilotControlCommand = "start" | "pause" | "resume" | "stop";
export type AutopilotStopMode = "safe";

export type ApplyAutopilotControlInput = {
  projectRoot: string;
  command: AutopilotControlCommand;
  reason?: string;
  mode?: AutopilotStopMode;
  at?: string;
};

export type ApplyAutopilotControlResult = {
  state: AutopilotState;
  decision: AutopilotDecision;
  changed: boolean;
  decisionLogPath: string;
};

function resolveDesiredState(
  command: AutopilotControlCommand,
  config: Pick<SwarmPluginConfig, "autopilot">,
): AutopilotDesiredState {
  if (command === "pause") {
    return "paused";
  }
  if (command === "stop") {
    return "stopped";
  }
  return config.autopilot.enabled ? "running" : "stopped";
}

function buildControlSummary(
  command: AutopilotControlCommand,
  config: Pick<SwarmPluginConfig, "autopilot">,
  reason?: string,
): string {
  const reasonSuffix = reason ? `: ${reason}` : "";
  if ((command === "start" || command === "resume") && !config.autopilot.enabled) {
    return `operator requested ${command}, but autopilot remains stopped because config is disabled${reasonSuffix}`;
  }
  if (command === "start") {
    return `operator started autopilot${reasonSuffix}`;
  }
  if (command === "resume") {
    return `operator resumed autopilot${reasonSuffix}`;
  }
  if (command === "pause") {
    return `operator paused autopilot${reasonSuffix}`;
  }
  return `operator stopped autopilot (safe mode)${reasonSuffix}`;
}

export async function applyAutopilotControl(
  store: AutopilotStore,
  input: ApplyAutopilotControlInput,
): Promise<ApplyAutopilotControlResult> {
  if (input.command === "stop" && input.mode !== undefined && input.mode !== "safe") {
    throw new Error(`Unsupported autopilot stop mode: ${input.mode}`);
  }

  const current = await store.getState(input.projectRoot);
  const at = input.at ?? new Date().toISOString();
  const desiredState = resolveDesiredState(input.command, store.config);
  const pausedReason = desiredState === "paused" ? input.reason ?? "operator pause" : undefined;
  const nextTickAt =
    desiredState === "running"
      ? new Date(new Date(at).getTime() + store.config.autopilot.tickSeconds * 1000).toISOString()
      : undefined;
  const decision: AutopilotDecision = {
    at,
    action: "noop",
    summary: buildControlSummary(input.command, store.config, input.reason),
    reason: input.reason,
    targets: [],
  };
  const nextState: AutopilotState = {
    ...current,
    desiredState,
    pausedReason,
    nextTickAt,
    lastDecision: decision,
  };
  const changed =
    current.desiredState !== nextState.desiredState ||
    current.pausedReason !== nextState.pausedReason ||
    current.nextTickAt !== nextState.nextTickAt;

  await store.saveState(input.projectRoot, nextState);
  await store.appendDecision(input.projectRoot, {
    tickId: `control-${at}`,
    ...decision,
  });

  return {
    state: nextState,
    decision,
    changed,
    decisionLogPath: store.resolvePaths(input.projectRoot).autopilotDecisionLogPath,
  };
}
