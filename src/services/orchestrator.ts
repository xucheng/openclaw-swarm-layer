import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { OpenClawPluginService, OpenClawPluginServiceContext } from "openclaw/plugin-sdk/core";
import type { RunnerType, RuntimePolicySnapshot, SwarmPluginConfig } from "../config.js";
import { getSubagentRunnerDisabledMessage, resolvePluginConfigFromApi, resolveRuntimePolicySnapshot } from "../config.js";
import { getQueuedTasks, getRunnableTasks } from "../planning/task-graph.js";
import { checkConcurrencySlot } from "../runtime/concurrency-gate.js";
import { applyAcpRunStatusToWorkflow, deriveWorkflowLifecycle, enqueueReview } from "../review/review-gate.js";
import { AcpRunner } from "../runtime/acp-runner.js";
import { ManualRunner } from "../runtime/manual-runner.js";
import { UnsupportedOpenClawSessionAdapter, type OpenClawSessionAdapter } from "../runtime/openclaw-session-adapter.js";
import { UnsupportedOpenClawSubagentAdapter, type OpenClawSubagentAdapter } from "../runtime/openclaw-subagent-adapter.js";
import { appendRetryHistory, shouldRetry } from "../runtime/retry-engine.js";
import { RunnerRegistry } from "../runtime/runner-registry.js";
import { SubagentRunner } from "../runtime/subagent-runner.js";
import type { TaskRunner } from "../runtime/task-runner.js";
import { runBootstrap } from "../session/session-bootstrap.js";
import { buildBudgetUsageFromRun, checkBudgetExceeded } from "../session/session-budget.js";
import { buildSessionRecordFromRun } from "../session/session-lifecycle.js";
import { selectReusableSessionForTask } from "../session/session-selector.js";
import { SessionStore } from "../session/session-store.js";
import { StateStore } from "../state/state-store.js";
import type { BootstrapResult, RunRecord, SessionRecord, TaskNode, WorkflowState } from "../types.js";
import { AutopilotController } from "../autopilot/controller.js";
import { AutopilotStore } from "../autopilot/autopilot-store.js";
import { AutopilotServiceLoop } from "../autopilot/service-loop.js";

export type RunOnceInput = {
  projectRoot: string;
  taskId?: string;
  dryRun?: boolean;
  runnerOverride?: RunnerType;
};

export type RunOnceResult = {
  ok: boolean;
  action: "noop" | "planned" | "dispatched" | "review_required" | "session_required" | "dead_letter" | "retrying";
  taskIds?: string[];
  runIds?: string[];
  reusedSessionId?: string;
  selectedRunner?: RunnerType;
  runtime?: RuntimePolicySnapshot;
  message?: string;
  bootstrap?: BootstrapResult;
};

export type RunBatchInput = {
  projectRoot: string;
  parallel?: number;
  allReady?: boolean;
  dryRun?: boolean;
  runnerOverride?: RunnerType;
};

export type DispatchStats = {
  dispatchRequested: number;
  dispatchAdmitted: number;
  dispatchQueued: number;
};

export type RunBatchResult = {
  ok: boolean;
  results: RunOnceResult[];
  stats: DispatchStats;
  runtime?: RuntimePolicySnapshot;
  message?: string;
};

export type SyncRunInput = {
  projectRoot: string;
  runId: string;
};

export type SyncRunResult = {
  ok: true;
  runId: string;
  taskId: string;
  previousStatus: RunRecord["status"];
  status: RunRecord["status"];
  transitioned: boolean;
  checkedAt?: string;
  sessionRef?: RunRecord["sessionRef"];
  summary?: string;
};

export type SyncActiveRunsInput = {
  projectRoot: string;
  maxRuns?: number;
};

export type SyncActiveRunsResult = {
  ok: true;
  results: SyncRunResult[];
  message: string;
};

export type CancelRunInput = {
  projectRoot: string;
  runId: string;
  reason?: string;
  terminalStatus?: Extract<RunRecord["status"], "cancelled" | "timed_out" | "failed">;
};

export type CancelRunResult = {
  ok: true;
  runId: string;
  taskId: string;
  status: RunRecord["status"];
  summary?: string;
  sessionRef?: RunRecord["sessionRef"];
};

export type CloseSessionInput = {
  projectRoot: string;
  sessionId: string;
  reason?: string;
};

