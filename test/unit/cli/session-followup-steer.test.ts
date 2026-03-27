import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmInit } from "../../../src/cli/swarm-init.js";
import { runSwarmPlan } from "../../../src/cli/swarm-plan.js";
import { runSwarmSessionFollowup } from "../../../src/cli/swarm-session-followup.js";
import { runSwarmSessionSteer } from "../../../src/cli/swarm-session-steer.js";
import type { OpenClawSessionAdapter } from "../../../src/runtime/openclaw-session-adapter.js";
import { SessionStore } from "../../../src/session/session-store.js";
import { StateStore } from "../../../src/state/state-store.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-followup-steer-"));
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

function makeAdapter(): OpenClawSessionAdapter {
  return {
    async spawnAcpSession(params) {
      return {
        sessionKey: params.existingSessionKey ?? "agent:codex:acp:new",
        backend: "acpx",
      };
    },
    async getAcpSessionStatus(key) {
      return { sessionKey: key, state: "running" };
    },
    async cancelAcpSession(key) {
      return { sessionKey: key };
    },
    async closeAcpSession(key) {
      return { sessionKey: key };
    },
  };
}

describe("session follow-up and steer", () => {
  it("follow-up injects a task into an active session and dispatches it", async () => {
    const projectRoot = await makeTempProject();
    const specPath = path.join(projectRoot, "SPEC.md");
    await fs.writeFile(specPath, "# Spec\n\n## Goals\n- test\n\n## Phases\n### P1\n- Task A\n", "utf8");

    const stateStore = new StateStore(acpConfig);
    const sessionStore = new SessionStore(stateStore.config);
    const sessionAdapter = makeAdapter();

    await runSwarmInit({ project: projectRoot }, { stateStore, sessionStore });
    await runSwarmPlan({ project: projectRoot, spec: specPath }, { stateStore, sessionStore });

    // Seed an active session
    await sessionStore.writeSession(projectRoot, {
      sessionId: "acp-followup",
      runner: "acp",
      projectRoot,
      scope: { bindingKey: "feature-a", taskKind: "coding" },
      mode: "persistent",
      state: "active",
      createdAt: "2026-03-22T00:00:00.000Z",
      updatedAt: "2026-03-22T00:10:00.000Z",
      providerRef: { sessionKey: "agent:codex:acp:followup" },
    });

    const result = (await runSwarmSessionFollowup(
      { project: projectRoot, session: "acp-followup", task: "Fix the remaining test failures" },
      { stateStore, sessionStore, sessionAdapter },
    )) as any;

    expect(result.ok).toBe(true);
    expect(result.followupTaskId).toMatch(/^followup-/);
    expect(result.sessionId).toBe("acp-followup");
  });

  it("follow-up rejects non-active/idle session", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore(acpConfig);
    const sessionStore = new SessionStore(stateStore.config);
    await stateStore.initProject(projectRoot);

    await sessionStore.writeSession(projectRoot, {
      sessionId: "acp-closed",
      runner: "acp",
      projectRoot,
      scope: {},
      mode: "persistent",
      state: "closed",
      createdAt: "2026-03-22T00:00:00.000Z",
      updatedAt: "2026-03-22T00:10:00.000Z",
      providerRef: { sessionKey: "agent:codex:acp:closed" },
    });

    const result = (await runSwarmSessionFollowup(
      { project: projectRoot, session: "acp-closed", task: "should fail" },
      { stateStore, sessionStore },
    )) as any;

    expect(result.ok).toBe(false);
    expect(result.error).toContain("closed");
  });

  it("follow-up rejects non-existent session", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore(acpConfig);
    const sessionStore = new SessionStore(stateStore.config);
    await stateStore.initProject(projectRoot);

    const result = (await runSwarmSessionFollowup(
      { project: projectRoot, session: "missing", task: "should fail" },
      { stateStore, sessionStore },
    )) as any;

    expect(result.ok).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("follow-up rejects subagent sessions when subagent is disabled", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore();
    const sessionStore = new SessionStore(stateStore.config);
    await stateStore.initProject(projectRoot);

    await sessionStore.writeSession(projectRoot, {
      sessionId: "subagent-followup",
      runner: "subagent",
      projectRoot,
      scope: { bindingKey: "feature-subagent", taskKind: "coding" },
      mode: "persistent",
      state: "active",
      createdAt: "2026-03-22T00:00:00.000Z",
      updatedAt: "2026-03-22T00:10:00.000Z",
      providerRef: { sessionKey: "agent:main:subagent:followup" },
    });

    const result = (await runSwarmSessionFollowup(
      { project: projectRoot, session: "subagent-followup", task: "delegate the follow-up" },
      { stateStore, sessionStore },
    )) as any;

    expect(result.ok).toBe(false);
    expect(result.error).toContain("subagent runner is disabled by config");
  });

  it("steer sends a message to an active session", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore(acpConfig);
    const sessionStore = new SessionStore(stateStore.config);
    const sessionAdapter = makeAdapter();
    await stateStore.initProject(projectRoot);

    await sessionStore.writeSession(projectRoot, {
      sessionId: "acp-steer",
      runner: "acp",
      projectRoot,
      scope: {},
      mode: "persistent",
      state: "active",
      createdAt: "2026-03-22T00:00:00.000Z",
      updatedAt: "2026-03-22T00:10:00.000Z",
      providerRef: { sessionKey: "agent:codex:acp:steer" },
    });

    const result = (await runSwarmSessionSteer(
      { project: projectRoot, session: "acp-steer", message: "Focus on performance tests" },
      { stateStore, sessionStore, sessionAdapter },
    )) as any;

    expect(result.ok).toBe(true);
    expect(result.sessionId).toBe("acp-steer");

    // Verify session summary updated
    const session = await sessionStore.loadSession(projectRoot, "acp-steer");
    expect(session?.summary).toContain("Steered:");
  });

  it("steer rejects non-active session", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore(acpConfig);
    const sessionStore = new SessionStore(stateStore.config);
    await stateStore.initProject(projectRoot);

    await sessionStore.writeSession(projectRoot, {
      sessionId: "acp-idle",
      runner: "acp",
      projectRoot,
      scope: {},
      mode: "persistent",
      state: "idle",
      createdAt: "2026-03-22T00:00:00.000Z",
      updatedAt: "2026-03-22T00:10:00.000Z",
      providerRef: { sessionKey: "agent:codex:acp:idle" },
    });

    const result = (await runSwarmSessionSteer(
      { project: projectRoot, session: "acp-idle", message: "should fail" },
      { stateStore, sessionStore },
    )) as any;

    expect(result.ok).toBe(false);
    expect(result.error).toContain("idle");
  });
});
