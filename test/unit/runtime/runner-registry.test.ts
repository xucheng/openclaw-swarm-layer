import { AcpRunner } from "../../../src/runtime/acp-runner.js";
import { ManualRunner } from "../../../src/runtime/manual-runner.js";
import { SubagentRunner } from "../../../src/runtime/subagent-runner.js";
import { RunnerRegistry } from "../../../src/runtime/runner-registry.js";

describe("RunnerRegistry", () => {
  it("keeps subagent dark by default", () => {
    const registry = new RunnerRegistry();

    expect(registry.resolve("manual").kind).toBe("manual");
    expect(registry.resolve("acp").kind).toBe("acp");
    expect(registry.has("subagent")).toBe(false);
    expect(() => registry.resolve("subagent")).toThrow("Unknown runner: subagent");
  });

  it("resolves subagent when it is registered explicitly", () => {
    const registry = new RunnerRegistry([new ManualRunner(), new AcpRunner(), new SubagentRunner()]);

    expect(registry.has("subagent")).toBe(true);
    expect(registry.resolve("subagent").kind).toBe("subagent");
  });

  it("throws for unknown runners", () => {
    const registry = new RunnerRegistry([new ManualRunner()]);
    expect(() => registry.resolve("acp")).toThrow("Unknown runner: acp");
  });
});
