import { buildSessionRecordFromRun, deriveSessionId, deriveSessionMode, deriveSessionStateFromRunStatus, transitionSessionState } from "../../../src/session/session-lifecycle.js";
import type { RunRecord, SessionRecord, TaskNode, WorkflowState } from "../../../src/types.js";

const workflow: WorkflowState = {
  version: 1,
  projectRoot: "/tmp/project",
  activeSpecId: "spec-1",
  lifecycle: "running",
  tasks: [],
  reviewQueue: [],
};

const task: TaskNode = {
  taskId: "task-1",
  specId: "spec-1",
  title: "Task 1",
  description: "Task 1",
  kind: "coding",
  deps: [],
  status: "running",
  workspace: { mode: "shared" },
  runner: { type: "acp", mode: "session" },
  review: { required: true },
  session: {
    policy: "create_persistent",
    bindingKey: "feature-a",
  },
};

describe("session lifecycle", () => {
  it("derives session ids from session-backed runs", () => {
    const sessionId = deriveSessionId({
      runner: { type: "acp" },
      sessionRef: { sessionKey: "agent:codex:acp:1" },
    } as Pick<RunRecord, "runner" | "sessionRef">);

    expect(sessionId).toMatch(/^acp-/);
  });

  it("derives persistent session mode from task policy", () => {
    expect(deriveSessionMode(task)).toBe("persistent");
    expect(deriveSessionMode()).toBe("oneshot");
  });

  it("maps run status into session states", () => {
    expect(deriveSessionStateFromRunStatus("persistent", "completed")).toBe("idle");
    expect(deriveSessionStateFromRunStatus("oneshot", "completed")).toBe("closed");
    expect(deriveSessionStateFromRunStatus("oneshot", "timed_out")).toBe("failed");
  });

  it("builds a session record from a session-backed run", () => {
    const runRecord: RunRecord = {
      runId: "run-1",
      taskId: "task-1",
      attempt: 1,
      status: "accepted",
      runner: { type: "acp" },
      workspacePath: "/tmp/project",
      startedAt: "2026-03-21T00:00:00.000Z",
      artifacts: [],
      sessionRef: {
        runtime: "acp",
        sessionKey: "agent:codex:acp:1",
        backend: "acpx",
      },
      resultSummary: "Accepted: ACP session accepted",
    };

    const session = buildSessionRecordFromRun(workflow, runRecord, task);

    expect(session?.runner).toBe("acp");
    expect(session?.mode).toBe("persistent");
    expect(session?.state).toBe("active");
    expect(session?.scope.bindingKey).toBe("feature-a");
  });

  it("transitions failed sessions back to active on retry", () => {
    const existing: SessionRecord = {
      sessionId: "session-1",
      runner: "acp",
      projectRoot: "/tmp/project",
      scope: {},
      mode: "persistent",
      state: "failed",
      createdAt: "2026-03-21T00:00:00.000Z",
      updatedAt: "2026-03-21T00:05:00.000Z",
      providerRef: { sessionKey: "agent:codex:acp:1" },
    };

    expect(transitionSessionState(existing, "running")).toBe("active");
  });

  it("allows closed sessions to reopen on new run", () => {
    const existing: SessionRecord = {
      sessionId: "session-1",
      runner: "acp",
      projectRoot: "/tmp/project",
      scope: {},
      mode: "persistent",
      state: "closed",
      createdAt: "2026-03-21T00:00:00.000Z",
      updatedAt: "2026-03-21T00:05:00.000Z",
      providerRef: { sessionKey: "agent:codex:acp:1" },
    };

    expect(transitionSessionState(existing, "accepted")).toBe("active");
  });

  it("returns null session id for manual runner", () => {
    expect(
      deriveSessionId({
        runner: { type: "manual" },
        sessionRef: { sessionKey: "some-key" },
      } as Pick<RunRecord, "runner" | "sessionRef">),
    ).toBeNull();
  });

  it("returns null session id when sessionRef is missing", () => {
    expect(
      deriveSessionId({
        runner: { type: "acp" },
        sessionRef: {},
      } as Pick<RunRecord, "runner" | "sessionRef">),
    ).toBeNull();
  });

  it("derives oneshot mode when task has no session policy", () => {
    const plainTask: TaskNode = {
      taskId: "t-1",
      specId: "spec-1",
      title: "T",
      description: "T",
      kind: "coding",
      deps: [],
      status: "ready",
      workspace: { mode: "shared" },
      runner: { type: "acp" },
      review: { required: false },
    };
    expect(deriveSessionMode(plainTask)).toBe("oneshot");
  });

  it("derives persistent mode from runner.persistentSession flag", () => {
    const t: TaskNode = {
      taskId: "t-1",
      specId: "spec-1",
      title: "T",
      description: "T",
      kind: "coding",
      deps: [],
      status: "ready",
      workspace: { mode: "shared" },
      runner: { type: "acp", persistentSession: true },
      review: { required: false },
    };
    expect(deriveSessionMode(t)).toBe("persistent");
  });

  it("maps all run statuses through deriveSessionStateFromRunStatus", () => {
    expect(deriveSessionStateFromRunStatus("oneshot", "planned")).toBe("created");
    expect(deriveSessionStateFromRunStatus("oneshot", "accepted")).toBe("active");
    expect(deriveSessionStateFromRunStatus("oneshot", "running")).toBe("active");
    expect(deriveSessionStateFromRunStatus("oneshot", "failed")).toBe("failed");
    expect(deriveSessionStateFromRunStatus("oneshot", "cancelled")).toBe("closed");
  });

  it("transitions orphaned session to active on running status", () => {
    const existing: SessionRecord = {
      sessionId: "session-1",
      runner: "acp",
      projectRoot: "/tmp/project",
      scope: {},
      mode: "persistent",
      state: "orphaned",
      createdAt: "2026-03-21T00:00:00.000Z",
      updatedAt: "2026-03-21T00:05:00.000Z",
      providerRef: { sessionKey: "agent:codex:acp:1" },
    };
    // orphaned follows derivation since no special transition rule
    expect(transitionSessionState(existing, "running")).toBe("active");
  });

  it("transitions idle persistent session to active on accepted status", () => {
    const existing: SessionRecord = {
      sessionId: "session-1",
      runner: "acp",
      projectRoot: "/tmp/project",
      scope: {},
      mode: "persistent",
      state: "idle",
      createdAt: "2026-03-21T00:00:00.000Z",
      updatedAt: "2026-03-21T00:05:00.000Z",
      providerRef: { sessionKey: "agent:codex:acp:1" },
    };
    expect(transitionSessionState(existing, "accepted")).toBe("active");
  });

  it("returns null from buildSessionRecordFromRun for manual runner", () => {
    const runRecord: RunRecord = {
      runId: "run-1",
      taskId: "task-1",
      attempt: 1,
      status: "completed",
      runner: { type: "manual" },
      workspacePath: "/tmp/project",
      startedAt: "2026-03-21T00:00:00.000Z",
      artifacts: [],
      sessionRef: { runtime: "manual" },
    };
    expect(buildSessionRecordFromRun(workflow, runRecord)).toBeNull();
  });

  it("preserves existing session createdAt when merging", () => {
    const runRecord: RunRecord = {
      runId: "run-2",
      taskId: "task-1",
      attempt: 2,
      status: "running",
      runner: { type: "acp" },
      workspacePath: "/tmp/project",
      startedAt: "2026-03-21T01:00:00.000Z",
      artifacts: [],
      sessionRef: {
        runtime: "acp",
        sessionKey: "agent:codex:acp:1",
        backend: "acpx",
      },
    };
    const existing: SessionRecord = {
      sessionId: "acp-xxx",
      runner: "acp",
      projectRoot: "/tmp/project",
      scope: {},
      mode: "persistent",
      state: "idle",
      createdAt: "2026-03-20T00:00:00.000Z",
      updatedAt: "2026-03-20T12:00:00.000Z",
      providerRef: { sessionKey: "agent:codex:acp:1" },
    };
    const session = buildSessionRecordFromRun(workflow, runRecord, task, existing);
    expect(session?.createdAt).toBe("2026-03-20T00:00:00.000Z");
    expect(session?.state).toBe("active");
  });

  it("captures threadId from run sessionRef into session record", () => {
    const runRecord: RunRecord = {
      runId: "run-thread",
      taskId: "task-1",
      attempt: 1,
      status: "accepted",
      runner: { type: "acp" },
      workspacePath: "/tmp/project",
      startedAt: "2026-03-22T00:00:00.000Z",
      artifacts: [],
      sessionRef: {
        runtime: "acp",
        sessionKey: "agent:codex:acp:threaded",
        backend: "acpx",
        threadId: "thread-abc",
      },
    };
    const session = buildSessionRecordFromRun(workflow, runRecord, task);
    expect(session?.threadId).toBe("thread-abc");
  });

  it("preserves existing threadId when run has no threadId", () => {
    const runRecord: RunRecord = {
      runId: "run-no-thread",
      taskId: "task-1",
      attempt: 2,
      status: "running",
      runner: { type: "acp" },
      workspacePath: "/tmp/project",
      startedAt: "2026-03-22T00:00:00.000Z",
      artifacts: [],
      sessionRef: {
        runtime: "acp",
        sessionKey: "agent:codex:acp:1",
      },
    };
    const existing: SessionRecord = {
      sessionId: "acp-xxx",
      runner: "acp",
      projectRoot: "/tmp/project",
      scope: {},
      mode: "persistent",
      state: "idle",
      createdAt: "2026-03-20T00:00:00.000Z",
      updatedAt: "2026-03-20T12:00:00.000Z",
      providerRef: { sessionKey: "agent:codex:acp:1" },
      threadId: "thread-existing",
    };
    const session = buildSessionRecordFromRun(workflow, runRecord, task, existing);
    expect(session?.threadId).toBe("thread-existing");
  });
});
