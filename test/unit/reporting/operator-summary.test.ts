import { buildAttentionItems } from "../../../src/reporting/operator-summary.js";
import type { RunRecord, TaskNode, WorkflowState } from "../../../src/types.js";

function makeTask(overrides: Partial<TaskNode>): TaskNode {
  return {
    taskId: "task-1",
    specId: "spec-1",
    title: "Write the note",
    description: "Write the note",
    kind: "coding",
    deps: [],
    status: "done",
    workspace: { mode: "shared" },
    runner: { type: "acp" },
    review: { required: false },
    ...overrides,
  };
}

function makeWorkflow(tasks: TaskNode[]): WorkflowState {
  return {
    version: 1,
    projectRoot: "/tmp/project",
    lifecycle: "completed",
    tasks,
    reviewQueue: [],
  };
}

function makeCompletedRun(overrides: Partial<RunRecord>): RunRecord {
  return {
    runId: "run-1",
    taskId: "task-1",
    attempt: 1,
    status: "completed",
    runner: { type: "acp" },
    workspacePath: "/tmp/project",
    startedAt: "2026-06-11T00:00:00.000Z",
    artifacts: [],
    ...overrides,
  };
}

describe("buildAttentionItems artifact warnings", () => {
  it("flags completed runs without artifacts when the task declares expectedArtifacts", () => {
    const workflow = makeWorkflow([makeTask({ expectedArtifacts: ["out/note.md"] })]);
    const items = buildAttentionItems(workflow, [makeCompletedRun({})]);

    const artifactItems = items.filter((item) => item.kind === "artifact_missing");
    expect(artifactItems).toHaveLength(1);
    expect(artifactItems[0]?.taskId).toBe("task-1");
    expect(artifactItems[0]?.latestRunId).toBe("run-1");
  });

  it("flags artifact-less completion for coding tasks that mention an absolute output path", () => {
    const workflow = makeWorkflow([
      makeTask({
        description: "补齐论文笔记，输出到 /Users/bot/Documents/ObsidianVault/JerryVault/Research/2606.11722-note.md",
      }),
    ]);
    const items = buildAttentionItems(workflow, [makeCompletedRun({})]);

    expect(items.some((item) => item.kind === "artifact_missing")).toBe(true);
  });

  it("stays quiet when the latest run recorded artifacts", () => {
    const workflow = makeWorkflow([makeTask({ expectedArtifacts: ["out/note.md"] })]);
    const items = buildAttentionItems(workflow, [
      makeCompletedRun({ artifacts: ["/tmp/project/out/note.md"] }),
    ]);

    expect(items.some((item) => item.kind === "artifact_missing")).toBe(false);
  });

  it("stays quiet for tasks without artifact expectations", () => {
    const workflow = makeWorkflow([makeTask({ description: "Refactor the helper" })]);
    const items = buildAttentionItems(workflow, [makeCompletedRun({})]);

    expect(items.some((item) => item.kind === "artifact_missing")).toBe(false);
  });
});
