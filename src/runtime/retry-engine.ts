import type { RetryHistoryEntry, RetryPolicy, RunRecord, TaskNode } from "../types.js";

const DEFAULT_RETRYABLE_STATUSES: RetryPolicy["retryOn"] = ["failed", "timed_out"];

export function isRetryableStatus(
  status: RunRecord["status"],
  policy: RetryPolicy,
): boolean {
  const retryOn = policy.retryOn.length > 0 ? policy.retryOn : DEFAULT_RETRYABLE_STATUSES;
  return retryOn.includes(status as "failed" | "timed_out");
}

export function shouldRetry(
  task: TaskNode,
  runRecord: RunRecord,
): { retry: boolean; reason: string } {
  const policy = task.runner.retryPolicy;
  if (!policy) {
    return { retry: false, reason: "no retry policy configured" };
  }

  if (!isRetryableStatus(runRecord.status, policy)) {
    return { retry: false, reason: `status ${runRecord.status} is not retryable` };
  }

  const pastAttempts = runRecord.retryHistory?.length ?? 0;
  const currentAttempt = pastAttempts + 1;
  if (currentAttempt >= policy.maxAttempts) {
    return { retry: false, reason: `exhausted ${policy.maxAttempts} attempts` };
  }

  return { retry: true, reason: `attempt ${currentAttempt + 1} of ${policy.maxAttempts}` };
}

export function appendRetryHistory(
  runRecord: RunRecord,
): RetryHistoryEntry[] {
  const entry: RetryHistoryEntry = {
    attempt: runRecord.attempt,
    runId: runRecord.runId,
    status: runRecord.status,
    at: runRecord.endedAt ?? runRecord.startedAt,
  };
  return [...(runRecord.retryHistory ?? []), entry];
}
