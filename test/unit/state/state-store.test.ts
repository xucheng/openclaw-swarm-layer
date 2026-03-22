import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { StateStore, createEmptyWorkflowState } from "../../../src/state/state-store.js";
import type { RunRecord, SpecDoc } from "../../../src/types.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-state-"));
}

describe("StateStore", () => {
  it("initializes swarm directories and empty workflow state", async () => {
    const projectRoot = await makeTempProject();
    const store = new StateStore();

    const paths = await store.initProject(projectRoot);
    const workflow = await store.loadWorkflow(projectRoot);

    expect(paths.swarmRoot).toContain(path.join(".openclaw", "swarm"));
    await expect(fs.stat(paths.sessionsDir)).resolves.toBeTruthy();
    expect(workflow).toEqual(createEmptyWorkflowState(projectRoot));
  });

  it("persists validated spec and run records", async () => {
    const projectRoot = await makeTempProject();
    const store = new StateStore();
    const spec: SpecDoc = {
      specId: "spec-001",
      title: "Test spec",
      sourcePath: path.join(projectRoot, "SPEC-001.md"),
      projectRoot,
      goals: ["Ship status"],
      constraints: ["No ACP"],
      acceptanceCriteria: ["CLI works"],
      phases: [{ phaseId: "phase-1", title: "Bootstrap", tasks: ["task-1"] }],
    };
    const runRecord: RunRecord = {
      runId: "run-001",
      taskId: "task-1",
      attempt: 1,
      status: "accepted",
      runner: { type: "manual" },
      workspacePath: projectRoot,
      startedAt: new Date().toISOString(),
      artifacts: [],
    };

    await store.writeSpec(projectRoot, spec);
    await store.writeRun(projectRoot, runRecord);

    await expect(store.loadSpecs(projectRoot)).resolves.toEqual([spec]);
    await expect(store.loadRuns(projectRoot)).resolves.toEqual([runRecord]);
  });

  it("rejects invalid workflow state", async () => {
    const projectRoot = await makeTempProject();
    const store = new StateStore();

    const invalidWorkflow = {
      version: 1,
      projectRoot,
      lifecycle: "idle",
      tasks: [
        {
          taskId: "task-1",
        },
      ],
      reviewQueue: [],
    };

    expect(() => store.assertValidWorkflow(invalidWorkflow as any)).toThrow("Invalid workflow state");
  });

  it("accepts tasks with session policy metadata", async () => {
    const projectRoot = await makeTempProject();
    const store = new StateStore();

    const workflow = {
      version: 1,
      projectRoot,
      lifecycle: "planned" as const,
      tasks: [
        {
          taskId: "task-1",
          specId: "spec-1",
          title: "Task 1",
          description: "Task 1",
          kind: "coding" as const,
          deps: [],
          status: "ready" as const,
          workspace: { mode: "shared" as const },
          runner: { type: "acp" as const },
          review: { required: true },
          session: {
            policy: "create_persistent" as const,
            bindingKey: "feature-x",
          },
        },
      ],
      reviewQueue: [],
    };

    expect(() => store.assertValidWorkflow(workflow)).not.toThrow();
  });

  it("loads a single run by runId", async () => {
    const projectRoot = await makeTempProject();
    const store = new StateStore();
    const runRecord: RunRecord = {
      runId: "run-single",
      taskId: "task-1",
      attempt: 1,
      status: "completed",
      runner: { type: "manual" },
      workspacePath: projectRoot,
      startedAt: new Date().toISOString(),
      artifacts: [],
    };

    await store.writeRun(projectRoot, runRecord);

    const loaded = await store.loadRun(projectRoot, "run-single");
    expect(loaded).toEqual(runRecord);
  });

  it("returns null for non-existent run", async () => {
    const projectRoot = await makeTempProject();
    const store = new StateStore();
    await store.initProject(projectRoot);

    const loaded = await store.loadRun(projectRoot, "run-missing");
    expect(loaded).toBeNull();
  });

  it("loads session records from sessions directory", async () => {
    const projectRoot = await makeTempProject();
    const store = new StateStore();
    await store.initProject(projectRoot);

    // Sessions are not validated by StateStore (they go through SessionStore)
    // but loadSessions reads from the sessionsDir
    const sessions = await store.loadSessions(projectRoot);
    expect(sessions).toEqual([]);
  });

  it("summarizes workflow status counts", () => {
    const store = new StateStore();
    const workflow = {
      version: 1,
      projectRoot: "/tmp/p",
      activeSpecId: "spec-1",
      lifecycle: "running" as const,
      tasks: [
        { taskId: "t1", specId: "s", title: "T", description: "", kind: "coding" as const, deps: [], status: "ready" as const, workspace: { mode: "shared" as const }, runner: { type: "manual" as const }, review: { required: false } },
        { taskId: "t2", specId: "s", title: "T", description: "", kind: "coding" as const, deps: [], status: "running" as const, workspace: { mode: "shared" as const }, runner: { type: "manual" as const }, review: { required: false } },
        { taskId: "t3", specId: "s", title: "T", description: "", kind: "coding" as const, deps: [], status: "blocked" as const, workspace: { mode: "shared" as const }, runner: { type: "manual" as const }, review: { required: false } },
        { taskId: "t4", specId: "s", title: "T", description: "", kind: "coding" as const, deps: [], status: "done" as const, workspace: { mode: "shared" as const }, runner: { type: "manual" as const }, review: { required: false } },
      ],
      reviewQueue: ["t2"],
    };

    const summary = store.summarizeWorkflow(workflow);
    expect(summary.lifecycle).toBe("running");
    expect(summary.totalTasks).toBe(4);
    expect(summary.readyTasks).toBe(1);
    expect(summary.runningTasks).toBe(1);
    expect(summary.blockedTasks).toBe(1);
    expect(summary.reviewQueueSize).toBe(1);
    expect(summary.activeSpecId).toBe("spec-1");
  });
});
