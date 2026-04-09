import fs from "node:fs/promises";
import path from "node:path";
import { AutopilotStore } from "../autopilot/autopilot-store.js";
import { buildAutopilotHealthSummary } from "../autopilot/metrics.js";
import { createDefaultAutopilotState, type AutopilotState } from "../autopilot/types.js";
import type { SwarmPluginConfig } from "../config.js";
import { describeAcpExecutionPosture, resolveRuntimePolicySnapshot } from "../config.js";
import { ensureDir } from "../lib/json-file.js";
import { resolveSwarmPaths } from "../lib/paths.js";
import { buildAcpBridgeExitGate, formatAcpBridgeExitGateNotes } from "../runtime/acp-bridge-exit-gate.js";
import { summarizeSessionReuseForTask } from "../session/session-selector.js";
import { SessionStore } from "../session/session-store.js";
import { StateStore } from "../state/state-store.js";
import type { RunRecord, WorkflowState } from "../types.js";
import { buildAttentionItems, buildOperatorHighlights, buildRecommendedActions, buildReviewQueueItems } from "./operator-summary.js";

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

function buildRuntimePolicyLines(workflow: WorkflowState, stateStore: StateStore): string[] {
  const runtime = resolveRuntimePolicySnapshot(stateStore.config, workflow.runtime, { runtimeVersion: stateStore.runtimeVersion });
  return [
    `- Configured default runner: ${runtime.configuredDefaultRunner}`,
    `- Resolved default runner: ${runtime.resolvedDefaultRunner}`,
    `- Workflow default runner: ${runtime.workflowDefaultRunner ?? "(none)"}`,
    `- Allowed runners: ${runtime.allowedRunners.join(", ")}`,
    `- Default runner resolution: ${runtime.configuredDefaultRunner} -> ${runtime.resolvedDefaultRunner} on this install`,
    `- Manual runner fallback: available`,
    `- ACP execution posture: ${describeAcpExecutionPosture(stateStore.config)}`,
  ];
}

function buildAutopilotLines(
  workflow: WorkflowState,
  stateStore: StateStore,
  runs: RunRecord[],
  autopilotState = createDefaultAutopilotState(workflow.projectRoot, stateStore.config),
): string[] {
  const autopilotStore = new AutopilotStore(stateStore.config);
  const health = buildAutopilotHealthSummary(runs, autopilotState, stateStore.config);
  const queuePressure = {
    runnableTasks: workflow.tasks.filter((task) => task.status === "planned" || task.status === "ready").length,
    queuedTasks: workflow.tasks.filter((task) => task.status === "queued").length,
    runningTasks: workflow.tasks.filter((task) => task.status === "running").length,
    reviewQueueSize: workflow.reviewQueue.length,
  };
  return [
    `- Enabled: ${stateStore.config.autopilot.enabled ? "yes" : "no"}`,
    `- Mode: ${autopilotState.mode}`,
    `- Desired state: ${autopilotState.desiredState}`,
    `- Runtime state: ${autopilotState.runtimeState}`,
    ...(autopilotState.pausedReason ? [`- Paused reason: ${autopilotState.pausedReason}`] : []),
    `- Last tick: ${autopilotState.lastTickAt ?? "(never)"}`,
    `- Next tick: ${autopilotState.nextTickAt ?? "(none)"}`,
    `- Degraded: ${health.degraded ? "yes" : "no"}`,
    ...(autopilotState.degradedReason ? [`- Degraded reason: ${autopilotState.degradedReason}`] : []),
    ...(autopilotState.degradedSince ? [`- Degraded since: ${autopilotState.degradedSince}`] : []),
    ...(autopilotState.lastDecision
      ? [
          `- Last decision: ${autopilotState.lastDecision.action} - ${autopilotState.lastDecision.summary}`,
        ]
      : ["- Last decision: (none)"]),
    `- Queue pressure: runnable=${queuePressure.runnableTasks}, queued=${queuePressure.queuedTasks}, running=${queuePressure.runningTasks}, review=${queuePressure.reviewQueueSize}`,
    `- Metrics: ticks=${autopilotState.metrics.tickCount}, dryRuns=${autopilotState.metrics.dryRunCount}, observations=${autopilotState.metrics.observationCount}, dispatches=${autopilotState.metrics.dispatchCount}, autoApprovals=${autopilotState.metrics.autoApproveCount}, retries=${autopilotState.metrics.retryCount}, escalations=${autopilotState.metrics.escalationCount}, cancels=${autopilotState.metrics.cancelCount}, closes=${autopilotState.metrics.closeCount}, degradedTicks=${autopilotState.metrics.degradedTickCount}`,
    `- Health: terminalRuns=${health.terminalRuns}/${health.terminalWindow}, failures=${health.failedRuns}, successes=${health.successfulRuns}, interventions=${health.intervenedRuns}, failureRate=${Math.round(health.failureRate * 100)}%, interventionRate=${Math.round(health.interventionRate * 100)}%`,
    `- Decision log: ${autopilotStore.resolvePaths(workflow.projectRoot).autopilotDecisionLogPath}`,
  ];
}

