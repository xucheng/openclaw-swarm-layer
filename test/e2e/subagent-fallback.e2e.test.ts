import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmInit } from "../../src/cli/swarm-init.js";
import { runSwarmPlan } from "../../src/cli/swarm-plan.js";
import { runSwarmRun } from "../../src/cli/swarm-run.js";
import type { OpenClawSubagentAdapter } from "../../src/runtime/openclaw-subagent-adapter.js";
import { StateStore } from "../../src/state/state-store.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-subagent-e2e-"));
}

describe("e2e: subagent fallback run", () => {
  it("dispatches a subagent runner and writes an accepted run ledger", async () => {
    const projectRoot = await makeTempProject();
    const specPath = path.join(projectRoot, "SPEC-SUBAGENT.md");
    const stateStore = new StateStore();
    const subagentAdapter: OpenClawSubagentAdapter = {
      async spawnSubagent() {
        return {
          childSessionKey: "agent:main:subagent:e2e",
          runId: "sub-run-e2e",
          mode: "run",
          note: "subagent accepted",
        };
      },
      async getSubagentRunStatus() {
        return {
          childSessionKey: "agent:main:subagent:e2e",
          state: "running",
        };
      },
      async killSubagentRun() {
        return {
          childSessionKey: "agent:main:subagent:e2e",
        };
      },
    };
    await fs.writeFile(specPath, "# Subagent Spec\n\n## Goals\n- use subagent fallback\n\n## Phases\n### Execute\n- Delegate work\n", "utf8");

    await runSwarmInit({ project: projectRoot }, { stateStore });
    await runSwarmPlan({ project: projectRoot, spec: specPath }, { stateStore });
    const result = await runSwarmRun(
      { project: projectRoot, runner: "subagent" },
      { stateStore, subagentAdapter },
    );
    const workflow = await stateStore.loadWorkflow(projectRoot);
    const runs = await stateStore.loadRuns(projectRoot);

    expect((result as any).action).toBe("dispatched");
    expect(workflow.lifecycle).toBe("running");
    expect(workflow.tasks[0]?.status).toBe("running");
    expect(runs[0]?.runner.type).toBe("subagent");
    expect(runs[0]?.sessionRef?.runtime).toBe("subagent");
  });
});
