import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmStatus } from "../../../src/cli/swarm-status.js";
import { StateStore } from "../../../src/state/state-store.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-status-"));
}

describe("swarm status cli", () => {
  it("returns last action, review queue, and recent runs", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore();
    await stateStore.initProject(projectRoot);
    await stateStore.saveWorkflow(projectRoot, {
      version: 1,
      projectRoot,
      activeSpecId: "spec-1",
      lifecycle: "reviewing",
      tasks: [
        {
          taskId: "task-1",
          specId: "spec-1",
          title: "Task 1",
          description: "Task 1",
          kind: "coding",
          deps: [],
          status: "review_required",
          workspace: { mode: "shared" },
          runner: { type: "acp", mode: "session" },
          review: { required: true, status: "pending" },
          session: {
            policy: "reuse_if_available",
            bindingKey: "feature-a",
          },
        },
      ],
      reviewQueue: ["task-1"],
      lastAction: {
        at: "2026-03-21T00:20:00.000Z",
        type: "run:completed",
        message: "task finished with summary",
      },
    });
    await stateStore.writeRun(projectRoot, {
      runId: "run-1",
      taskId: "task-1",
      attempt: 1,
      status: "completed",
      runner: { type: "acp" },
      workspacePath: projectRoot,
      startedAt: "2026-03-21T00:10:00.000Z",
      endedAt: "2026-03-21T00:20:00.000Z",
      artifacts: [],
      resultSummary: "task finished with summary",
    });
    await fs.mkdir(path.join(projectRoot, ".openclaw", "swarm", "sessions"), { recursive: true });
    await fs.writeFile(
      path.join(projectRoot, ".openclaw", "swarm", "sessions", "session-1.json"),
      JSON.stringify(
        {
          sessionId: "session-1",
          runner: "acp",
          projectRoot,
          scope: { specId: "spec-1", bindingKey: "feature-a", taskKind: "coding" },
          mode: "persistent",
          state: "active",
          createdAt: "2026-03-21T00:00:00.000Z",
          updatedAt: "2026-03-21T00:20:00.000Z",
          lastRunId: "run-1",
          providerRef: { sessionKey: "agent:codex:acp:1" },
          summary: "active session",
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await runSwarmStatus({ project: projectRoot }, { stateStore });

    expect(result.workflow.lastAction?.type).toBe("run:completed");
    expect(result.reviewQueue).toEqual([
      {
        taskId: "task-1",
        title: "Task 1",
        status: "review_required",
        latestRunId: "run-1",
        latestRunStatus: "completed",
        latestRunSummary: "task finished with summary",
        recommendedAction: "Review the latest run outcome and approve or reject the task.",
      },
    ]);
    expect(result.attention[0]?.kind).toBe("review");
    expect(result.attention[0]?.latestRunSummary).toBe("task finished with summary");
    expect(result.attention[0]?.recommendedAction).toContain("approve or reject");
    expect(result.highlights[0]?.kind).toBe("completed");
    expect(result.highlights[0]?.recommendedAction).toContain("Inspect the completion summary");
    expect(result.recommendedActions.length).toBeGreaterThan(0);
    expect(result.recentRuns[0]?.resultSummary).toBe("task finished with summary");
    expect(result.sessions.active).toBe(1);
    expect(result.recentSessions[0]?.sessionId).toBe("session-1");
    expect(result.reusableSessionCandidates[0]?.selectedSessionId).toBe("session-1");
    expect(result.reusableSessionCandidates[0]?.reason).toContain("Reusable session candidate found");
  });
});
