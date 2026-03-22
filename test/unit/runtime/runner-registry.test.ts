import { AcpRunner } from "../../../src/runtime/acp-runner.js";
import { ManualRunner } from "../../../src/runtime/manual-runner.js";
import { SubagentRunner } from "../../../src/runtime/subagent-runner.js";
import { RunnerRegistry } from "../../../src/runtime/runner-registry.js";

describe("RunnerRegistry", () => {
  it("resolves manual, acp, and subagent runners", () => {
    const registry = new RunnerRegistry([new ManualRunner(), new AcpRunner(), new SubagentRunner()]);

    expect(registry.resolve("manual").kind).toBe("manual");
    expect(registry.resolve("acp").kind).toBe("acp");
    expect(registry.resolve("subagent").kind).toBe("subagent");
  });

  it("throws for unknown runners", () => {
    const registry = new RunnerRegistry([new ManualRunner()]);
    expect(() => registry.resolve("acp")).toThrow("Unknown runner: acp");
  });
});
