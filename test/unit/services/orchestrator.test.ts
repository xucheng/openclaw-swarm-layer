import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AcpRunner } from "../../../src/runtime/acp-runner.js";
import type { OpenClawSessionAdapter } from "../../../src/runtime/openclaw-session-adapter.js";
import { RunnerRegistry } from "../../../src/runtime/runner-registry.js";
import { createOrchestrator } from "../../../src/services/orchestrator.js";
import { SessionStore } from "../../../src/session/session-store.js";
import { StateStore } from "../../../src/state/state-store.js";
import type { SessionRecord, SpecDoc, TaskNode, WorkflowState } from "../../../src/types.js";
import { planTasksFromSpec } from "../../../src/planning/planner.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-orchestrator-"));
}

function makeSpec(projectRoot: string): SpecDoc {
  return {
    specId: "spec-1",
    title: "Spec 1",
    sourcePath: path.join(projectRoot, "SPEC.md"),
    projectRoot,
    goals: ["Ship"],
    constraints: [],
    acceptanceCriteria: [],
    phases: [{ phaseId: "phase-1", title: "Build", tasks: ["Run task"] }],
  };
}

function makeAcpAdapter(): OpenClawSessionAdapter {
  return {
    async spawnAcpSession() {
      return { sessionKey: "agent:codex:acp:abc", backend: "acpx" };
    },
    async getAcpSessionStatus() {
      return { sessionKey: "agent:codex:acp:abc", state: "running" };
    },
    async cancelAcpSession() {
      return { sessionKey: "agent:codex:acp:abc" };
    },
    async closeAcpSession() {
      return { sessionKey: "agent:codex:acp:abc" };
    },
  };
}

function makeAcpRunner(adapter?: OpenClawSessionAdapter): AcpRunner {
  return new AcpRunner(
    {
      acp: {
        enabled: true,
        defaultAgentId: "codex",
        allowedAgents: ["codex"],
        defaultMode: "run",
        allowThreadBinding: false,
        defaultTimeoutSeconds: 600,
        experimentalControlPlaneAdapter: false,
      },
    },
    adapter ?? makeAcpAdapter(),
  );
}

async function setupProject(opts?: {
  taskOverrides?: Partial<TaskNode>;
  reviewRequired?: boolean;
}): Promise<{ projectRoot: string; stateStore: StateStore }> {
  const projectRoot = await makeTempProject();
  const stateStore = new StateStore();
  const spec = makeSpec(projectRoot);
  const tasks = planTasksFromSpec(spec, {
    defaultRunner: "manual",
    reviewRequiredByDefault: opts?.reviewRequired ?? true,
  });
  const finalTasks = opts?.taskOverrides
    ? tasks.map((t) => ({ ...t, ...opts.taskOverrides }))
    : tasks;
  await stateStore.initProject(projectRoot);
  await stateStore.saveWorkflow(projectRoot, {
    version: 1,
    projectRoot,
    activeSpecId: spec.specId,
    lifecycle: "planned",
    tasks: finalTasks,
    reviewQueue: [],
  });
  return { projectRoot, stateStore };
}