export type CloseSessionResult = {
  ok: true;
  sessionId: string;
  state: SessionRecord["state"];
  summary?: string;
  lastRunId?: string;
};

type OrchestratorDeps = {
  stateStore?: StateStore;
  sessionStore?: SessionStore;
  manualRunner?: ManualRunner;
  runnerRegistry?: RunnerRegistry;
  sessionAdapter?: OpenClawSessionAdapter;
  subagentAdapter?: OpenClawSubagentAdapter;
};

type SwarmServiceLoopLike = {
  start(projectRoot: string): void;
  stop(): Promise<void>;
};

type SwarmServiceDeps = {
  createLoop?: (deps: {
    stateStore: StateStore;
    autopilotStore: AutopilotStore;
    logger: OpenClawPluginServiceContext["logger"];
  }) => SwarmServiceLoopLike;
};

function pickTask(tasks: TaskNode[], taskId?: string): TaskNode | undefined {
  if (taskId) {
    return tasks.find((task) => task.taskId === taskId);
  }
  return tasks[0];
}

function resolveRunnerUnavailableMessage(
  runner: RunnerType,
  stateStore: Pick<StateStore, "config">,
): string | undefined {
  if (runner === "subagent") {
    return getSubagentRunnerDisabledMessage(stateStore.config);
  }
  return undefined;
}

function canUseLocalClosedRunFallback(error: unknown, runRecord: RunRecord): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const hasClosedEvent = (runRecord.events ?? []).some((event) => event.type === "closed");
  return hasClosedEvent && /metadata is missing|Unable to resolve session target/i.test(message);
}

function resolveCancelledAt(result: { cancelledAt?: string } | { killedAt?: string }): string | undefined {
  const normalized = result as { cancelledAt?: string; killedAt?: string };
  return normalized.cancelledAt ?? normalized.killedAt;
}

export class SwarmOrchestrator {
  constructor(
    private readonly stateStore: StateStore = new StateStore(),
    private readonly sessionStore: SessionStore = new SessionStore(),
    private readonly manualRunner: ManualRunner = new ManualRunner(),
    private readonly runnerRegistry: RunnerRegistry = new RunnerRegistry([new ManualRunner(), new AcpRunner()]),
    private readonly sessionAdapter: OpenClawSessionAdapter = new UnsupportedOpenClawSessionAdapter(),
    private readonly subagentAdapter: OpenClawSubagentAdapter = new UnsupportedOpenClawSubagentAdapter(),
  ) {}

