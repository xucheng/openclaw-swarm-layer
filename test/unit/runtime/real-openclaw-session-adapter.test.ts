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
    const adapter = new ExperimentalRealOpenClawSessionAdapter(runtime, config as any, async () => ({}));

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

  it("falls back to the resolved OpenClaw root when bare sdk imports are unavailable", async () => {
    const openclawRoot = mkdtempSync(path.join(tmpdir(), "swarm-layer-openclaw-root-"));
    mkdirSync(path.join(openclawRoot, "dist", "plugin-sdk"), { recursive: true });
    writeFileSync(path.join(openclawRoot, "dist", "plugin-sdk", "acp-runtime.js"), "export {};\n", "utf8");

    const importModule = vi.fn(async (specifier: string): Promise<any> => {
      if (specifier.startsWith("openclaw/")) {
        throw new Error(`missing:${specifier}`);
      }
      return {
        getAcpSessionManager() {
          return null;
        },
      };
    });
    try {
      const sdk = await loadCompatibleAcpSdk("2026.3.22", {
        importModule,
        resolveOpenClawRoot: () => openclawRoot,
      });

      expect(sdk.getAcpSessionManager).toBeTypeOf("function");
      expect(importModule).toHaveBeenNthCalledWith(1, "openclaw/plugin-sdk/acp-runtime");
      expect(importModule).toHaveBeenNthCalledWith(2, "openclaw/plugin-sdk");
      expect(importModule).toHaveBeenNthCalledWith(
        3,
        pathToFileURL(path.join(openclawRoot, "dist", "plugin-sdk", "acp-runtime.js")).href,
      );
    } finally {
      rmSync(openclawRoot, { recursive: true, force: true });
    }
  });

  it("uses the legacy plugin-sdk index fallback for pre-2026.3.22 runtimes", async () => {
    const importModule = vi.fn(async (specifier: string): Promise<any> => {
      if (specifier === "openclaw/plugin-sdk") {
        throw new Error("missing:openclaw/plugin-sdk");
      }
      return {
        getAcpSessionManager() {
          return null;
        },
      };
    });

    await loadCompatibleAcpSdk("2026.3.13", {
      importModule,
      resolveOpenClawRoot: () => "/opt/openclaw",
    });

    expect(importModule).toHaveBeenNthCalledWith(1, "openclaw/plugin-sdk");
    expect(importModule).toHaveBeenNthCalledWith(2, "file:///opt/openclaw/dist/plugin-sdk/index.js");
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
