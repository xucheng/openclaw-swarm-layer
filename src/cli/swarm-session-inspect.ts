import { resolveSessionStore, type SwarmCliContext } from "./context.js";

export async function runSwarmSessionInspect(
  options: { project: string; session: string },
  context?: SwarmCliContext,
): Promise<unknown> {
  const sessionStore = resolveSessionStore(context);
  const session = await sessionStore.loadSession(options.project, options.session);
  if (!session) {
    throw new Error(`Session record not found: ${options.session}`);
  }
  return {
    ok: true,
    session,
  };
}
