import type { TaskNode } from "../types.js";

export type TaskGraphValidationResult = {
  ok: boolean;
  errors: string[];
};

export function validateTaskGraph(tasks: TaskNode[]): TaskGraphValidationResult {
  const errors: string[] = [];
  const ids = new Set<string>();
  const tasksById = new Map(tasks.map((task) => [task.taskId, task]));

  for (const task of tasks) {
    if (ids.has(task.taskId)) {
      errors.push(`duplicate taskId: ${task.taskId}`);
    }
    ids.add(task.taskId);
    for (const dep of task.deps) {
      if (!tasksById.has(dep)) {
        errors.push(`missing dependency: ${task.taskId} -> ${dep}`);
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (taskId: string) => {
    if (visited.has(taskId)) {
      return;
    }
    if (visiting.has(taskId)) {
      errors.push(`cycle detected at taskId: ${taskId}`);
      return;
    }
    visiting.add(taskId);
    const task = tasksById.get(taskId);
    if (task) {
      for (const dep of task.deps) {
        visit(dep);
      }
    }
    visiting.delete(taskId);
    visited.add(taskId);
  };

  tasks.forEach((task) => visit(task.taskId));
  return { ok: errors.length === 0, errors };
}

export function getRunnableTasks(tasks: TaskNode[]): TaskNode[] {
  const taskStatus = new Map(tasks.map((task) => [task.taskId, task.status]));
  return tasks.filter((task) => {
    if (task.status !== "planned" && task.status !== "ready") {
      return false;
    }
    return task.deps.every((dep) => taskStatus.get(dep) === "done");
  }).map((task) => ({
    ...task,
    status: task.status === "planned" ? "ready" : task.status,
  }));
}

export function upsertTaskStatuses(tasks: TaskNode[]): TaskNode[] {
  const runnableIds = new Set(getRunnableTasks(tasks).map((task) => task.taskId));
  return tasks.map((task) => {
    if (task.status === "planned" && runnableIds.has(task.taskId)) {
      return { ...task, status: "ready" };
    }
    return task;
  });
}