  async runOnce(input: RunOnceInput): Promise<RunOnceResult> {
    const fallbackRuntime = resolveRuntimePolicySnapshot(this.stateStore.config, undefined, { runtimeVersion: this.stateStore.runtimeVersion });

    if (this.stateStore.config.bootstrap.enabled) {
      const bootstrapResult = await runBootstrap(input.projectRoot, this.stateStore);
      if (!bootstrapResult.ok) {
        return {
          ok: false,
          action: "noop",
          message: `Bootstrap failed: ${bootstrapResult.checks.filter((c) => !c.ok).map((c) => c.message).join("; ")}`,
          bootstrap: bootstrapResult,
          runtime: fallbackRuntime,
        };
      }
    }

    const workflow = await this.stateStore.loadWorkflow(input.projectRoot);
    const runtime = resolveRuntimePolicySnapshot(this.stateStore.config, workflow.runtime, { runtimeVersion: this.stateStore.runtimeVersion });
    const runnableTasks = getRunnableTasks(workflow.tasks);
    const task = pickTask(runnableTasks, input.taskId);

    if (!task) {
      return {
        ok: true,
        action: "noop",
        message: "no runnable tasks",
        runtime,
      };
    }

    const selectedRunner = input.runnerOverride ?? task.runner.type;
    const unavailableRunnerMessage = resolveRunnerUnavailableMessage(selectedRunner, this.stateStore);
    if (unavailableRunnerMessage) {
      return {
        ok: false,
        action: "noop",
        taskIds: [task.taskId],
        selectedRunner,
        runtime,
        message: unavailableRunnerMessage,
      };
    }
    if (selectedRunner !== "manual" && !this.runnerRegistry.has(selectedRunner)) {
      return {
        ok: false,
        action: "noop",
        taskIds: [task.taskId],
        selectedRunner,
        runtime,
        message: `runner ${selectedRunner} is not registered in the current orchestrator`,
      };
    }
    const runner = selectedRunner === "manual" ? this.manualRunner : this.runnerRegistry.resolve(selectedRunner);
    const effectiveTask =
      selectedRunner === task.runner.type ? task : { ...task, runner: { ...task.runner, type: selectedRunner } };

    let reusedSession: SessionRecord | undefined;
    const sessionPolicy = effectiveTask.session?.policy ?? "none";
    if (sessionPolicy !== "none" && selectedRunner !== "manual") {
      const sessions = await this.sessionStore.listSessions(input.projectRoot);
      const candidate = selectReusableSessionForTask(effectiveTask, sessions);
      if (candidate) {
        reusedSession = candidate;
      } else if (sessionPolicy === "require_existing") {
        return {
          ok: false,
          action: "session_required",
          taskIds: [effectiveTask.taskId],
          selectedRunner,
          runtime,
          message: `Task ${effectiveTask.taskId} requires an existing session but none is available`,
        };
      }
    }

    if (reusedSession?.threadId && !this.stateStore.config.acp.allowThreadBinding) {
      return {
        ok: false,
        action: "noop",
        taskIds: [effectiveTask.taskId],
        selectedRunner,
        runtime,
        message: `Task ${effectiveTask.taskId} would bind to thread ${reusedSession.threadId} but allowThreadBinding is disabled`,
      };
    }

    const plan = await runner.plan({
      projectRoot: workflow.projectRoot,
      task: effectiveTask,
      workflow,
      dryRun: input.dryRun,
    });

    if (input.dryRun) {
      return {
        ok: true,
        action: "planned",
        taskIds: [effectiveTask.taskId],
        reusedSessionId: reusedSession?.sessionId,
        selectedRunner,
        runtime,
        message: reusedSession
          ? `${plan.summary} (would reuse session ${reusedSession.sessionId})`
          : plan.summary,
      };
    }

    const result = await runner.run({
      projectRoot: workflow.projectRoot,
      task: effectiveTask,
      workflow,
      reusedSession,
    });

    const runRecordWithBudget = { ...result.runRecord };
    if (effectiveTask.runner.budget) {
      const budgetUsage = buildBudgetUsageFromRun(result.runRecord, result.runRecord.budgetUsage);
      const budgetCheck = checkBudgetExceeded(effectiveTask.runner.budget, budgetUsage);
      runRecordWithBudget.budgetUsage = {
        ...budgetUsage,
        exceeded: budgetCheck.exceeded,
        exceededReason: budgetCheck.reason,
      };
      if (budgetCheck.exceeded) {
        runRecordWithBudget.resultSummary = `${runRecordWithBudget.resultSummary ?? ""} [BUDGET EXCEEDED: ${budgetCheck.reason}]`.trim();
      }
    }

    await this.stateStore.writeRun(workflow.projectRoot, runRecordWithBudget);
    const sessionRecord = buildSessionRecordFromRun(workflow, runRecordWithBudget, effectiveTask);
    if (sessionRecord) {
      const existingSession = await this.sessionStore.loadSession(workflow.projectRoot, sessionRecord.sessionId);
      await this.sessionStore.writeSession(
        workflow.projectRoot,
        existingSession
          ? {
              ...existingSession,
              ...sessionRecord,
              createdAt: existingSession.createdAt,
            }
          : sessionRecord,
      );
    }

    const nextTask = {
      ...task,
      status: result.nextTaskStatus,
      review: {
        ...task.review,
        status: result.nextTaskStatus === "review_required" ? "pending" : task.review.status,
      },
    };

    const reusedLabel = reusedSession ? ` (reused session ${reusedSession.sessionId})` : "";
    const nextTasks = workflow.tasks.map((entry) => (entry.taskId === task.taskId ? nextTask : entry));
    const nextReviewQueue =
      result.nextTaskStatus === "review_required"
        ? [...workflow.reviewQueue, ...(workflow.reviewQueue.includes(task.taskId) ? [] : [task.taskId])]
        : workflow.reviewQueue.filter((entry) => entry !== task.taskId);
    let nextWorkflow: WorkflowState = {
      ...workflow,
      lifecycle: deriveWorkflowLifecycle(nextTasks, nextReviewQueue),
      tasks: nextTasks,
      reviewQueue: nextReviewQueue,
      lastAction: {
        at: new Date().toISOString(),
        type: "run",
        message: `ran ${task.taskId} via ${selectedRunner}${reusedLabel}`,
      },
    };

    await this.stateStore.saveWorkflow(workflow.projectRoot, nextWorkflow);

    return {
      ok: true,
      action: result.nextTaskStatus === "review_required" ? "review_required" : "dispatched",
      taskIds: [task.taskId],
      runIds: [result.runRecord.runId],
      reusedSessionId: reusedSession?.sessionId,
      selectedRunner,
      runtime,
      message: result.runRecord.resultSummary,
    };
  }

