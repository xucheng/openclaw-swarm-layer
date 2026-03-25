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

export type SessionBudget = {
  maxDurationSeconds?: number;
  maxRetries?: number;
};

export type BudgetUsage = {
  durationSeconds?: number;
  retriesUsed?: number;
  exceeded: boolean;
  exceededReason?: string;
};

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

export type RubricDimension = {
  name: string;
  weight: number;
  description?: string;
};

export type RubricScore = {
  dimension: string;
  score: number;
  note?: string;
};

export type QualityRubric = {
  dimensions: RubricDimension[];
  passingThreshold: number;
};

export type RubricResult = {
  scores: RubricScore[];
  weightedTotal: number;
  passing: boolean;
  evaluatedAt: string;
};

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

export type AcceptanceCriterionKind = "test_passes" | "file_exists" | "content_matches" | "command_exits_zero" | "manual_check";

export type AcceptanceCriterion = {
  id: string;
  description: string;
  kind: AcceptanceCriterionKind;
  verifyCommand?: string;
  verifyPattern?: string;
  targetPath?: string;
  passes?: boolean;
};

export type SprintContract = {
  taskId: string;
  negotiatedAt: string;
  criteria: AcceptanceCriterion[];
  frozen: boolean;
};

export type TaskNode = {
  taskId: string;
  specId: string;
  phaseId?: string;
  title: string;
  description: string;
  kind: "coding" | "review" | "research" | "ops" | "docs" | "evaluate";
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
    budget?: SessionBudget;
  };
  review: {
    required: boolean;
    status?: ReviewStatus;
    rubric?: QualityRubric;
    rubricResult?: RubricResult;
  };
  session?: {
    policy: TaskSessionPolicyMode;
    bindingKey?: string;
    preferredSessionId?: string;
  };
  contract?: SprintContract;
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
  budgetUsage?: BudgetUsage;
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

export type HarnessAssumption = {
  id: string;
  category: "model_capability" | "environment" | "tooling" | "workflow_structure";
  description: string;
  createdAt: string;
  validatedAt?: string;
  valid?: boolean;
  invalidationReason?: string;
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
  assumptions?: HarnessAssumption[];
};

export type ProgressSummary = {
  version: number;
  projectRoot: string;
  specId?: string;
  updatedAt: string;
  completedTasks: Array<{
    taskId: string;
    title: string;
    completedAt: string;
    resultSummary?: string;
  }>;
  currentTask?: {
    taskId: string;
    title: string;
    status: TaskStatus;
    lastAttemptSummary?: string;
  };
  remainingTasks: Array<{
    taskId: string;
    title: string;
    blockedBy?: string[];
  }>;
  blockers: string[];
  keyDecisions: string[];
  environmentNotes: string[];
};

export type BootstrapCheck = {
  step: "environment" | "progress" | "task_selection" | "baseline_verify";
  ok: boolean;
  message: string;
};

export type BootstrapResult = {
  ok: boolean;
  checks: BootstrapCheck[];
  selectedTaskId?: string;
  progress?: ProgressSummary;
  resumedFromProgress: boolean;
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
