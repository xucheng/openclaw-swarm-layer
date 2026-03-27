import { AcpRunner } from "../../../src/runtime/acp-runner.js";
import type { OpenClawSessionAdapter } from "../../../src/runtime/openclaw-session-adapter.js";
import type { SessionRecord, TaskNode, WorkflowState } from "../../../src/types.js";

const task: TaskNode = {
  taskId: "task-acp",
  specId: "spec-1",
  title: "ACP Task",
  description: "ACP Task",
  kind: "coding",
  deps: [],
  status: "ready",
  workspace: { mode: "shared" },
  runner: { type: "acp", cwd: "/tmp/project" },
  review: { required: true },
};

const workflow: WorkflowState = {
  version: 1,
  projectRoot: "/tmp/project",
  lifecycle: "planned",
  tasks: [task],
  reviewQueue: [],
};

describe("AcpRunner", () => {
  it("returns a scaffold plan for dry-run flow", async () => {
    const runner = new AcpRunner({
      acp: {
        enabled: true,
        defaultAgentId: "codex",
        allowedAgents: ["codex"],
        defaultMode: "run",
        allowThreadBinding: false,
        defaultTimeoutSeconds: 600,
        experimentalControlPlaneAdapter: false,
      },
    });
    const plan = await runner.plan({ projectRoot: workflow.projectRoot, task, workflow, dryRun: true });

    expect(plan.runnable).toBe(true);
    expect(plan.summary).toContain("codex");
    expect(plan.workspacePath).toBe("/tmp/project");
  });

  it("throws for real execution until M2 is implemented", async () => {
    const runner = new AcpRunner({
      acp: {
        enabled: true,
        defaultAgentId: "codex",
        allowedAgents: ["codex"],
        defaultMode: "run",
        allowThreadBinding: false,
        defaultTimeoutSeconds: 600,
        experimentalControlPlaneAdapter: false,
      },
    });
    await expect(runner.run({ projectRoot: workflow.projectRoot, task, workflow })).rejects.toThrow(
      "ACP public control-plane execution is unavailable",
    );
  });

  it("creates an accepted run record when a session adapter is provided", async () => {
    const adapter: OpenClawSessionAdapter = {
      async spawnAcpSession() {
        return {
          sessionKey: "agent:codex:acp:123",
          backend: "acpx",
          backendSessionId: "backend-123",
          agentSessionId: "agent-session-123",
          acceptedAt: "2026-03-20T00:00:00.000Z",
        };
      },
      async getAcpSessionStatus() {
        return {
          sessionKey: "agent:codex:acp:123",
          state: "running",
        };
      },
      async cancelAcpSession() {
        return { sessionKey: "agent:codex:acp:123" };
      },
      async closeAcpSession() {
        return { sessionKey: "agent:codex:acp:123" };
      },
    };
    const runner = new AcpRunner(
      {
        acp: {
          enabled: true,
          defaultAgentId: "codex",
          allowedAgents: ["codex"],
          defaultMode: "run",
          allowThreadBinding: false,
          defaultTimeoutSeconds: 600,
          experimentalControlPlaneAdapter: false,
        },
      },
      adapter,
    );

    const result = await runner.run({ projectRoot: workflow.projectRoot, task, workflow });

    expect(result.accepted).toBe(true);
    expect(result.nextTaskStatus).toBe("running");
    expect(result.runRecord.status).toBe("accepted");
    expect(result.runRecord.sessionRef?.sessionKey).toBe("agent:codex:acp:123");
    expect(result.runRecord.events?.map((event) => event.type)).toEqual(["spawn_requested", "spawn_accepted"]);
  });

  it("marks run as reused when reusedSession is provided", async () => {
    const adapter: OpenClawSessionAdapter = {
      async spawnAcpSession() {
        return {
          sessionKey: "agent:codex:acp:existing",
          backend: "acpx",
        };
      },
      async getAcpSessionStatus() {
        return { sessionKey: "agent:codex:acp:existing", state: "running" };
      },
      async cancelAcpSession() {
        return { sessionKey: "agent:codex:acp:existing" };
      },
      async closeAcpSession() {
        return { sessionKey: "agent:codex:acp:existing" };
      },
    };
    const runner = new AcpRunner(
      {
        acp: {
          enabled: true,
          defaultAgentId: "codex",
          allowedAgents: ["codex"],
          defaultMode: "run",
          allowThreadBinding: false,
          defaultTimeoutSeconds: 600,
          experimentalControlPlaneAdapter: false,
        },
      },
      adapter,
    );

    const reusedSession: SessionRecord = {
      sessionId: "acp-existing",
      runner: "acp",
      projectRoot: "/tmp/project",
      scope: { bindingKey: "feature-a" },
      mode: "persistent",
      state: "idle",
      createdAt: "2026-03-21T00:00:00.000Z",
      updatedAt: "2026-03-21T00:10:00.000Z",
      providerRef: { sessionKey: "agent:codex:acp:existing" },
    };

    const result = await runner.run({
      projectRoot: workflow.projectRoot,
      task,
      workflow,
      reusedSession,
    });

    expect(result.accepted).toBe(true);
    expect(result.runRecord.resultSummary).toContain("reused");
    expect(result.runRecord.events?.[0]?.type).toBe("session_reused");
    expect(result.runRecord.events?.[0]?.detail?.reusedSessionKey).toBe("agent:codex:acp:existing");
  });

  it("passes threadId from reused session to spawn params and records it in sessionRef", async () => {
    const adapter: OpenClawSessionAdapter = {
      async spawnAcpSession() {
        return {
          sessionKey: "agent:codex:acp:threaded",
          backend: "acpx",
          threadId: "thread-from-backend",
        };
      },
      async getAcpSessionStatus() {
        return { sessionKey: "agent:codex:acp:threaded", state: "running" };
      },
      async cancelAcpSession() {
        return { sessionKey: "agent:codex:acp:threaded" };
      },
      async closeAcpSession() {
        return { sessionKey: "agent:codex:acp:threaded" };
      },
    };
    const runner = new AcpRunner(
      {
        acp: {
          enabled: true,
          defaultAgentId: "codex",
          allowedAgents: ["codex"],
          defaultMode: "run",
          allowThreadBinding: true,
          defaultTimeoutSeconds: 600,
          experimentalControlPlaneAdapter: false,
        },
      },
      adapter,
    );

    const reusedSession: SessionRecord = {
      sessionId: "acp-threaded",
      runner: "acp",
      projectRoot: "/tmp/project",
      scope: { bindingKey: "feature-a" },
      mode: "persistent",
      state: "idle",
      createdAt: "2026-03-21T00:00:00.000Z",
      updatedAt: "2026-03-21T00:10:00.000Z",
      providerRef: { sessionKey: "agent:codex:acp:threaded" },
      threadId: "thread-123",
    };

    const result = await runner.run({
      projectRoot: workflow.projectRoot,
      task: { ...task, runner: { ...task.runner, threadRequested: true } },
      workflow,
      reusedSession,
    });

    expect(result.runRecord.sessionRef?.threadId).toBe("thread-from-backend");
    expect(result.runRecord.events?.[0]?.detail?.threadId).toBe("thread-123");
  });
});
