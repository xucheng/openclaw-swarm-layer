import { acquireAutopilotLease, releaseAutopilotLease } from "../../../src/autopilot/lease.js";
import { createDefaultAutopilotState } from "../../../src/autopilot/types.js";
import { resolveSwarmPluginConfig } from "../../../src/config.js";

const config = resolveSwarmPluginConfig({
  autopilot: {
    enabled: true,
  },
});

describe("autopilot lease", () => {
  it("acquires a lease when none exists", () => {
    const state = createDefaultAutopilotState("/tmp/project", config);

    const result = acquireAutopilotLease(state, "owner-1", "2026-04-08T12:00:00.000Z", 30);

    expect(result.acquired).toBe(true);
    expect(result.state.runtimeState).toBe("ticking");
    expect(result.state.lease?.ownerId).toBe("owner-1");
  });

  it("rejects a second owner while the lease is still active", () => {
    const state = createDefaultAutopilotState("/tmp/project", config);
    const leased = acquireAutopilotLease(state, "owner-1", "2026-04-08T12:00:00.000Z", 30).state;

    const result = acquireAutopilotLease(leased, "owner-2", "2026-04-08T12:00:10.000Z", 30);

    expect(result.acquired).toBe(false);
    expect(result.reason).toContain("lease held by owner-1");
  });

  it("releases the lease for the owner that holds it", () => {
    const state = createDefaultAutopilotState("/tmp/project", config);
    const leased = acquireAutopilotLease(state, "owner-1", "2026-04-08T12:00:00.000Z", 30).state;

    const released = releaseAutopilotLease(leased, "owner-1");

    expect(released.runtimeState).toBe("idle");
    expect(released.lease).toBeUndefined();
  });
});
