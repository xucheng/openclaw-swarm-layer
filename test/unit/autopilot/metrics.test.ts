import { buildAutopilotHealthSummary } from "../../../src/autopilot/metrics.js";
import { createDefaultAutopilotState } from "../../../src/autopilot/types.js";
import { defaultSwarmPluginConfig } from "../../../src/config.js";
import type { RunRecord } from "../../../src/types.js";

function makeRun(runId: string, status: RunRecord["status"], events: RunRecord["events"] = []): RunRecord {
  return {
    runId,
    taskId: `task-${runId}`,
    attempt: 1,
    status,
    runner: { type: "acp" },
    workspacePath: "/tmp/project",
    startedAt: `2026-04-08T00:0${runId}:00.000Z`,
    endedAt: `2026-04-08T00:0${runId}:30.000Z`,
    artifacts: [],
    events,
  };
}

describe("autopilot metrics", () => {
  it("marks health as degraded when recent terminal failure rate breaches policy", () => {
    const state = createDefaultAutopilotState("/tmp/project", defaultSwarmPluginConfig);
    const summary = buildAutopilotHealthSummary(
      [
        makeRun("1", "failed"),
        makeRun("2", "timed_out"),
        makeRun("3", "completed"),
      ],
      state,
      defaultSwarmPluginConfig,
    );

    expect(summary.degraded).toBe(true);
    expect(summary.failedRuns).toBe(2);
    expect(summary.terminalRuns).toBe(3);
    expect(summary.failureRate).toBeCloseTo(2 / 3);
  });

  it("counts recovery-tagged runs as interventions", () => {
    const state = createDefaultAutopilotState("/tmp/project", defaultSwarmPluginConfig);
    const summary = buildAutopilotHealthSummary(
      [
        makeRun("1", "completed", [{ at: "2026-04-08T00:01:00.000Z", type: "recovery_cancelled" }]),
        makeRun("2", "completed"),
        makeRun("3", "completed"),
      ],
      state,
      defaultSwarmPluginConfig,
    );

    expect(summary.intervenedRuns).toBe(1);
    expect(summary.interventionRate).toBeCloseTo(1 / 3);
    expect(summary.degraded).toBe(false);
  });
});
