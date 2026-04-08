import { randomUUID } from "node:crypto";
import { buildAutopilotHealthSummary } from "./metrics.js";
import { planAutopilotRecovery } from "./recovery-planner.js";
import { applyAutopilotReviewPolicy } from "./review-policy.js";
import type { AutopilotDecision, AutopilotState } from "./types.js";
import { AutopilotStore } from "./autopilot-store.js";
import { acquireAutopilotLease, releaseAutopilotLease } from "./lease.js";
import { getQueuedTasks, getRunnableTasks } from "../planning/task-graph.js";
import { createOrchestrator, type SwarmOrchestrator } from "../services/orchestrator.js";
import { SessionStore } from "../session/session-store.js";
import { StateStore } from "../state/state-store.js";
import type { WorkflowState } from "../types.js";

export type AutopilotTickInput = {
  projectRoot: string;
  dryRun?: boolean;
};

export type AutopilotTickResult = {
  ok: true;
  dryRun: boolean;
  action: "dry_run" | "observe" | "dispatch" | "noop";
  summary: string;
  autopilot: AutopilotState;
  decision: AutopilotDecision;
  queuePressure: {
    runnableTasks: number;
    queuedTasks: number;
    runningTasks: number;
    reviewQueueSize: number;
  };
  targets: {
    runnableTaskIds: string[];
    queuedTaskIds: string[];
    reviewTaskIds: string[];
  };
  decisionLogPath: string;
};

export class AutopilotController {
  constructor(
    private readonly stateStore: StateStore = new StateStore(),
    private readonly autopilotStore: AutopilotStore = new AutopilotStore(stateStore.config),
    private readonly orchestrator: SwarmOrchestrator = createOrchestrator({ stateStore }),
  ) {}

