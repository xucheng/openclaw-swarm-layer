import { resolveSessionAdapter } from "../../../src/cli/context.js";
import * as bridgeAdapterModule from "../../../src/runtime/bridge-openclaw-session-adapter.js";
import * as realAdapterModule from "../../../src/runtime/real-openclaw-session-adapter.js";

describe("resolveSessionAdapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to the bridge adapter when the public ACP runtime export is unavailable", async () => {
    const runtimeAdapter = {
      spawnAcpSession: vi.fn(async () => {
        throw new Error("OpenClaw public ACP runtime does not expose getAcpSessionManager at runtime");
      }),
      getAcpSessionStatus: vi.fn(),
      cancelAcpSession: vi.fn(),
      closeAcpSession: vi.fn(),
    };
    const bridgeAdapter = {
      spawnAcpSession: vi.fn(async () => ({ sessionKey: "bridge-session", backend: "acpx" })),
      getAcpSessionStatus: vi.fn(),
      cancelAcpSession: vi.fn(),
      closeAcpSession: vi.fn(),
    };
    vi.spyOn(realAdapterModule, "createSessionAdapter").mockReturnValue(runtimeAdapter as any);
    vi.spyOn(bridgeAdapterModule, "createBridgeSessionAdapter").mockReturnValue(bridgeAdapter as any);

    const adapter = resolveSessionAdapter({
      config: {
        acp: {
          enabled: true,
          backendId: "acpx",
          defaultAgentId: "codex",
          allowedAgents: ["codex"],
          defaultMode: "run",
          allowThreadBinding: true,
          defaultTimeoutSeconds: 600,
          experimentalControlPlaneAdapter: true,
        },
        bridge: {
          enabled: true,
          versionAllow: ["2026.3.22"],
        },
      },
      runtime: {
        version: "2026.3.22",
        config: { loadConfig: () => ({}) },
        system: {} as any,
      },
    } as any);

    const accepted = await adapter.spawnAcpSession({
      task: "Run smoke task",
      runtime: "acp",
      agentId: "codex",
      mode: "run",
      thread: false,
    });

    expect(runtimeAdapter.spawnAcpSession).toHaveBeenCalledTimes(1);
    expect(bridgeAdapter.spawnAcpSession).toHaveBeenCalledTimes(1);
    expect(accepted.sessionKey).toBe("bridge-session");
  });

  it("does not hide non-capability errors from the public adapter", async () => {
    const runtimeAdapter = {
      spawnAcpSession: vi.fn(async () => {
        throw new Error("backend start failed");
      }),
      getAcpSessionStatus: vi.fn(),
      cancelAcpSession: vi.fn(),
      closeAcpSession: vi.fn(),
    };
    const bridgeAdapter = {
      spawnAcpSession: vi.fn(),
      getAcpSessionStatus: vi.fn(),
      cancelAcpSession: vi.fn(),
      closeAcpSession: vi.fn(),
    };
    vi.spyOn(realAdapterModule, "createSessionAdapter").mockReturnValue(runtimeAdapter as any);
    vi.spyOn(bridgeAdapterModule, "createBridgeSessionAdapter").mockReturnValue(bridgeAdapter as any);

    const adapter = resolveSessionAdapter({
      config: {
        acp: {
          enabled: true,
          backendId: "acpx",
          defaultAgentId: "codex",
          allowedAgents: ["codex"],
          defaultMode: "run",
          allowThreadBinding: true,
          defaultTimeoutSeconds: 600,
          experimentalControlPlaneAdapter: true,
        },
        bridge: {
          enabled: true,
          versionAllow: ["2026.3.22"],
        },
      },
      runtime: {
        version: "2026.3.22",
        config: { loadConfig: () => ({}) },
        system: {} as any,
      },
    } as any);

    await expect(
      adapter.spawnAcpSession({
        task: "Run smoke task",
        runtime: "acp",
        agentId: "codex",
        mode: "run",
        thread: false,
      }),
    ).rejects.toThrow("backend start failed");
    expect(bridgeAdapter.spawnAcpSession).not.toHaveBeenCalled();
  });
});
