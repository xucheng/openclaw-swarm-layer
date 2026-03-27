import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { OpenClawPluginService } from "openclaw/plugin-sdk/core";
import type { RunnerType, RuntimePolicySnapshot } from "../config.js";
import { getSubagentRunnerDisabledMessage, resolveRuntimePolicySnapshot } from "../config.js";
import { getRunnableTasks } from "../planning/task-graph.js";
import { enqueueReview } from "../review/review-gate.js";
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

type OrchestratorDeps = {
  stateStore?: StateStore;
  sessionStore?: SessionStore;
  manualRunner?: ManualRunner;
  runnerRegistry?: RunnerRegistry;
  sessionAdapter?: OpenClawSessionAdapter;
  subagentAdapter?: OpenClawSubagentAdapter;
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

export class SwarmOrchestrator {
  constructor(
    private readonly stateStore: StateStore = new StateStore(),
    private readonly sessionStore: SessionStore = new SessionStore(),
    private readonly manualRunner: ManualRunner = new ManualRunner(),
    private readonly runnerRegistry: RunnerRegistry = new RunnerRegistry([new ManualRunner(), new AcpRunner()]),
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
    let nextWorkflow: WorkflowState = {
      ...workflow,
      lifecycle:
        result.nextTaskStatus === "review_required"
          ? ("reviewing" as const)
          : result.nextTaskStatus === "running"
            ? ("running" as const)
            : ("planned" as const),
      tasks: workflow.tasks.map((entry) => (entry.taskId === task.taskId ? nextTask : entry)),
      lastAction: {
        at: new Date().toISOString(),
        type: "run",
        message: `ran ${task.taskId} via ${selectedRunner}${reusedLabel}`,
      },
    };

    if (result.nextTaskStatus === "review_required") {
      nextWorkflow = enqueueReview(nextWorkflow, task.taskId);
    }

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
}

export function createSwarmService(): OpenClawPluginService {
  return {
    id: "swarm-orchestrator",
    async start() {
      return;
    },
  };
}

export function registerSwarmService(api: OpenClawPluginApi): void {
  api.registerService(createSwarmService());
}

export function createOrchestrator(deps?: OrchestratorDeps): SwarmOrchestrator {
  const stateStore = deps?.stateStore ?? new StateStore();
  const sessionStore = deps?.sessionStore ?? new SessionStore(stateStore.config);
  const manualRunner = deps?.manualRunner ?? new ManualRunner();
  const sessionAdapter = deps?.sessionAdapter ?? new UnsupportedOpenClawSessionAdapter();
  const subagentAdapter = deps?.subagentAdapter ?? new UnsupportedOpenClawSubagentAdapter();
  const configuredRunners: TaskRunner[] = [manualRunner, new AcpRunner(stateStore.config, sessionAdapter)];
  if (stateStore.config.subagent.enabled) {
    configuredRunners.push(new SubagentRunner(subagentAdapter));
  }
  return new SwarmOrchestrator(
    stateStore,
    sessionStore,
    manualRunner,
    deps?.runnerRegistry ?? new RunnerRegistry(configuredRunners),
  );
}
