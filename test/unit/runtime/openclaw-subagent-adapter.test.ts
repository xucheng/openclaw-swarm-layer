import { UnsupportedOpenClawSubagentAdapter } from "../../../src/runtime/openclaw-subagent-adapter.js";

describe("UnsupportedOpenClawSubagentAdapter", () => {
  it("throws a clear error until a public subagent spawn surface exists", async () => {
    const adapter = new UnsupportedOpenClawSubagentAdapter();

    await expect(
      adapter.spawnSubagent({
        task: "Run subagent task",
        mode: "run",
        thread: false,
      }),
    ).rejects.toThrow("public plugin SDK does not expose a stable subagent spawn surface");
  });

  it("throws for status and kill before a public subagent surface exists", async () => {
    const adapter = new UnsupportedOpenClawSubagentAdapter();

    await expect(adapter.getSubagentRunStatus("agent:main:subagent:1")).rejects.toThrow(
      "stable subagent status surface",
    );
    await expect(adapter.killSubagentRun("agent:main:subagent:1")).rejects.toThrow(
      "stable subagent kill surface",
    );
  });
});
