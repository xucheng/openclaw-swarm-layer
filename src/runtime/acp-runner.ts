import type { SwarmPluginConfig } from "../config.js";
import { defaultSwarmPluginConfig } from "../config.js";
import { buildAcpSpawnParams } from "./acp-mapping.js";
import { UnsupportedOpenClawSessionAdapter, type OpenClawSessionAdapter } from "./openclaw-session-adapter.js";
import type { RunnerPlan, RunnerPlanInput, RunnerRunInput, RunnerRunResult, TaskRunner } from "./task-runner.js";

function createRunId(taskId: string): string {
  return `${taskId}-run-${Date.now()}`;
}

export class AcpRunner implements TaskRunner {
  readonly kind = "acp" as const;

  constructor(
    private readonly config: Pick<SwarmPluginConfig, "acp"> = defaultSwarmPluginConfig,
    private readonly sessionAdapter: OpenClawSessionAdapter = new UnsupportedOpenClawSessionAdapter(),
  ) {}

  async plan(input: RunnerPlanInput): Promise<RunnerPlan> {
    const spawnParams = buildAcpSpawnParams(input.task, input.workflow, this.config);
    return {
      runnable: true,
      summary: `acp runner is scaffolded for task ${input.task.taskId} with agent ${spawnParams.agentId} in ${spawnParams.mode} mode`,
      workspacePath: spawnParams.cwd ?? input.projectRoot,
      nextStatus: "running",
    };
  }

  async run(input: RunnerRunInput): Promise<RunnerRunResult> {
    const existingSessionKey = input.reusedSession?.providerRef.sessionKey;
    const threadId = input.reusedSession?.threadId;
    const spawnParams = buildAcpSpawnParams(input.task, input.workflow, this.config, {
      existingSessionKey,
      threadId,
    });
    const requestedAt = new Date().toISOString();
    const accepted = await this.sessionAdapter.spawnAcpSession(spawnParams);
    const acceptedAt = accepted.acceptedAt ?? new Date().toISOString();
    const reused = Boolean(existingSessionKey);

    return {
      accepted: true,
      nextTaskStatus: "running",
      runRecord: {
        runId: createRunId(input.task.taskId),
        taskId: input.task.taskId,
        attempt: 1,
        status: "accepted",
        runner: { type: "acp" },
        workspacePath: spawnParams.cwd ?? input.projectRoot,
        startedAt: requestedAt,
        promptSummary: spawnParams.task,
        resultSummary: reused
          ? `ACP session reused: ${accepted.sessionKey}`
          : `ACP session accepted: ${accepted.sessionKey}`,
        artifacts: [],
        sessionRef: {
          runtime: "acp",
          sessionKey: accepted.sessionKey,
          backend: accepted.backend,
          backendSessionId: accepted.backendSessionId,
          agentSessionId: accepted.agentSessionId,
          threadId: accepted.threadId ?? threadId,
        },
        events: [
          {
            at: requestedAt,
            type: reused ? "session_reused" : "spawn_requested",
            detail: {
              agentId: spawnParams.agentId,
              mode: spawnParams.mode,
              thread: spawnParams.thread,
              ...(reused ? { reusedSessionKey: existingSessionKey } : {}),
              ...(threadId ? { threadId } : {}),
            },
          },
          {
            at: acceptedAt,
            type: "spawn_accepted",
            detail: {
              sessionKey: accepted.sessionKey,
              backend: accepted.backend,
            },
          },
        ],
      },
    };
  }
}
