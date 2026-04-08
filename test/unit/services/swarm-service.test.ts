import { createSwarmService } from "../../../src/services/orchestrator.js";

describe("swarm service", () => {
  it("starts and stops the autopilot service loop for the workspace", async () => {
    const loop = {
      start: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
    };
    const service = createSwarmService(
      {
        autopilot: {
          enabled: true,
          mode: "supervised",
          tickSeconds: 15,
          leaseSeconds: 45,
          maxDispatchPerTick: 2,
          reviewPolicy: {
            mode: "manual_only",
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
      },
      "2026.4.8",
      {
        createLoop: () => loop,
      },
    );

    await service.start({
      config: {} as any,
      workspaceDir: "/tmp/swarm-service-project",
      stateDir: "/tmp/swarm-service-state",
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as any,
    });
    expect(loop.start).toHaveBeenCalledWith("/tmp/swarm-service-project");

    await service.stop?.({
      config: {} as any,
      workspaceDir: "/tmp/swarm-service-project",
      stateDir: "/tmp/swarm-service-state",
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as any,
    });
    expect(loop.stop).toHaveBeenCalledTimes(1);
  });
});
