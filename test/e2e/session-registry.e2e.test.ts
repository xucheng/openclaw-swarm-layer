import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmInit } from "../../src/cli/swarm-init.js";
import { runSwarmPlan } from "../../src/cli/swarm-plan.js";
import { runSwarmRun } from "../../src/cli/swarm-run.js";
import { runSwarmSessionInspect } from "../../src/cli/swarm-session-inspect.js";
import { runSwarmSessionList } from "../../src/cli/swarm-session-list.js";
import { runSwarmStatus } from "../../src/cli/swarm-status.js";
import type { OpenClawSessionAdapter } from "../../src/runtime/openclaw-session-adapter.js";
import { SessionStore } from "../../src/session/session-store.js";
import { StateStore } from "../../src/state/state-store.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-session-registry-e2e-"));
}

describe("e2e: session registry", () => {
  it("creates session records and exposes them via list/inspect/status", async () => {
    const projectRoot = await makeTempProject();
    const specPath = path.join(projectRoot, "SPEC-SESSION.md");
    const stateStore = new StateStore({
      acp: {
        enabled: true,
        defaultAgentId: "codex",
        allowedAgents: ["codex"],
        defaultMode: "run",
        allowThreadBinding: true,
        defaultTimeoutSeconds: 300,
        experimentalControlPlaneAdapter: false,
      },
    });
    const sessionStore = new SessionStore(stateStore.config);
    const sessionAdapter: OpenClawSessionAdapter = {
      async spawnAcpSession() {
        return {
          sessionKey: "agent:codex:acp:session-registry",
          backend: "acpx",
          acceptedAt: "2026-03-21T00:00:00.000Z",
        };
      },
      async getAcpSessionStatus() {
        return {
          sessionKey: "agent:codex:acp:session-registry",
          state: "running",
        };
      },
      async cancelAcpSession() {
        return { sessionKey: "agent:codex:acp:session-registry" };
      },
      async closeAcpSession() {
        return { sessionKey: "agent:codex:acp:session-registry" };
      },
    };
    await fs.writeFile(
      specPath,
      "# Session Spec\n\n## Goals\n- test session registry\n\n## Phases\n### Execute\n- Run persistent ACP task\n",
      "utf8",
    );

    await runSwarmInit({ project: projectRoot }, { stateStore, sessionStore });
    await runSwarmPlan({ project: projectRoot, spec: specPath }, { stateStore, sessionStore });

    const workflow = await stateStore.loadWorkflow(projectRoot);
    workflow.tasks[0] = {
      ...workflow.tasks[0],
      runner: {
        ...workflow.tasks[0].runner,
        type: "acp",
        mode: "session",
        threadRequested: true,
      },
      session: {
        policy: "create_persistent",
        bindingKey: "feature-a",
      },
    };
    await stateStore.saveWorkflow(projectRoot, workflow);

    await runSwarmRun({ project: projectRoot, runner: "acp" }, { stateStore, sessionStore, sessionAdapter });

    const list = await runSwarmSessionList({ project: projectRoot }, { sessionStore });
    const sessionId = (list as any).sessions[0].sessionId;
    const inspect = await runSwarmSessionInspect({ project: projectRoot, session: sessionId }, { sessionStore });
    const status = await runSwarmStatus({ project: projectRoot }, { stateStore, sessionStore });
    const reportPath = path.join(projectRoot, ".openclaw", "swarm", "reports", "swarm-report.md");
    const report = await fs.readFile(reportPath, "utf8");

    expect((list as any).sessions).toHaveLength(1);
    expect((inspect as any).session.mode).toBe("persistent");
    expect((status as any).sessions.active).toBe(1);
    expect((status as any).recentSessions[0].sessionId).toBe(sessionId);
    expect((status as any).reusableSessionCandidates[0].selectedSessionId).toBe(sessionId);
    expect((status as any).reusableSessionCandidates[0].reason).toContain("Reusable session candidate found");
    expect(report).toContain("## Sessions");
    expect(report).toContain("## Session Reuse Candidates");
  });
});
