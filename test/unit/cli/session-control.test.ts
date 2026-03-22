import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmSessionCancel } from "../../../src/cli/swarm-session-cancel.js";
import { runSwarmSessionClose } from "../../../src/cli/swarm-session-close.js";
import type { OpenClawSubagentAdapter } from "../../../src/runtime/openclaw-subagent-adapter.js";
import type { OpenClawSessionAdapter } from "../../../src/runtime/openclaw-session-adapter.js";
import { StateStore } from "../../../src/state/state-store.js";
import type { RunRecord } from "../../../src/types.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-session-control-"));
}

async function seedRun(stateStore: StateStore, projectRoot: string): Promise<void> {
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
  const runRecord: RunRecord = {
    runId: "run-acp-1",
    taskId: "task-1",
    attempt: 1,
    status: "running",
    runner: { type: "acp" },
    workspacePath: projectRoot,
    startedAt: "2026-03-20T00:00:00.000Z",
    artifacts: [],
    sessionRef: { runtime: "acp", sessionKey: "agent:codex:acp:1" },
  };
  await stateStore.writeRun(projectRoot, runRecord);
}

describe("swarm session control cli", () => {
  it("cancels a run and blocks the task", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore();
    await seedRun(stateStore, projectRoot);
    const sessionAdapter: OpenClawSessionAdapter = {
      async spawnAcpSession() {
        throw new Error("not used");
      },
      async getAcpSessionStatus() {
        throw new Error("not used");
      },
      async cancelAcpSession() {
        return { sessionKey: "agent:codex:acp:1", cancelledAt: "2026-03-20T00:02:00.000Z", message: "cancelled" };
      },
      async closeAcpSession() {
        throw new Error("not used");
      },
    };

    const result = await runSwarmSessionCancel(
      { project: projectRoot, run: "run-acp-1", reason: "operator stop" },
      { stateStore, sessionAdapter },
    );
    const run = await stateStore.loadRun(projectRoot, "run-acp-1");
    const workflow = await stateStore.loadWorkflow(projectRoot);

    expect((result as any).status).toBe("cancelled");
    expect(run?.status).toBe("cancelled");
    expect(workflow.lifecycle).toBe("blocked");
    expect(workflow.tasks[0]?.status).toBe("blocked");
    expect((result as any).localReportPath).toContain(path.join(".openclaw", "swarm", "reports"));
  });

  it("closes a run and appends a close event", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore();
    await seedRun(stateStore, projectRoot);
    const sessionAdapter: OpenClawSessionAdapter = {
      async spawnAcpSession() {
        throw new Error("not used");
      },
      async getAcpSessionStatus() {
        throw new Error("not used");
      },
      async cancelAcpSession() {
        throw new Error("not used");
      },
      async closeAcpSession() {
        return { sessionKey: "agent:codex:acp:1", closedAt: "2026-03-20T00:03:00.000Z", message: "closed" };
      },
    };

    const result = await runSwarmSessionClose(
      { project: projectRoot, run: "run-acp-1", reason: "done" },
      { stateStore, sessionAdapter },
    );
    const run = await stateStore.loadRun(projectRoot, "run-acp-1");

    expect((result as any).status).toBe("running");
    expect(run?.events?.some((event) => event.type === "closed")).toBe(true);
    expect((result as any).localReportPath).toContain(path.join(".openclaw", "swarm", "reports"));
  });

  it("kills a subagent run via the generic cancel path", async () => {
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
          runner: { type: "subagent" },
          review: { required: true },
        },
      ],
      reviewQueue: [],
    });
    await stateStore.writeRun(projectRoot, {
      runId: "run-subagent-1",
      taskId: "task-1",
      attempt: 1,
      status: "running",
      runner: { type: "subagent" },
      workspacePath: projectRoot,
      startedAt: "2026-03-20T00:00:00.000Z",
      artifacts: [],
      sessionRef: { runtime: "subagent", sessionKey: "agent:main:subagent:1" },
    });
    const subagentAdapter: OpenClawSubagentAdapter = {
      async spawnSubagent() {
        throw new Error("not used");
      },
      async getSubagentRunStatus() {
        throw new Error("not used");
      },
      async killSubagentRun() {
        return { childSessionKey: "agent:main:subagent:1", killedAt: "2026-03-20T00:06:00.000Z", message: "killed" };
      },
    };
    const sessionAdapter: OpenClawSessionAdapter = {
      async spawnAcpSession() {
        throw new Error("not used");
      },
      async getAcpSessionStatus() {
        throw new Error("not used");
      },
      async cancelAcpSession() {
        throw new Error("not used");
      },
      async closeAcpSession() {
        throw new Error("not used");
      },
    };

    const result = await runSwarmSessionCancel(
      { project: projectRoot, run: "run-subagent-1", reason: "kill it" },
      { stateStore, subagentAdapter, sessionAdapter },
    );
    const workflow = await stateStore.loadWorkflow(projectRoot);

    expect((result as any).status).toBe("cancelled");
    expect(workflow.lifecycle).toBe("blocked");
  });
});
