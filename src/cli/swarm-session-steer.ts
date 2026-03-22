import { SessionStore } from "../session/session-store.js";
import { resolveSessionAdapter, resolveStateStore, type SwarmCliContext } from "./context.js";

export async function runSwarmSessionSteer(
  options: { project: string; session: string; message: string },
  context?: SwarmCliContext,
): Promise<unknown> {
  const stateStore = resolveStateStore(context);
  const sessionStore = context?.sessionStore ?? new SessionStore(stateStore.config);
  const sessionAdapter = resolveSessionAdapter(context);

  const session = await sessionStore.loadSession(options.project, options.session);
  if (!session) {
    return { ok: false, error: `Session not found: ${options.session}` };
  }
  if (session.state !== "active") {
    return { ok: false, error: `Session ${options.session} is in ${session.state} state, must be active to steer` };
  }
  if (!session.providerRef.sessionKey) {
    return { ok: false, error: `Session ${options.session} has no provider session key` };
  }

  // Use the session adapter to send a follow-up message via spawn with the existing session
  // This leverages the same spawn mechanism with existingSessionKey
  const result = await sessionAdapter.spawnAcpSession({
    task: options.message,
    runtime: "acp",
    agentId: "codex",
    mode: "session",
    thread: true,
    existingSessionKey: session.providerRef.sessionKey,
    threadId: session.threadId,
  });

  // Update session record
  await sessionStore.writeSession(options.project, {
    ...session,
    updatedAt: new Date().toISOString(),
    summary: `Steered: ${options.message.slice(0, 80)}`,
  });

  return {
    ok: true,
    sessionId: options.session,
    sessionKey: result.sessionKey,
    message: `Steering message sent to session ${options.session}`,
  };
}
