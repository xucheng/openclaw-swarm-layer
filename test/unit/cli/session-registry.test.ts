import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmSessionInspect } from "../../../src/cli/swarm-session-inspect.js";
import { runSwarmSessionList } from "../../../src/cli/swarm-session-list.js";
import { SessionStore } from "../../../src/session/session-store.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-session-cli-"));
}

describe("swarm session registry cli", () => {
  it("lists sessions in updated order", async () => {
    const projectRoot = await makeTempProject();
    const sessionStore = new SessionStore();
    await sessionStore.writeSession(projectRoot, {
      sessionId: "session-1",
      runner: "acp",
      projectRoot,
      scope: {},
      mode: "oneshot",
      state: "closed",
      createdAt: "2026-03-21T00:00:00.000Z",
      updatedAt: "2026-03-21T00:00:00.000Z",
      providerRef: {},
      summary: "first",
    });
    await sessionStore.writeSession(projectRoot, {
      sessionId: "session-2",
      runner: "subagent",
      projectRoot,
      scope: {},
      mode: "persistent",
      state: "active",
      createdAt: "2026-03-21T00:01:00.000Z",
      updatedAt: "2026-03-21T00:02:00.000Z",
      providerRef: {},
      summary: "second",
    });

    const result = await runSwarmSessionList({ project: projectRoot }, { sessionStore });

    expect((result as any).sessions[0]?.sessionId).toBe("session-2");
  });

  it("inspects a single session", async () => {
    const projectRoot = await makeTempProject();
    const sessionStore = new SessionStore();
    await sessionStore.writeSession(projectRoot, {
      sessionId: "session-1",
      runner: "acp",
      projectRoot,
      scope: { specId: "spec-1" },
      mode: "oneshot",
      state: "closed",
      createdAt: "2026-03-21T00:00:00.000Z",
      updatedAt: "2026-03-21T00:00:00.000Z",
      providerRef: { sessionKey: "agent:codex:acp:1" },
      summary: "first",
    });

    const result = await runSwarmSessionInspect({ project: projectRoot, session: "session-1" }, { sessionStore });

    expect((result as any).session.sessionId).toBe("session-1");
    expect((result as any).session.scope.specId).toBe("spec-1");
  });
});
