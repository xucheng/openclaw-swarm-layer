import { checkBudgetExceeded, buildBudgetUsageFromRun, computeRunDuration } from "../../../src/session/session-budget.js";
import type { BudgetUsage, RunRecord, SessionBudget } from "../../../src/types.js";

function makeRun(overrides: Partial<RunRecord> & { runId: string }): RunRecord {
  return {
    taskId: "t1",
    attempt: 1,
    status: "completed",
    runner: { type: "manual" },
    workspacePath: "/tmp",
    startedAt: "2026-01-01T00:00:00Z",
    endedAt: "2026-01-01T00:01:00Z",
    artifacts: [],
    ...overrides,
  };
}

describe("session-budget", () => {
  describe("computeRunDuration", () => {
    it("computes seconds between start and end", () => {
      const run = makeRun({
        runId: "r1",
        startedAt: "2026-01-01T00:00:00Z",
        endedAt: "2026-01-01T00:05:30Z",
      });
      expect(computeRunDuration(run)).toBe(330);
    });

    it("returns 0 when endedAt is missing", () => {
      const run = makeRun({
        runId: "r1",
        startedAt: "2026-01-01T00:00:00Z",
        endedAt: undefined,
      });
      expect(computeRunDuration(run)).toBe(0);
    });

    it("returns 0 for invalid timestamps", () => {
      const run = makeRun({
        runId: "r1",
        startedAt: "not-a-date",
        endedAt: "also-not-a-date",
      });
      expect(computeRunDuration(run)).toBe(0);
    });
  });

  describe("buildBudgetUsageFromRun", () => {
    it("builds usage from a single run", () => {
      const run = makeRun({
        runId: "r1",
        startedAt: "2026-01-01T00:00:00Z",
        endedAt: "2026-01-01T00:02:00Z",
      });
      const usage = buildBudgetUsageFromRun(run);
      expect(usage.durationSeconds).toBe(120);
      expect(usage.retriesUsed).toBe(0);
      expect(usage.exceeded).toBe(false);
    });

    it("accumulates duration from existing usage", () => {
      const run = makeRun({
        runId: "r2",
        startedAt: "2026-01-01T00:05:00Z",
        endedAt: "2026-01-01T00:06:00Z",
      });
      const existing: BudgetUsage = {
        durationSeconds: 120,
        retriesUsed: 1,
        exceeded: false,
      };
      const usage = buildBudgetUsageFromRun(run, existing);
      expect(usage.durationSeconds).toBe(180);
      expect(usage.retriesUsed).toBe(1); // attempt=1, no retry increment
    });

    it("increments retries when attempt > 1", () => {
      const run = makeRun({
        runId: "r2",
        attempt: 2,
        startedAt: "2026-01-01T00:00:00Z",
        endedAt: "2026-01-01T00:00:30Z",
      });
      const existing: BudgetUsage = {
        durationSeconds: 60,
        retriesUsed: 0,
        exceeded: false,
      };
      const usage = buildBudgetUsageFromRun(run, existing);
      expect(usage.retriesUsed).toBe(1);
    });
  });

  describe("checkBudgetExceeded", () => {
    it("returns false when under all limits", () => {
      const budget: SessionBudget = { maxDurationSeconds: 600, maxRetries: 3 };
      const usage: BudgetUsage = { durationSeconds: 100, retriesUsed: 1, exceeded: false };
      const result = checkBudgetExceeded(budget, usage);
      expect(result.exceeded).toBe(false);
    });

    it("returns true with reason when duration exceeded", () => {
      const budget: SessionBudget = { maxDurationSeconds: 60 };
      const usage: BudgetUsage = { durationSeconds: 120, retriesUsed: 0, exceeded: false };
      const result = checkBudgetExceeded(budget, usage);
      expect(result.exceeded).toBe(true);
      expect(result.reason).toContain("Duration");
      expect(result.reason).toContain("120");
    });

    it("returns true with reason when retries exceeded", () => {
      const budget: SessionBudget = { maxRetries: 2 };
      const usage: BudgetUsage = { durationSeconds: 30, retriesUsed: 3, exceeded: false };
      const result = checkBudgetExceeded(budget, usage);
      expect(result.exceeded).toBe(true);
      expect(result.reason).toContain("Retries");
    });

    it("returns false when budget has no limits (undefined fields)", () => {
      const budget: SessionBudget = {};
      const usage: BudgetUsage = { durationSeconds: 9999, retriesUsed: 99, exceeded: false };
      const result = checkBudgetExceeded(budget, usage);
      expect(result.exceeded).toBe(false);
    });
  });
});
