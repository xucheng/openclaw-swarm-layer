import type { SwarmPluginConfig } from "../config.js";
import { applyReviewDecision, type ReviewDecisionOptions } from "../review/review-gate.js";
import type { RunRecord, TaskNode, WorkflowState } from "../types.js";

const AUTO_SAFE_BASE_DENY_TAGS = [
  "prod",
  "production",
  "deploy",
  "release",
  "migration",
  "security",
  "secret",
  "credential",
  "billing",
  "payment",
  "incident",
  "rollback",
];

export type AutopilotReviewDecision = {
  taskId: string;
  decision: "approve" | "reject" | "escalate";
  finalStatus?: TaskNode["status"];
  reason: string;
  matchedAllowTags: string[];
  matchedDenyTags: string[];
};

export type AutopilotReviewResult = {
  workflow: WorkflowState;
  decisions: AutopilotReviewDecision[];
  counts: {
    autoApproved: number;
    retryQueued: number;
    rejectedBlocked: number;
    escalated: number;
  };
};

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function findLatestRun(taskId: string, runs: RunRecord[]): RunRecord | undefined {
  return [...runs]
    .filter((runRecord) => runRecord.taskId === taskId)
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0];
}

function buildTaskSignalText(task: TaskNode, runRecord?: RunRecord): string {
  const criteriaText = task.contract?.criteria.map((criterion) => criterion.description).join(" ") ?? "";
  return normalizeText(
    [
      task.taskId,
      task.phaseId,
      task.title,
      task.description,
      task.kind,
      task.runner.type,
      runRecord?.promptSummary,
      runRecord?.resultSummary,
      criteriaText,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function matchTags(signalText: string, tags: string[]): string[] {
  return tags.filter((tag) => {
    const normalizedTag = normalizeText(tag);
    return normalizedTag.length > 0 && signalText.includes(normalizedTag);
  });
}

function buildRejectOptions(config: Pick<SwarmPluginConfig, "review">): ReviewDecisionOptions {
  return {
    rejectPolicy: config.review.rejectPolicy,
    maxRejectRetries: config.review.maxRejectRetries,
  };
}

export function applyAutopilotReviewPolicy(
  workflow: WorkflowState,
  runs: RunRecord[],
  config: Pick<SwarmPluginConfig, "autopilot" | "review">,
): AutopilotReviewResult {
  let nextWorkflow = workflow;
  const decisions: AutopilotReviewDecision[] = [];
  const mode = config.autopilot.reviewPolicy.mode;

  for (const taskId of workflow.reviewQueue) {
    const task = nextWorkflow.tasks.find((entry) => entry.taskId === taskId);
    if (!task) {
      continue;
    }

    const latestRun = findLatestRun(taskId, runs);
    const signalText = buildTaskSignalText(task, latestRun);
    const denyTags = Array.from(
      new Set([
        ...config.autopilot.reviewPolicy.denyTags,
        ...(mode === "auto_safe" ? AUTO_SAFE_BASE_DENY_TAGS : []),
      ]),
    );
    const matchedDenyTags = matchTags(signalText, denyTags);
    const matchedAllowTags = matchTags(signalText, config.autopilot.reviewPolicy.allowlistTags);

    if (mode === "manual_only") {
      continue;
    }

    if (!latestRun) {
      decisions.push({
        taskId,
        decision: "escalate",
        reason: "review requires operator attention because no run record was found",
        matchedAllowTags,
        matchedDenyTags,
      });
      continue;
    }

    if (latestRun.status !== "completed") {
      const rejectNote = `autopilot rejected ${taskId} after ${latestRun.status}: ${latestRun.resultSummary ?? "run did not complete cleanly"}`;
      const result = applyReviewDecision(
        nextWorkflow,
        taskId,
        "reject",
        rejectNote,
        buildRejectOptions(config),
      );
      nextWorkflow = result.workflow;
      decisions.push({
        taskId,
        decision: "reject",
        finalStatus: result.task.status,
        reason: rejectNote,
        matchedAllowTags,
        matchedDenyTags,
      });
      continue;
    }

    if (matchedDenyTags.length > 0) {
      decisions.push({
        taskId,
        decision: "escalate",
        reason: `review requires operator attention because task matched deny tags: ${matchedDenyTags.join(", ")}`,
        matchedAllowTags,
        matchedDenyTags,
      });
      continue;
    }

    if (mode === "auto_allowlist" && matchedAllowTags.length === 0) {
      decisions.push({
        taskId,
        decision: "escalate",
        reason: "review requires operator attention because task is not on the allowlist",
        matchedAllowTags,
        matchedDenyTags,
      });
      continue;
    }

    const approveNote =
      mode === "auto_allowlist" && matchedAllowTags.length > 0
        ? `autopilot approved allowlisted task (${matchedAllowTags.join(", ")})`
        : "autopilot approved completed task under auto_safe policy";
    const result = applyReviewDecision(nextWorkflow, taskId, "approve", approveNote);
    nextWorkflow = result.workflow;
    decisions.push({
      taskId,
      decision: "approve",
      finalStatus: result.task.status,
      reason: approveNote,
      matchedAllowTags,
      matchedDenyTags,
    });
  }

  return {
    workflow: nextWorkflow,
    decisions,
    counts: {
      autoApproved: decisions.filter((decision) => decision.decision === "approve").length,
      retryQueued: decisions.filter((decision) => decision.decision === "reject" && decision.finalStatus === "ready").length,
      rejectedBlocked: decisions.filter((decision) => decision.decision === "reject" && decision.finalStatus === "blocked").length,
      escalated: decisions.filter((decision) => decision.decision === "escalate").length,
    },
  };
}
