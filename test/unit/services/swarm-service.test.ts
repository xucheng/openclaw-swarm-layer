import { AutopilotServiceLoop } from "../../../src/autopilot/service-loop.js";
import type { OpenClawSessionAdapter } from "../../../src/runtime/openclaw-session-adapter.js";
import * as realAdapterModule from "../../../src/runtime/real-openclaw-session-adapter.js";
import { createSwarmService, registerSwarmService } from "../../../src/services/orchestrator.js";

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
    loadConfig: () => ({} as any),
    writeConfigFile: vi.fn(async () => undefined),
  },
};

function makeRuntimeAdapter(): OpenClawSessionAdapter {
  return {
    spawnAcpSession: vi.fn(),
    getAcpSessionStatus: vi.fn(),
    cancelAcpSession: vi.fn(),
    closeAcpSession: vi.fn(),
  };
}

function makeServiceContext() {
  return {
    config: {} as any,
    workspaceDir: "/tmp/swarm-service-project",
    stateDir: "/tmp/swarm-service-state",
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any,
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

  it("wires the default service loop to use the runtime ACP session adapter", async () => {
    const runtimeAdapter = makeRuntimeAdapter();
    vi.spyOn(realAdapterModule, "createSessionAdapter").mockReturnValue(runtimeAdapter);
    const startSpy = vi.spyOn(AutopilotServiceLoop.prototype, "start").mockImplementation(() => undefined);
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
    const startSpy = vi.spyOn(AutopilotServiceLoop.prototype, "start").mockImplementation(() => undefined);
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
