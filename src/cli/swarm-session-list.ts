import { resolveSessionStore, type SwarmCliContext } from "./context.js";

export async function runSwarmSessionList(
  options: { project: string },
  context?: SwarmCliContext,
): Promise<unknown> {
  const sessionStore = resolveSessionStore(context);
  const sessions = await sessionStore.listSessions(options.project);
  return {
    ok: true,
    sessions: sessions
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map((session) => ({
        sessionId: session.sessionId,
        runner: session.runner,
        mode: session.mode,
        state: session.state,
        summary: session.summary,
        lastRunId: session.lastRunId,
        updatedAt: session.updatedAt,
      })),
  };
}
