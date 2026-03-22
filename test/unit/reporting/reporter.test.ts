import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildWorkflowReport, writeWorkflowReport } from "../../../src/reporting/reporter.js";
import type { WorkflowState } from "../../../src/types.js";

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

const workflow: WorkflowState = {
  version: 1,
  projectRoot: "/tmp/project-a",
  activeSpecId: "spec-1",
  lifecycle: "planned",
  tasks: [
    {
      taskId: "task-1",
      specId: "spec-1",
      title: "Task 1",
      description: "Task 1",
      kind: "coding",
      deps: [],
      status: "ready",
      workspace: { mode: "shared" },
      runner: { type: "acp", mode: "session" },
      review: { required: true },
      session: {
        policy: "reuse_if_available",
        bindingKey: "feature-a",
      },
    },
  ],
  reviewQueue: [],
};

describe("reporter", () => {
  it("builds a readable workflow report", () => {
    const report = buildWorkflowReport(
      {
        ...workflow,
        reviewQueue: ["task-1"],
        lastAction: {
          at: "2026-03-21T00:20:00.000Z",
          type: "run:completed",
          message: "subagent finished cleanly",
        },
      },
      undefined as any,
      [
      {
        runId: "run-1",
        taskId: "task-1",
        attempt: 1,
        status: "completed",
        runner: { type: "subagent" },
        workspacePath: "/tmp/project-a",
        startedAt: "2026-03-21T00:00:00.000Z",
        artifacts: [],
        resultSummary: "subagent finished cleanly",
      },
    ] as any,
    );

    expect(report).toContain("# Swarm Report");
    expect(report).toContain("Active spec: spec-1");
    expect(report).toContain("task-1: Task 1 [ready]");
    expect(report).toContain("## Recent Runs");
    expect(report).toContain("subagent finished cleanly");
    expect(report).toContain("## Review Queue");
    expect(report).toContain("Last action: run:completed");
    expect(report).toContain("## Attention");
    expect(report).toContain("[review]");
    expect(report).toContain("Action:");
    expect(report).toContain("## Highlights");
    expect(report).toContain("## Recommended Actions");
  });

  it("writes local and obsidian reports", async () => {
    const projectRoot = await makeTempDir("swarm-report-project-");
    const obsidianRoot = await makeTempDir("swarm-report-obsidian-");
    const workflowWithProject = { ...workflow, projectRoot };
    const sessionsDir = path.join(projectRoot, ".openclaw", "swarm", "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.writeFile(
      path.join(sessionsDir, "session-1.json"),
      JSON.stringify(
        {
          sessionId: "session-1",
          runner: "acp",
          projectRoot,
          scope: { bindingKey: "feature-a", taskKind: "coding" },
          mode: "persistent",
          state: "active",
          createdAt: "2026-03-21T00:00:00.000Z",
          updatedAt: "2026-03-21T00:10:00.000Z",
          providerRef: { sessionKey: "agent:codex:acp:1" },
          summary: "active session",
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await writeWorkflowReport(projectRoot, workflowWithProject, { obsidianRoot });

    const localContent = await fs.readFile(result.localReportPath, "utf8");
    expect(localContent).toContain("# Swarm Report");
    expect(localContent).toContain("## Sessions");
    expect(localContent).toContain("active session");
    expect(localContent).toContain("## Session Reuse Candidates");
    expect(localContent).toContain("Reusable session candidate found");
    expect(result.obsidianReportPath).toBeDefined();
    const obsidianContent = await fs.readFile(result.obsidianReportPath!, "utf8");
    expect(obsidianContent).toContain(path.basename(projectRoot));
  });

  it("writes (none) for empty sessions and candidates", async () => {
    const projectRoot = await makeTempDir("swarm-report-nosessions-");
    const emptyWorkflow: WorkflowState = {
      version: 1,
      projectRoot,
      lifecycle: "idle",
      tasks: [],
      reviewQueue: [],
    };
    const sessionsDir = path.join(projectRoot, ".openclaw", "swarm", "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });

    const result = await writeWorkflowReport(projectRoot, emptyWorkflow);
    const content = await fs.readFile(result.localReportPath, "utf8");

    expect(content).toContain("## Sessions");
    expect(content).toContain("## Session Reuse Candidates");
    // Both should have (none) since no sessions and no tasks
    const sessionsSection = content.split("## Sessions")[1]!.split("##")[0]!;
    expect(sessionsSection).toContain("(none)");
  });

  it("builds report with no runs and no last action", () => {
    const report = buildWorkflowReport(workflow, undefined as any, []);
    expect(report).toContain("# Swarm Report");
    expect(report).toContain("## Recent Runs");
    expect(report).toContain("- (none)");
    expect(report).not.toContain("Last action:");
  });
});
