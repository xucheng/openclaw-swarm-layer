import type { BudgetUsage, RunRecord, SessionBudget } from "../types.js";

export function computeRunDuration(runRecord: RunRecord): number {
  if (!runRecord.startedAt || !runRecord.endedAt) {
    return 0;
  }
  const start = new Date(runRecord.startedAt).getTime();
  const end = new Date(runRecord.endedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return 0;
  }
  return Math.max(0, Math.round((end - start) / 1000));
}

export function buildBudgetUsageFromRun(runRecord: RunRecord, existing?: BudgetUsage): BudgetUsage {
  const duration = computeRunDuration(runRecord);
  const prevDuration = existing?.durationSeconds ?? 0;
  const prevRetries = existing?.retriesUsed ?? 0;

  return {
    durationSeconds: prevDuration + duration,
    retriesUsed: prevRetries + (runRecord.attempt > 1 ? 1 : 0),
    exceeded: false,
    exceededReason: undefined,
  };
}

export function checkBudgetExceeded(
  budget: SessionBudget,
  usage: BudgetUsage,
): { exceeded: boolean; reason?: string } {
  if (budget.maxDurationSeconds !== undefined && usage.durationSeconds !== undefined) {
    if (usage.durationSeconds > budget.maxDurationSeconds) {
      return {
        exceeded: true,
        reason: `Duration ${usage.durationSeconds}s exceeds budget of ${budget.maxDurationSeconds}s`,
      };
    }
  }

  if (budget.maxRetries !== undefined && usage.retriesUsed !== undefined) {
    if (usage.retriesUsed > budget.maxRetries) {
      return {
        exceeded: true,
        reason: `Retries ${usage.retriesUsed} exceeds budget of ${budget.maxRetries}`,
      };
    }
  }

  return { exceeded: false };
}
