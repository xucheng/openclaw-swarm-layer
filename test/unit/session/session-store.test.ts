import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SessionStore, createSessionSummary } from "../../../src/session/session-store.js";
import type { SessionRecord } from "../../../src/types.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-session-store-"));
}

describe("SessionStore", () => {
  it("persists and loads session records", async () => {
    const projectRoot = await makeTempProject();
    const store = new SessionStore();
    const session: SessionRecord = {
      sessionId: "session-1",
      runner: "acp",
      projectRoot,
      scope: {
        specId: "spec-1",
        bindingKey: "feature-a",
        taskKind: "coding",
      },
      mode: "persistent",
      state: "active",
      createdAt: "2026-03-21T00:00:00.000Z",
      updatedAt: "2026-03-21T00:05:00.000Z",
      lastRunId: "run-1",
      lastTaskId: "task-1",
      providerRef: {
        sessionKey: "agent:codex:acp:1",
        backend: "acpx",
      },
      summary: "active ACP persistent session",
    };

    await store.writeSession(projectRoot, session);
    await expect(store.loadSession(projectRoot, "session-1")).resolves.toEqual(session);
    await expect(store.listSessions(projectRoot)).resolves.toEqual([session]);
  });

  it("rejects invalid session records", async () => {
    const store = new SessionStore();
    expect(() =>
      store.assertValidSession({
        sessionId: "session-1",
      } as any),
    ).toThrow("session.runner is invalid");
  });

  it("builds a readable session summary", () => {
    const summary = createSessionSummary({
      sessionId: "session-1",
      runner: "subagent",
      projectRoot: "/tmp/project",
      scope: {},
      mode: "oneshot",
      state: "idle",
      createdAt: "2026-03-21T00:00:00.000Z",
      updatedAt: "2026-03-21T00:05:00.000Z",
      providerRef: {
        sessionKey: "agent:main:subagent:1",
      },
    });

    expect(summary).toContain("subagent/oneshot");
    expect(summary).toContain("idle");
  });
});
