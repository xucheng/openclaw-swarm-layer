import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildWorkflowReport, writeWorkflowReport } from "../../../src/reporting/reporter.js";
import { StateStore } from "../../../src/state/state-store.js";
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
  runtime: {
    defaultRunner: "acp",
    allowedRunners: ["manual", "acp"],
  },
};

function makeAcpEnabledStateStore() {
  return new StateStore({
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
}

describe("reporter", () => {
  it("builds a readable workflow report with runtime policy", () => {
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
      makeAcpEnabledStateStore(),
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
    expect(report).toContain("## Runtime Policy");
    expect(report).toContain("Configured default runner: auto");
    expect(report).toContain("Resolved default runner: acp");
    expect(report).toContain("Allowed runners: manual, acp");
    expect(report).toContain("Default runner resolution: auto -> acp on this install");
    expect(report).toContain("Manual runner fallback: available");
    expect(report).toContain("ACP execution posture: public control-plane primary without bridge fallback");
    expect(report).toContain("Subagent enabled: no");
    expect(report).toContain("Subagent posture: experimental (disabled by default)");
    expect(report).toContain("## ACP Bridge Exit Gate");
    expect(report).toContain("Bridge-free ACP floor: >=2026.3.22.");
    expect(report).toContain("OpenClaw runtime version: 2026.3.24.");
    expect(report).toContain(
      "Live smoke matrix checks: acp-backend-direct, swarm-doctor, swarm-init-plan-status, swarm-dry-run, swarm-live-run, swarm-session-lifecycle, swarm-review-report-journal",
    );
    expect(report).toContain(
      "Remaining ACP bridge dependencies: acp-bridge-session-adapter, acp-bridge-command-surface, acp-bridge-doctor-shellout",
    );
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

    const stateStore = new StateStore({
      obsidianRoot,
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

    const result = await writeWorkflowReport(projectRoot, workflowWithProject, {
      obsidianRoot,
      acp: {
        enabled: true,
        defaultAgentId: "codex",
        allowedAgents: ["codex"],
        defaultMode: "run",
        allowThreadBinding: false,
        defaultTimeoutSeconds: 600,
        experimentalControlPlaneAdapter: false,
      },
    }, stateStore);

    const localContent = await fs.readFile(result.localReportPath, "utf8");
    expect(localContent).toContain("# Swarm Report");
    expect(localContent).toContain("## Runtime Policy");
    expect(localContent).toContain("Resolved default runner: acp");
    expect(localContent).toContain("Default runner resolution: auto -> acp on this install");
    expect(localContent).toContain("Manual runner fallback: available");
    expect(localContent).toContain("ACP execution posture: public control-plane primary without bridge fallback");
    expect(localContent).toContain("Subagent posture: experimental (disabled by default)");
    expect(localContent).toContain("## ACP Bridge Exit Gate");
    expect(localContent).toContain("Bridge-free ACP floor: >=2026.3.22.");
    expect(localContent).toContain("## Sessions");
    expect(localContent).toContain("active session");
    expect(localContent).toContain("## Session Reuse Candidates");
    expect(localContent).toContain("Reusable session candidate found");
    expect(result.obsidianReportPath).toBeDefined();
    const obsidianReportPath = result.obsidianReportPath as string;
    const obsidianContent = await fs.readFile(obsidianReportPath, "utf8");
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
    const sessionsSection = content.split("## Sessions")[1] ?? "";
    const sessionsBody = sessionsSection.split("##")[0] ?? "";
    expect(sessionsBody).toContain("(none)");
  });

  it("builds report with no runs and no last action", () => {
    const report = buildWorkflowReport(workflow, makeAcpEnabledStateStore(), []);
    expect(report).toContain("# Swarm Report");
    expect(report).toContain("## Recent Runs");
    expect(report).toContain("- (none)");
    expect(report).not.toContain("Last action:");
  });
});
