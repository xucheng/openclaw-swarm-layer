import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmSessionCleanup } from "../../../src/cli/swarm-session-cleanup.js";
import { SessionStore } from "../../../src/session/session-store.js";
import { StateStore } from "../../../src/state/state-store.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-cleanup-"));
}

describe("session cleanup", () => {
  it("marks stale active sessions as orphaned", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore();
    const sessionStore = new SessionStore(stateStore.config);
    await stateStore.initProject(projectRoot);

    // Session updated 2 hours ago
    await sessionStore.writeSession(projectRoot, {
      sessionId: "acp-stale",
      runner: "acp",
      projectRoot,
      scope: {},
      mode: "persistent",
      state: "active",
      createdAt: "2026-03-22T00:00:00.000Z",
      updatedAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
      providerRef: { sessionKey: "agent:codex:acp:stale" },
    });

    const result = await runSwarmSessionCleanup(
      { project: projectRoot, staleMinutes: 60 },
      { stateStore, sessionStore },
    );

    expect(result.ok).toBe(true);
    expect(result.orphanedCount).toBe(1);
    expect(result.closedSessionIds).toContain("acp-stale");

    const session = await sessionStore.loadSession(projectRoot, "acp-stale");
    expect(session?.state).toBe("orphaned");
    expect(session?.summary).toContain("Orphaned");
  });

  it("skips recently updated active sessions", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore();
    const sessionStore = new SessionStore(stateStore.config);
    await stateStore.initProject(projectRoot);

    await sessionStore.writeSession(projectRoot, {
      sessionId: "acp-fresh",
      runner: "acp",
      projectRoot,
      scope: {},
      mode: "persistent",
      state: "active",
      createdAt: "2026-03-22T00:00:00.000Z",
      updatedAt: new Date().toISOString(),
      providerRef: { sessionKey: "agent:codex:acp:fresh" },
    });

    const result = await runSwarmSessionCleanup(
      { project: projectRoot, staleMinutes: 60 },
      { stateStore, sessionStore },
    );

    expect(result.orphanedCount).toBe(0);
  });

  it("skips idle and closed sessions", async () => {
    const projectRoot = await makeTempProject();
    const stateStore = new StateStore();
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
      updatedAt: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
      providerRef: { sessionKey: "agent:codex:acp:idle" },
    });

    const result = await runSwarmSessionCleanup(
      { project: projectRoot, staleMinutes: 60 },
      { stateStore, sessionStore },
    );

    expect(result.orphanedCount).toBe(0);
  });
});
