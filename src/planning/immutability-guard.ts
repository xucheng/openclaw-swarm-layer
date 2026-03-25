import type { TaskNode } from "../types.js";

const IMMUTABLE_FIELDS: ReadonlySet<string> = new Set([
  "taskId",
  "specId",
  "phaseId",
  "title",
  "description",
  "kind",
  "deps",
  "workspace",
  "runner",
]);

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);
  if (keysA.length !== keysB.length) return false;

  return keysA.every((key) =>
    deepEqual(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
    ),
  );
}

export function validateTaskImmutability(
  previous: TaskNode[],
  next: TaskNode[],
): { ok: boolean; violations: string[] } {
  const violations: string[] = [];

  // Build index of previous tasks
  const prevMap = new Map<string, TaskNode>();
  for (const task of previous) {
    prevMap.set(task.taskId, task);
  }

  // Check for removed tasks
  const nextIds = new Set(next.map((t) => t.taskId));
  for (const prevTask of previous) {
    if (!nextIds.has(prevTask.taskId)) {
      violations.push(`Task removed: ${prevTask.taskId}`);
    }
  }

  // Check immutable fields on existing tasks
  for (const nextTask of next) {
    const prevTask = prevMap.get(nextTask.taskId);
    if (!prevTask) continue; // new task — allowed

    for (const field of IMMUTABLE_FIELDS) {
      const prevVal = (prevTask as Record<string, unknown>)[field];
      const nextVal = (nextTask as Record<string, unknown>)[field];
      if (!deepEqual(prevVal, nextVal)) {
        violations.push(`Immutable field changed: ${nextTask.taskId}.${field}`);
      }
    }
  }

  return { ok: violations.length === 0, violations };
}