function buildAcpBridgeExitGateLines(stateStore: StateStore): string[] {
  const gate = buildAcpBridgeExitGate(stateStore.runtimeVersion, {
    publicControlPlaneExportReady: null,
    evidenceMode: "runtime-version-only",
  });
  const remainingDependencies =
    gate.remainingBridgeDependencies.length > 0
      ? gate.remainingBridgeDependencies.map((dependency) => dependency.id).join(", ")
      : "none";

  return [
    ...formatAcpBridgeExitGateNotes(gate).map((line) => `- ${line}`),
    `- Live smoke matrix checks: ${gate.liveSmokeMatrix.map((check) => check.id).join(", ")}`,
    `- Remaining ACP bridge dependencies: ${remainingDependencies}`,
  ];
}

export function buildWorkflowReport(
  workflow: WorkflowState,
  stateStore = new StateStore(),
  runs: RunRecord[] = [],
  autopilotState?: AutopilotState,
): string {
  const summary = stateStore.summarizeWorkflow(workflow);
  const taskLines = workflow.tasks.map(
    (task) => `- ${task.taskId}: ${task.title} [${task.status}]${task.review.required ? " review" : ""}`,
  );
  const runLines = buildRunLines(runs);
  const reviewQueueLines = buildReviewQueueLines(workflow, runs);
  const attentionLines = buildAttentionLines(workflow, runs);
  const highlightLines = buildHighlightLines(runs);
  const recommendedActionLines = buildRecommendedActionLines(workflow, runs);
  const runtimePolicyLines = buildRuntimePolicyLines(workflow, stateStore);
  const acpBridgeExitGateLines = buildAcpBridgeExitGateLines(stateStore);
  const autopilotLines = buildAutopilotLines(workflow, stateStore, runs, autopilotState);

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
    `## Runtime Policy`,
    ...runtimePolicyLines,
    ``,
    `## ACP Bridge Exit Gate`,
    ...acpBridgeExitGateLines,
    ``,
    `## Autopilot`,
    ...autopilotLines,
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
  stateStore = new StateStore(config),
): Promise<ReportWriteResult> {
  const resolvedConfig = config ?? stateStore.config;
  const paths = resolveSwarmPaths(projectRoot, resolvedConfig);
  const sessionStore = new SessionStore(stateStore.config);
  const autopilotStore = new AutopilotStore(stateStore.config);
  const runs = await stateStore.loadRuns(projectRoot);
  const sessions = await sessionStore.listSessions(projectRoot);
  const autopilotState = await autopilotStore.getState(projectRoot);
  const report = buildWorkflowReport(workflow, stateStore, runs, autopilotState);
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