  async tick(input: AutopilotTickInput): Promise<AutopilotTickResult> {
    const workflow = await this.stateStore.loadWorkflow(input.projectRoot);
    const current = await this.autopilotStore.getState(input.projectRoot);
    const dryRun = input.dryRun === true;
    const dispatchCap = this.stateStore.config.autopilot.maxDispatchPerTick;
    const initialSnapshot = snapshotWorkflow(workflow);
    const autopilotRunnable = current.desiredState === "running" && !stateStoreAutopilotDisabled(this.stateStore);

    const plannedDispatchCount = Math.min(
      dispatchCap,
      initialSnapshot.queuePressure.runnableTasks + initialSnapshot.queuePressure.queuedTasks,
    );
    const baseReason =
      current.desiredState === "paused"
        ? "autopilot is paused"
        : current.desiredState === "stopped"
          ? "autopilot is stopped"
          : stateStoreAutopilotDisabled(this.stateStore)
            ? "autopilot is disabled in config"
            : plannedDispatchCount > 0
              ? `eligible to dispatch up to ${plannedDispatchCount} tasks this tick`
              : "no runnable or queued tasks";
    const dryRunAction =
      autopilotRunnable
        ? ("dry_run" as const)
        : ("noop" as const);
    const initialAction = dryRun ? dryRunAction : "observe";
    const initialSummary =
      !autopilotRunnable || (dryRunAction === "noop" && dryRun)
        ? `${baseReason}; runnable=${initialSnapshot.queuePressure.runnableTasks}, queued=${initialSnapshot.queuePressure.queuedTasks}, review=${initialSnapshot.queuePressure.reviewQueueSize}`
        : `${dryRun ? "dry-run" : "observed"} runnable=${initialSnapshot.queuePressure.runnableTasks}, queued=${initialSnapshot.queuePressure.queuedTasks}, review=${initialSnapshot.queuePressure.reviewQueueSize}, dispatchCap=${dispatchCap}`;

    let decision: AutopilotDecision = {
      at: new Date().toISOString(),
      action: initialAction,
      summary: initialSummary,
      reason: baseReason,
      dryRun,
      targets: [
        ...initialSnapshot.targets.runnableTaskIds,
        ...initialSnapshot.targets.queuedTaskIds,
        ...initialSnapshot.targets.reviewTaskIds,
      ],
    };

    let nextState = current;
    let finalWorkflow = workflow;
    if (!dryRun) {
      const ownerId = randomUUID();
      const leaseAttempt = acquireAutopilotLease(
        current,
        ownerId,
        decision.at,
        this.stateStore.config.autopilot.leaseSeconds,
      );
      if (!leaseAttempt.acquired) {
        decision = {
          ...decision,
          action: "noop",
          summary: leaseAttempt.reason ?? "unable to acquire lease",
          reason: leaseAttempt.reason,
        };
        nextState = await this.persistTickState(input.projectRoot, current, decision, {
          dispatchCount: 0,
          observationCount: 0,
          autoApproveCount: 0,
          retryCount: 0,
          escalationCount: 0,
          cancelCount: 0,
          closeCount: 0,
          degradedTickCount: 0,
          degradedReason: current.degradedReason,
        });
      } else {
        await this.autopilotStore.saveState(input.projectRoot, leaseAttempt.state);
        let finalState = leaseAttempt.state;
        const increments = {
          dispatchCount: 0,
          observationCount: 0,
          autoApproveCount: 0,
          retryCount: 0,
          escalationCount: 0,
          cancelCount: 0,
          closeCount: 0,
          degradedTickCount: 0,
          degradedReason: leaseAttempt.state.degradedReason,
        };

        try {
          if (autopilotRunnable) {
            const syncResult = await this.orchestrator.syncActiveRuns({
              projectRoot: input.projectRoot,
            });
            finalWorkflow = await this.stateStore.loadWorkflow(input.projectRoot);

            let runs = await this.stateStore.loadRuns(input.projectRoot);
            const reviewResult = applyAutopilotReviewPolicy(finalWorkflow, runs, this.stateStore.config);
            if (reviewResult.workflow !== finalWorkflow) {
              await this.stateStore.saveWorkflow(input.projectRoot, reviewResult.workflow);
              finalWorkflow = reviewResult.workflow;
            }

            increments.autoApproveCount += reviewResult.counts.autoApproved;
            increments.retryCount += reviewResult.counts.retryQueued;
            increments.escalationCount += reviewResult.counts.escalated;

            const sessionStore = new SessionStore(this.stateStore.config);
            const targetIds = new Set<string>();
            syncResult.results.forEach((result) => targetIds.add(result.taskId));
            reviewResult.decisions.forEach((reviewDecision) => targetIds.add(reviewDecision.taskId));
            const summaryParts: string[] = [];
            let holdReason: string | undefined;

            if (syncResult.results.length > 0) {
              const transitionedCount = syncResult.results.filter((result) => result.transitioned).length;
              summaryParts.push(
                transitionedCount > 0
                  ? `synced ${syncResult.results.length} active run${syncResult.results.length === 1 ? "" : "s"} (${transitionedCount} transition${transitionedCount === 1 ? "" : "s"})`
                  : `synced ${syncResult.results.length} active run${syncResult.results.length === 1 ? "" : "s"}`,
              );
            }
            if (reviewResult.counts.autoApproved > 0) {
              summaryParts.push(`auto-approved ${reviewResult.counts.autoApproved} review task${reviewResult.counts.autoApproved === 1 ? "" : "s"}`);
            }
            if (reviewResult.counts.retryQueued > 0) {
              summaryParts.push(`re-queued ${reviewResult.counts.retryQueued} rejected review task${reviewResult.counts.retryQueued === 1 ? "" : "s"}`);
            }
            if (reviewResult.counts.rejectedBlocked > 0) {
              summaryParts.push(`blocked ${reviewResult.counts.rejectedBlocked} rejected review task${reviewResult.counts.rejectedBlocked === 1 ? "" : "s"}`);
            }
            if (reviewResult.counts.escalated > 0) {
              summaryParts.push(`escalated ${reviewResult.counts.escalated} review task${reviewResult.counts.escalated === 1 ? "" : "s"}`);
            }

            finalState = await this.mergeOperatorControlState(input.projectRoot, finalState);
            const controlHoldReason = describeControlHoldReason(finalState, stateStoreAutopilotDisabled(this.stateStore));
            if (controlHoldReason) {
              holdReason = controlHoldReason;
              summaryParts.push(controlHoldReason);
            } else {
              const recoveryPlan = planAutopilotRecovery({
                workflow: finalWorkflow,
                runs,
                sessions: await sessionStore.listSessions(input.projectRoot),
                config: this.stateStore.config,
                now: decision.at,
              });

              for (const action of recoveryPlan.actions) {
                finalState = await this.mergeOperatorControlState(input.projectRoot, finalState);
                const recoveryHoldReason = describeControlHoldReason(finalState, stateStoreAutopilotDisabled(this.stateStore));
                if (recoveryHoldReason) {
                  holdReason = recoveryHoldReason;
                  summaryParts.push(recoveryHoldReason);
                  break;
                }

                if (action.kind === "safe_cancel") {
                  const cancelled = await this.orchestrator.cancelRun({
                    projectRoot: input.projectRoot,
                    runId: action.runId,
                    reason: action.reason,
                    terminalStatus: action.terminalStatus,
                  });
                  increments.cancelCount += 1;
                  targetIds.add(action.taskId);
                  summaryParts.push(
                    action.retryAfterCancel
                      ? `cancelled stuck run ${action.taskId} and queued retry`
                      : `cancelled stuck run ${action.taskId}`,
                  );
                  if (action.retryAfterCancel) {
                    const cancelledRun = await this.stateStore.loadRun(input.projectRoot, cancelled.runId);
                    if (cancelledRun) {
                      const retryResult = await this.orchestrator.evaluateRetry({
                        projectRoot: input.projectRoot,
                        taskId: action.taskId,
                        runRecord: cancelledRun,
                      });
                      if (retryResult.ok && (retryResult.action === "dispatched" || retryResult.action === "review_required")) {
                        increments.retryCount += 1;
                        (retryResult.taskIds ?? []).forEach((taskId) => targetIds.add(taskId));
                      } else if (!retryResult.ok) {
                        increments.escalationCount += 1;
                        summaryParts.push(`retry hold for ${action.taskId}: ${retryResult.message ?? retryResult.action}`);
                      }
                    }
                  }
                } else if (action.kind === "safe_close") {
                  await this.orchestrator.closeSession({
                    projectRoot: input.projectRoot,
                    sessionId: action.sessionId,
                    reason: action.reason,
                  });
                  increments.closeCount += 1;
                  summaryParts.push(`closed stale session ${action.sessionId}`);
                } else if (action.kind === "escalate") {
                  increments.escalationCount += 1;
                  summaryParts.push(`escalated ${action.taskId ?? action.sessionId ?? action.runId ?? "recovery item"}`);
                }
              }
            }

            finalWorkflow = await this.stateStore.loadWorkflow(input.projectRoot);
            runs = await this.stateStore.loadRuns(input.projectRoot);
            finalState = await this.mergeOperatorControlState(input.projectRoot, finalState);
            const health = buildAutopilotHealthSummary(runs, finalState, this.stateStore.config);
            increments.degradedReason = health.degraded ? health.degradedReason : undefined;
            if (health.degraded) {
              increments.degradedTickCount = 1;
              summaryParts.push(`degraded mode holding dispatch: ${health.degradedReason}`);
              holdReason = `degraded mode active: ${health.degradedReason}`;
            }

            const finalSnapshotBeforeDispatch = snapshotWorkflow(finalWorkflow);
            const dispatchableCount = Math.min(
              dispatchCap,
              finalSnapshotBeforeDispatch.queuePressure.runnableTasks + finalSnapshotBeforeDispatch.queuePressure.queuedTasks,
            );

            finalState = await this.mergeOperatorControlState(input.projectRoot, finalState);
            const dispatchHoldReason = describeControlHoldReason(finalState, stateStoreAutopilotDisabled(this.stateStore));
            if (dispatchHoldReason) {
              holdReason = dispatchHoldReason;
              if (!summaryParts.includes(dispatchHoldReason)) {
                summaryParts.push(dispatchHoldReason);
              }
            } else if (!health.degraded && dispatchableCount > 0) {
              const batchResult = await this.orchestrator.runBatch({
                projectRoot: input.projectRoot,
                parallel: dispatchCap,
              });
              increments.dispatchCount = batchResult.stats.dispatchAdmitted;
              batchResult.results.flatMap((result) => result.taskIds ?? []).forEach((taskId) => targetIds.add(taskId));
              summaryParts.push(
                increments.dispatchCount > 0
                  ? `dispatched ${batchResult.stats.dispatchAdmitted}, queued ${batchResult.stats.dispatchQueued} of ${batchResult.stats.dispatchRequested} requested`
                  : batchResult.message ?? "no tasks dispatched",
              );
            }

            if (increments.dispatchCount === 0 && summaryParts.length > 0) {
              increments.observationCount = 1;
            }

            decision = {
              ...decision,
              action:
                increments.dispatchCount > 0
                  ? "dispatch"
                  : summaryParts.length > 0
                    ? "observe"
                    : "noop",
              summary: summaryParts.length > 0 ? summaryParts.join("; ") : initialSummary,
              reason:
                increments.dispatchCount > 0
                  ? `autopilot dispatched up to ${dispatchCap} tasks`
                  : summaryParts.length > 0
                    ? holdReason ?? "autopilot synchronized active runs and review queue"
                    : baseReason,
              targets: Array.from(targetIds),
            };
            finalWorkflow = await this.stateStore.loadWorkflow(input.projectRoot);
          } else {
            increments.observationCount = 1;
            decision = {
              ...decision,
              action: "noop",
              summary: initialSummary,
              reason: baseReason,
            };
          }
        } finally {
          finalState = releaseAutopilotLease(finalState, ownerId);
        }

        finalState = await this.mergeOperatorControlState(input.projectRoot, finalState);
        nextState = await this.persistTickState(input.projectRoot, finalState, decision, {
          dispatchCount: increments.dispatchCount,
          observationCount: increments.observationCount,
          autoApproveCount: increments.autoApproveCount,
          retryCount: increments.retryCount,
          escalationCount: increments.escalationCount,
          cancelCount: increments.cancelCount,
          closeCount: increments.closeCount,
          degradedTickCount: increments.degradedTickCount,
          degradedReason: increments.degradedReason,
        });
      }
    }

    const finalSnapshot = snapshotWorkflow(finalWorkflow);

    return {
      ok: true,
      dryRun,
      action: decision.action,
      summary: decision.summary,
      autopilot: nextState,
      decision,
      queuePressure: finalSnapshot.queuePressure,
      targets: finalSnapshot.targets,
      decisionLogPath: this.autopilotStore.resolvePaths(input.projectRoot).autopilotDecisionLogPath,
    };
  }

