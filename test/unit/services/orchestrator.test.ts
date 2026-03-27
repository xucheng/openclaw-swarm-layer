import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AcpRunner } from "../../../src/runtime/acp-runner.js";
import type { OpenClawSessionAdapter } from "../../../src/runtime/openclaw-session-adapter.js";
import { RunnerRegistry } from "../../../src/runtime/runner-registry.js";
import { createOrchestrator } from "../../../src/services/orchestrator.js";
import { SessionStore } from "../../../src/session/session-store.js";
import { StateStore } from "../../../src/state/state-store.js";
import type { SessionRecord, SpecDoc, TaskNode } from "../../../src/types.js";
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
    expect(workflow.lifecycle).toBe("planned");
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

  it("rejects subagent dispatch when subagent is disabled", async () => {
    const { projectRoot, stateStore } = await setupProject();
    const orchestrator = createOrchestrator({ stateStore });

    const result = await orchestrator.runOnce({ projectRoot, runnerOverride: "subagent" });
    const runs = await stateStore.loadRuns(projectRoot);

    expect(result.ok).toBe(false);
    expect(result.action).toBe("noop");
    expect(result.selectedRunner).toBe("subagent");
    expect(result.message).toContain("legacy bridge-backed opt-in path");
    expect(runs).toEqual([]);
  });

  it("rejects subagent dispatch when subagent is enabled but bridge support is not enabled", async () => {
    const { projectRoot } = await setupProject();
    const stateStore = new StateStore({
      subagent: { enabled: true },
    });
    await stateStore.initProject(projectRoot);
    await stateStore.saveWorkflow(projectRoot, {
      version: 1,
      projectRoot,
      activeSpecId: "spec-1",
      lifecycle: "planned",
      tasks: planTasksFromSpec(makeSpec(projectRoot), {
        defaultRunner: "manual",
        reviewRequiredByDefault: true,
      }),
      reviewQueue: [],
    });
    const orchestrator = createOrchestrator({ stateStore });

    const result = await orchestrator.runOnce({ projectRoot, runnerOverride: "subagent" });

    expect(result.ok).toBe(false);
    expect(result.action).toBe("noop");
    expect(result.selectedRunner).toBe("subagent");
    expect(result.message).toContain("enable bridge.subagentEnabled=true");
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
