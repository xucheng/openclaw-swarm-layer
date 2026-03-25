import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { journalCompletionSummary, journalReviewEntry, journalRunEntry, journalSpecArchive } from "../../../src/reporting/obsidian-journal.js";
import type { SwarmPaths } from "../../../src/lib/paths.js";
import type { JournalConfig } from "../../../src/config.js";
import type { RunRecord, SpecDoc, WorkflowState } from "../../../src/types.js";

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-journal-"));
}

function makePaths(base: string, obsidian?: string): SwarmPaths {
  const reportsDir = path.join(base, "reports");
  const obsProject = obsidian ? path.join(obsidian, "test-project") : undefined;
  return {
    projectRoot: base,
    swarmRoot: base,
    workflowStatePath: path.join(base, "workflow-state.json"),
    specsDir: path.join(base, "specs"),
    runsDir: path.join(base, "runs"),
    sessionsDir: path.join(base, "sessions"),
    artifactsDir: path.join(base, "artifacts"),
    logsDir: path.join(base, "logs"),
    reportsDir,
    localReportPath: path.join(reportsDir, "swarm-report.md"),
    localRunLogPath: path.join(reportsDir, "run-log.md"),
    localReviewLogPath: path.join(reportsDir, "review-log.md"),
    localSpecsArchiveDir: path.join(reportsDir, "specs"),
    localCompletionPath: path.join(reportsDir, "completion-summary.md"),
    obsidianReportPath: obsidian ? path.join(obsidian, "test-project-swarm-report.md") : undefined,
    obsidianProjectDir: obsProject,
    obsidianRunLogPath: obsProject ? path.join(obsProject, "run-log.md") : undefined,
    obsidianReviewLogPath: obsProject ? path.join(obsProject, "review-log.md") : undefined,
    obsidianSpecsDir: obsProject ? path.join(obsProject, "specs") : undefined,
    obsidianCompletionPath: obsProject ? path.join(obsProject, "completion-summary.md") : undefined,
    progressFilePath: path.join(base, "progress.json"),
  };
}

const enabledJournal: JournalConfig = {
  enableRunLog: true,
  enableReviewLog: true,
  enableSpecArchive: true,
  enableCompletionSummary: true,
};

const disabledJournal: JournalConfig = {
  enableRunLog: false,
  enableReviewLog: false,
  enableSpecArchive: false,
  enableCompletionSummary: false,
};

