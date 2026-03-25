import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { synthesizeProgress, formatProgressMarkdown } from "../../../src/session/progress-summary.js";
import { StateStore } from "../../../src/state/state-store.js";
import type { ProgressSummary, RunRecord, TaskNode, WorkflowState } from "../../../src/types.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-progress-"));
}

function makeTask(overrides: Partial<TaskNode> & { taskId: string; specId: string }): TaskNode {
  return {
    title: overrides.taskId,
    description: overrides.taskId,
    kind: "coding",
    deps: [],
    status: "planned",
    workspace: { mode: "shared" },
    runner: { type: "manual" },
    review: { required: true },
    ...overrides,
  };
}

function makeWorkflow(projectRoot: string, tasks: TaskNode[]): WorkflowState {
  return {
    version: 1,
    projectRoot,
    lifecycle: "planned",
    tasks,
    reviewQueue: [],
    activeSpecId: "spec-1",
  };
}

function makeRun(overrides: Partial<RunRecord> & { runId: string; taskId: string }): RunRecord {
  return {
    attempt: 1,
    status: "completed",
    runner: { type: "manual" },
    workspacePath: "/tmp/ws",
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:01:00.000Z",
    artifacts: [],
    ...overrides,
  };
}

describe("synthesizeProgress", () => {
  it("handles empty workflow with no completed tasks", () => {
    const workflow = makeWorkflow("/tmp/proj", [
      makeTask({ taskId: "t1", specId: "s1", status: "planned" }),
      makeTask({ taskId: "t2", specId: "s1", status: "ready", deps: ["t1"] }),
    ]);

    const progress = synthesizeProgress(workflow, []);

    expect(progress.completedTasks).toHaveLength(0);
    expect(progress.remainingTasks).toHaveLength(2);
    expect(progress.currentTask).toBeUndefined();
    expect(progress.version).toBe(1);
    expect(progress.specId).toBe("spec-1");
  });

  it("splits tasks correctly between completed, current, and remaining", () => {
    const workflow = makeWorkflow("/tmp/proj", [
      makeTask({ taskId: "t1", specId: "s1", status: "done" }),
      makeTask({ taskId: "t2", specId: "s1", status: "running", deps: ["t1"] }),
      makeTask({ taskId: "t3", specId: "s1", status: "planned", deps: ["t2"] }),
    ]);
    const runs: RunRecord[] = [
      makeRun({ runId: "r1", taskId: "t1", resultSummary: "built OK" }),
      makeRun({ runId: "r2", taskId: "t2", status: "running", resultSummary: "in progress" }),
    ];

    const progress = synthesizeProgress(workflow, runs);

    expect(progress.completedTasks).toHaveLength(1);
    expect(progress.completedTasks[0].taskId).toBe("t1");
    expect(progress.completedTasks[0].resultSummary).toBe("built OK");

    expect(progress.currentTask).toBeDefined();
    expect(progress.currentTask!.taskId).toBe("t2");
    expect(progress.currentTask!.status).toBe("running");

    expect(progress.remainingTasks).toHaveLength(1);
    expect(progress.remainingTasks[0].taskId).toBe("t3");
    expect(progress.remainingTasks[0].blockedBy).toEqual(["t2"]);
  });

  it("handles fully completed workflow", () => {
    const workflow = makeWorkflow("/tmp/proj", [
      makeTask({ taskId: "t1", specId: "s1", status: "done" }),
      makeTask({ taskId: "t2", specId: "s1", status: "done", deps: ["t1"] }),
    ]);
    const runs: RunRecord[] = [
      makeRun({ runId: "r1", taskId: "t1" }),
      makeRun({ runId: "r2", taskId: "t2" }),
    ];

    const progress = synthesizeProgress(workflow, runs);

    expect(progress.completedTasks).toHaveLength(2);
    expect(progress.remainingTasks).toHaveLength(0);
    expect(progress.currentTask).toBeUndefined();
  });

  it("merges existing keyDecisions and environmentNotes", () => {
    const workflow = makeWorkflow("/tmp/proj", [
      makeTask({ taskId: "t1", specId: "s1", status: "planned" }),
    ]);
    const existing: ProgressSummary = {
      version: 1,
      projectRoot: "/tmp/proj",
      updatedAt: "2026-01-01T00:00:00.000Z",
      completedTasks: [],
      remainingTasks: [],
      blockers: [],
      keyDecisions: ["Chose React over Vue"],
      environmentNotes: ["Node 24 required"],
    };

    const progress = synthesizeProgress(workflow, [], existing);

    expect(progress.keyDecisions).toEqual(["Chose React over Vue"]);
    expect(progress.environmentNotes).toEqual(["Node 24 required"]);
  });

  it("reports blocked and dead_letter tasks as blockers", () => {
    const workflow = makeWorkflow("/tmp/proj", [
      makeTask({ taskId: "t1", specId: "s1", status: "blocked" }),
      makeTask({ taskId: "t2", specId: "s1", status: "dead_letter" }),
    ]);

    const progress = synthesizeProgress(workflow, []);

    expect(progress.blockers).toHaveLength(2);
    expect(progress.blockers[0]).toContain("t1");
    expect(progress.blockers[1]).toContain("t2");
  });

  it("picks latest run for completed task summary", () => {
    const workflow = makeWorkflow("/tmp/proj", [
      makeTask({ taskId: "t1", specId: "s1", status: "done" }),
    ]);
    const runs: RunRecord[] = [
      makeRun({ runId: "r1", taskId: "t1", startedAt: "2026-01-01T00:00:00Z", resultSummary: "old" }),
      makeRun({ runId: "r2", taskId: "t1", startedAt: "2026-01-02T00:00:00Z", resultSummary: "latest" }),
    ];

    const progress = synthesizeProgress(workflow, runs);

    expect(progress.completedTasks[0].resultSummary).toBe("latest");
  });
});

