import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmSessionStatus } from "../../../src/cli/swarm-session-status.js";
import type { OpenClawSessionAdapter } from "../../../src/runtime/openclaw-session-adapter.js";
import { StateStore } from "../../../src/state/state-store.js";
import type { RunRecord } from "../../../src/types.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-session-status-"));
}

describe("swarm session status cli", () => {
  it("loads an ACP run, syncs status, and persists the updated run", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore();
    await stateStore.saveWorkflow(projectRoot, {
      version: 1,
      projectRoot,
      lifecycle: "running",
      tasks: [
        {
          taskId: "task-1",
          specId: "spec-1",
          title: "Task 1",
          description: "Task 1",
          kind: "coding",
          deps: [],
          status: "running",
          workspace: { mode: "shared" },
          runner: { type: "acp" },
          review: { required: true },
        },
      ],
      reviewQueue: [],
    });
    const runRecord: RunRecord = {
      runId: "run-acp-1",
      taskId: "task-1",
      attempt: 1,
      status: "accepted",
      runner: { type: "acp" },
      workspacePath: projectRoot,
      startedAt: "2026-03-20T00:00:00.000Z",
      artifacts: [],
      sessionRef: { runtime: "acp", sessionKey: "agent:codex:acp:1" },
    };
    await stateStore.initProject(projectRoot);
    await stateStore.writeRun(projectRoot, runRecord);

    const sessionAdapter: OpenClawSessionAdapter = {
      async spawnAcpSession() {
        throw new Error("not used");
      },
      async getAcpSessionStatus() {
        return {
          sessionKey: "agent:codex:acp:1",
          state: "running",
          checkedAt: "2026-03-20T00:01:00.000Z",
          message: "running",
        };
      },
      async cancelAcpSession() {
        throw new Error("not used");
      },
      async closeAcpSession() {
        throw new Error("not used");
      },
    };

    const result = await runSwarmSessionStatus(
      { project: projectRoot, run: "run-acp-1" },
      { stateStore, sessionAdapter },
    );
    const saved = await stateStore.loadRun(projectRoot, "run-acp-1");

    expect((result as any).status).toBe("running");
    expect(saved?.status).toBe("running");
    expect(saved?.events?.some((event) => event.type === "status_polled")).toBe(true);
    expect((result as any).localReportPath).toContain(path.join(".openclaw", "swarm", "reports"));
  });

  it("moves timed out runs into review", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore();
    await stateStore.initProject(projectRoot);
    await stateStore.saveWorkflow(projectRoot, {
      version: 1,
      projectRoot,
      lifecycle: "running",
      tasks: [
        {
          taskId: "task-1",
          specId: "spec-1",
          title: "Task 1",
          description: "Task 1",
          kind: "coding",
          deps: [],
          status: "running",
          workspace: { mode: "shared" },
          runner: { type: "acp" },
          review: { required: true },
        },
      ],
      reviewQueue: [],
    });
    await stateStore.writeRun(projectRoot, {
      runId: "run-acp-timeout",
      taskId: "task-1",
      attempt: 1,
      status: "running",
      runner: { type: "acp" },
      workspacePath: projectRoot,
      startedAt: "2026-03-20T00:00:00.000Z",
      artifacts: [],
      sessionRef: { runtime: "acp", sessionKey: "agent:codex:acp:timeout" },
    });
    const sessionAdapter: OpenClawSessionAdapter = {
      async spawnAcpSession() {
        throw new Error("not used");
      },
      async getAcpSessionStatus() {
        return {
          sessionKey: "agent:codex:acp:timeout",
          state: "timed_out",
          checkedAt: "2026-03-20T00:04:00.000Z",
          message: "timeout",
        };
      },
      async cancelAcpSession() {
        throw new Error("not used");
      },
      async closeAcpSession() {
        throw new Error("not used");
      },
    };

    const result = await runSwarmSessionStatus(
      { project: projectRoot, run: "run-acp-timeout" },
      { stateStore, sessionAdapter },
    );
    const workflow = await stateStore.loadWorkflow(projectRoot);

    expect((result as any).status).toBe("timed_out");
    expect(workflow.lifecycle).toBe("reviewing");
    expect(workflow.reviewQueue).toEqual(["task-1"]);
  });

  it("falls back to local ledger when metadata is missing after close", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore();
    await stateStore.initProject(projectRoot);
    await stateStore.saveWorkflow(projectRoot, {
      version: 1,
      projectRoot,
      lifecycle: "planned",
      tasks: [
        {
          taskId: "task-1",
          specId: "spec-1",
          title: "Task 1",
          description: "Task 1",
          kind: "coding",
          deps: [],
          status: "done",
          workspace: { mode: "shared" },
          runner: { type: "acp" },
          review: { required: true, status: "approved" },
        },
      ],
      reviewQueue: [],
    });
    await stateStore.writeRun(projectRoot, {
      runId: "run-acp-closed",
      taskId: "task-1",
      attempt: 1,
      status: "completed",
      runner: { type: "acp" },
      workspacePath: projectRoot,
      startedAt: "2026-03-20T00:00:00.000Z",
      endedAt: "2026-03-20T00:01:00.000Z",
      artifacts: [],
      sessionRef: { runtime: "acp", sessionKey: "agent:codex:acp:closed" },
      events: [{ at: "2026-03-20T00:02:00.000Z", type: "closed" }],
    });
    const sessionAdapter: OpenClawSessionAdapter = {
      async spawnAcpSession() {
        throw new Error("not used");
      },
      async getAcpSessionStatus() {
        throw new Error("ACP metadata is missing for agent:codex:acp:closed");
      },
      async cancelAcpSession() {
        throw new Error("not used");
      },
      async closeAcpSession() {
        throw new Error("not used");
      },
    };

    const result = await runSwarmSessionStatus(
      { project: projectRoot, run: "run-acp-closed" },
      { stateStore, sessionAdapter },
    );

    expect((result as any).status).toBe("completed");
    expect((result as any).resultSummary).toContain("metadata missing");
  });

});
