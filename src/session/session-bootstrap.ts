import fs from "node:fs/promises";
import { getRunnableTasks } from "../planning/task-graph.js";
import { StateStore } from "../state/state-store.js";
import type { BootstrapCheck, BootstrapResult } from "../types.js";

async function checkEnvironment(projectRoot: string): Promise<BootstrapCheck> {
  try {
    await fs.access(projectRoot);
    return { step: "environment", ok: true, message: `Project root exists: ${projectRoot}` };
  } catch {
    return { step: "environment", ok: false, message: `Project root not accessible: ${projectRoot}` };
  }
}

export async function runBootstrap(
  projectRoot: string,
  stateStore: StateStore,
): Promise<BootstrapResult> {
  const checks: BootstrapCheck[] = [];

  // Step 1: Environment check
  const envCheck = await checkEnvironment(projectRoot);
  checks.push(envCheck);
  if (!envCheck.ok) {
    return { ok: false, checks, resumedFromProgress: false };
  }

  // Step 2: Progress check
  const progress = await stateStore.loadProgress(projectRoot);
  checks.push({
    step: "progress",
    ok: true,
    message: progress ? "Existing progress loaded" : "No previous progress (fresh start)",
  });

  // Step 3: Task selection
  const workflow = await stateStore.loadWorkflow(projectRoot);
  const runnableTasks = getRunnableTasks(workflow.tasks);
  const selectedTask = runnableTasks[0];

  checks.push({
    step: "task_selection",
    ok: true,
    message: selectedTask
      ? `Selected task: ${selectedTask.taskId} — ${selectedTask.title}`
      : "No runnable tasks available",
  });

  // Step 4: Baseline verify — confirm selected task's deps are done
  if (selectedTask) {
    const allDepsDone = selectedTask.deps.every((depId) => {
      const dep = workflow.tasks.find((t) => t.taskId === depId);
      return dep && (dep.status === "done" || dep.status === "dead_letter");
    });
    checks.push({
      step: "baseline_verify",
      ok: allDepsDone,
      message: allDepsDone
        ? "All dependencies satisfied"
        : `Some dependencies not yet done for ${selectedTask.taskId}`,
    });
    if (!allDepsDone) {
      return {
        ok: false,
        checks,
        selectedTaskId: selectedTask.taskId,
        progress: progress ?? undefined,
        resumedFromProgress: progress !== null,
      };
    }
  } else {
    checks.push({
      step: "baseline_verify",
      ok: true,
      message: "No task selected, baseline verify skipped",
    });
  }

  return {
    ok: true,
    checks,
    selectedTaskId: selectedTask?.taskId,
    progress: progress ?? undefined,
    resumedFromProgress: progress !== null,
  };
}
