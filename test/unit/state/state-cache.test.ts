import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { StateWatcherEvent, StateWatcherEventKind, StateWatcherOperation } from "../../../src/autopilot/state-watcher.js";
import { resolveSwarmPaths, type SwarmPaths } from "../../../src/lib/paths.js";
import { SessionStore } from "../../../src/session/session-store.js";
import { StateCache } from "../../../src/state/state-cache.js";
import { createEmptyWorkflowState, StateStore } from "../../../src/state/state-store.js";
import { FsWorkflowReader, type WorkflowReader } from "../../../src/state/workflow-reader.js";
import type { ProgressSummary, RunRecord, SessionRecord, SpecDoc, TaskNode, WorkflowState } from "../../../src/types.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-state-cache-"));
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function taskNode(taskId = "task-1"): TaskNode {
  return {
    taskId,
    specId: "spec-1",
    title: `Task ${taskId}`,
    description: "Task description",
    kind: "coding",
    deps: [],
    status: "ready",
    workspace: { mode: "shared" },
    runner: { type: "manual" },
    review: { required: false },
  };
}

function workflowState(projectRoot: string): WorkflowState {
  return {
    version: 1,
    projectRoot,
    lifecycle: "planned",
    tasks: [taskNode()],
    reviewQueue: [],
  };
}

function specDoc(projectRoot: string, specId = "spec-1"): SpecDoc {
  return {
    specId,
    title: `Spec ${specId}`,
    sourcePath: path.join(projectRoot, `${specId}.md`),
    projectRoot,
    goals: [`goal-${specId}`],
    constraints: [],
    acceptanceCriteria: [],
    phases: [{ phaseId: "phase-1", title: "Phase 1", tasks: ["task-1"] }],
  };
}

function runRecord(projectRoot: string, runId = "run-1", status: RunRecord["status"] = "completed"): RunRecord {
  return {
    runId,
    taskId: "task-1",
    attempt: 1,
    status,
    runner: { type: "manual" },
    workspacePath: projectRoot,
    startedAt: "2026-05-25T00:00:00.000Z",
    artifacts: [],
  };
}

function progressSummary(projectRoot: string, updatedAt = "2026-05-25T00:00:00.000Z"): ProgressSummary {
  return {
    version: 1,
    projectRoot,
    updatedAt,
    completedTasks: [],
    remainingTasks: [{ taskId: "task-1", title: "Task 1" }],
    blockers: [],
    keyDecisions: [],
    environmentNotes: [],
  };
}

function sessionRecord(projectRoot: string, sessionId = "session-1", state: SessionRecord["state"] = "idle"): SessionRecord {
  return {
    sessionId,
    runner: "acp",
    projectRoot,
    scope: { specId: "spec-1" },
    mode: "persistent",
    state,
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-25T00:00:00.000Z",
    providerRef: { sessionKey: sessionId },
  };
}

function watcherEvent(
  kind: StateWatcherEventKind,
  op: StateWatcherOperation,
  filePaths: string[],
  seq = 1,
): StateWatcherEvent {
  return {
    kind,
    op,
    paths: filePaths,
    at: "2026-05-25T00:00:01.000Z",
    seq,
  };
}

type MemoryReaderState = {
  workflow: WorkflowState | null;
  specs: SpecDoc[];
  runs: RunRecord[];
  progress: ProgressSummary | null;
  sessions: SessionRecord[];
};

function createMemoryReader(
  projectRoot: string,
  overrides: Partial<MemoryReaderState> = {},
): { reader: WorkflowReader; state: MemoryReaderState; calls: Record<string, string[]>; paths: SwarmPaths } {
  const paths = resolveSwarmPaths(projectRoot, {});
  const state: MemoryReaderState = {
    workflow: workflowState(projectRoot),
    specs: [],
    runs: [],
    progress: null,
    sessions: [],
    ...overrides,
  };
  const calls: Record<string, string[]> = {
    initProject: [],
    loadWorkflow: [],
    loadSpecs: [],
    loadRuns: [],
    loadRun: [],
    loadProgress: [],
    loadSessions: [],
  };
  const reader: WorkflowReader = {
    initProject: vi.fn(async (root: string) => {
      calls.initProject.push(root);
      return resolveSwarmPaths(root, {});
    }),
    loadWorkflow: vi.fn(async (root: string) => {
      calls.loadWorkflow.push(root);
      return state.workflow ? clone(state.workflow) : null;
    }),
    loadSpecs: vi.fn(async (root: string) => {
      calls.loadSpecs.push(root);
      return state.specs.map(clone);
    }),
    loadRuns: vi.fn(async (root: string) => {
      calls.loadRuns.push(root);
      return state.runs.map(clone);
    }),
    loadRun: vi.fn(async (root: string, runId: string) => {
      calls.loadRun.push(runId);
      const run = state.runs.find((entry) => entry.runId === runId);
      return run ? clone(run) : null;
    }),
    loadProgress: vi.fn(async (root: string) => {
      calls.loadProgress.push(root);
      return state.progress ? clone(state.progress) : null;
    }),
    loadSessions: vi.fn(async (root: string) => {
      calls.loadSessions.push(root);
      return state.sessions.map(clone);
    }),
  };
  return { reader, state, calls, paths };
}

