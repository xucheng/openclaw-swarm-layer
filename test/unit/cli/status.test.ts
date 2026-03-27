import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmStatus } from "../../../src/cli/swarm-status.js";
import { StateStore } from "../../../src/state/state-store.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-status-"));
}

describe("swarm status cli", () => {
  it("returns runtime policy, last action, review queue, and recent runs", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore({
      acp: {
        enabled: true,
        defaultAgentId: "codex",
        allowedAgents: ["codex"],
        defaultMode: "run",
        allowThreadBinding: false,
        defaultTimeoutSeconds: 600,
        experimentalControlPlaneAdapter: false,
      },
    }, { runtimeVersion: "2026.3.24" });
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
      runtime: {
        defaultRunner: "acp",
        allowedRunners: ["manual", "acp"],
      },
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

    expect(result.runtime).toEqual({
      configuredDefaultRunner: "auto",
      resolvedDefaultRunner: "acp",
      workflowDefaultRunner: "acp",
      allowedRunners: ["manual", "acp"],
      subagentEnabled: false,
    });
    expect(result.acpBridgeExitGate).toMatchObject({
      minimumVersion: "2026.3.22",
      currentVersion: "2026.3.24",
      versionSatisfied: true,
      publicControlPlaneExportReady: null,
      readyForBridgeRemoval: false,
      evidenceMode: "runtime-version-only",
    });
    expect(result.notes).toContain("Default runner resolution: auto -> acp on this install.");
    expect(result.notes).toContain("Manual runner remains the safe explicit fallback.");
    expect(result.notes).toContain("ACP execution posture: public control-plane only.");
    expect(result.notes).toContain("Subagent posture: legacy bridge-backed opt-in (disabled by default).");
    expect(result.notes).toContain("Bridge-free ACP floor: >=2026.3.22.");
    expect(result.notes).toContain("OpenClaw runtime version: 2026.3.24.");
    expect(result.notes).toContain(
      "ACP bridge exit gate: version floor satisfied; verify public ACP export readiness with swarm doctor before removing ACP bridge.",
    );
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
