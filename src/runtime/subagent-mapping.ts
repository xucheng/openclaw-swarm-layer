import type { TaskNode, WorkflowState } from "../types.js";
import type { SubagentSpawnParams } from "./openclaw-subagent-adapter.js";

export type SubagentPreflightResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export function preflightSubagentTask(task: TaskNode): SubagentPreflightResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const mode = task.runner.mode ?? "run";
  const thread = Boolean(task.runner.threadRequested);

  if (mode === "session" && !thread) {
    errors.push('subagent mode "session" requires threadRequested=true');
  }
  if (task.runner.persistentSession) {
    warnings.push("persistentSession is ignored for subagent runner");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

export function buildSubagentSpawnParams(task: TaskNode, workflow: WorkflowState): SubagentSpawnParams {
  const preflight = preflightSubagentTask(task);
  if (!preflight.ok) {
    throw new Error(`Subagent preflight failed: ${preflight.errors.join("; ")}`);
  }

  return {
    task: task.description || task.title,
    label: `${task.taskId}:${task.title}`,
    agentId: task.runner.agentId,
    mode: task.runner.mode ?? "run",
    thread: Boolean(task.runner.threadRequested),
    runTimeoutSeconds: task.runner.timeoutSeconds,
  };
}
