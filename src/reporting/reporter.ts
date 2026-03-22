import path from "node:path";
import type { SwarmPluginConfig } from "../config.js";
import { ensureDir } from "../lib/json-file.js";
import { resolveSwarmPaths } from "../lib/paths.js";
import type { RunRecord, WorkflowState } from "../types.js";
import { buildAttentionItems, buildOperatorHighlights, buildRecommendedActions, buildReviewQueueItems } from "./operator-summary.js";
import { SessionStore } from "../session/session-store.js";
import { summarizeSessionReuseForTask } from "../session/session-selector.js";
import { StateStore } from "../state/state-store.js";
import fs from "node:fs/promises";

export type ReportWriteResult = {
  report: string;
  localReportPath: string;
  obsidianReportPath?: string;
};

function buildRunLines(runs: RunRecord[]): string[] {
  const sorted = [...runs].sort((left, right) => right.startedAt.localeCompare(left.startedAt)).slice(0, 5);
  return sorted.map((run) => {
    const summary = run.resultSummary?.trim();
    const suffix = summary ? ` - ${summary}` : "";
    return `- ${run.runId}: ${run.runner.type} [${run.status}]${suffix}`;
  });
}

function buildReviewQueueLines(workflow: WorkflowState, runs: RunRecord[]): string[] {
  return buildReviewQueueItems(workflow, runs).map((item) => {
    const suffix = item.latestRunSummary ? ` - ${item.latestRunSummary}` : "";
    return `- ${item.taskId}: ${item.title ?? "(unknown task)"}${suffix}`;
  });
}

function buildAttentionLines(workflow: WorkflowState, runs: RunRecord[]): string[] {
  return buildAttentionItems(workflow, runs).map((item) => {
    const suffix = item.latestRunSummary ? ` - ${item.latestRunSummary}` : "";
    return `- [${item.kind}] ${item.taskId}: ${item.message}${suffix} | Action: ${item.recommendedAction}`;
  });
}

function buildHighlightLines(runs: RunRecord[]): string[] {
  return buildOperatorHighlights(runs).map((item) => {
    const suffix = item.summary ? ` - ${item.summary}` : "";
    return `- [${item.kind}] ${item.runId}: ${item.runner}/${item.taskId}${suffix} | Action: ${item.recommendedAction}`;
  });
}

function buildRecommendedActionLines(workflow: WorkflowState, runs: RunRecord[]): string[] {
  return buildRecommendedActions(workflow, runs).map((action) => `- ${action}`);
}

function buildSessionLines(sessions: Awaited<ReturnType<SessionStore["listSessions"]>>): string[] {
  return [...sessions]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 5)
    .map((session) => {
      const suffix = session.summary ? ` - ${session.summary}` : "";
      return `- ${session.sessionId}: ${session.runner}/${session.mode} [${session.state}]${suffix}`;
    });
}

function buildSessionCandidateLines(workflow: WorkflowState, sessions: Awaited<ReturnType<SessionStore["listSessions"]>>): string[] {
  return workflow.tasks.map((task) => {
    const candidate = summarizeSessionReuseForTask(task, sessions);
    const binding = candidate.bindingKey ? ` binding=${candidate.bindingKey}` : "";
    const selected = candidate.selectedSessionId ? ` selected=${candidate.selectedSessionId}` : "";
    return `- ${task.taskId}: policy=${candidate.policy} eligible=${candidate.eligible}${binding}${selected} - ${candidate.reason}`;
  });
}

export function buildWorkflowReport(workflow: WorkflowState, stateStore = new StateStore(), runs: RunRecord[] = []): string {
  const summary = stateStore.summarizeWorkflow(workflow);
  const taskLines = workflow.tasks.map(
    (task) => `- ${task.taskId}: ${task.title} [${task.status}]${task.review.required ? " review" : ""}`,
  );
  const runLines = buildRunLines(runs);
  const reviewQueueLines = buildReviewQueueLines(workflow, runs);
  const attentionLines = buildAttentionLines(workflow, runs);
  const highlightLines = buildHighlightLines(runs);
  const recommendedActionLines = buildRecommendedActionLines(workflow, runs);

  return [
    `# Swarm Report`,
    ``,
    `- Project: ${path.basename(workflow.projectRoot)}`,
    `- Lifecycle: ${summary.lifecycle}`,
    `- Active spec: ${summary.activeSpecId ?? "(none)"}`,
    `- Total tasks: ${summary.totalTasks}`,
    `- Ready tasks: ${summary.readyTasks}`,
    `- Running tasks: ${summary.runningTasks}`,
    `- Blocked tasks: ${summary.blockedTasks}`,
    `- Dead letter tasks: ${summary.deadLetterTasks}`,
    `- Review queue: ${summary.reviewQueueSize}`,
    ...(workflow.lastAction
      ? [
          `- Last action: ${workflow.lastAction.type}${workflow.lastAction.message ? ` - ${workflow.lastAction.message}` : ""}`,
        ]
      : []),
    ``,
    `## Attention`,
    ...(attentionLines.length > 0 ? attentionLines : ["- (none)"]),
    ``,
    `## Tasks`,
    ...(taskLines.length > 0 ? taskLines : ["- (none)"]),
    ``,
    `## Review Queue`,
    ...(reviewQueueLines.length > 0 ? reviewQueueLines : ["- (none)"]),
    ``,
    `## Highlights`,
    ...(highlightLines.length > 0 ? highlightLines : ["- (none)"]),
    ``,
    `## Recommended Actions`,
    ...(recommendedActionLines.length > 0 ? recommendedActionLines : ["- (none)"]),
    ``,
    `## Recent Runs`,
    ...(runLines.length > 0 ? runLines : ["- (none)"]),
  ].join("\n");
}

export async function writeWorkflowReport(
  projectRoot: string,
  workflow: WorkflowState,
  config?: Partial<SwarmPluginConfig>,
): Promise<ReportWriteResult> {
  const paths = resolveSwarmPaths(projectRoot, config);
  const stateStore = new StateStore(config);
  const sessionStore = new SessionStore(config);
  const runs = await stateStore.loadRuns(projectRoot);
  const sessions = await sessionStore.listSessions(projectRoot);
  const report = buildWorkflowReport(workflow, stateStore, runs);
  const sessionCandidateLines = buildSessionCandidateLines(workflow, sessions);
  const reportWithSessions = [
    report,
    ``,
    `## Sessions`,
    ...(buildSessionLines(sessions).length > 0 ? buildSessionLines(sessions) : ["- (none)"]),
    ``,
    `## Session Reuse Candidates`,
    ...(sessionCandidateLines.length > 0 ? sessionCandidateLines : ["- (none)"]),
  ].join("\n");

  await ensureDir(paths.reportsDir);
  await fs.writeFile(paths.localReportPath, `${reportWithSessions}\n`, "utf8");

  if (paths.obsidianReportPath) {
    await ensureDir(path.dirname(paths.obsidianReportPath));
    await fs.writeFile(paths.obsidianReportPath, `${reportWithSessions}\n`, "utf8");
  }

  return {
    report: reportWithSessions,
    localReportPath: paths.localReportPath,
    obsidianReportPath: paths.obsidianReportPath,
  };
}
