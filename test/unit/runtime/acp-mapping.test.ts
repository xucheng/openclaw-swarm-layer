import { buildAcpSpawnParams, preflightAcpTask } from "../../../src/runtime/acp-mapping.js";
import type { SwarmPluginConfig } from "../../../src/config.js";
import type { TaskNode, WorkflowState } from "../../../src/types.js";

const baseConfig: Pick<SwarmPluginConfig, "acp"> = {
  acp: {
    enabled: true,
    defaultAgentId: "codex",
    allowedAgents: ["codex", "claude"],
    defaultMode: "run",
    allowThreadBinding: false,
    defaultTimeoutSeconds: 600,
    experimentalControlPlaneAdapter: false,
  },
};

const baseTask: TaskNode = {
  taskId: "task-acp",
  specId: "spec-1",
  title: "ACP Task",
  description: "Open the repo and run tests",
  kind: "coding",
  deps: [],
  status: "ready",
  workspace: { mode: "shared" },
  runner: { type: "acp" },
  review: { required: true },
};

const workflow: WorkflowState = {
  version: 1,
  projectRoot: "/tmp/project",
  lifecycle: "planned",
  tasks: [baseTask],
  reviewQueue: [],
};

describe("acp mapping", () => {
  it("builds spawn params from task and config defaults", () => {
    const params = buildAcpSpawnParams(baseTask, workflow, baseConfig);

    expect(params).toEqual({
      task: "Open the repo and run tests",
      runtime: "acp",
      agentId: "codex",
      mode: "run",
      thread: false,
      cwd: "/tmp/project",
      runTimeoutSeconds: 600,
    });
  });

  it("fails preflight when acp is disabled", () => {
    const result = preflightAcpTask(baseTask, {
      acp: {
        ...baseConfig.acp,
        enabled: false,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("ACP is disabled in plugin config");
  });

  it("fails preflight for disallowed agents and invalid session mode", () => {
    const result = preflightAcpTask(
      {
        ...baseTask,
        runner: {
          type: "acp",
          agentId: "gemini",
          mode: "session",
        },
      },
      baseConfig,
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("ACP target agent is not allowed: gemini");
    expect(result.errors).toContain('ACP mode "session" requires threadRequested=true');
  });

  it("warns when persistent session is requested before M3", () => {
    const result = preflightAcpTask(
      {
        ...baseTask,
        runner: {
          type: "acp",
          persistentSession: true,
        },
      },
      baseConfig,
    );

    expect(result.ok).toBe(true);
    expect(result.warnings).toContain("persistentSession is reserved for M3 and is ignored in M2");
  });

  it("passes existingSessionKey through spawn params", () => {
    const params = buildAcpSpawnParams(baseTask, workflow, baseConfig, {
      existingSessionKey: "agent:codex:acp:existing",
    });

    expect(params.existingSessionKey).toBe("agent:codex:acp:existing");
  });

  it("omits existingSessionKey when not provided", () => {
    const params = buildAcpSpawnParams(baseTask, workflow, baseConfig);
    expect(params.existingSessionKey).toBeUndefined();
  });

  it("passes threadId through spawn params", () => {
    const params = buildAcpSpawnParams(baseTask, workflow, baseConfig, {
      threadId: "thread-abc",
    });
    expect(params.threadId).toBe("thread-abc");
    expect(params.thread).toBe(true);
  });

  it("sets thread to true when threadId is provided even without threadRequested", () => {
    const params = buildAcpSpawnParams(baseTask, workflow, baseConfig, {
      threadId: "thread-xyz",
    });
    expect(params.thread).toBe(true);
  });
});