  private async persistTickState(
    projectRoot: string,
    current: AutopilotState,
    decision: AutopilotDecision,
    increments: {
      dispatchCount: number;
      observationCount: number;
      autoApproveCount: number;
      retryCount: number;
      escalationCount: number;
      cancelCount: number;
      closeCount: number;
      degradedTickCount: number;
      degradedReason?: string;
    },
  ): Promise<AutopilotState> {
    const nextState: AutopilotState = {
      ...current,
      runtimeState: "idle",
      lastTickAt: decision.at,
      nextTickAt: new Date(new Date(decision.at).getTime() + this.stateStore.config.autopilot.tickSeconds * 1000).toISOString(),
      lastDecision: decision,
      metrics: {
        ...current.metrics,
        tickCount: current.metrics.tickCount + 1,
        dryRunCount: current.metrics.dryRunCount,
        observationCount: current.metrics.observationCount + increments.observationCount,
        dispatchCount: current.metrics.dispatchCount + increments.dispatchCount,
        autoApproveCount: current.metrics.autoApproveCount + increments.autoApproveCount,
        retryCount: current.metrics.retryCount + increments.retryCount,
        escalationCount: current.metrics.escalationCount + increments.escalationCount,
        cancelCount: current.metrics.cancelCount + increments.cancelCount,
        closeCount: current.metrics.closeCount + increments.closeCount,
        degradedTickCount: current.metrics.degradedTickCount + increments.degradedTickCount,
      },
      degradedReason: increments.degradedReason,
      degradedSince:
        increments.degradedReason && !current.degradedReason
          ? decision.at
          : increments.degradedReason
            ? current.degradedSince ?? decision.at
            : undefined,
    };
    await this.autopilotStore.saveState(projectRoot, nextState);
    await this.autopilotStore.appendDecision(projectRoot, {
      tickId: randomUUID(),
      ...decision,
    });
    return nextState;
  }