describe("SwarmOrchestrator", () => {
  it("keeps acp accepted runs in running state until review is possible", async () => {
    const { projectRoot, stateStore } = await setupProject();
    const orchestrator = createOrchestrator({
      stateStore,
      runnerRegistry: new RunnerRegistry([makeAcpRunner()]),
    });

    const result = await orchestrator.runOnce({ projectRoot, runnerOverride: "acp" });
    const workflow = await stateStore.loadWorkflow(projectRoot);
    const runs = await stateStore.loadRuns(projectRoot);

    expect(result.action).toBe("dispatched");
    expect(workflow.lifecycle).toBe("running");
    expect(workflow.reviewQueue).toEqual([]);
    expect(workflow.tasks[0]?.status).toBe("running");
    expect(runs[0]?.status).toBe("accepted");
  });

  it("returns noop when no runnable tasks exist", async () => {
    const { projectRoot, stateStore } = await setupProject({
      taskOverrides: { status: "done" },
    });
    const orchestrator = createOrchestrator({ stateStore });

    const result = await orchestrator.runOnce({ projectRoot });
    expect(result.ok).toBe(true);
    expect(result.action).toBe("noop");
    expect(result.message).toBe("no runnable tasks");
  });

  it("returns planned result on dry run", async () => {
    const { projectRoot, stateStore } = await setupProject();
    const orchestrator = createOrchestrator({ stateStore });

    const result = await orchestrator.runOnce({ projectRoot, dryRun: true });
    expect(result.ok).toBe(true);
    expect(result.action).toBe("planned");
    expect(result.taskIds).toHaveLength(1);
  });

  it("dispatches manual runner and moves to review when required", async () => {
    const { projectRoot, stateStore } = await setupProject({ reviewRequired: true });
    const orchestrator = createOrchestrator({ stateStore });

    const result = await orchestrator.runOnce({ projectRoot });
    const workflow = await stateStore.loadWorkflow(projectRoot);

    expect(result.ok).toBe(true);
    expect(result.action).toBe("review_required");
    expect(workflow.lifecycle).toBe("reviewing");
    expect(workflow.reviewQueue).toContain(workflow.tasks[0]?.taskId);
  });

  it("dispatches manual runner and completes when review not required", async () => {
    const { projectRoot, stateStore } = await setupProject({ reviewRequired: false });
    const orchestrator = createOrchestrator({ stateStore });

    const result = await orchestrator.runOnce({ projectRoot });
    const workflow = await stateStore.loadWorkflow(projectRoot);

    expect(result.ok).toBe(true);
    expect(result.action).toBe("dispatched");
    expect(workflow.lifecycle).toBe("completed");
    expect(workflow.tasks[0]?.status).toBe("done");
  });

  it("persists session record for ACP runs", async () => {
    const { projectRoot, stateStore } = await setupProject();
    const sessionStore = new SessionStore(stateStore.config);
    const orchestrator = createOrchestrator({
      stateStore,
      sessionStore,
      runnerRegistry: new RunnerRegistry([makeAcpRunner()]),
    });

    await orchestrator.runOnce({ projectRoot, runnerOverride: "acp" });
    const sessions = await sessionStore.listSessions(projectRoot);

    expect(sessions.length).toBeGreaterThanOrEqual(1);
    expect(sessions[0]?.runner).toBe("acp");
    expect(sessions[0]?.state).toBe("active");
  });

  it("syncs active ACP runs back into workflow and session state", async () => {
    const { projectRoot, stateStore } = await setupProject({
      taskOverrides: { status: "running", runner: { type: "acp" } },
    });
    const sessionStore = new SessionStore(stateStore.config);
    await stateStore.writeRun(projectRoot, {
      runId: "run-acp-sync",
      taskId: (await stateStore.loadWorkflow(projectRoot)).tasks[0]!.taskId,
      attempt: 1,
      status: "accepted",
      runner: { type: "acp" },
      workspacePath: projectRoot,
      startedAt: "2026-03-22T00:00:00.000Z",
      artifacts: [],
      sessionRef: { runtime: "acp", sessionKey: "agent:codex:acp:sync" },
    });
    const adapter: OpenClawSessionAdapter = {
      async spawnAcpSession() {
        return { sessionKey: "agent:codex:acp:sync", backend: "acpx" };
      },
      async getAcpSessionStatus() {
        return {
          sessionKey: "agent:codex:acp:sync",
          state: "completed",
          checkedAt: "2026-03-22T00:05:00.000Z",
          message: "done",
        };
      },
      async cancelAcpSession() {
        return { sessionKey: "agent:codex:acp:sync" };
      },
      async closeAcpSession() {
        return { sessionKey: "agent:codex:acp:sync" };
      },
    };
    const orchestrator = createOrchestrator({
      stateStore,
      sessionStore,
      sessionAdapter: adapter,
    });

    const result = await orchestrator.syncActiveRuns({ projectRoot });
    const workflow = await stateStore.loadWorkflow(projectRoot);
    const run = await stateStore.loadRun(projectRoot, "run-acp-sync");
    const sessions = await sessionStore.listSessions(projectRoot);

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.status).toBe("completed");
    expect(workflow.reviewQueue).toEqual([workflow.tasks[0]!.taskId]);
    expect(run?.status).toBe("completed");
    expect(sessions[0]?.state).toBe("closed");
  });

  it("cancels a stuck ACP run into timed_out and updates workflow/session state", async () => {
    const { projectRoot, stateStore } = await setupProject({
      taskOverrides: { status: "running", runner: { type: "acp" } },
    });
    const sessionStore = new SessionStore(stateStore.config);
    await stateStore.writeRun(projectRoot, {
      runId: "run-acp-stuck",
      taskId: (await stateStore.loadWorkflow(projectRoot)).tasks[0]!.taskId,
      attempt: 1,
      status: "running",
      runner: { type: "acp" },
      workspacePath: projectRoot,
      startedAt: "2026-03-22T00:00:00.000Z",
      artifacts: [],
      sessionRef: { runtime: "acp", sessionKey: "agent:codex:acp:stuck" },
    });
    const adapter: OpenClawSessionAdapter = {
      async spawnAcpSession() {
        return { sessionKey: "agent:codex:acp:stuck", backend: "acpx" };
      },
      async getAcpSessionStatus() {
        return { sessionKey: "agent:codex:acp:stuck", state: "running" };
      },
      async cancelAcpSession() {
        return { sessionKey: "agent:codex:acp:stuck", cancelledAt: "2026-03-22T00:05:00.000Z", message: "cancelled" };
      },
      async closeAcpSession() {
        return { sessionKey: "agent:codex:acp:stuck" };
      },
    };
    const orchestrator = createOrchestrator({
      stateStore,
      sessionStore,
      sessionAdapter: adapter,
    });

    const result = await orchestrator.cancelRun({
      projectRoot,
      runId: "run-acp-stuck",
      terminalStatus: "timed_out",
      reason: "stuck",
    });
    const workflow = await stateStore.loadWorkflow(projectRoot);
    const run = await stateStore.loadRun(projectRoot, "run-acp-stuck");
    const sessions = await sessionStore.listSessions(projectRoot);

    expect(result.status).toBe("timed_out");
    expect(run?.events?.some((event) => event.type === "recovery_cancelled")).toBe(true);
    expect(workflow.reviewQueue).toEqual([workflow.tasks[0]!.taskId]);
    expect(sessions[0]?.state).toBe("failed");
  });

  it("closes stale ACP sessions and records the recovery event", async () => {
    const { projectRoot, stateStore } = await setupProject({
      taskOverrides: { status: "done", runner: { type: "acp" }, review: { required: false, status: "approved" } as any },
      reviewRequired: false,
    });
    const sessionStore = new SessionStore(stateStore.config);
    await stateStore.writeRun(projectRoot, {
      runId: "run-acp-closed",
      taskId: (await stateStore.loadWorkflow(projectRoot)).tasks[0]!.taskId,
      attempt: 1,
      status: "completed",
      runner: { type: "acp" },
      workspacePath: projectRoot,
      startedAt: "2026-03-22T00:00:00.000Z",
      endedAt: "2026-03-22T00:01:00.000Z",
      artifacts: [],
      sessionRef: { runtime: "acp", sessionKey: "agent:codex:acp:idle" },
    });
    await sessionStore.writeSession(projectRoot, {
      sessionId: "acp-idle",
      runner: "acp",
      projectRoot,
      scope: { bindingKey: "feature-a", taskKind: "coding" },
      mode: "persistent",
      state: "idle",
      createdAt: "2026-03-22T00:00:00.000Z",
      updatedAt: "2026-03-22T00:10:00.000Z",
      lastRunId: "run-acp-closed",
      providerRef: { sessionKey: "agent:codex:acp:idle" },
    });
    const adapter: OpenClawSessionAdapter = {
      async spawnAcpSession() {
        return { sessionKey: "agent:codex:acp:idle", backend: "acpx" };
      },
      async getAcpSessionStatus() {
        return { sessionKey: "agent:codex:acp:idle", state: "completed" };
      },
      async cancelAcpSession() {
        return { sessionKey: "agent:codex:acp:idle" };
      },
      async closeAcpSession() {
        return { sessionKey: "agent:codex:acp:idle", closedAt: "2026-03-22T00:20:00.000Z", message: "closed" };
      },
    };
    const orchestrator = createOrchestrator({
      stateStore,
      sessionStore,
      sessionAdapter: adapter,
    });

    const result = await orchestrator.closeSession({
      projectRoot,
      sessionId: "acp-idle",
      reason: "stale",
    });
    const session = await sessionStore.loadSession(projectRoot, "acp-idle");
    const run = await stateStore.loadRun(projectRoot, "run-acp-closed");

    expect(result.state).toBe("closed");
    expect(session?.state).toBe("closed");
    expect(run?.events?.some((event) => event.type === "recovery_closed")).toBe(true);
  });

  it("reuses an existing idle persistent session for reuse_if_available task", async () => {
    const { projectRoot, stateStore } = await setupProject({
      taskOverrides: {
        runner: { type: "acp" },
        session: { policy: "reuse_if_available", bindingKey: "feature-a" },
      },
    });
    const sessionStore = new SessionStore(stateStore.config);

    // Seed an idle persistent session
    const existingSession: SessionRecord = {
      sessionId: "acp-existing",
      runner: "acp",
      projectRoot,
      scope: { bindingKey: "feature-a", taskKind: "coding" },
      mode: "persistent",
      state: "idle",
      createdAt: "2026-03-21T00:00:00.000Z",
      updatedAt: "2026-03-21T00:10:00.000Z",
      providerRef: { sessionKey: "agent:codex:acp:existing" },
    };
    await sessionStore.writeSession(projectRoot, existingSession);

    const orchestrator = createOrchestrator({
      stateStore,
      sessionStore,
      runnerRegistry: new RunnerRegistry([makeAcpRunner()]),
    });

    const result = await orchestrator.runOnce({ projectRoot, runnerOverride: "acp" });

    expect(result.ok).toBe(true);
    expect(result.action).toBe("dispatched");
    expect(result.reusedSessionId).toBe("acp-existing");
    expect(result.message).toContain("reused");
  });

  it("fails with session_required when require_existing finds no session", async () => {
    const { projectRoot, stateStore } = await setupProject({
      taskOverrides: {
        runner: { type: "acp" },
        session: { policy: "require_existing", bindingKey: "feature-x" },
      },
    });
    const sessionStore = new SessionStore(stateStore.config);
    const orchestrator = createOrchestrator({
      stateStore,
      sessionStore,
      runnerRegistry: new RunnerRegistry([makeAcpRunner()]),
    });

    const result = await orchestrator.runOnce({ projectRoot, runnerOverride: "acp" });

    expect(result.ok).toBe(false);
    expect(result.action).toBe("session_required");
    expect(result.message).toContain("requires an existing session");
  });

  it("shows reuse info in dry run when session is available", async () => {
    const { projectRoot, stateStore } = await setupProject({
      taskOverrides: {
        runner: { type: "acp" },
        session: { policy: "reuse_if_available", bindingKey: "feature-a" },
      },
    });
    const sessionStore = new SessionStore(stateStore.config);
    await sessionStore.writeSession(projectRoot, {
      sessionId: "acp-dry",
      runner: "acp",
      projectRoot,
      scope: { bindingKey: "feature-a", taskKind: "coding" },
      mode: "persistent",
      state: "idle",
      createdAt: "2026-03-21T00:00:00.000Z",
      updatedAt: "2026-03-21T00:10:00.000Z",
      providerRef: { sessionKey: "agent:codex:acp:dry" },
    });
    const orchestrator = createOrchestrator({
      stateStore,
      sessionStore,
      runnerRegistry: new RunnerRegistry([makeAcpRunner()]),
    });

    const result = await orchestrator.runOnce({ projectRoot, runnerOverride: "acp", dryRun: true });

    expect(result.ok).toBe(true);
    expect(result.action).toBe("planned");
    expect(result.reusedSessionId).toBe("acp-dry");
    expect(result.message).toContain("would reuse session");
  });

  it("spawns new session when no reusable session matches", async () => {
    const { projectRoot, stateStore } = await setupProject({
      taskOverrides: {
        runner: { type: "acp" },
        session: { policy: "reuse_if_available", bindingKey: "feature-z" },
      },
    });
    const sessionStore = new SessionStore(stateStore.config);
    const orchestrator = createOrchestrator({
      stateStore,
      sessionStore,
      runnerRegistry: new RunnerRegistry([makeAcpRunner()]),
    });

    const result = await orchestrator.runOnce({ projectRoot, runnerOverride: "acp" });

    expect(result.ok).toBe(true);
    expect(result.action).toBe("dispatched");
    expect(result.reusedSessionId).toBeUndefined();
  });

  it("rejects thread-bound dispatch when allowThreadBinding is disabled", async () => {
    const { projectRoot, stateStore } = await setupProject({
      taskOverrides: {
        runner: { type: "acp" },
        session: { policy: "reuse_if_available", bindingKey: "feature-a" },
      },
    });
    // Override config to disable thread binding
    const restrictedStore = new StateStore({
      acp: {
        enabled: true,
        defaultAgentId: "codex",
        allowedAgents: ["codex"],
        defaultMode: "run",
        allowThreadBinding: false,
        defaultTimeoutSeconds: 600,
        experimentalControlPlaneAdapter: false,
      },
    });
    const sessionStore = new SessionStore(restrictedStore.config);

    // Seed a session WITH threadId
    await sessionStore.writeSession(projectRoot, {
      sessionId: "acp-threaded",
      runner: "acp",
      projectRoot,
      scope: { bindingKey: "feature-a", taskKind: "coding" },
      mode: "persistent",
      state: "idle",
      createdAt: "2026-03-21T00:00:00.000Z",
      updatedAt: "2026-03-21T00:10:00.000Z",
      providerRef: { sessionKey: "agent:codex:acp:threaded" },
      threadId: "thread-123",
    });

    // Need to re-setup workflow with the restricted store
    const spec = makeSpec(projectRoot);
    const tasks = planTasksFromSpec(spec, { defaultRunner: "manual", reviewRequiredByDefault: true });
    const finalTasks = tasks.map((t) => ({
      ...t,
      runner: { type: "acp" as const },
      session: { policy: "reuse_if_available" as const, bindingKey: "feature-a" },
    }));
    await restrictedStore.initProject(projectRoot);
    await restrictedStore.saveWorkflow(projectRoot, {
      version: 1,
      projectRoot,
      activeSpecId: spec.specId,
      lifecycle: "planned",
      tasks: finalTasks,
      reviewQueue: [],
    });

    const orchestrator = createOrchestrator({
      stateStore: restrictedStore,
      sessionStore,
      runnerRegistry: new RunnerRegistry([makeAcpRunner()]),
    });

    const result = await orchestrator.runOnce({ projectRoot, runnerOverride: "acp" });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("allowThreadBinding is disabled");
  });

  it("evaluateRetry moves task to dead_letter when retries exhausted", async () => {
    const { projectRoot, stateStore } = await setupProject({
      taskOverrides: {
        runner: {
          type: "acp",
          retryPolicy: { maxAttempts: 2, backoffSeconds: 0, retryOn: ["failed"] },
        },
      },
    });
    const orchestrator = createOrchestrator({ stateStore });

    const failedRun: import("../../../src/types.js").RunRecord = {
      runId: "run-fail",
      taskId: (await stateStore.loadWorkflow(projectRoot)).tasks[0]!.taskId,
      attempt: 2,
      status: "failed",
      runner: { type: "acp" },
      workspacePath: projectRoot,
      startedAt: "2026-03-22T00:00:00.000Z",
      artifacts: [],
      retryHistory: [
        { attempt: 1, runId: "run-fail-1", status: "failed", at: "2026-03-22T00:00:00.000Z" },
      ],
    };
    await stateStore.writeRun(projectRoot, failedRun);

    const result = await orchestrator.evaluateRetry({
      projectRoot,
      taskId: failedRun.taskId,
      runRecord: failedRun,
    });

    expect(result.ok).toBe(false);
    expect(result.action).toBe("dead_letter");

    const workflow = await stateStore.loadWorkflow(projectRoot);
    expect(workflow.tasks[0]?.status).toBe("dead_letter");
    expect(workflow.lastAction?.type).toBe("retry:exhausted");
  });

  it("evaluateRetry re-dispatches when retries remain", async () => {
    const { projectRoot, stateStore } = await setupProject({
      taskOverrides: {
        runner: {
          type: "manual",
          retryPolicy: { maxAttempts: 3, backoffSeconds: 0, retryOn: ["failed"] },
        },
      },
      reviewRequired: false,
    });
    const orchestrator = createOrchestrator({ stateStore });

    const failedRun: import("../../../src/types.js").RunRecord = {
      runId: "run-retry",
      taskId: (await stateStore.loadWorkflow(projectRoot)).tasks[0]!.taskId,
      attempt: 1,
      status: "failed",
      runner: { type: "manual" },
      workspacePath: projectRoot,
      startedAt: "2026-03-22T00:00:00.000Z",
      artifacts: [],
    };
    await stateStore.writeRun(projectRoot, failedRun);

    const result = await orchestrator.evaluateRetry({
      projectRoot,
      taskId: failedRun.taskId,
      runRecord: failedRun,
    });

    expect(result.ok).toBe(true);
    expect(result.action).toBe("dispatched");
  });

  it("surfaces ACP as the selected runner when workflow default resolves from auto", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore({
      acp: {
        enabled: true,
        defaultAgentId: "codex",
        allowedAgents: ["codex"],
        defaultMode: "run",
        allowThreadBinding: false,
        defaultTimeoutSeconds: 600,
        experimentalControlPlaneAdapter: false,
      },
    }, { runtimeVersion: "2026.3.24" });
    const spec = makeSpec(projectRoot);
    const tasks = planTasksFromSpec(spec, stateStore.config, { runtimeVersion: stateStore.runtimeVersion });

    await stateStore.initProject(projectRoot);
    await stateStore.saveWorkflow(projectRoot, {
      version: 1,
      projectRoot,
      activeSpecId: spec.specId,
      lifecycle: "planned",
      tasks,
      reviewQueue: [],
      runtime: {
        defaultRunner: "acp",
        allowedRunners: ["manual", "acp"],
      },
    });

    const orchestrator = createOrchestrator({
      stateStore,
      runnerRegistry: new RunnerRegistry([makeAcpRunner()]),
    });

    const result = await orchestrator.runOnce({ projectRoot, dryRun: true });

    expect(result.ok).toBe(true);
    expect(result.action).toBe("planned");
    expect(result.selectedRunner).toBe("acp");
    expect(result.runtime?.configuredDefaultRunner).toBe("auto");
    expect(result.runtime?.resolvedDefaultRunner).toBe("acp");
    expect(result.message).toContain("acp runner is scaffolded");
  });
});

