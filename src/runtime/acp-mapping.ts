import type { SwarmPluginConfig } from "../config.js";
import type { TaskNode, WorkflowState } from "../types.js";

export type AcpSpawnParams = {
  task: string;
  runtime: "acp";
  agentId: string;
  mode: "run" | "session";
  thread: boolean;
  cwd?: string;
  runTimeoutSeconds?: number;
  existingSessionKey?: string;
  threadId?: string;
};

export type AcpPreflightResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export function preflightAcpTask(
  task: TaskNode,
  config: Pick<SwarmPluginConfig, "acp">,
): AcpPreflightResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const agentId = task.runner.agentId ?? config.acp.defaultAgentId;
  const mode = task.runner.mode ?? config.acp.defaultMode;
  const thread = Boolean(task.runner.threadRequested);

  if (!config.acp.enabled) {
    errors.push("ACP is disabled in plugin config");
  }
  if (!agentId) {
    errors.push("ACP target agent is not configured");
  }
  if (
    agentId &&
    config.acp.allowedAgents.length > 0 &&
    !config.acp.allowedAgents.includes("*") &&
    !config.acp.allowedAgents.includes(agentId)
  ) {
    errors.push(`ACP target agent is not allowed: ${agentId}`);
  }
  if (mode === "session" && !thread) {
    errors.push('ACP mode "session" requires threadRequested=true');
  }
  if (thread && !config.acp.allowThreadBinding) {
    errors.push("ACP thread binding is not enabled in plugin config");
  }
  if (task.runner.persistentSession) {
    warnings.push("persistentSession is reserved for M3 and is ignored in M2");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

export function buildAcpSpawnParams(
  task: TaskNode,
  workflow: WorkflowState,
  config: Pick<SwarmPluginConfig, "acp">,
  options?: { existingSessionKey?: string; threadId?: string },
): AcpSpawnParams {
  const preflight = preflightAcpTask(task, config);
  if (!preflight.ok) {
    throw new Error(`ACP preflight failed: ${preflight.errors.join("; ")}`);
  }

  return {
    task: task.description || task.title,
    runtime: "acp",
    agentId: task.runner.agentId ?? config.acp.defaultAgentId!,
    mode: task.runner.mode ?? config.acp.defaultMode,
    thread: Boolean(task.runner.threadRequested) || Boolean(options?.threadId),
    cwd: task.runner.cwd ?? workflow.projectRoot,
    runTimeoutSeconds: task.runner.timeoutSeconds ?? config.acp.defaultTimeoutSeconds,
    existingSessionKey: options?.existingSessionKey,
    threadId: options?.threadId,
  };
}
