import path from "node:path";
import type { SwarmPluginConfig } from "../config.js";
import { resolveSwarmPluginConfig } from "../config.js";
import { ensureDir, readDirectoryJsonFiles, readJsonFile, writeJsonFileAtomic } from "../lib/json-file.js";
import { resolveSwarmPaths, type SwarmPaths } from "../lib/paths.js";
import type { SessionRecord } from "../types.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function createSessionSummary(session: SessionRecord): string {
  const parts = [
    `${session.runner}/${session.mode}`,
    session.state,
    session.providerRef.sessionKey ? `session=${session.providerRef.sessionKey}` : null,
    session.lastRunId ? `lastRun=${session.lastRunId}` : null,
  ].filter(Boolean);
  return parts.join(" | ");
}

export class SessionStore {
  readonly config: SwarmPluginConfig;

  constructor(config?: Partial<SwarmPluginConfig>) {
    this.config = resolveSwarmPluginConfig(config);
  }

  resolvePaths(projectRoot: string): SwarmPaths {
    return resolveSwarmPaths(projectRoot, this.config);
  }

  async initProject(projectRoot: string): Promise<SwarmPaths> {
    const paths = this.resolvePaths(projectRoot);
    await ensureDir(paths.sessionsDir);
    return paths;
  }

  async writeSession(projectRoot: string, session: SessionRecord): Promise<string> {
    this.assertValidSession(session);
    const paths = await this.initProject(projectRoot);
    const filePath = path.join(paths.sessionsDir, `${session.sessionId}.json`);
    await writeJsonFileAtomic(filePath, session);
    return filePath;
  }

  async loadSession(projectRoot: string, sessionId: string): Promise<SessionRecord | null> {
    const paths = await this.initProject(projectRoot);
    const filePath = path.join(paths.sessionsDir, `${sessionId}.json`);
    const session = await readJsonFile<SessionRecord>(filePath);
    if (!session) {
      return null;
    }
    this.assertValidSession(session);
    return session;
  }

  async listSessions(projectRoot: string): Promise<SessionRecord[]> {
    const paths = await this.initProject(projectRoot);
    const sessions = await readDirectoryJsonFiles<SessionRecord>(paths.sessionsDir);
    sessions.forEach((session) => this.assertValidSession(session));
    return sessions;
  }

  assertValidSession(session: SessionRecord): void {
    assert(isObject(session), "session must be an object");
    assert(typeof session.sessionId === "string" && session.sessionId.length > 0, "session.sessionId is required");
    assert(session.runner === "acp" || session.runner === "subagent", "session.runner is invalid");
    assert(typeof session.projectRoot === "string" && session.projectRoot.length > 0, "session.projectRoot is required");
    assert(isObject(session.scope), "session.scope must be an object");
    assert(session.mode === "oneshot" || session.mode === "persistent", "session.mode is invalid");
    assert(
      session.state === "created" ||
        session.state === "active" ||
        session.state === "idle" ||
        session.state === "closed" ||
        session.state === "failed" ||
        session.state === "orphaned",
      "session.state is invalid",
    );
    assert(typeof session.createdAt === "string" && session.createdAt.length > 0, "session.createdAt is required");
    assert(typeof session.updatedAt === "string" && session.updatedAt.length > 0, "session.updatedAt is required");
    assert(isObject(session.providerRef), "session.providerRef must be an object");
    if (session.lastRunId !== undefined) {
      assert(typeof session.lastRunId === "string", "session.lastRunId must be a string");
    }
    if (session.lastTaskId !== undefined) {
      assert(typeof session.lastTaskId === "string", "session.lastTaskId must be a string");
    }
    if (session.summary !== undefined) {
      assert(typeof session.summary === "string", "session.summary must be a string");
    }
  }
}
