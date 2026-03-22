import { SessionStore } from "../session/session-store.js";
import { resolveStateStore, type SwarmCliContext } from "./context.js";
import type { SessionRecord } from "../types.js";

export type CleanupResult = {
  ok: boolean;
  orphanedCount: number;
  closedSessionIds: string[];
  message: string;
};

/**
 * Detect orphaned sessions and close them.
 * A session is considered orphaned if it is in "active" state but its
 * updatedAt is older than the staleness threshold (default 1 hour).
 */
export async function runSwarmSessionCleanup(
  options: { project: string; staleMinutes?: number },
  context?: SwarmCliContext,
): Promise<CleanupResult> {
  const stateStore = resolveStateStore(context);
  const sessionStore = context?.sessionStore ?? new SessionStore(stateStore.config);
  const staleMinutes = options.staleMinutes ?? 60;
  const cutoff = new Date(Date.now() - staleMinutes * 60_000).toISOString();

  const sessions = await sessionStore.listSessions(options.project);
  const orphanCandidates = sessions.filter(
    (session) => session.state === "active" && session.updatedAt < cutoff,
  );

  const closedIds: string[] = [];
  for (const session of orphanCandidates) {
    const updated: SessionRecord = {
      ...session,
      state: "orphaned",
      updatedAt: new Date().toISOString(),
      summary: `Orphaned: stale for >${staleMinutes}m (was active since ${session.updatedAt})`,
    };
    await sessionStore.writeSession(options.project, updated);
    closedIds.push(session.sessionId);
  }

  return {
    ok: true,
    orphanedCount: closedIds.length,
    closedSessionIds: closedIds,
    message: closedIds.length > 0
      ? `Marked ${closedIds.length} stale session(s) as orphaned`
      : "No orphaned sessions found",
  };
}
