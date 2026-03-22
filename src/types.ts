import type { RunnerType, WorkspaceMode } from "./config.js";

export type SessionRunnerType = Exclude<RunnerType, "manual">;
export type SessionMode = "oneshot" | "persistent";
export type SessionState = "created" | "active" | "idle" | "closed" | "failed" | "orphaned";
export type TaskSessionPolicyMode = "none" | "create_persistent" | "reuse_if_available" | "require_existing";

export type WorkflowLifecycle =
  | "idle"
  | "planned"
  | "running"
  | "reviewing"
  | "blocked"
  | "completed"
  | "failed";

export type TaskStatus =
  | "planned"
  | "ready"
  | "running"
  | "review_required"
  | "blocked"
  | "done"
  | "failed"
  | "dead_letter";

export type RetryPolicy = {
  maxAttempts: number;
  backoffSeconds: number;
  retryOn: Array<"failed" | "timed_out">;
};

export type RetryHistoryEntry = {
  attempt: number;
  runId: string;
  status: string;
  at: string;
};

export type ReviewStatus = "pending" | "approved" | "rejected";

export type SpecDoc = {
  specId: string;
  title: string;
  sourcePath: string;
  projectRoot: string;
  goals: string[];
  constraints: string[];
  acceptanceCriteria: string[];
  phases: Array<{
    phaseId: string;
    title: string;
    tasks: string[];
  }>;
  metadata?: Record<string, unknown>;
};

export type TaskNode = {
  taskId: string;
  specId: string;
  phaseId?: string;
  title: string;
  description: string;
  kind: "coding" | "review" | "research" | "ops" | "docs";
  deps: string[];
  status: TaskStatus;
  workspace: {
    mode: WorkspaceMode;
  };
  runner: {
    type: RunnerType;
    agentId?: string;
    cwd?: string;
    mode?: "run" | "session";
    timeoutSeconds?: number;
    threadRequested?: boolean;
    persistentSession?: boolean;
    retryPolicy?: RetryPolicy;
  };
  review: {
    required: boolean;
    status?: ReviewStatus;
  };
  session?: {
    policy: TaskSessionPolicyMode;
    bindingKey?: string;
    preferredSessionId?: string;
  };
};

export type RunEvent = {
  at: string;
  type: string;
  detail?: Record<string, unknown>;
};

export type RunRecord = {
  runId: string;
  taskId: string;
  attempt: number;
  status: "planned" | "accepted" | "running" | "completed" | "failed" | "cancelled" | "timed_out";
  runner: {
    type: RunnerType;
  };
  workspacePath: string;
  startedAt: string;
  endedAt?: string;
  promptSummary?: string;
  resultSummary?: string;
  artifacts: string[];
  sessionRef?: {
    runtime?: RunnerType;
    sessionKey?: string;
    backend?: string;
    backendSessionId?: string;
    agentSessionId?: string;
    threadId?: string;
  };
  events?: RunEvent[];
  retryHistory?: RetryHistoryEntry[];
};

export type SessionRecord = {
  sessionId: string;
  runner: SessionRunnerType;
  projectRoot: string;
  scope: {
    specId?: string;
    bindingKey?: string;
    taskKind?: string;
  };
  mode: SessionMode;
  state: SessionState;
  createdAt: string;
  updatedAt: string;
  lastRunId?: string;
  lastTaskId?: string;
  providerRef: {
    sessionKey?: string;
    backend?: string;
    backendSessionId?: string;
    agentSessionId?: string;
  };
  threadId?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
};

export type WorkflowState = {
  version: number;
  projectRoot: string;
  activeSpecId?: string;
  lifecycle: WorkflowLifecycle;
  tasks: TaskNode[];
  reviewQueue: string[];
  lastAction?: {
    at: string;
    type: string;
    message?: string;
  };
  locks?: {
    orchestrator?: boolean;
  };
  runtime?: {
    defaultRunner?: RunnerType;
    allowedRunners?: RunnerType[];
  };
};

export type WorkflowStatusSummary = {
  lifecycle: WorkflowLifecycle;
  totalTasks: number;
  readyTasks: number;
  runningTasks: number;
  blockedTasks: number;
  deadLetterTasks: number;
  reviewQueueSize: number;
  activeSpecId?: string;
};