describe("SwarmOrchestrator.runBatch", () => {
  function makeIndependentTasks(count: number, overrides: Partial<TaskNode> = {}): TaskNode[] {
    return Array.from({ length: count }, (_, i) => ({
      taskId: `task-${i + 1}`,
      specId: "spec-1",
      title: `Task ${i + 1}`,
      description: `Task ${i + 1}`,
      kind: "coding" as const,
      deps: [],
      status: "ready" as const,
      workspace: { mode: "shared" as const },
      runner: { type: "manual" as const },
      review: { required: false },
      ...overrides,
    }));
  }

  async function setupBatchProject(opts: {
    taskCount: number;
    taskOverrides?: Partial<TaskNode>;
    acpMaxConcurrent?: number;
  }): Promise<{ projectRoot: string; stateStore: StateStore }> {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore({
      acp: { maxConcurrent: opts.acpMaxConcurrent ?? 6 } as any,
    });
    const tasks = makeIndependentTasks(opts.taskCount, opts.taskOverrides);
    await stateStore.initProject(projectRoot);
    await stateStore.saveWorkflow(projectRoot, {
      version: 1,
      projectRoot,
      activeSpecId: "spec-1",
      lifecycle: "planned",
      tasks,
      reviewQueue: [],
    });
    return { projectRoot, stateStore };
  }

  it("dispatches N tasks with --parallel", async () => {
    const { projectRoot, stateStore } = await setupBatchProject({ taskCount: 5 });
    const orchestrator = createOrchestrator({ stateStore });

    const result = await orchestrator.runBatch({ projectRoot, parallel: 3 });

    expect(result.ok).toBe(true);
    expect(result.stats.dispatchRequested).toBe(3);
    expect(result.stats.dispatchAdmitted).toBe(3);
    expect(result.stats.dispatchQueued).toBe(0);
    expect(result.results).toHaveLength(3);
  });

  it("dispatches all ready tasks with --allReady", async () => {
    const { projectRoot, stateStore } = await setupBatchProject({ taskCount: 4 });
    const orchestrator = createOrchestrator({ stateStore });

    const result = await orchestrator.runBatch({ projectRoot, allReady: true });

    expect(result.ok).toBe(true);
    expect(result.stats.dispatchRequested).toBe(4);
    expect(result.stats.dispatchAdmitted).toBe(4);
    expect(result.results).toHaveLength(4);
  });

  it("queues tasks that exceed maxConcurrent", async () => {
    const { projectRoot, stateStore } = await setupBatchProject({
      taskCount: 5,
      acpMaxConcurrent: 2,
    });

    // First, put 2 tasks into running state to fill the concurrency slots
    const workflow = await stateStore.loadWorkflow(projectRoot);
    const updatedTasks = workflow.tasks.map((t, i) =>
      i < 2 ? { ...t, status: "running" as const, runner: { type: "acp" as const } } : t,
    );
    await stateStore.saveWorkflow(projectRoot, { ...workflow, tasks: updatedTasks });

    const orchestrator = createOrchestrator({ stateStore });
    const result = await orchestrator.runBatch({ projectRoot, allReady: true });

    expect(result.stats.dispatchAdmitted).toBe(0);
    expect(result.stats.dispatchQueued).toBe(3);

    const finalWorkflow = await stateStore.loadWorkflow(projectRoot);
    const queuedCount = finalWorkflow.tasks.filter((t) => t.status === "queued").length;
    expect(queuedCount).toBe(3);
  });

  it("returns noop when no runnable tasks", async () => {
    const { projectRoot, stateStore } = await setupBatchProject({
      taskCount: 2,
      taskOverrides: { status: "done" },
    });
    const orchestrator = createOrchestrator({ stateStore });

    const result = await orchestrator.runBatch({ projectRoot, allReady: true });

    expect(result.ok).toBe(true);
    expect(result.stats.dispatchRequested).toBe(0);
    expect(result.message).toBe("no runnable tasks");
  });

  it("returns correct dispatch stats", async () => {
    const { projectRoot, stateStore } = await setupBatchProject({
      taskCount: 5,
      acpMaxConcurrent: 3,
    });

    // Put 1 task as running ACP to take one slot
    const workflow = await stateStore.loadWorkflow(projectRoot);
    const updatedTasks = workflow.tasks.map((t, i) =>
      i === 0 ? { ...t, status: "running" as const, runner: { type: "acp" as const } } : t,
    );
    await stateStore.saveWorkflow(projectRoot, { ...workflow, tasks: updatedTasks });

    const orchestrator = createOrchestrator({ stateStore });
    const result = await orchestrator.runBatch({ projectRoot, allReady: true });

    expect(result.stats.dispatchRequested).toBe(4);
    expect(result.stats.dispatchAdmitted).toBe(2); // 3 max - 1 running = 2 slots
    expect(result.stats.dispatchQueued).toBe(2);
    expect(result.message).toContain("dispatched 2");
    expect(result.message).toContain("queued 2");
  });
});
