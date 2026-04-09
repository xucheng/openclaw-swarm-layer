import { buildTaskSessionBindingKey, canTaskUseReusableSession, REUSABLE_SESSION_TASK_KINDS, selectReusableSessionForTask, summarizeSessionReuseForTask } from "../../../src/session/session-selector.js";
import type { SessionRecord, TaskNode } from "../../../src/types.js";

const task: TaskNode = {
  taskId: "task-1",
  specId: "spec-1",
  title: "Task 1",
  description: "Task 1",
  kind: "coding",
  deps: [],
  status: "ready",
  workspace: { mode: "shared" },
  runner: { type: "acp", mode: "session" },
  review: { required: true },
  session: {
    policy: "reuse_if_available",
    bindingKey: "feature-a",
  },
};

const sessions: SessionRecord[] = [
  {
    sessionId: "session-1",
    runner: "acp",
    projectRoot: "/tmp/project",
    scope: {
      specId: "spec-1",
      bindingKey: "feature-a",
      taskKind: "coding",
    },
    mode: "persistent",
    state: "idle",
    createdAt: "2026-03-21T00:00:00.000Z",
    updatedAt: "2026-03-21T00:10:00.000Z",
    providerRef: {
      sessionKey: "agent:codex:acp:1",
    },
  },
];

describe("session selector", () => {
  it("defines reusable session task kinds", () => {
    expect(REUSABLE_SESSION_TASK_KINDS).toEqual(["coding", "research", "docs"]);
  });

  it("detects whether a task can use reusable sessions", () => {
    expect(canTaskUseReusableSession(task)).toBe(true);
    expect(canTaskUseReusableSession({ ...task, kind: "review" })).toBe(false);
  });

  it("builds a task binding key", () => {
    expect(buildTaskSessionBindingKey(task)).toBe("feature-a");
  });

  it("selects a reusable session by binding key", () => {
    expect(selectReusableSessionForTask(task, sessions)?.sessionId).toBe("session-1");
  });

  it("summarizes reusable session eligibility", () => {
    const summary = summarizeSessionReuseForTask(task, sessions);
    expect(summary.eligible).toBe(true);
    expect(summary.selectedSessionId).toBe("session-1");
    expect(summary.reason).toContain("Reusable session candidate found");
  });

  it("explains why a task cannot reuse sessions", () => {
    const summary = summarizeSessionReuseForTask({ ...task, kind: "review" }, sessions);
    expect(summary.eligible).toBe(false);
    expect(summary.reason).toContain("not allowed");
  });

  it("returns null when task has policy none", () => {
    const noSessionTask: TaskNode = {
      ...task,
      session: { policy: "none" },
    };
    expect(canTaskUseReusableSession(noSessionTask)).toBe(false);
    expect(selectReusableSessionForTask(noSessionTask, sessions)).toBeNull();
  });

  it("generates fallback binding key from specId and kind", () => {
    const noBindingTask: TaskNode = {
      ...task,
      session: { policy: "reuse_if_available" },
    };
    expect(buildTaskSessionBindingKey(noBindingTask)).toBe("spec-1:coding");
  });

  it("returns undefined binding key for non-eligible task", () => {
    const reviewTask: TaskNode = {
      ...task,
      kind: "review",
      session: { policy: "none" },
    };
    expect(buildTaskSessionBindingKey(reviewTask)).toBeUndefined();
  });

  it("returns null when preferred session id does not match any session", () => {
    const preferredTask: TaskNode = {
      ...task,
      session: { policy: "reuse_if_available", preferredSessionId: "session-missing" },
    };
    expect(selectReusableSessionForTask(preferredTask, sessions)).toBeNull();
  });

  it("selects preferred session when it exists", () => {
    const preferredTask: TaskNode = {
      ...task,
      session: { policy: "reuse_if_available", preferredSessionId: "session-1" },
    };
    expect(selectReusableSessionForTask(preferredTask, sessions)?.sessionId).toBe("session-1");
  });

  it("selects the most recently updated session among multiple candidates", () => {
    const olderSession: SessionRecord = {
      ...sessions[0]!,
      sessionId: "session-old",
      updatedAt: "2026-03-21T00:05:00.000Z",
    };
    const newerSession: SessionRecord = {
      ...sessions[0]!,
      sessionId: "session-new",
      updatedAt: "2026-03-21T00:20:00.000Z",
    };
    const selected = selectReusableSessionForTask(task, [olderSession, newerSession]);
    expect(selected?.sessionId).toBe("session-new");
  });

  it("returns null when sessions list is empty", () => {
    expect(selectReusableSessionForTask(task, [])).toBeNull();
  });

  it("skips sessions with wrong runner type", () => {
    const mismatchedTask: TaskNode = {
      ...task,
      runner: { type: "manual" },
    };
    expect(selectReusableSessionForTask(mismatchedTask, sessions)).toBeNull();
  });

  it("skips oneshot sessions", () => {
    const oneshotSession: SessionRecord = {
      ...sessions[0]!,
      mode: "oneshot",
    };
    expect(selectReusableSessionForTask(task, [oneshotSession])).toBeNull();
  });

  it("skips sessions in non-active/idle state", () => {
    const failedSession: SessionRecord = {
      ...sessions[0]!,
      state: "failed",
    };
    const closedSession: SessionRecord = {
      ...sessions[0]!,
      state: "closed",
    };
    expect(selectReusableSessionForTask(task, [failedSession, closedSession])).toBeNull();
  });

  it("summarizes policy none as explicit reason", () => {
    const noSessionTask: TaskNode = { ...task, session: { policy: "none" } };
    const summary = summarizeSessionReuseForTask(noSessionTask, sessions);
    expect(summary.policy).toBe("none");
    expect(summary.reason).toContain("policy is none");
  });

  it("summarizes eligible but no compatible session available", () => {
    const summary = summarizeSessionReuseForTask(task, []);
    expect(summary.eligible).toBe(true);
    expect(summary.selectedSessionId).toBeUndefined();
    expect(summary.reason).toContain("no compatible session");
  });
});
