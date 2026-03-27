import { getSubagentRunnerDisabledMessage } from "../config.js";
import { writeWorkflowReport } from "../reporting/reporter.js";
import { createOrchestrator } from "../services/orchestrator.js";
import { SessionStore } from "../session/session-store.js";
import { resolveSessionAdapter, resolveStateStore, resolveSubagentAdapter, type SwarmCliContext } from "./context.js";

export async function runSwarmSessionFollowup(
  options: { project: string; session: string; task: string; runner?: "acp" | "subagent" },
  context?: SwarmCliContext,
): Promise<unknown> {
  const stateStore = resolveStateStore(context);
  const sessionStore = context?.sessionStore ?? new SessionStore(stateStore.config);
  const sessionAdapter = resolveSessionAdapter(context);
  const subagentAdapter = resolveSubagentAdapter(context);

  const session = await sessionStore.loadSession(options.project, options.session);
  if (!session) {
    return { ok: false, error: `Session not found: ${options.session}` };
  }
  if (session.state !== "active" && session.state !== "idle") {
    return { ok: false, error: `Session ${options.session} is in ${session.state} state, cannot follow up` };
  }

  // Load workflow and find next runnable task, or inject a synthetic one
  const workflow = await stateStore.loadWorkflow(options.project);
  const runnerType = options.runner ?? session.runner;
  const subagentDisabledMessage = runnerType === "subagent" ? getSubagentRunnerDisabledMessage(stateStore.config) : undefined;
  if (subagentDisabledMessage) {
    return { ok: false, error: subagentDisabledMessage };
  }

  // Create a synthetic follow-up task injected into the workflow
  const followupTaskId = `followup-${Date.now()}`;
  const followupTask = {
    taskId: followupTaskId,
    specId: workflow.activeSpecId ?? "followup",
    title: `Follow-up: ${options.task}`,
    description: options.task,
    kind: "coding" as const,
    deps: [],
    status: "ready" as const,
    workspace: { mode: "shared" as const },
    runner: { type: runnerType, threadRequested: Boolean(session.threadId) },
    review: { required: true },
    session: {
      policy: "require_existing" as const,
      bindingKey: session.scope.bindingKey,
      preferredSessionId: session.sessionId,
    },
  };

  // Add task to workflow
  const updatedWorkflow = {
    ...workflow,
    tasks: [...workflow.tasks, followupTask],
  };
  await stateStore.saveWorkflow(options.project, updatedWorkflow);

  // Dispatch through orchestrator
  const orchestrator = createOrchestrator({ stateStore, sessionStore, sessionAdapter, subagentAdapter });
  const result = await orchestrator.runOnce({
    projectRoot: options.project,
    taskId: followupTaskId,
    runnerOverride: runnerType,
  });

  if (!result.ok) {
    return result;
  }

  const finalWorkflow = await stateStore.loadWorkflow(options.project);
  const report = await writeWorkflowReport(options.project, finalWorkflow, stateStore.config, stateStore);

  return {
    ...result,
    followupTaskId,
    sessionId: options.session,
    localReportPath: report.localReportPath,
  };
}
