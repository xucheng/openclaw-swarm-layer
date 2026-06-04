import type { AcpAutomationResolutionHints, SwarmPluginConfig, SwarmPluginConfigInput } from "../config.js";
import { resolveSwarmPluginConfig, resolveWorkflowDefaultRunner } from "../config.js";
import type { SpecDoc, TaskNode } from "../types.js";
import { injectEvaluatorTasks } from "./evaluator-injection.js";
import { contractFromSpecCriteria } from "./sprint-contract.js";
import { upsertTaskStatuses, validateTaskGraph } from "./task-graph.js";

function taskIdForPhase(phaseId: string, index: number): string {
  return `${phaseId}-task-${index + 1}`;
}

export function planTasksFromSpec(
  spec: SpecDoc,
  config?: SwarmPluginConfigInput,
  hints?: AcpAutomationResolutionHints,
): TaskNode[] {
  const resolvedConfig = resolveSwarmPluginConfig(config);
  const defaultRunner = resolveWorkflowDefaultRunner(resolvedConfig, hints);
  const tasks: TaskNode[] = [];
  let previousPhaseLeafTaskIds: string[] = [];

  for (const phase of spec.phases) {
    const phaseTasks = phase.tasks.length > 0 ? phase.tasks : [`Execute ${phase.title}`];
    const phaseTaskIds: string[] = [];
    let previousTaskInPhase: TaskNode | undefined;
    phaseTasks.forEach((taskTitle, index) => {
      const deps =
        phase.execution === "parallel"
          ? previousPhaseLeafTaskIds
          : previousTaskInPhase
            ? [previousTaskInPhase.taskId]
            : previousPhaseLeafTaskIds;
      const task: TaskNode = {
        taskId: taskIdForPhase(phase.phaseId, index),
        specId: spec.specId,
        phaseId: phase.phaseId,
        title: taskTitle,
        description: taskTitle,
        kind: "coding",
        deps: [...deps],
        status: "planned",
        workspace: {
          mode: resolvedConfig.defaultWorkspaceMode,
        },
        runner: {
          type: defaultRunner,
        },
        review: {
          required: resolvedConfig.reviewRequiredByDefault,
        },
      };
      tasks.push(task);
      phaseTaskIds.push(task.taskId);
      previousTaskInPhase = task;
    });
    previousPhaseLeafTaskIds = phase.execution === "parallel"
      ? phaseTaskIds
      : phaseTaskIds.slice(-1);
  }

  if (spec.acceptanceCriteria.length > 0 && tasks.length > 0) {
    const firstCodingTask = tasks.find((t) => t.kind === "coding");
    if (firstCodingTask) {
      firstCodingTask.contract = contractFromSpecCriteria(firstCodingTask.taskId, spec.acceptanceCriteria);
    }
  }

  const finalTasks = resolvedConfig.evaluator.enabled
    ? injectEvaluatorTasks(tasks, resolvedConfig)
    : tasks;

  const validation = validateTaskGraph(finalTasks);
  if (!validation.ok) {
    throw new Error(`Invalid task graph: ${validation.errors.join("; ")}`);
  }
  return upsertTaskStatuses(finalTasks);
}
