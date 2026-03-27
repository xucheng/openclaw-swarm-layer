import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  ExperimentalRealOpenClawSessionAdapter,
  createSessionAdapter,
  loadCompatibleAcpSdk,
} from "../../../src/runtime/real-openclaw-session-adapter.js";

describe("ExperimentalRealOpenClawSessionAdapter", () => {
  const runtime = {
    version: "2026.3.22",
    config: {
      loadConfig() {
        return { acp: { enabled: true } };
      },
    },
  } as any;

  const config = {
    acp: {
      enabled: true,
      backendId: "acpx",
      defaultAgentId: "codex",
      allowedAgents: ["codex"],
      defaultMode: "run" as const,
      allowThreadBinding: false,
      defaultTimeoutSeconds: 600,
      experimentalControlPlaneAdapter: true,
    },
  };

  it("returns null when runtime is missing or ACP is disabled", () => {
    expect(createSessionAdapter(undefined, config as any)).toBeNull();
    expect(
      createSessionAdapter(runtime, {
        acp: { ...config.acp, enabled: false, experimentalControlPlaneAdapter: false },
      } as any),
    ).toBeNull();
  });

  it("auto-enables the public adapter on OpenClaw 2026.3.22+", () => {
    expect(
      createSessionAdapter(
        {
          ...runtime,
          version: "2026.3.22",
        } as any,
        {
          acp: { ...config.acp, experimentalControlPlaneAdapter: false },
        } as any,
      ),
    ).toBeInstanceOf(ExperimentalRealOpenClawSessionAdapter);
  });

  it("auto-enables the public adapter on suffixed OpenClaw 2026.3.23 builds", () => {
    expect(
      createSessionAdapter(
        {
          ...runtime,
          version: "2026.3.23-1",
        } as any,
        {
          acp: { ...config.acp, experimentalControlPlaneAdapter: false },
        } as any,
      ),
    ).toBeInstanceOf(ExperimentalRealOpenClawSessionAdapter);
  });

  it("fails clearly when runtime sdk lacks control-plane export", async () => {
    const adapter = new ExperimentalRealOpenClawSessionAdapter(runtime, config as any, async () => ({}), async () => undefined);

    await expect(
      adapter.spawnAcpSession({
        task: "Run tests",
        runtime: "acp",
        agentId: "codex",
        mode: "run",
        thread: false,
      }),
    ).rejects.toThrow("upstream public control-plane export");
  });

  it("prefers the resolved host OpenClaw root before bare sdk imports", async () => {
    const openclawRoot = mkdtempSync(path.join(tmpdir(), "swarm-layer-openclaw-root-"));
    mkdirSync(path.join(openclawRoot, "dist", "plugin-sdk"), { recursive: true });
    writeFileSync(path.join(openclawRoot, "dist", "plugin-sdk", "acp-runtime.js"), "export {};\n", "utf8");

    const importModule = vi.fn(async (specifier: string): Promise<any> => {
      if (specifier === pathToFileURL(path.join(openclawRoot, "dist", "plugin-sdk", "acp-runtime.js")).href) {
        return {
          getAcpSessionManager() {
            return null;
          },
        };
      }
      throw new Error(`unexpected:${specifier}`);
    });
    try {
      const sdk = await loadCompatibleAcpSdk("2026.3.22", {
        importModule,
        resolveOpenClawRoot: () => openclawRoot,
      });

      expect(sdk.getAcpSessionManager).toBeTypeOf("function");
      expect(importModule).toHaveBeenCalledTimes(1);
      expect(importModule).toHaveBeenNthCalledWith(
        1,
        pathToFileURL(path.join(openclawRoot, "dist", "plugin-sdk", "acp-runtime.js")).href,
      );
    } finally {
      rmSync(openclawRoot, { recursive: true, force: true });
    }
  });

  it("falls back to bare sdk imports when the resolved host OpenClaw root is unavailable", async () => {
    const importModule = vi.fn(async (specifier: string): Promise<any> => {
      if (specifier === "openclaw/plugin-sdk/acp-runtime") {
        return {
          getAcpSessionManager() {
            return null;
          },
        };
      }
      throw new Error(`missing:${specifier}`);
    });

    await loadCompatibleAcpSdk("2026.3.22", {
      importModule,
      resolveOpenClawRoot: () => {
        throw new Error("missing host openclaw");
      },
    });

    expect(importModule).toHaveBeenNthCalledWith(1, "openclaw/plugin-sdk/acp-runtime");
  });

  it("uses the host plugin-sdk index fallback for pre-2026.3.22 runtimes", async () => {
    const importModule = vi.fn(async (specifier: string): Promise<any> => {
      if (specifier === "file:///opt/openclaw/dist/plugin-sdk/index.js") {
        return {
          getAcpSessionManager() {
            return null;
          },
        };
      }
      throw new Error(`unexpected:${specifier}`);
    });

    await loadCompatibleAcpSdk("2026.3.13", {
      importModule,
      resolveOpenClawRoot: () => "/opt/openclaw",
    });

    expect(importModule).toHaveBeenCalledTimes(1);
    expect(importModule).toHaveBeenNthCalledWith(1, "file:///opt/openclaw/dist/plugin-sdk/index.js");
  });

  it("bootstraps the host acpx backend before reading the public ACP manager", async () => {
    const ensureBackendRegistered = vi.fn(async () => undefined);
    const initializeSession = vi.fn(async ({ sessionKey }) => ({
      handle: { sessionKey, backend: "acpx" },
    }));
    const runTurn = vi.fn(async () => undefined);
    const adapter = new ExperimentalRealOpenClawSessionAdapter(
      runtime,
      config as any,
      async () => ({
        getAcpSessionManager: () => ({
          initializeSession,
          runTurn,
          getSessionStatus: vi.fn(),
          cancelSession: vi.fn(),
          closeSession: vi.fn(),
        }),
      }),
      ensureBackendRegistered,
    );

    await adapter.spawnAcpSession({
      task: "Run tests",
      runtime: "acp",
      agentId: "codex",
      mode: "run",
      thread: false,
    });

    expect(ensureBackendRegistered).toHaveBeenCalledTimes(1);
    expect(ensureBackendRegistered).toHaveBeenCalledWith(expect.any(String), { acp: { enabled: true } });
  });

  it("spawns and queries ACP sessions through the manager", async () => {
    const initializeSession = vi.fn(async ({ sessionKey }) => ({
      handle: { sessionKey, backend: "acpx", backendSessionId: "backend-1", agentSessionId: "agent-1" },
    }));
    const runTurn = vi.fn(async () => undefined);
    const getSessionStatus = vi.fn(async ({ sessionKey }) => ({
      sessionKey,
      backend: "acpx",
      state: "running" as const,
      runtimeStatus: { backendSessionId: "backend-1", agentSessionId: "agent-1", summary: "running" },
    }));
    const cancelSession = vi.fn(async () => undefined);
    const closeSession = vi.fn(async () => ({ runtimeClosed: true, runtimeNotice: "closed" }));
    const adapter = new ExperimentalRealOpenClawSessionAdapter(
      runtime,
      config as any,
      async () => ({
        getAcpSessionManager: () => ({
          initializeSession,
          runTurn,
          getSessionStatus,
          cancelSession,
          closeSession,
        }),
      }),
      async () => undefined,
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
    const status = await adapter.getAcpSessionStatus(accepted.sessionKey);
    const cancelled = await adapter.cancelAcpSession(accepted.sessionKey, "stop");
    const closed = await adapter.closeAcpSession(accepted.sessionKey, "done");

    expect(accepted.backend).toBe("acpx");
    expect(runTurn).toHaveBeenCalledTimes(1);
    expect(status.state).toBe("running");
    expect(cancelSession).toHaveBeenCalledTimes(1);
    expect(cancelled.sessionKey).toBe(accepted.sessionKey);
    expect(closed.message).toBe("closed");
  });
});