describe("obsidian journal", () => {
  it("writes run log entry locally and to obsidian", async () => {
    const local = await makeTempDir();
    const obsidian = await makeTempDir();
    const paths = makePaths(local, obsidian);
    const run: RunRecord = {
      runId: "run-j1",
      taskId: "task-1",
      attempt: 1,
      status: "completed",
      runner: { type: "acp" },
      workspacePath: local,
      startedAt: "2026-03-22T00:00:00.000Z",
      artifacts: [],
      resultSummary: "ACP session finished",
    };

    await journalRunEntry(paths, enabledJournal, run);

    const localContent = await fs.readFile(paths.localRunLogPath, "utf8");
    expect(localContent).toContain("# Run Log");
    expect(localContent).toContain("run-j1");
    expect(localContent).toContain("completed");

    // Wait a tick for async obsidian write
    await new Promise((r) => setTimeout(r, 50));
    const obsContent = await fs.readFile(paths.obsidianRunLogPath!, "utf8");
    expect(obsContent).toContain("run-j1");
  });

  it("skips run log when disabled", async () => {
    const local = await makeTempDir();
    const paths = makePaths(local);
    const run: RunRecord = {
      runId: "run-skip",
      taskId: "task-1",
      attempt: 1,
      status: "completed",
      runner: { type: "manual" },
      workspacePath: local,
      startedAt: "2026-03-22T00:00:00.000Z",
      artifacts: [],
    };

    await journalRunEntry(paths, disabledJournal, run);

    await expect(fs.access(paths.localRunLogPath)).rejects.toThrow();
  });

  it("writes review log entry", async () => {
    const local = await makeTempDir();
    const paths = makePaths(local);

    await journalReviewEntry(paths, enabledJournal, "task-1", "approve", "Looks good");

    const content = await fs.readFile(paths.localReviewLogPath, "utf8");
    expect(content).toContain("# Review Log");
    expect(content).toContain("task-1");
    expect(content).toContain("**approve**");
    expect(content).toContain("Looks good");
  });

  it("archives spec to local and obsidian", async () => {
    const local = await makeTempDir();
    const obsidian = await makeTempDir();
    const paths = makePaths(local, obsidian);
    const spec: SpecDoc = {
      specId: "test-spec",
      title: "Test Spec",
      sourcePath: "/tmp/SPEC.md",
      projectRoot: local,
      goals: ["Ship"],
      constraints: ["None"],
      acceptanceCriteria: ["Tests pass"],
      phases: [{ phaseId: "p1", title: "Build", tasks: ["Task A", "Task B"] }],
    };

    await journalSpecArchive(paths, enabledJournal, spec);

    const localPath = path.join(paths.localSpecsArchiveDir, "test-spec.md");
    const content = await fs.readFile(localPath, "utf8");
    expect(content).toContain("# Test Spec");
    expect(content).toContain("- Ship");
    expect(content).toContain("### Build");

    await new Promise((r) => setTimeout(r, 50));
    const obsPath = path.join(paths.obsidianSpecsDir!, "test-spec.md");
    const obsContent = await fs.readFile(obsPath, "utf8");
    expect(obsContent).toContain("# Test Spec");
  });

  it("writes completion summary", async () => {
    const local = await makeTempDir();
    const paths = makePaths(local);
    const workflow: WorkflowState = {
      version: 1,
      projectRoot: local,
      activeSpecId: "spec-1",
      lifecycle: "completed" as any,
      tasks: [
        { taskId: "t1", specId: "s", title: "Task A", description: "", kind: "coding", deps: [], status: "done", workspace: { mode: "shared" }, runner: { type: "acp" }, review: { required: true } },
        { taskId: "t2", specId: "s", title: "Task B", description: "", kind: "coding", deps: [], status: "done", workspace: { mode: "shared" }, runner: { type: "manual" }, review: { required: true } },
      ],
      reviewQueue: [],
    };
    const runs: RunRecord[] = [
      { runId: "r1", taskId: "t1", attempt: 1, status: "completed", runner: { type: "acp" }, workspacePath: local, startedAt: "2026-03-22T00:00:00.000Z", artifacts: [], resultSummary: "Done" },
      { runId: "r2", taskId: "t2", attempt: 1, status: "completed", runner: { type: "manual" }, workspacePath: local, startedAt: "2026-03-22T01:00:00.000Z", artifacts: [] },
    ];

    await journalCompletionSummary(paths, enabledJournal, workflow, runs);

    const content = await fs.readFile(paths.localCompletionPath, "utf8");
    expect(content).toContain("# Completion Summary");
    expect(content).toContain("Tasks: 2/2 done");
    expect(content).toContain("Completed: 2");
    expect(content).toContain("Task A");
    expect(content).toContain("Task B");
  });

  it("appends multiple run log entries", async () => {
    const local = await makeTempDir();
    const paths = makePaths(local);
    const makeRun = (id: string): RunRecord => ({
      runId: id,
      taskId: "task-1",
      attempt: 1,
      status: "completed",
      runner: { type: "acp" },
      workspacePath: local,
      startedAt: "2026-03-22T00:00:00.000Z",
      artifacts: [],
    });

    await journalRunEntry(paths, enabledJournal, makeRun("run-a"));
    await journalRunEntry(paths, enabledJournal, makeRun("run-b"));

    const content = await fs.readFile(paths.localRunLogPath, "utf8");
    expect(content).toContain("run-a");
    expect(content).toContain("run-b");
    // Header should appear only once
    const headerCount = (content.match(/# Run Log/g) || []).length;
    expect(headerCount).toBe(1);
  });
});
