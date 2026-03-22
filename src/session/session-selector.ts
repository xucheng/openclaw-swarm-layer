import type { SessionRecord, TaskNode } from "../types.js";

export const REUSABLE_SESSION_TASK_KINDS = ["coding", "research", "docs"] as const;

export function canTaskUseReusableSession(task: TaskNode): boolean {
  const policy = task.session?.policy ?? "none";
  if (policy !== "create_persistent" && policy !== "reuse_if_available" && policy !== "require_existing") {
    return false;
  }
  return REUSABLE_SESSION_TASK_KINDS.includes(task.kind as (typeof REUSABLE_SESSION_TASK_KINDS)[number]);
}

export function buildTaskSessionBindingKey(task: TaskNode): string | undefined {
  if (task.session?.bindingKey) {
    return task.session.bindingKey;
  }
  if (!canTaskUseReusableSession(task)) {
    return undefined;
  }
  return `${task.specId}:${task.kind}`;
}

export function selectReusableSessionForTask(task: TaskNode, sessions: SessionRecord[]): SessionRecord | null {
  if (!canTaskUseReusableSession(task)) {
    return null;
  }

  if (task.session?.preferredSessionId) {
    return sessions.find((session) => session.sessionId === task.session?.preferredSessionId) ?? null;
  }

  const bindingKey = buildTaskSessionBindingKey(task);
  const candidates = sessions.filter((session) => {
    if (session.mode !== "persistent") {
      return false;
    }
    if (session.state !== "active" && session.state !== "idle") {
      return false;
    }
    if (session.runner !== task.runner.type) {
      return false;
    }
    if (bindingKey && session.scope.bindingKey !== bindingKey) {
      return false;
    }
    if (session.scope.taskKind && session.scope.taskKind !== task.kind) {
      return false;
    }
    return true;
  });

  candidates.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return candidates[0] ?? null;
}

export function summarizeSessionReuseForTask(task: TaskNode, sessions: SessionRecord[]): {
  eligible: boolean;
  policy: string;
  bindingKey?: string;
  selectedSessionId?: string;
  reason: string;
} {
  const eligible = canTaskUseReusableSession(task);
  const selected = eligible ? selectReusableSessionForTask(task, sessions) : null;
  const policy = task.session?.policy ?? "none";
  const bindingKey = buildTaskSessionBindingKey(task);

  let reason = "Session reuse is disabled for this task.";
  if (policy === "none") {
    reason = "Task session policy is none.";
  } else if (!eligible) {
    reason = `Task kind ${task.kind} is not allowed to reuse sessions.`;
  } else if (selected) {
    reason = `Reusable session candidate found: ${selected.sessionId}.`;
  } else {
    reason = "Task may reuse a session, but no compatible session is currently available.";
  }

  return {
    eligible,
    policy,
    bindingKey,
    selectedSessionId: selected?.sessionId,
    reason,
  };
}