  async evaluateRetry(input: { projectRoot: string; taskId: string; runRecord: RunRecord }): Promise<RunOnceResult> {
    const workflow = await this.stateStore.loadWorkflow(input.projectRoot);
    const runtime = resolveRuntimePolicySnapshot(this.stateStore.config, workflow.runtime, { runtimeVersion: this.stateStore.runtimeVersion });
    const task = workflow.tasks.find((t) => t.taskId === input.taskId);
    if (!task) {
      return { ok: false, action: "noop", message: `Unknown task: ${input.taskId}`, runtime };
    }

    const decision = shouldRetry(task, input.runRecord);
    if (!decision.retry) {
      const policy = task.runner.retryPolicy;
      if (policy && (input.runRecord.retryHistory?.length ?? 0) + 1 >= policy.maxAttempts) {
        const deadTask: TaskNode = { ...task, status: "dead_letter" };
        const nextWorkflow: WorkflowState = {
          ...workflow,
          tasks: workflow.tasks.map((t) => (t.taskId === task.taskId ? deadTask : t)),
          lastAction: {
            at: new Date().toISOString(),
            type: "retry:exhausted",
            message: `${task.taskId} moved to dead letter after ${policy.maxAttempts} attempts`,
          },
        };
        await this.stateStore.saveWorkflow(input.projectRoot, nextWorkflow);
        return {
          ok: false,
          action: "dead_letter",
          taskIds: [task.taskId],
          selectedRunner: task.runner.type,
          runtime,
          message: decision.reason,
        };
      }
      return { ok: false, action: "noop", taskIds: [task.taskId], selectedRunner: task.runner.type, runtime, message: decision.reason };
    }

    const updatedRun: RunRecord = {
      ...input.runRecord,
      retryHistory: appendRetryHistory(input.runRecord),
    };
    await this.stateStore.writeRun(input.projectRoot, updatedRun);

    const readyTask: TaskNode = { ...task, status: "ready" };
    const readyWorkflow: WorkflowState = {
      ...workflow,
      lifecycle: "planned",
      tasks: workflow.tasks.map((t) => (t.taskId === task.taskId ? readyTask : t)),
      lastAction: {
        at: new Date().toISOString(),
        type: "retry",
        message: `retrying ${task.taskId}: ${decision.reason}`,
      },
    };
    await this.stateStore.saveWorkflow(input.projectRoot, readyWorkflow);

    return this.runOnce({
      projectRoot: input.projectRoot,
      taskId: task.taskId,
      runnerOverride: task.runner.type === "manual" ? undefined : (task.runner.type as "acp" | "subagent"),
    });
  }

  async syncRun(input: SyncRunInput): Promise<SyncRunResult> {
    const runRecord = await this.stateStore.loadRun(input.projectRoot, input.runId);
    if (!runRecord) {
      throw new Error(`Run record not found: ${input.runId}`);
    }

    return this.syncRunRecord(input.projectRoot, runRecord);
  }

