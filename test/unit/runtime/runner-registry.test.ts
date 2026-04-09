import { AcpRunner } from "../../../src/runtime/acp-runner.js";
import { ManualRunner } from "../../../src/runtime/manual-runner.js";
import { RunnerRegistry } from "../../../src/runtime/runner-registry.js";

describe("RunnerRegistry", () => {
  it("resolves manual and acp by default", () => {
    const registry = new RunnerRegistry();

    expect(registry.resolve("manual").kind).toBe("manual");
    expect(registry.resolve("acp").kind).toBe("acp");
  });

  it("throws for unknown runners", () => {
    const registry = new RunnerRegistry([new ManualRunner()]);
    expect(() => registry.resolve("acp")).toThrow("Unknown runner: acp");
  });
});
