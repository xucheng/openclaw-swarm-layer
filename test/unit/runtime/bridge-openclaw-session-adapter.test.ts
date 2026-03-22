import { BridgeOpenClawSessionAdapter, createBridgeSessionAdapter, resolveBridgeScriptPath, resolveTsxLoaderPath, runBridgeCommandDirect } from "../../../src/runtime/bridge-openclaw-session-adapter.js";

describe("BridgeOpenClawSessionAdapter", () => {
  const runtime = {} as any;
  const commandRunner = vi.fn();

  const config = {
    acp: {
      enabled: true,
      backendId: "acpx",
      defaultAgentId: "codex",
      allowedAgents: ["codex"],
      defaultMode: "run" as const,
      allowThreadBinding: false,
      defaultTimeoutSeconds: 300,
      experimentalControlPlaneAdapter: false,
    },
    bridge: {
      enabled: true,
      nodePath: undefined,
      openclawRoot: "/opt/openclaw",
      versionAllow: ["2026.2.26"],
    },
  };

  beforeEach(() => {
    commandRunner.mockReset();
  });

  it("returns null when bridge mode is disabled", () => {
    expect(createBridgeSessionAdapter(undefined, {
      ...config,
      bridge: { ...config.bridge, enabled: false },
    } as any)).toBeNull();
    expect(
      createBridgeSessionAdapter(runtime, {
        ...config,
        bridge: { ...config.bridge, enabled: false },
      } as any),
    ).toBeNull();
  });

  it("creates an adapter when bridge mode is enabled", () => {
    expect(createBridgeSessionAdapter(undefined, config as any)).toBeInstanceOf(BridgeOpenClawSessionAdapter);
  });

  it("resolves a stable repo-level bridge script path", () => {
    expect(resolveBridgeScriptPath()).toMatch(/scripts\/openclaw-exec-bridge\.mjs$/);
  });

  it("resolves a local tsx loader path", () => {
    expect(resolveTsxLoaderPath()).toMatch(/node_modules\/tsx\/dist\/loader\.mjs$/);
  });

  it("invokes the bridge process and parses spawn results", async () => {
    commandRunner.mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({
        ok: true,
        version: "2026.2.26",
        result: {
          sessionKey: "agent:codex:acp:1",
          backend: "acpx",
          acceptedAt: "2026-03-21T00:00:00.000Z",
        },
      }),
      stderr: "",
      pid: 1,
      signal: null,
      killed: false,
      termination: "exit",
    });
    const adapter = new BridgeOpenClawSessionAdapter(
      runtime,
      config as any,
      "/usr/bin/node",
      "/tmp/bridge.js",
      "/tmp/loader.mjs",
      commandRunner,
    );

    const accepted = await adapter.spawnAcpSession({
      task: "Run tests",
      runtime: "acp",
      agentId: "codex",
      mode: "run",
      thread: false,
      cwd: "/tmp/project",
      runTimeoutSeconds: 60,
    });

    expect(accepted.backend).toBe("acpx");
    expect(commandRunner).toHaveBeenCalledTimes(1);
    expect(commandRunner.mock.calls[0]?.[0]).toEqual([
      "/usr/bin/node",
      "--import",
      "/tmp/loader.mjs",
      "/tmp/bridge.js",
      "acp-spawn",
    ]);
  });

  it("surfaces bridge command failures clearly", async () => {
    commandRunner.mockResolvedValue({
      code: 1,
      stdout: "",
      stderr: "boom",
    });
    const adapter = new BridgeOpenClawSessionAdapter(
      runtime,
      config as any,
      "/usr/bin/node",
      "/tmp/bridge.js",
      "/tmp/loader.mjs",
      commandRunner,
    );

    await expect(
      adapter.getAcpSessionStatus("agent:codex:acp:1"),
    ).rejects.toThrow("Bridge command failed (acp-status) [unknown]: boom");
  });

  it("marks direct bridge command timeouts clearly", async () => {
    const result = await runBridgeCommandDirect(
      [process.execPath, "-e", "setTimeout(() => {}, 200)"],
      {
        cwd: process.cwd(),
        input: "",
        timeoutMs: 10,
      },
    );

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("bridge timed out after 10ms");
  });
});
