import type { PluginRuntime } from "openclaw/plugin-sdk";
import type { SwarmPluginConfig } from "../config.js";
import { resolveSwarmPluginConfig } from "../config.js";
import { createBridgeSubagentAdapter } from "../runtime/bridge-openclaw-subagent-adapter.js";
import { UnsupportedOpenClawSessionAdapter, type OpenClawSessionAdapter } from "../runtime/openclaw-session-adapter.js";
import { UnsupportedOpenClawSubagentAdapter, type OpenClawSubagentAdapter } from "../runtime/openclaw-subagent-adapter.js";
import { createSessionAdapter } from "../runtime/real-openclaw-session-adapter.js";
import { SessionStore } from "../session/session-store.js";
import { StateStore } from "../state/state-store.js";

export type SwarmCliContext = {
  config?: Partial<SwarmPluginConfig>;
  stateStore?: StateStore;
  sessionStore?: SessionStore;
  sessionAdapter?: OpenClawSessionAdapter;
  subagentAdapter?: OpenClawSubagentAdapter;
  runtime?: Pick<PluginRuntime, "config" | "system" | "version">;
};

export function resolveStateStore(context?: SwarmCliContext): StateStore {
  return context?.stateStore ?? new StateStore(context?.config, { runtimeVersion: context?.runtime?.version });
}

export function resolveSessionStore(context?: SwarmCliContext): SessionStore {
  return context?.sessionStore ?? new SessionStore(context?.stateStore?.config ?? context?.config);
}

export function resolveSessionAdapter(context?: SwarmCliContext): OpenClawSessionAdapter {
  if (context?.sessionAdapter) {
    return context.sessionAdapter;
  }
  const config = context?.stateStore?.config ?? resolveSwarmPluginConfig(context?.config);
  const runtimeAdapter = createSessionAdapter(context?.runtime, { acp: config.acp });
  if (runtimeAdapter) {
    return runtimeAdapter;
  }
  return new UnsupportedOpenClawSessionAdapter();
}

export function resolveSubagentAdapter(context?: SwarmCliContext): OpenClawSubagentAdapter {
  if (context?.subagentAdapter) {
    return context.subagentAdapter;
  }
  const config = context?.stateStore?.config ?? resolveSwarmPluginConfig(context?.config);
  const bridgeAdapter = createBridgeSubagentAdapter({ bridge: config.bridge });
  return bridgeAdapter ?? new UnsupportedOpenClawSubagentAdapter();
}