  async syncActiveRuns(input: SyncActiveRunsInput): Promise<SyncActiveRunsResult> {
    const workflow = await this.stateStore.loadWorkflow(input.projectRoot);
    const runningTaskIds = new Set(
      workflow.tasks.filter((task) => task.status === "running").map((task) => task.taskId),
    );
    const runs = await this.stateStore.loadRuns(input.projectRoot);
    const latestActiveRunsByTask = new Map<string, RunRecord>();

    for (const runRecord of [...runs].sort((left, right) => right.startedAt.localeCompare(left.startedAt))) {
      if (runRecord.runner.type === "manual" || !runRecord.sessionRef?.sessionKey) {
        continue;
      }
      if (runRecord.status !== "accepted" && runRecord.status !== "running") {
        continue;
      }
      if (!runningTaskIds.has(runRecord.taskId) || latestActiveRunsByTask.has(runRecord.taskId)) {
        continue;
      }
      latestActiveRunsByTask.set(runRecord.taskId, runRecord);
    }

    const candidates = Array.from(latestActiveRunsByTask.values()).slice(0, input.maxRuns ?? Number.MAX_SAFE_INTEGER);
    if (candidates.length === 0) {
      return {
        ok: true,
        results: [],
        message: "no active session-backed runs",
      };
    }

    const results: SyncRunResult[] = [];
    for (const runRecord of candidates) {
      results.push(await this.syncRunRecord(input.projectRoot, runRecord));
    }

    return {
      ok: true,
      results,
      message: `synced ${results.length} active run${results.length === 1 ? "" : "s"}`,
    };
  }

  async cancelRun(input: CancelRunInput): Promise<CancelRunResult> {
    const runRecord = await this.stateStore.loadRun(input.projectRoot, input.runId);
    if (!runRecord) {
      throw new Error(`Run record not found: ${input.runId}`);
    }
    if (!runRecord.sessionRef?.sessionKey) {
      throw new Error(`Run record has no session key: ${input.runId}`);
    }

    const cancelled =
      runRecord.runner.type === "subagent"
        ? await this.subagentAdapter.killSubagentRun(runRecord.sessionRef.sessionKey, input.reason)
        : await this.sessionAdapter.cancelAcpSession(runRecord.sessionRef.sessionKey, input.reason);
    const terminalStatus = input.terminalStatus ?? "cancelled";
    const endedAt = resolveCancelledAt(cancelled) ?? new Date().toISOString();
    const nextRun: RunRecord = {
      ...runRecord,
      status: terminalStatus,
      endedAt,
      resultSummary:
        cancelled.message ?? `autopilot recovery cancelled ${runRecord.runId}${input.reason ? `: ${input.reason}` : ""}`,
      events: [
        ...(runRecord.events ?? []),
        {
          at: endedAt,
          type: "recovery_cancelled",
          detail: {
            reason: input.reason,
            message: cancelled.message,
            terminalStatus,
          },
        },
        {
          at: endedAt,
          type: terminalStatus === "timed_out" ? "timeout" : terminalStatus === "failed" ? "error" : "cancelled",
          detail: { reason: input.reason, message: cancelled.message },
        },
      ],
    };
    await this.stateStore.writeRun(input.projectRoot, nextRun);

    const workflow = await this.stateStore.loadWorkflow(input.projectRoot);
    const nextWorkflow = applyAcpRunStatusToWorkflow(workflow, {
      taskId: nextRun.taskId,
      runStatus: nextRun.status,
      summary: nextRun.resultSummary,
      at: endedAt,
    });
    await this.stateStore.saveWorkflow(input.projectRoot, nextWorkflow);

    const task = nextWorkflow.tasks.find((entry) => entry.taskId === nextRun.taskId);
    const nextSession = buildSessionRecordFromRun(nextWorkflow, nextRun, task);
    if (nextSession) {
      const existing = await this.sessionStore.loadSession(input.projectRoot, nextSession.sessionId);
      await this.sessionStore.writeSession(
        input.projectRoot,
        existing
          ? {
              ...existing,
              ...nextSession,
              createdAt: existing.createdAt,
            }
          : nextSession,
      );
    }

    return {
      ok: true,
      runId: nextRun.runId,
      taskId: nextRun.taskId,
      status: nextRun.status,
      summary: nextRun.resultSummary,
      sessionRef: nextRun.sessionRef,
    };
  }