  private async mergeOperatorControlState(projectRoot: string, current: AutopilotState): Promise<AutopilotState> {
    const persisted = await this.autopilotStore.getState(projectRoot);
    return {
      ...current,
      desiredState: persisted.desiredState,
      pausedReason: persisted.pausedReason,
    };
  }
}

function stateStoreAutopilotDisabled(stateStore: StateStore): boolean {
  return !stateStore.config.autopilot.enabled;
}

function snapshotWorkflow(workflow: WorkflowState): Pick<AutopilotTickResult, "queuePressure" | "targets"> {
  const runnableTasks = getRunnableTasks(workflow.tasks);
  const queuedTasks = getQueuedTasks(workflow.tasks);
  const runningTasks = workflow.tasks.filter((task) => task.status === "running");

  return {
    queuePressure: {
      runnableTasks: runnableTasks.length,
      queuedTasks: queuedTasks.length,
      runningTasks: runningTasks.length,
      reviewQueueSize: workflow.reviewQueue.length,
    },
    targets: {
      runnableTaskIds: runnableTasks.map((task) => task.taskId),
      queuedTaskIds: queuedTasks.map((task) => task.taskId),
      reviewTaskIds: [...workflow.reviewQueue],
    },
  };
}

function describeControlHoldReason(current: AutopilotState, disabledInConfig: boolean): string | undefined {
  if (current.desiredState === "paused") {
    return current.pausedReason ? `operator paused autopilot: ${current.pausedReason}` : "operator paused autopilot";
  }
  if (current.desiredState === "stopped") {
    return "operator stopped autopilot";
  }
  if (disabledInConfig) {
    return "autopilot is disabled in config";
  }
  return undefined;
}