describe("formatProgressMarkdown", () => {
  it("produces expected markdown sections", () => {
    const progress: ProgressSummary = {
      version: 1,
      projectRoot: "/tmp/proj",
      specId: "spec-1",
      updatedAt: "2026-03-25T00:00:00.000Z",
      completedTasks: [{ taskId: "t1", title: "Init", completedAt: "2026-01-01T00:00:00Z", resultSummary: "done" }],
      currentTask: { taskId: "t2", title: "Build", status: "running" },
      remainingTasks: [{ taskId: "t3", title: "Deploy", blockedBy: ["t2"] }],
      blockers: ["t4: Hotfix is blocked"],
      keyDecisions: ["Use PostgreSQL"],
      environmentNotes: ["Needs Docker"],
    };

    const md = formatProgressMarkdown(progress);

    expect(md).toContain("# Progress Summary");
    expect(md).toContain("Spec: spec-1");
    expect(md).toContain("## Completed Tasks");
    expect(md).toContain("[x] t1: Init — done");
    expect(md).toContain("## Current Task");
    expect(md).toContain("t2: Build (running)");
    expect(md).toContain("## Remaining Tasks");
    expect(md).toContain("t3: Deploy (blocked by: t2)");
    expect(md).toContain("## Blockers");
    expect(md).toContain("t4: Hotfix is blocked");
    expect(md).toContain("## Key Decisions");
    expect(md).toContain("Use PostgreSQL");
    expect(md).toContain("## Environment Notes");
    expect(md).toContain("Needs Docker");
  });

  it("handles empty progress gracefully", () => {
    const progress: ProgressSummary = {
      version: 1,
      projectRoot: "/tmp/proj",
      updatedAt: "2026-03-25T00:00:00.000Z",
      completedTasks: [],
      remainingTasks: [],
      blockers: [],
      keyDecisions: [],
      environmentNotes: [],
    };

    const md = formatProgressMarkdown(progress);

    expect(md).toContain("# Progress Summary");
    expect(md).toContain("(none)");
    expect(md).not.toContain("## Blockers");
    expect(md).not.toContain("## Key Decisions");
  });
});

describe("StateStore progress round-trip", () => {
  it("saves and loads progress", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore();
    await stateStore.initProject(projectRoot);

    const progress: ProgressSummary = {
      version: 1,
      projectRoot,
      specId: "spec-1",
      updatedAt: "2026-03-25T00:00:00.000Z",
      completedTasks: [{ taskId: "t1", title: "Init", completedAt: "2026-01-01T00:00:00Z" }],
      remainingTasks: [{ taskId: "t2", title: "Build" }],
      blockers: [],
      keyDecisions: ["decision-1"],
      environmentNotes: ["note-1"],
    };

    await stateStore.saveProgress(projectRoot, progress);
    const loaded = await stateStore.loadProgress(projectRoot);

    expect(loaded).toBeDefined();
    expect(loaded!.specId).toBe("spec-1");
    expect(loaded!.completedTasks).toHaveLength(1);
    expect(loaded!.keyDecisions).toEqual(["decision-1"]);
  });

  it("returns null when no progress file exists", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore();

    const loaded = await stateStore.loadProgress(projectRoot);
    expect(loaded).toBeNull();
  });
});
