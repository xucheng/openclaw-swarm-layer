import type { TaskNode } from "../types.js";

export type ConcurrencyCheckResult = {
  admitted: boolean;
  activeCount: number;
  maxConcurrent: number;
  queueDepth: number;
};

export function checkConcurrencySlot(
  tasks: TaskNode[],
  maxConcurrent: number,
): ConcurrencyCheckResult {
  const activeCount = tasks.filter(
    (task) => task.status === "running" && task.runner.type === "acp",
  ).length;
  const queueDepth = tasks.filter((task) => task.status === "queued").length;

  return {
    admitted: activeCount < maxConcurrent,
    activeCount,
    maxConcurrent,
    queueDepth,
  };
}
