import { applyAutopilotControl, type AutopilotControlCommand, type AutopilotStopMode } from "../autopilot/control.js";
import { AutopilotStore } from "../autopilot/autopilot-store.js";
import { resolveStateStore, type SwarmCliContext } from "./context.js";

export type SwarmAutopilotControlResult = {
  ok: true;
  command: AutopilotControlCommand;
  mode?: AutopilotStopMode;
  changed: boolean;
  summary: string;
  autopilot: {
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
    decisionLogPath: string;
  };
};

export async function runSwarmAutopilotControl(
  options: { project: string; command: AutopilotControlCommand; reason?: string; mode?: AutopilotStopMode },
  context?: SwarmCliContext,
): Promise<SwarmAutopilotControlResult> {
  const stateStore = resolveStateStore(context);
  await stateStore.initProject(options.project);
  const autopilotStore = new AutopilotStore(stateStore.config);
  const result = await applyAutopilotControl(autopilotStore, {
    projectRoot: options.project,
    command: options.command,
    reason: options.reason,
    mode: options.mode,
  });

  return {
    ok: true,
    command: options.command,
    mode: options.mode,
    changed: result.changed,
    summary: result.decision.summary,
    autopilot: {
      desiredState: result.state.desiredState,
      runtimeState: result.state.runtimeState,
      pausedReason: result.state.pausedReason,
      lastTickAt: result.state.lastTickAt,
      nextTickAt: result.state.nextTickAt,
      degradedReason: result.state.degradedReason,
      degradedSince: result.state.degradedSince,
      lastDecision: result.state.lastDecision,
      decisionLogPath: result.decisionLogPath,
    },
  };
}