  async closeSession(input: CloseSessionInput): Promise<CloseSessionResult> {
    const session = await this.sessionStore.loadSession(input.projectRoot, input.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${input.sessionId}`);
    }
    if (session.runner !== "acp" || !session.providerRef.sessionKey) {
      throw new Error(`Session is not ACP-closable: ${input.sessionId}`);
    }

    const closed = await this.sessionAdapter.closeAcpSession(session.providerRef.sessionKey, input.reason);
    const closedAt = closed.closedAt ?? new Date().toISOString();
    const nextSession: SessionRecord = {
      ...session,
      state: "closed",
      updatedAt: closedAt,
      summary: closed.message ?? session.summary,
    };
    await this.sessionStore.writeSession(input.projectRoot, nextSession);

    if (session.lastRunId) {
      const lastRun = await this.stateStore.loadRun(input.projectRoot, session.lastRunId);
      if (lastRun) {
        await this.stateStore.writeRun(input.projectRoot, {
          ...lastRun,
          resultSummary: closed.message ?? lastRun.resultSummary,
          events: [
            ...(lastRun.events ?? []),
            {
              at: closedAt,
              type: "recovery_closed",
              detail: { reason: input.reason, message: closed.message, sessionId: session.sessionId },
            },
            {
              at: closedAt,
              type: "closed",
              detail: { reason: input.reason, message: closed.message },
            },
          ],
        });
      }
    }

    return {
      ok: true,
      sessionId: nextSession.sessionId,
      state: nextSession.state,
      summary: nextSession.summary,
      lastRunId: nextSession.lastRunId,
    };
  }

  async runBatch(input: RunBatchInput): Promise<RunBatchResult> {
    const workflow = await this.stateStore.loadWorkflow(input.projectRoot);
    const runtime = resolveRuntimePolicySnapshot(this.stateStore.config, workflow.runtime, { runtimeVersion: this.stateStore.runtimeVersion });
    const maxConcurrent = this.stateStore.config.acp.maxConcurrent ?? 6;

    const queuedTasks = getQueuedTasks(workflow.tasks);
    const runnableTasks = getRunnableTasks(workflow.tasks);
    const candidates = [...queuedTasks, ...runnableTasks];

    const requestedCount = input.allReady
      ? candidates.length
      : Math.min(input.parallel ?? 1, candidates.length);

    if (requestedCount === 0) {
      return {
        ok: true,
        results: [],
        stats: { dispatchRequested: 0, dispatchAdmitted: 0, dispatchQueued: 0 },
        runtime,
        message: "no runnable tasks",
      };
    }

    const concurrency = checkConcurrencySlot(workflow.tasks, maxConcurrent);
    const availableSlots = Math.max(0, maxConcurrent - concurrency.activeCount);
    const admitCount = Math.min(requestedCount, availableSlots);
    const toDispatch = candidates.slice(0, admitCount);
    const toQueue = candidates.slice(admitCount, requestedCount);

    const results: RunOnceResult[] = [];

    for (const task of toDispatch) {
      const result = await this.runOnce({
        projectRoot: input.projectRoot,
        taskId: task.taskId,
        dryRun: input.dryRun,
        runnerOverride: input.runnerOverride,
      });
      results.push(result);
    }

    if (toQueue.length > 0) {
      const currentWorkflow = await this.stateStore.loadWorkflow(input.projectRoot);
      const updatedTasks = currentWorkflow.tasks.map((t) => {
        if (toQueue.some((q) => q.taskId === t.taskId) && (t.status === "ready" || t.status === "planned")) {
          return { ...t, status: "queued" as const };
        }
        return t;
      });
      await this.stateStore.saveWorkflow(input.projectRoot, {
        ...currentWorkflow,
        tasks: updatedTasks,
        lastAction: {
          at: new Date().toISOString(),
          type: "batch:queued",
          message: `queued ${toQueue.length} tasks awaiting concurrency slots`,
        },
      });
    }

    const stats: DispatchStats = {
      dispatchRequested: requestedCount,
      dispatchAdmitted: toDispatch.length,
      dispatchQueued: toQueue.length,
    };

    return {
      ok: results.every((r) => r.ok),
      results,
      stats,
      runtime,
      message: `dispatched ${stats.dispatchAdmitted}, queued ${stats.dispatchQueued} of ${stats.dispatchRequested} requested`,
    };
  }

  private async syncRunRecord(projectRoot: string, runRecord: RunRecord): Promise<SyncRunResult> {
    if (runRecord.runner.type === "manual") {
      throw new Error(`Run record is not a session-backed runner: ${runRecord.runId}`);
    }
    if (!runRecord.sessionRef?.sessionKey) {
      throw new Error(`Run record has no session key: ${runRecord.runId}`);
    }

    const workflow = await this.stateStore.loadWorkflow(projectRoot);
    const task = workflow.tasks.find((entry) => entry.taskId === runRecord.taskId);
    if (!task) {
      throw new Error(`Unknown taskId: ${runRecord.taskId}`);
    }

    const runner = this.runnerRegistry.resolve(runRecord.runner.type);
    if (!runner.sync) {
      throw new Error(`Runner ${runRecord.runner.type} does not support sync`);
    }

    const previousStatus = runRecord.status;
    let synced;
    try {
      synced = await runner.sync({
        projectRoot: workflow.projectRoot,
        task,
        runRecord,
      });
    } catch (error) {
      if (!canUseLocalClosedRunFallback(error, runRecord)) {
        throw error;
      }
      synced = {
        runRecord: {
          ...runRecord,
          resultSummary: runRecord.resultSummary ?? "session metadata missing after close; using local ledger",
        },
        checkedAt: new Date().toISOString(),
        remoteState: runRecord.status === "cancelled" ? "cancelled" : "completed",
      };
    }

    await this.stateStore.writeRun(projectRoot, synced.runRecord);

    const nextWorkflow = applyAcpRunStatusToWorkflow(workflow, {
      taskId: synced.runRecord.taskId,
      runStatus: synced.runRecord.status,
      summary: synced.runRecord.resultSummary,
      at: synced.checkedAt,
    });
    await this.stateStore.saveWorkflow(projectRoot, nextWorkflow);

    const nextTask = nextWorkflow.tasks.find((entry) => entry.taskId === synced.runRecord.taskId);
    const nextSession = buildSessionRecordFromRun(nextWorkflow, synced.runRecord, nextTask);
    if (nextSession) {
      const existing = await this.sessionStore.loadSession(projectRoot, nextSession.sessionId);
      await this.sessionStore.writeSession(
        projectRoot,
        existing
          ? {
              ...existing,
              ...nextSession,
              createdAt: existing.createdAt,
            }
          : nextSession,
      );
    }

    return {
      ok: true,
      runId: synced.runRecord.runId,
      taskId: synced.runRecord.taskId,
      previousStatus,
      status: synced.runRecord.status,
      transitioned: previousStatus !== synced.runRecord.status,
      checkedAt: synced.checkedAt,
      sessionRef: synced.runRecord.sessionRef,
      summary: synced.runRecord.resultSummary,
    };
  }
}

export function createSwarmService(
  config?: Partial<SwarmPluginConfig>,
  runtimeVersion?: string | null,
  deps?: SwarmServiceDeps,
): OpenClawPluginService {
  let loop: SwarmServiceLoopLike | undefined;
  return {
    id: "swarm-orchestrator",
    async start(ctx) {
      const projectRoot = ctx.workspaceDir;
      if (!projectRoot) {
        ctx.logger.warn("[swarm-autopilot] workspaceDir is missing; service loop will stay idle");
        return;
      }

      const stateStore = new StateStore(config, { runtimeVersion });
      const autopilotStore = new AutopilotStore(stateStore.config);
      loop =
        deps?.createLoop?.({ stateStore, autopilotStore, logger: ctx.logger }) ??
        new AutopilotServiceLoop(
          new AutopilotController(stateStore, autopilotStore, createOrchestrator({ stateStore })),
          autopilotStore,
          stateStore.config.autopilot.tickSeconds * 1000,
          ctx.logger,
        );
      loop.start(projectRoot);
    },
    async stop() {
      await loop?.stop();
    },
  };
}

export function registerSwarmService(api: OpenClawPluginApi): void {
  api.registerService(createSwarmService(resolvePluginConfigFromApi(api), api.runtime?.version));
}

export function createOrchestrator(deps?: OrchestratorDeps): SwarmOrchestrator {
  const stateStore = deps?.stateStore ?? new StateStore();
  const sessionStore = deps?.sessionStore ?? new SessionStore(stateStore.config);
  const manualRunner = deps?.manualRunner ?? new ManualRunner();
  const sessionAdapter = deps?.sessionAdapter ?? new UnsupportedOpenClawSessionAdapter();
  const subagentAdapter = deps?.subagentAdapter ?? new UnsupportedOpenClawSubagentAdapter();
  const configuredRunners: TaskRunner[] = [
    manualRunner,
    new AcpRunner(stateStore.config, sessionAdapter),
    new SubagentRunner(subagentAdapter),
  ];
  return new SwarmOrchestrator(
    stateStore,
    sessionStore,
    manualRunner,
    deps?.runnerRegistry ?? new RunnerRegistry(configuredRunners),
    sessionAdapter,
    subagentAdapter,
  );
}
