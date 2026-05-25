import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AutopilotServiceLoop } from "../../../src/autopilot/service-loop.js";
import { StateWatcher } from "../../../src/autopilot/state-watcher.js";
import type { OpenClawSessionAdapter } from "../../../src/runtime/openclaw-session-adapter.js";
import * as realAdapterModule from "../../../src/runtime/real-openclaw-session-adapter.js";
import { createSwarmService, registerSwarmService } from "../../../src/services/orchestrator.js";
import { StateCache } from "../../../src/state/state-cache.js";
import { StateStore } from "../../../src/state/state-store.js";
import { AutopilotStore } from "../../../src/autopilot/autopilot-store.js";
import type { RunRecord } from "../../../src/types.js";

const serviceConfig = {
  acp: {
    enabled: true,
    backendId: "acpx",
    defaultAgentId: "codex",
    allowedAgents: ["codex"],
    defaultMode: "run" as const,
    allowThreadBinding: true,
    defaultTimeoutSeconds: 600,
    experimentalControlPlaneAdapter: true,
  },
  autopilot: {
    enabled: true,
    mode: "supervised" as const,
    tickSeconds: 15,
    leaseSeconds: 45,
    maxDispatchPerTick: 2,
    reviewPolicy: {
      mode: "manual_only" as const,
      allowlistTags: [],
      denyTags: ["high-risk", "security", "prod"],
    },
    recoveryPolicy: {
      stuckRunMinutes: 20,
      idleSessionMinutes: 60,
      maxRecoveriesPerTask: 1,
      cancelBeforeRetry: true,
      degradedFailureRate: 0.5,
      degradedMinTerminalRuns: 3,
      degradedTerminalWindow: 6,
    },
  },
};

const runtime = {
  version: "2026.4.8",
  config: {
    current: () => ({} as any),
    loadConfig: () => ({} as any),
    mutateConfigFile: vi.fn(),
    replaceConfigFile: vi.fn(),
    writeConfigFile: vi.fn(async () => undefined),
  },
} as any;

function makeRuntimeAdapter(): OpenClawSessionAdapter {
  return {
    spawnAcpSession: vi.fn(),
    getAcpSessionStatus: vi.fn(),
    cancelAcpSession: vi.fn(),
    closeAcpSession: vi.fn(),
  };
}

async function makeTempWorkspace(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-service-project-"));
}

function makeServiceContext(overrides: { workspaceDir?: string } = {}) {
  return {
    config: {} as any,
    workspaceDir: overrides.workspaceDir ?? "/tmp/swarm-service-project",
    stateDir: "/tmp/swarm-service-state",
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any,
  };
}

function runRecord(projectRoot: string, runId: string): RunRecord {
  return {
    runId,
    taskId: "task-1",
    attempt: 1,
    status: "completed",
    runner: { type: "manual" },
    workspacePath: projectRoot,
    startedAt: "2026-05-25T00:00:00.000Z",
    artifacts: [],
  };
}

