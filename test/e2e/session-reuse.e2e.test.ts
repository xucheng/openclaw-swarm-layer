import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmInit } from "../../src/cli/swarm-init.js";
import { runSwarmPlan } from "../../src/cli/swarm-plan.js";
import { runSwarmRun } from "../../src/cli/swarm-run.js";
import type { OpenClawSessionAdapter } from "../../src/runtime/openclaw-session-adapter.js";
import { SessionStore } from "../../src/session/session-store.js";
import { StateStore } from "../../src/state/state-store.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-session-reuse-e2e-"));
}

const acpConfig = {
  acp: {
    enabled: true,
    defaultAgentId: "codex",
    allowedAgents: ["codex"],
    defaultMode: "run" as const,
    allowThreadBinding: true,
    defaultTimeoutSeconds: 300,
    experimentalControlPlaneAdapter: false,
  },
};

function makeSessionAdapter(): OpenClawSessionAdapter {
  return {
    async spawnAcpSession(params) {
      // Return the existing session key if provided, otherwise create new
      const key = params.existingSessionKey ?? `agent:codex:acp:new-${Date.now()}`;
      return {
        sessionKey: key,
        backend: "acpx",
        acceptedAt: new Date().toISOString(),
      };
    },
    async getAcpSessionStatus(sessionKey) {
      return { sessionKey, state: "running" };
    },
    async cancelAcpSession(sessionKey) {
      return { sessionKey };
    },
    async closeAcpSession(sessionKey) {
      return { sessionKey };
    },
  };
}

describe("e2e: session reuse", () => {
  it("reuses an existing idle persistent session for reuse_if_available task", async () => {
    const projectRoot = await makeTempProject();
    const specPath = path.join(projectRoot, "SPEC-REUSE.md");
    const stateStore = new StateStore(acpConfig);
    const sessionStore = new SessionStore(stateStore.config);
    const sessionAdapter = makeSessionAdapter();

    await fs.writeFile(
      specPath,
      "# Reuse Spec\n\n## Goals\n- test session reuse\n\n## Phases\n### Phase 1\n- First ACP task\n### Phase 2\n- Second ACP task\n",
      "utf8",
    );

    await runSwarmInit({ project: projectRoot }, { stateStore, sessionStore });
    await runSwarmPlan({ project: projectRoot, spec: specPath }, { stateStore, sessionStore });

    // Configure first task as create_persistent
    let workflow = await stateStore.loadWorkflow(projectRoot);
    workflow.tasks[0] = {
      ...workflow.tasks[0],
      runner: { ...workflow.tasks[0].runner, type: "acp" },
      session: { policy: "create_persistent", bindingKey: "feature-reuse" },
    };
    // Configure second task as reuse_if_available
    workflow.tasks[1] = {
      ...workflow.tasks[1],
      runner: { ...workflow.tasks[1].runner, type: "acp" },
      session: { policy: "reuse_if_available", bindingKey: "feature-reuse" },
    };
    await stateStore.saveWorkflow(projectRoot, workflow);

    // Run first task — creates a new session
    const firstResult = await runSwarmRun(
      { project: projectRoot, runner: "acp" },
      { stateStore, sessionStore, sessionAdapter },
    ) as any;

    expect(firstResult.action).toBe("dispatched");
    expect(firstResult.reusedSessionId).toBeUndefined();

    // Get the session that was created and mark it as idle (simulating completion)
    const sessions = await sessionStore.listSessions(projectRoot);
    expect(sessions).toHaveLength(1);
    const createdSession = sessions[0]!;
    await sessionStore.writeSession(projectRoot, {
      ...createdSession,
      state: "idle",
      mode: "persistent",
      scope: { ...createdSession.scope, bindingKey: "feature-reuse", taskKind: "coding" },
    });

    // Mark first task as done so second becomes runnable
    workflow = await stateStore.loadWorkflow(projectRoot);
    workflow.tasks[0] = { ...workflow.tasks[0], status: "done", review: { required: false } };
    workflow.lifecycle = "planned";
    await stateStore.saveWorkflow(projectRoot, workflow);

    // Run second task — should reuse the existing session
    const secondResult = await runSwarmRun(
      { project: projectRoot, runner: "acp" },
      { stateStore, sessionStore, sessionAdapter },
    ) as any;

    expect(secondResult.action).toBe("dispatched");
    expect(secondResult.reusedSessionId).toBe(createdSession.sessionId);
    expect(secondResult.message).toContain("reused");

    // Verify the report mentions reuse
    const reportPath = path.join(projectRoot, ".openclaw", "swarm", "reports", "swarm-report.md");
    const report = await fs.readFile(reportPath, "utf8");
    expect(report).toContain("reused");
  });

  it("fails with session_required when require_existing finds no session", async () => {
    const projectRoot = await makeTempProject();
    const specPath = path.join(projectRoot, "SPEC-REQUIRE.md");
    const stateStore = new StateStore(acpConfig);
    const sessionStore = new SessionStore(stateStore.config);
    const sessionAdapter = makeSessionAdapter();

    await fs.writeFile(
      specPath,
      "# Require Spec\n\n## Goals\n- test require\n\n## Phases\n### Phase 1\n- Require existing session\n",
      "utf8",
    );

    await runSwarmInit({ project: projectRoot }, { stateStore, sessionStore });
    await runSwarmPlan({ project: projectRoot, spec: specPath }, { stateStore, sessionStore });

    let workflow = await stateStore.loadWorkflow(projectRoot);
    workflow.tasks[0] = {
      ...workflow.tasks[0],
      runner: { ...workflow.tasks[0].runner, type: "acp" },
      session: { policy: "require_existing", bindingKey: "missing-session" },
    };
    await stateStore.saveWorkflow(projectRoot, workflow);

    const result = await runSwarmRun(
      { project: projectRoot, runner: "acp" },
      { stateStore, sessionStore, sessionAdapter },
    ) as any;

    expect(result.ok).toBe(false);
    expect(result.action).toBe("session_required");
    expect(result.message).toContain("requires an existing session");
  });
});
