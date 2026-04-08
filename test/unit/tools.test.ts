import { registerSwarmTools } from "../../src/tools/index.js";

describe("swarm tools", () => {
  it("registers all orchestration tools as optional", () => {
    const registerTool = vi.fn();

    registerSwarmTools({
      pluginConfig: {},
      registerTool,
    } as any);

    expect(registerTool).toHaveBeenCalledTimes(8);
    for (const call of registerTool.mock.calls) {
      expect(call[1]).toEqual({ optional: true });
    }
    expect(registerTool.mock.calls.map((call) => call[0].name)).toEqual([
      "swarm_status",
      "swarm_autopilot_status",
      "swarm_task_plan",
      "swarm_run",
      "swarm_review_gate",
      "swarm_session_status",
      "swarm_session_cancel",
      "swarm_session_close",
    ]);
  });
});
