import { resolveSessionStore, resolveStateStore, type SwarmCliContext } from "./context.js";
import { buildAttentionItems, buildOperatorHighlights, buildRecommendedActions, buildReviewQueueItems } from "../reporting/operator-summary.js";
import { summarizeSessionReuseForTask } from "../session/session-selector.js";

export type SwarmStatusResult = {
  ok: true;
  workflow: {
    lifecycle: string;
    activeSpecId?: string;
    totalTasks: number;
    readyTasks: number;
    runningTasks: number;
    blockedTasks: number;
    reviewQueueSize: number;
    lastAction?: {
      at: string;
      type: string;
      message?: string;
    };
  };
  reviewQueue: Array<{
    taskId: string;
    title?: string;
    status?: string;
    latestRunId?: string;
    latestRunStatus?: string;
    latestRunSummary?: string;
    recommendedAction?: string;
  }>;
  attention: Array<{
    kind: string;
    taskId: string;
    title?: string;
    message: string;
    latestRunId?: string;
    latestRunStatus?: string;
    latestRunSummary?: string;
    recommendedAction: string;
  }>;
  recentRuns: Array<{
    runId: string;
    taskId: string;
    runner: string;
    status: string;
    resultSummary?: string;
  }>;
  highlights: Array<{
    kind: string;
    runId: string;
    taskId: string;
    runner: string;
    summary?: string;
    recommendedAction: string;
  }>;
  recommendedActions: string[];
  sessions: {
    total: number;
    active: number;
    idle: number;
    closed: number;
    failed: number;
    orphaned: number;
  };
  recentSessions: Array<{
    sessionId: string;
    runner: string;
    mode: string;
    state: string;
    summary?: string;
    lastRunId?: string;
  }>;
  reusableSessionCandidates: Array<{
    taskId: string;
    title?: string;
    policy: string;
    eligible: boolean;
    bindingKey?: string;
    selectedSessionId?: string;
    reason: string;
  }>;
};

export async function runSwarmStatus(
  options: { project: string },
  context?: SwarmCliContext,
): Promise<SwarmStatusResult> {
  const stateStore = resolveStateStore(context);
  const sessionStore = resolveSessionStore(context);
  const workflow = await stateStore.loadWorkflow(options.project);
  const runs = await stateStore.loadRuns(options.project);
  const sessions = await sessionStore.listSessions(options.project);
  const summary = stateStore.summarizeWorkflow(workflow);
  return {
    ok: true,
    workflow: {
      ...summary,
      lastAction: workflow.lastAction,
    },
    reviewQueue: buildReviewQueueItems(workflow, runs),
    attention: buildAttentionItems(workflow, runs),
    highlights: buildOperatorHighlights(runs),
    recommendedActions: buildRecommendedActions(workflow, runs),
    sessions: {
      total: sessions.length,
      active: sessions.filter((session) => session.state === "active").length,
      idle: sessions.filter((session) => session.state === "idle").length,
      closed: sessions.filter((session) => session.state === "closed").length,
      failed: sessions.filter((session) => session.state === "failed").length,
      orphaned: sessions.filter((session) => session.state === "orphaned").length,
    },
    recentSessions: [...sessions]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 5)
      .map((session) => ({
        sessionId: session.sessionId,
        runner: session.runner,
        mode: session.mode,
        state: session.state,
        summary: session.summary,
        lastRunId: session.lastRunId,
      })),
    reusableSessionCandidates: workflow.tasks.map((task) => ({
      taskId: task.taskId,
      title: task.title,
      ...summarizeSessionReuseForTask(task, sessions),
    })),
    recentRuns: [...runs]
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      .slice(0, 5)
      .map((run) => ({
        runId: run.runId,
        taskId: run.taskId,
        runner: run.runner.type,
        status: run.status,
        resultSummary: run.resultSummary,
      })),
  };
}