describe("StateCache", () => {
  it("warms from the underlying reader and serves loadRuns from memory", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore();
    const fsReader = new FsWorkflowReader(stateStore.config, (root) => createEmptyWorkflowState(root, stateStore.config));
    const cache = new StateCache(fsReader);
    await stateStore.writeRun(projectRoot, runRecord(projectRoot, "run-1"));
    await cache.start(projectRoot);

    const paths = stateStore.resolvePaths(projectRoot);
    await fs.rename(path.join(paths.runsDir, "run-1.json"), path.join(paths.runsDir, "run-1.moved"));

    await expect(cache.loadRuns(projectRoot)).resolves.toEqual([runRecord(projectRoot, "run-1")]);
  });

  it("returns clones for cached workflow, spec, run, progress, and session data", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore();
    const sessionStore = new SessionStore();
    const fsReader = new FsWorkflowReader(stateStore.config, (root) => createEmptyWorkflowState(root, stateStore.config));
    const cache = new StateCache(fsReader);
    const workflow = workflowState(projectRoot);
    const spec = specDoc(projectRoot, "spec-1");
    const run = runRecord(projectRoot, "run-1");
    const progress = progressSummary(projectRoot);
    const session = sessionRecord(projectRoot, "session-1");

    await stateStore.saveWorkflow(projectRoot, workflow);
    await stateStore.writeSpec(projectRoot, spec);
    await stateStore.writeRun(projectRoot, run);
    await stateStore.saveProgress(projectRoot, progress);
    await sessionStore.writeSession(projectRoot, session);
    await cache.start(projectRoot);

    const cachedWorkflow = await cache.loadWorkflow(projectRoot);
    const cachedSpecs = await cache.loadSpecs(projectRoot);
    const cachedRun = await cache.loadRun(projectRoot, "run-1");
    const cachedProgress = await cache.loadProgress(projectRoot);
    const cachedSessions = await cache.loadSessions(projectRoot);

    cachedWorkflow!.tasks[0]!.title = "mutated";
    cachedSpecs[0]!.goals.push("mutated");
    cachedRun!.status = "failed";
    cachedProgress!.remainingTasks[0]!.title = "mutated";
    cachedSessions[0]!.state = "failed";

    await expect(cache.loadWorkflow(projectRoot)).resolves.toEqual(workflow);
    await expect(cache.loadSpecs(projectRoot)).resolves.toEqual([spec]);
    await expect(cache.loadRun(projectRoot, "run-1")).resolves.toEqual(run);
    await expect(cache.loadProgress(projectRoot)).resolves.toEqual(progress);
    await expect(cache.loadSessions(projectRoot)).resolves.toEqual([session]);
  });

  it("refreshes and deletes run entries from watcher changes", async () => {
    const projectRoot = await makeTempProject();
    const { reader, state, calls, paths } = createMemoryReader(projectRoot, {
      runs: [runRecord(projectRoot, "run-1"), runRecord(projectRoot, "run-2")],
    });
    const cache = new StateCache(reader);
    await cache.start(projectRoot);
    state.runs = [runRecord(projectRoot, "run-1", "failed"), runRecord(projectRoot, "run-2")];

    await cache.applyChange(watcherEvent("run", "update", [path.join(paths.runsDir, "run-1.json")]));

    await expect(cache.loadRuns(projectRoot)).resolves.toEqual([
      runRecord(projectRoot, "run-1", "failed"),
      runRecord(projectRoot, "run-2"),
    ]);
    expect(calls.loadRun).toEqual(["run-1"]);

    await cache.applyChange(watcherEvent("run", "delete", [path.join(paths.runsDir, "run-2.json")], 2));

    await expect(cache.loadRuns(projectRoot)).resolves.toEqual([runRecord(projectRoot, "run-1", "failed")]);
    expect(calls.loadRun).toEqual(["run-1"]);
  });

  it("refreshes and deletes spec entries from watcher changes", async () => {
    const projectRoot = await makeTempProject();
    const { reader, state, calls, paths } = createMemoryReader(projectRoot, {
      specs: [specDoc(projectRoot, "spec-1"), specDoc(projectRoot, "spec-2")],
    });
    const cache = new StateCache(reader);
    await cache.start(projectRoot);
    state.specs = [{ ...specDoc(projectRoot, "spec-1"), title: "Updated spec" }, specDoc(projectRoot, "spec-2")];

    await cache.applyChange(watcherEvent("spec", "update", [path.join(paths.specsDir, "spec-1.json")]));

    await expect(cache.loadSpecs(projectRoot)).resolves.toEqual([
      { ...specDoc(projectRoot, "spec-1"), title: "Updated spec" },
      specDoc(projectRoot, "spec-2"),
    ]);
    expect(calls.loadSpecs).toHaveLength(2);

    await cache.applyChange(watcherEvent("spec", "delete", [path.join(paths.specsDir, "spec-2.json")], 2));

    await expect(cache.loadSpecs(projectRoot)).resolves.toEqual([{ ...specDoc(projectRoot, "spec-1"), title: "Updated spec" }]);
    expect(calls.loadSpecs).toHaveLength(2);
  });

  it("refreshes and deletes workflow and progress records from watcher changes", async () => {
    const projectRoot = await makeTempProject();
    const updatedWorkflow = { ...workflowState(projectRoot), lifecycle: "running" as const };
    const updatedProgress = progressSummary(projectRoot, "2026-05-25T00:00:02.000Z");
    const { reader, state, paths } = createMemoryReader(projectRoot, {
      progress: progressSummary(projectRoot),
    });
    const cache = new StateCache(reader);
    await cache.start(projectRoot);

    state.workflow = updatedWorkflow;
    state.progress = updatedProgress;
    await cache.applyChange(watcherEvent("workflow", "update", [paths.workflowStatePath]));
    await cache.applyChange(watcherEvent("progress", "update", [paths.progressFilePath], 2));

    await expect(cache.loadWorkflow(projectRoot)).resolves.toEqual(updatedWorkflow);
    await expect(cache.loadProgress(projectRoot)).resolves.toEqual(updatedProgress);

    await cache.applyChange(watcherEvent("workflow", "delete", [paths.workflowStatePath], 3));
    await cache.applyChange(watcherEvent("progress", "delete", [paths.progressFilePath], 4));

    await expect(cache.loadWorkflow(projectRoot)).resolves.toBeNull();
    await expect(cache.loadProgress(projectRoot)).resolves.toBeNull();
  });

  it("refreshes and deletes session entries from watcher changes", async () => {
    const projectRoot = await makeTempProject();
    const { reader, state, calls, paths } = createMemoryReader(projectRoot, {
      sessions: [sessionRecord(projectRoot, "session-1"), sessionRecord(projectRoot, "session-2")],
    });
    const cache = new StateCache(reader);
    await cache.start(projectRoot);
    state.sessions = [
      sessionRecord(projectRoot, "session-1", "active"),
      sessionRecord(projectRoot, "session-2"),
    ];

    await cache.applyChange(watcherEvent("session", "update", [path.join(paths.sessionsDir, "session-1.json")]));

    await expect(cache.loadSessions(projectRoot)).resolves.toEqual([
      sessionRecord(projectRoot, "session-1", "active"),
      sessionRecord(projectRoot, "session-2"),
    ]);
    expect(calls.loadSessions).toHaveLength(2);

    await cache.applyChange(watcherEvent("session", "delete", [path.join(paths.sessionsDir, "session-2.json")], 2));

    await expect(cache.loadSessions(projectRoot)).resolves.toEqual([sessionRecord(projectRoot, "session-1", "active")]);
    expect(calls.loadSessions).toHaveLength(2);
  });

  it("serializes queued refreshes to avoid races", async () => {
    const projectRoot = await makeTempProject();
    const { reader, calls, paths } = createMemoryReader(projectRoot, { runs: [] });
    const firstRun = createDeferred<RunRecord | null>();
    reader.loadRun = vi.fn(async (_root: string, runId: string) => {
      calls.loadRun.push(runId);
      if (runId === "run-a") {
        return firstRun.promise;
      }
      return runRecord(projectRoot, runId);
    });
    const cache = new StateCache(reader);
    await cache.start(projectRoot);

    const first = cache.applyChange(watcherEvent("run", "update", [path.join(paths.runsDir, "run-a.json")]));
    await vi.waitFor(() => expect(calls.loadRun).toEqual(["run-a"]));
    const second = cache.applyChange(watcherEvent("run", "update", [path.join(paths.runsDir, "run-b.json")], 2));
    await Promise.resolve();

    expect(calls.loadRun).toEqual(["run-a"]);

    firstRun.resolve(runRecord(projectRoot, "run-a"));
    await first;
    await second;

    expect(calls.loadRun).toEqual(["run-a", "run-b"]);
    await expect(cache.loadRuns(projectRoot)).resolves.toEqual([
      runRecord(projectRoot, "run-a"),
      runRecord(projectRoot, "run-b"),
    ]);
  });

  it("rejects missing workflow warmup and invalid project access", async () => {
    const projectRoot = await makeTempProject();
    const otherRoot = await makeTempProject();
    const missing = createMemoryReader(projectRoot, { workflow: null });
    await expect(new StateCache(missing.reader).start(projectRoot)).rejects.toThrow(
      "workflow-state.json is missing after initialization",
    );

    const { reader } = createMemoryReader(projectRoot);
    const cache = new StateCache(reader);
    await expect(cache.loadWorkflow(projectRoot)).rejects.toThrow("StateCache has not been started");
    await cache.start(projectRoot);

    await expect(cache.loadWorkflow(otherRoot)).rejects.toThrow(`StateCache is bound to ${path.resolve(projectRoot)}`);
    await expect(cache.onRunWritten(otherRoot, runRecord(otherRoot, "run-x"))).rejects.toThrow(
      `StateCache is bound to ${path.resolve(projectRoot)}`,
    );
    await expect(cache.start(otherRoot)).rejects.toThrow(`StateCache is bound to ${path.resolve(projectRoot)}`);
  });

  it("updates cached workflow, spec, run, and progress through StateStore write hooks", async () => {
    const projectRoot = await makeTempProject();
    const config = new StateStore().config;
    const cache = new StateCache(new FsWorkflowReader(config, (root) => createEmptyWorkflowState(root, config)));
    await cache.start(projectRoot);
    const store = new StateStore(config, undefined, cache);
    const workflow: WorkflowState = { ...workflowState(projectRoot), lifecycle: "running" };
    const spec = specDoc(projectRoot, "spec-hook");
    const run = runRecord(projectRoot, "run-hook", "accepted");
    const progress = progressSummary(projectRoot, "2026-05-25T00:00:03.000Z");

    await store.saveWorkflow(projectRoot, workflow);
    await store.writeSpec(projectRoot, spec);
    await store.writeRun(projectRoot, run);
    await store.saveProgress(projectRoot, progress);

    await expect(cache.loadWorkflow(projectRoot)).resolves.toEqual(workflow);
    await expect(cache.loadSpecs(projectRoot)).resolves.toEqual([spec]);
    await expect(cache.loadRun(projectRoot, "run-hook")).resolves.toEqual(run);
    await expect(cache.loadProgress(projectRoot)).resolves.toEqual(progress);

    workflow.lifecycle = "failed";
    spec.goals.push("mutated");
    run.status = "failed";
    progress.blockers.push("mutated");

    await expect(cache.loadWorkflow(projectRoot)).resolves.toEqual({ ...workflow, lifecycle: "running" });
    await expect(cache.loadSpecs(projectRoot)).resolves.toEqual([specDoc(projectRoot, "spec-hook")]);
    await expect(cache.loadRun(projectRoot, "run-hook")).resolves.toEqual(runRecord(projectRoot, "run-hook", "accepted"));
    await expect(cache.loadProgress(projectRoot)).resolves.toEqual(progressSummary(projectRoot, "2026-05-25T00:00:03.000Z"));
  });
});
