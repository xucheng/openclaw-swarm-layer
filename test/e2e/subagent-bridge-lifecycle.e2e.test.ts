import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmInit } from "../../src/cli/swarm-init.js";
import { runSwarmPlan } from "../../src/cli/swarm-plan.js";
import { runSwarmRun } from "../../src/cli/swarm-run.js";
import { runSwarmSessionCancel } from "../../src/cli/swarm-session-cancel.js";
import { runSwarmSessionStatus } from "../../src/cli/swarm-session-status.js";
import type { OpenClawSubagentAdapter } from "../../src/runtime/openclaw-subagent-adapter.js";
import { StateStore } from "../../src/state/state-store.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-subagent-lifecycle-"));
}

describe("e2e: subagent bridge lifecycle", () => {
  it("syncs subagent completion and supports cancel path", async () => {
    const projectRoot = await makeTempProject();
    const specPath = path.join(projectRoot, "SPEC-SUB-LIFE.md");
    const stateStore = new StateStore({
      subagent: { enabled: true },
    });
    let currentState: "running" | "completed" = "running";
    const subagentAdapter: OpenClawSubagentAdapter = {
      async spawnSubagent() {
        return {
          childSessionKey: "agent:main:subagent:lifecycle",
          runId: "sub-run-lifecycle",
          mode: "run",
          note: "spawned",
        };
      },
      async getSubagentRunStatus() {
        return {
          childSessionKey: "agent:main:subagent:lifecycle",
          runId: "sub-run-lifecycle",
          state: currentState,
          checkedAt: "2026-03-21T00:10:00.000Z",
          message: currentState === "completed" ? "done" : "running",
        };
      },
      async killSubagentRun() {
        return {
          childSessionKey: "agent:main:subagent:lifecycle",
          killedAt: "2026-03-21T00:11:00.000Z",
          message: "killed",
        };
      },
    };
    await fs.writeFile(specPath, "# Subagent Lifecycle\n\n## Goals\n- test lifecycle\n\n## Phases\n### Execute\n- delegate\n", "utf8");

    await runSwarmInit({ project: projectRoot }, { stateStore });
    await runSwarmPlan({ project: projectRoot, spec: specPath }, { stateStore });

    const runResult = await runSwarmRun(
      { project: projectRoot, runner: "subagent" },
      { stateStore, subagentAdapter },
    );
    expect((runResult as any).action).toBe("dispatched");

    currentState = "completed";
    const statusResult = await runSwarmSessionStatus(
      { project: projectRoot, run: "sub-run-lifecycle" },
      { stateStore, subagentAdapter },
    );
    const workflowAfterStatus = await stateStore.loadWorkflow(projectRoot);
    expect((statusResult as any).status).toBe("completed");
    expect((statusResult as any).resultSummary).toContain("Completed:");
    expect(workflowAfterStatus.lifecycle).toBe("reviewing");
    const reportAfterStatus = await fs.readFile((statusResult as any).localReportPath, "utf8");
    expect(reportAfterStatus).toContain("## Recent Runs");
    expect(reportAfterStatus).toContain("done");
    expect(reportAfterStatus).toContain("Last action: run:completed");
    expect(reportAfterStatus).toContain("## Review Queue");
    expect(reportAfterStatus).toContain("## Attention");
    expect(reportAfterStatus).toContain("[review]");
    expect(reportAfterStatus).toContain("Action:");
    expect(reportAfterStatus).toContain("## Highlights");
    expect(reportAfterStatus).toContain("## Recommended Actions");

    await stateStore.saveWorkflow(projectRoot, {
      ...workflowAfterStatus,
      lifecycle: "running",
      reviewQueue: [],
      tasks: workflowAfterStatus.tasks.map((task) => ({ ...task, status: "running", review: { required: true } })),
    });
    await stateStore.writeRun(projectRoot, {
      ...(await stateStore.loadRun(projectRoot, "sub-run-lifecycle"))!,
      status: "running",
      endedAt: undefined,
    });

    const cancelResult = await runSwarmSessionCancel(
      { project: projectRoot, run: "sub-run-lifecycle", reason: "operator stop" },
      { stateStore, subagentAdapter },
    );
    const workflowAfterCancel = await stateStore.loadWorkflow(projectRoot);
    expect((cancelResult as any).status).toBe("cancelled");
    expect((cancelResult as any).resultSummary).toContain("killed");
    expect(workflowAfterCancel.lifecycle).toBe("blocked");
    const reportAfterCancel = await fs.readFile((cancelResult as any).localReportPath, "utf8");
    expect(reportAfterCancel).toContain("killed");
    expect(reportAfterCancel).toContain("Last action: run:cancelled");
    expect(reportAfterCancel).toContain("[blocked]");
    expect(reportAfterCancel).toContain("## Highlights");
    expect(reportAfterCancel).toContain("## Recommended Actions");
  });
});