describe("swarm service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes the runtime-resolved session adapter into custom loops", async () => {
    const runtimeAdapter = makeRuntimeAdapter();
    const createSessionAdapterSpy = vi
      .spyOn(realAdapterModule, "createSessionAdapter")
      .mockReturnValue(runtimeAdapter);
    const loop = {
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
    };
    let capturedDeps: any;
    const service = createSwarmService(
      serviceConfig,
      runtime.version,
      {
        runtime,
        createLoop: (deps) => {
          capturedDeps = deps;
          return loop;
        },
      },
    );

    await service.start(makeServiceContext());

    expect(createSessionAdapterSpy).toHaveBeenCalledWith(
      runtime,
      expect.objectContaining({
        acp: expect.objectContaining({
          backendId: "acpx",
          experimentalControlPlaneAdapter: true,
        }),
      }),
    );
    expect(capturedDeps.sessionAdapter).toBe(runtimeAdapter);
    expect(loop.start).toHaveBeenCalledWith("/tmp/swarm-service-project");

    await service.stop?.(makeServiceContext());
    expect(loop.stop).toHaveBeenCalledTimes(1);
  });

  it("keeps polling mode as the default without watcher or cache wiring", async () => {
    const loop = {
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
    };
    let capturedDeps: any;
    const service = createSwarmService(serviceConfig, runtime.version, {
      createLoop: (deps) => {
        capturedDeps = deps;
        return loop;
      },
    });

    await service.start(makeServiceContext({ workspaceDir: await makeTempWorkspace() }));

    expect(capturedDeps.stateStore).toBeInstanceOf(StateStore);
    expect(capturedDeps.autopilotStore).toBeInstanceOf(AutopilotStore);
    expect(capturedDeps.loopOptions).toMatchObject({
      mode: "polling",
      pollingIntervalMs: 15000,
    });
    expect(capturedDeps.loopOptions.watcher).toBeUndefined();
    expect((capturedDeps.stateStore as any).reader).not.toBeInstanceOf(StateCache);

    await service.stop?.(makeServiceContext());
  });

  it("passes watcher mode loop options and a cache-backed StateStore to custom loops", async () => {
    const loop = {
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
    };
    let capturedDeps: any;
    const service = createSwarmService(
      {
        ...serviceConfig,
        autopilot: {
          ...serviceConfig.autopilot,
          watcherMode: "hybrid",
          watcher: {
            debounceMs: 50,
            safetyTickMs: 120000,
            safetyResyncMs: 3600000,
            library: "node",
            ignoreInitial: true,
            useFsEventsCoalescing: false,
          },
        },
      },
      runtime.version,
      {
        createLoop: (deps) => {
          capturedDeps = deps;
          return loop;
        },
      },
    );
    const workspaceDir = await makeTempWorkspace();

    await service.start(makeServiceContext({ workspaceDir }));

    expect(capturedDeps.loopOptions).toMatchObject({
      mode: "hybrid",
      pollingIntervalMs: 15000,
      debounceMs: 50,
      safetyTickMs: 120000,
    });
    expect(capturedDeps.loopOptions.watcher).toBeInstanceOf(StateWatcher);
    expect(capturedDeps.loopOptions.watcher.listenerCount("change")).toBeGreaterThan(0);
    expect((capturedDeps.stateStore as any).reader).toBeInstanceOf(StateCache);
    expect(loop.start).toHaveBeenCalledWith(workspaceDir);

    await service.stop?.(makeServiceContext());
  });

  it("refreshes the service StateStore cache from watcher changes", async () => {
    const loop = {
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
    };
    let capturedDeps: any;
    const service = createSwarmService(
      {
        ...serviceConfig,
        autopilot: {
          ...serviceConfig.autopilot,
          watcherMode: "watch",
          watcher: {
            debounceMs: 50,
            safetyTickMs: 120000,
            safetyResyncMs: 3600000,
            library: "node",
            ignoreInitial: true,
            useFsEventsCoalescing: false,
          },
        },
      },
      runtime.version,
      {
        createLoop: (deps) => {
          capturedDeps = deps;
          return loop;
        },
      },
    );
    const workspaceDir = await makeTempWorkspace();

    await service.start(makeServiceContext({ workspaceDir }));

    const writer = new StateStore(capturedDeps.stateStore.config);
    const run = runRecord(workspaceDir, "run-1");
    const runPath = await writer.writeRun(workspaceDir, run);

    await expect(capturedDeps.stateStore.loadRuns(workspaceDir)).resolves.toEqual([]);
    capturedDeps.loopOptions.watcher.emit("change", {
      kind: "run",
      op: "update",
      paths: [runPath],
      at: "2026-05-25T00:00:01.000Z",
      seq: 1,
    });

    await vi.waitFor(async () => {
      await expect(capturedDeps.stateStore.loadRuns(workspaceDir)).resolves.toEqual([run]);
    });

    await service.stop?.(makeServiceContext());
  });

  it("wires the default service loop to use the runtime ACP session adapter", async () => {
    const runtimeAdapter = makeRuntimeAdapter();
    vi.spyOn(realAdapterModule, "createSessionAdapter").mockReturnValue(runtimeAdapter);
    const startSpy = vi.spyOn(AutopilotServiceLoop.prototype, "start").mockResolvedValue(undefined);
    const stopSpy = vi.spyOn(AutopilotServiceLoop.prototype, "stop").mockResolvedValue(undefined);

    const service = createSwarmService(serviceConfig, runtime.version, { runtime });
    await service.start(makeServiceContext());

    const loop = startSpy.mock.contexts[0] as any;
    expect(loop.controller.orchestrator.sessionAdapter).toBe(runtimeAdapter);
    expect(loop.controller.orchestrator.runnerRegistry.resolve("acp").sessionAdapter).toBe(runtimeAdapter);

    await service.stop?.(makeServiceContext());
    expect(stopSpy).toHaveBeenCalledTimes(1);
  });

  it("passes api.runtime through registerSwarmService", async () => {
    const runtimeAdapter = makeRuntimeAdapter();
    vi.spyOn(realAdapterModule, "createSessionAdapter").mockReturnValue(runtimeAdapter);
    const startSpy = vi.spyOn(AutopilotServiceLoop.prototype, "start").mockResolvedValue(undefined);
    const stopSpy = vi.spyOn(AutopilotServiceLoop.prototype, "stop").mockResolvedValue(undefined);
    const registerService = vi.fn();

    registerSwarmService({
      pluginConfig: serviceConfig,
      registerService,
      runtime,
    } as any);

    expect(registerService).toHaveBeenCalledTimes(1);

    const service = registerService.mock.calls[0][0];
    await service.start(makeServiceContext());

    const loop = startSpy.mock.contexts[0] as any;
    expect(loop.controller.orchestrator.sessionAdapter).toBe(runtimeAdapter);

    await service.stop?.(makeServiceContext());
    expect(stopSpy).toHaveBeenCalledTimes(1);
  });
});
