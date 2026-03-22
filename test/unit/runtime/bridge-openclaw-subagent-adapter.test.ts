import { BridgeOpenClawSubagentAdapter, createBridgeSubagentAdapter } from "../../../src/runtime/bridge-openclaw-subagent-adapter.js";

describe("BridgeOpenClawSubagentAdapter", () => {
  const commandRunner = vi.fn();
  const config = {
    bridge: {
      enabled: true,
      nodePath: undefined,
      openclawRoot: "/opt/openclaw",
      versionAllow: ["2026.3.13"],
    },
  };

  beforeEach(() => {
    commandRunner.mockReset();
  });

  it("returns null when bridge mode is disabled", () => {
    expect(createBridgeSubagentAdapter({ bridge: { ...config.bridge, enabled: false } } as any)).toBeNull();
  });

  it("creates an adapter when bridge mode is enabled", () => {
    expect(createBridgeSubagentAdapter(config as any)).toBeInstanceOf(BridgeOpenClawSubagentAdapter);
  });

  it("invokes bridge-backed subagent spawn", async () => {
    commandRunner.mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({
        ok: true,
        version: "2026.3.13",
        result: {
          childSessionKey: "agent:main:subagent:1",
          runId: "sub-run-1",
          mode: "run",
        },
      }),
      stderr: "",
    });
    const adapter = new BridgeOpenClawSubagentAdapter(config as any, "/usr/bin/node", "/tmp/bridge.mjs", "/tmp/loader.mjs", commandRunner);

    const accepted = await adapter.spawnSubagent({
      task: "delegate",
      mode: "run",
      thread: false,
    });

    expect(accepted.runId).toBe("sub-run-1");
    expect(commandRunner.mock.calls[0]?.[0]).toEqual([
      "/usr/bin/node",
      "--import",
      "/tmp/loader.mjs",
      "/tmp/bridge.mjs",
      "subagent-spawn",
    ]);
  });

  it("invokes bridge-backed subagent status and kill", async () => {
    commandRunner
      .mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify({
          ok: true,
          version: "2026.3.13",
          result: {
            childSessionKey: "agent:main:subagent:1",
            state: "running",
          },
        }),
        stderr: "",
      })
      .mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify({
          ok: true,
          version: "2026.3.13",
          result: {
            childSessionKey: "agent:main:subagent:1",
            killedAt: "2026-03-21T00:00:00.000Z",
          },
        }),
        stderr: "",
      });
    const adapter = new BridgeOpenClawSubagentAdapter(config as any, "/usr/bin/node", "/tmp/bridge.mjs", "/tmp/loader.mjs", commandRunner);

    const status = await adapter.getSubagentRunStatus("agent:main:subagent:1");
    const killed = await adapter.killSubagentRun("agent:main:subagent:1", "stop");

    expect(status.state).toBe("running");
    expect(killed.killedAt).toBe("2026-03-21T00:00:00.000Z");
    expect(commandRunner.mock.calls[1]?.[0]?.[4]).toBe("subagent-kill");
  });
});
