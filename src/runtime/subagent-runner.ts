import { buildSubagentSpawnParams } from "./subagent-mapping.js";
import { UnsupportedOpenClawSubagentAdapter, type OpenClawSubagentAdapter } from "./openclaw-subagent-adapter.js";
import { syncSubagentRunRecord } from "./session-sync.js";
import type { RunnerPlan, RunnerPlanInput, RunnerRunInput, RunnerRunResult, RunnerSyncInput, RunnerSyncResult, TaskRunner } from "./task-runner.js";

export class SubagentRunner implements TaskRunner {
  readonly kind = "subagent" as const;

  constructor(private readonly subagentAdapter: OpenClawSubagentAdapter = new UnsupportedOpenClawSubagentAdapter()) {}

  async plan(input: RunnerPlanInput): Promise<RunnerPlan> {
    const params = buildSubagentSpawnParams(input.task, input.workflow);
    return {
      runnable: true,
      summary: `subagent runner is prepared for task ${input.task.taskId} in ${params.mode} mode`,
      workspacePath: input.projectRoot,
      nextStatus: "running",
    };
  }

  async run(input: RunnerRunInput): Promise<RunnerRunResult> {
    const params = buildSubagentSpawnParams(input.task, input.workflow);
    const requestedAt = new Date().toISOString();
    const accepted = await this.subagentAdapter.spawnSubagent(params);
    const acceptedAt = accepted.acceptedAt ?? new Date().toISOString();

    return {
      accepted: true,
      nextTaskStatus: "running",
      runRecord: {
        runId: accepted.runId,
        taskId: input.task.taskId,
        attempt: 1,
        status: "accepted",
        runner: { type: "subagent" },
        workspacePath: input.projectRoot,
        startedAt: requestedAt,
        promptSummary: params.task,
        resultSummary: accepted.note ?? `Subagent accepted: ${accepted.childSessionKey}`,
        artifacts: [],
        sessionRef: {
          runtime: "subagent",
          sessionKey: accepted.childSessionKey,
        },
        events: [
          {
            at: requestedAt,
            type: "spawn_requested",
            detail: {
              mode: params.mode,
              thread: params.thread,
              agentId: params.agentId,
            },
          },
          {
            at: acceptedAt,
            type: "spawn_accepted",
            detail: {
              childSessionKey: accepted.childSessionKey,
              runId: accepted.runId,
            },
          },
        ],
      },
    };
  }

  async sync(input: RunnerSyncInput): Promise<RunnerSyncResult> {
    const childSessionKey = input.runRecord.sessionRef?.sessionKey;
    if (!childSessionKey) {
      throw new Error(`Subagent run record ${input.runRecord.runId} has no session key`);
    }

    const remoteStatus = await this.subagentAdapter.getSubagentRunStatus(childSessionKey);
    const synced = syncSubagentRunRecord(input.runRecord, remoteStatus);

    return {
      runRecord: synced.runRecord,
      checkedAt: remoteStatus.checkedAt,
      remoteState: remoteStatus.state,
    };
  }
}
