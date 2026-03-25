import type { SwarmPluginConfig } from "../config.js";
import type { TaskNode } from "../types.js";

export function isEvaluatorTask(task: TaskNode): boolean {
  return task.kind === "evaluate";
}

function buildEvaluatorDescription(sourceTask: TaskNode): string {
  if (sourceTask.contract && sourceTask.contract.criteria.length > 0) {
    const criteriaList = sourceTask.contract.criteria
      .map((c) => `- ${c.description} (${c.kind})`)
      .join("\n");
    return `Evaluate task "${sourceTask.title}" against acceptance criteria:\n${criteriaList}`;
  }
  return `Evaluate task "${sourceTask.title}" — verify output meets requirements`;
}

export function injectEvaluatorTasks(
  tasks: TaskNode[],
  config: Pick<SwarmPluginConfig, "evaluator">,
): TaskNode[] {
  if (!config.evaluator.enabled) {
    return tasks;
  }

  const injectAfter = new Set(config.evaluator.autoInjectAfter);
  const result: TaskNode[] = [];

  for (const task of tasks) {
    result.push(task);

    if (injectAfter.has(task.kind) && !isEvaluatorTask(task)) {
      const evalTask: TaskNode = {
        taskId: `${task.taskId}-eval`,
        specId: task.specId,
        phaseId: task.phaseId,
        title: `Evaluate: ${task.title}`,
        description: buildEvaluatorDescription(task),
        kind: "evaluate",
        deps: [task.taskId],
        status: "planned",
        workspace: task.workspace,
        runner: task.runner,
        review: { required: false },
        contract: task.contract ? { ...task.contract } : undefined,
      };
      result.push(evalTask);
    }
  }

  // Fix dependency chains: if task B depended on task A, and we inserted A-eval,
  // task B should now depend on A-eval instead
  const evalTaskIds = new Map<string, string>();
  for (const task of result) {
    if (isEvaluatorTask(task) && task.deps.length === 1) {
      evalTaskIds.set(task.deps[0], task.taskId);
    }
  }

  return result.map((task) => {
    if (isEvaluatorTask(task)) return task; // evaluator deps are already correct
    const newDeps = task.deps.map((depId) => evalTaskIds.get(depId) ?? depId);
    if (newDeps.some((d, i) => d !== task.deps[i])) {
      return { ...task, deps: newDeps };
    }
    return task;
  });
}
