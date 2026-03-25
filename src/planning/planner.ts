import type { SwarmPluginConfig } from "../config.js";
import { defaultSwarmPluginConfig } from "../config.js";
import type { SpecDoc, TaskNode } from "../types.js";
import { injectEvaluatorTasks } from "./evaluator-injection.js";
import { contractFromSpecCriteria } from "./sprint-contract.js";
import { upsertTaskStatuses, validateTaskGraph } from "./task-graph.js";

function taskIdForPhase(phaseId: string, index: number): string {
  return `${phaseId}-task-${index + 1}`;
}

export function planTasksFromSpec(spec: SpecDoc, config?: Partial<SwarmPluginConfig>): TaskNode[] {
  const resolvedConfig = { ...defaultSwarmPluginConfig, ...config };
  const tasks: TaskNode[] = [];

  for (const phase of spec.phases) {
    const phaseTasks = phase.tasks.length > 0 ? phase.tasks : [`Execute ${phase.title}`];
    phaseTasks.forEach((taskTitle, index) => {
      const previousTask = tasks[tasks.length - 1];
      tasks.push({
        taskId: taskIdForPhase(phase.phaseId, index),
        specId: spec.specId,
        phaseId: phase.phaseId,
        title: taskTitle,
        description: taskTitle,
        kind: "coding",
        deps: previousTask ? [previousTask.taskId] : [],
        status: "planned",
        workspace: {
          mode: resolvedConfig.defaultWorkspaceMode,
        },
        runner: {
          type: resolvedConfig.defaultRunner,
        },
        review: {
          required: resolvedConfig.reviewRequiredByDefault,
        },
      });
    });
  }

  // Attach sprint contracts from spec acceptance criteria
  if (spec.acceptanceCriteria.length > 0 && tasks.length > 0) {
    const firstCodingTask = tasks.find((t) => t.kind === "coding");
    if (firstCodingTask) {
      firstCodingTask.contract = contractFromSpecCriteria(firstCodingTask.taskId, spec.acceptanceCriteria);
    }
  }

  // Inject evaluator tasks after coding tasks (when enabled)
  const finalTasks = resolvedConfig.evaluator.enabled
    ? injectEvaluatorTasks(tasks, resolvedConfig)
    : tasks;

  const validation = validateTaskGraph(finalTasks);
  if (!validation.ok) {
    throw new Error(`Invalid task graph: ${validation.errors.join("; ")}`);
  }
  return upsertTaskStatuses(finalTasks);
}
