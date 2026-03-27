import { resolveSessionAdapter } from "../../../src/cli/context.js";
import { UnsupportedOpenClawSessionAdapter } from "../../../src/runtime/openclaw-session-adapter.js";
import * as realAdapterModule from "../../../src/runtime/real-openclaw-session-adapter.js";

describe("resolveSessionAdapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the provided session adapter unchanged", () => {
    const sessionAdapter = {
      spawnAcpSession: vi.fn(),
      getAcpSessionStatus: vi.fn(),
      cancelAcpSession: vi.fn(),
      closeAcpSession: vi.fn(),
    };

    expect(resolveSessionAdapter({ sessionAdapter } as any)).toBe(sessionAdapter);
  });

  it("returns the public ACP session adapter when available", async () => {
    const runtimeAdapter = {
      spawnAcpSession: vi.fn(async () => ({ sessionKey: "public-session", backend: "acpx" })),
      getAcpSessionStatus: vi.fn(),
      cancelAcpSession: vi.fn(),
      closeAcpSession: vi.fn(),
    };
    vi.spyOn(realAdapterModule, "createSessionAdapter").mockReturnValue(runtimeAdapter as any);

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
      },
      runtime: {
        version: "2026.3.24",
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

    expect(accepted.sessionKey).toBe("public-session");
    expect(runtimeAdapter.spawnAcpSession).toHaveBeenCalledTimes(1);
  });

  it("returns the unsupported adapter when no public ACP session adapter is available", async () => {
    vi.spyOn(realAdapterModule, "createSessionAdapter").mockReturnValue(null);

    const adapter = resolveSessionAdapter({
      config: {
        acp: {
          enabled: true,
          experimentalControlPlaneAdapter: false,
        },
      },
      runtime: {
        version: "2026.3.13",
        config: { loadConfig: () => ({}) },
        system: {} as any,
      },
    } as any);

    expect(adapter).toBeInstanceOf(UnsupportedOpenClawSessionAdapter);
    await expect(
      adapter.spawnAcpSession({
        task: "Run smoke task",
        runtime: "acp",
        agentId: "codex",
        mode: "run",
        thread: false,
      }),
    ).rejects.toThrow("public-ACP-capable build");
  });
});
