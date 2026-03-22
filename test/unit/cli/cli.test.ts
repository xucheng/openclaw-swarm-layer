import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { registerSwarmCliCommands } from "../../../src/cli/register-swarm-cli.js";
import { StateStore } from "../../../src/state/state-store.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-cli-"));
}

describe("swarm cli", () => {
  it("registers init, status, and plan commands", async () => {
    const program = new Command();
    const stateStore = new StateStore();

    registerSwarmCliCommands({ program }, { stateStore });

    const swarm = program.commands.find((command) => command.name() === "swarm");
    expect(swarm).toBeDefined();
    expect(swarm?.commands.map((command) => command.name())).toEqual([
      "init",
      "status",
      "plan",
      "run",
      "review",
      "report",
      "doctor",
      "session",
    ]);

    const runCommand = swarm?.commands.find((command) => command.name() === "run");
    expect(runCommand?.options.some((option) => option.long === "--runner")).toBe(true);
    const sessionCommand = swarm?.commands.find((command) => command.name() === "session");
    expect(sessionCommand?.commands.map((command) => command.name())).toEqual(["list", "inspect", "status", "cancel", "close", "follow-up", "cleanup", "steer"]);
  });

  it("executes init and plan handlers through the command tree", async () => {
    const projectRoot = await makeTempProject();
    const specPath = path.join(projectRoot, "SPEC-001.md");
    const program = new Command();
    const stateStore = new StateStore();
    await fs.writeFile(specPath, "# Test Spec\n\n## Goals\n- Ship\n\n## Phases\n### Build\n- Implement\n", "utf8");

    registerSwarmCliCommands({ program }, { stateStore });

    const writes: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    await program.parseAsync(["node", "test", "swarm", "init", "--project", projectRoot]);
    await program.parseAsync(["node", "test", "swarm", "plan", "--project", projectRoot, "--spec", specPath]);

    spy.mockRestore();

    expect(writes.join("")).toContain("specId");
    const workflow = await stateStore.loadWorkflow(projectRoot);
    expect(workflow.activeSpecId).toBe("test-spec");
  });
});
