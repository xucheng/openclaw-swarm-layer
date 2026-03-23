import { randomUUID } from "node:crypto";
import type { SwarmPluginConfig } from "../config.js";
import type { PluginRuntime } from "openclaw/plugin-sdk";
import type { OpenClawSessionAdapter, AcpAcceptedSession, AcpSessionStatus } from "./openclaw-session-adapter.js";
import type { AcpSpawnParams } from "./acp-mapping.js";
import { supportsPublicAcpRuntime } from "./openclaw-version.js";

type AcpManager = {
  initializeSession(input: {
    cfg: unknown;
    sessionKey: string;
    agent: string;
    mode: "persistent" | "oneshot";
    cwd?: string;
    backendId?: string;
  }): Promise<{
    handle: {
      sessionKey: string;
      backend: string;
      backendSessionId?: string;
      agentSessionId?: string;
    };
  }>;
  runTurn(input: {
    cfg: unknown;
    sessionKey: string;
    text: string;
    mode: "prompt" | "steer";
    requestId: string;
  }): Promise<void>;
  getSessionStatus(input: { cfg: unknown; sessionKey: string }): Promise<{
    sessionKey: string;
    backend: string;
    state: "idle" | "running" | "error";
    identity?: { acpxSessionId?: string; agentSessionId?: string };
    runtimeStatus?: { backendSessionId?: string; agentSessionId?: string; summary?: string };
    lastError?: string;
  }>;
  cancelSession(input: { cfg: unknown; sessionKey: string; reason?: string }): Promise<void>;
  closeSession(input: { cfg: unknown; sessionKey: string; reason: string }): Promise<{ runtimeClosed: boolean; runtimeNotice?: string }>;
};

type SdkLike = {
  getAcpSessionManager?: () => AcpManager;
};

async function loadCompatibleAcpSdk(runtimeVersion?: string | null): Promise<SdkLike> {
  if (supportsPublicAcpRuntime(runtimeVersion)) {
    try {
      const acpRuntimeEntry = "openclaw/plugin-sdk/acp-runtime";
      return (await import(acpRuntimeEntry)) as SdkLike;
    } catch {
      // Fall back to the legacy root entry for older installs or test doubles.
    }
  }
  const legacySdkEntry = "openclaw/plugin-sdk";
  return (await import(legacySdkEntry)) as SdkLike;
}

function shouldUsePublicSessionAdapter(
  runtime: Pick<PluginRuntime, "version"> | undefined,
  config: Pick<SwarmPluginConfig, "acp">,
): boolean {
  if (!runtime || !config.acp.enabled) {
    return false;
  }
  if (supportsPublicAcpRuntime(runtime.version)) {
    return true;
  }
  return Boolean(config.acp.experimentalControlPlaneAdapter);
}

function mapManagerState(status: Awaited<ReturnType<AcpManager["getSessionStatus"]>>): AcpSessionStatus["state"] {
  if (status.state === "running") {
    return "running";
  }
  if (status.state === "error") {
    return "failed";
  }
  return "completed";
}

export class ExperimentalRealOpenClawSessionAdapter implements OpenClawSessionAdapter {
  constructor(
    private readonly runtime: Pick<PluginRuntime, "config" | "version">,
    private readonly config: Pick<SwarmPluginConfig, "acp">,
    private readonly sdkLoader: () => Promise<SdkLike> = async () => await loadCompatibleAcpSdk(runtime.version),
  ) {}

  private async getManager(): Promise<{ manager: AcpManager; cfg: unknown }> {
    if (!shouldUsePublicSessionAdapter(this.runtime, this.config)) {
      throw new Error("OpenClaw public ACP session adapter is disabled for this runtime/config combination");
    }
    const sdk = await this.sdkLoader();
    const manager = sdk.getAcpSessionManager?.();
    if (!manager) {
      throw new Error(
        "OpenClaw public ACP runtime does not expose getAcpSessionManager at runtime; real ACP adapter remains blocked on an upstream public control-plane export",
      );
    }
    const cfg = this.runtime.config.loadConfig();
    return { manager, cfg };
  }

  async spawnAcpSession(params: AcpSpawnParams): Promise<AcpAcceptedSession> {
    const { manager, cfg } = await this.getManager();
    const sessionKey = `agent:${params.agentId}:acp:${randomUUID()}`;
    const initialized = await manager.initializeSession({
      cfg,
      sessionKey,
      agent: params.agentId,
      mode: params.mode === "session" ? "persistent" : "oneshot",
      cwd: params.cwd,
      backendId: this.config.acp.backendId,
    });
    void manager.runTurn({
      cfg,
      sessionKey,
      text: params.task,
      mode: "prompt",
      requestId: randomUUID(),
    });
    return {
      sessionKey,
      backend: initialized.handle.backend,
      backendSessionId: initialized.handle.backendSessionId,
      agentSessionId: initialized.handle.agentSessionId,
      acceptedAt: new Date().toISOString(),
    };
  }

  async getAcpSessionStatus(sessionKey: string): Promise<AcpSessionStatus> {
    const { manager, cfg } = await this.getManager();
    const status = await manager.getSessionStatus({ cfg, sessionKey });
    return {
      sessionKey,
      state: mapManagerState(status),
      backend: status.backend,
      backendSessionId: status.runtimeStatus?.backendSessionId ?? status.identity?.acpxSessionId,
      agentSessionId: status.runtimeStatus?.agentSessionId ?? status.identity?.agentSessionId,
      checkedAt: new Date().toISOString(),
      message: status.lastError ?? status.runtimeStatus?.summary,
    };
  }

  async cancelAcpSession(sessionKey: string, reason?: string): Promise<{ sessionKey: string; cancelledAt?: string; message?: string }> {
    const { manager, cfg } = await this.getManager();
    await manager.cancelSession({ cfg, sessionKey, reason });
    return { sessionKey, cancelledAt: new Date().toISOString(), message: reason };
  }

  async closeAcpSession(sessionKey: string, reason?: string): Promise<{ sessionKey: string; closedAt?: string; message?: string }> {
    const { manager, cfg } = await this.getManager();
    const closed = await manager.closeSession({ cfg, sessionKey, reason: reason ?? "closed by swarm layer" });
    return {
      sessionKey,
      closedAt: new Date().toISOString(),
      message: closed.runtimeNotice ?? reason,
    };
  }
}

export function createSessionAdapter(
  runtime: Pick<PluginRuntime, "config" | "version"> | undefined,
  config: Pick<SwarmPluginConfig, "acp">,
): OpenClawSessionAdapter | null {
  if (!runtime || !shouldUsePublicSessionAdapter(runtime, config)) {
    return null;
  }
  return new ExperimentalRealOpenClawSessionAdapter(runtime, config);
}
