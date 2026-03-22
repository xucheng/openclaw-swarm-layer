import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runSwarmInit } from "../../src/cli/swarm-init.js";
import { runSwarmPlan } from "../../src/cli/swarm-plan.js";
import { runSwarmReview } from "../../src/cli/swarm-review.js";
import { runSwarmRun } from "../../src/cli/swarm-run.js";
import { runSwarmStatus } from "../../src/cli/swarm-status.js";
import { StateStore } from "../../src/state/state-store.js";

async function makeTempProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-run-review-"));
}

describe("e2e: run -> review", () => {
  it("moves a task into review and approves it", async () => {
    const projectRoot = await makeTempProject();
    const obsidianRoot = await makeTempProject();
    const specPath = path.join(projectRoot, "SPEC-002.md");
    const stateStore = new StateStore({ obsidianRoot });
    await fs.writeFile(
      specPath,
      "# Review Spec\n\n## Goals\n- Ship\n\n## Phases\n### Build\n- Implement runner\n",
      "utf8",
    );

    await runSwarmInit({ project: projectRoot }, { stateStore });
    await runSwarmPlan({ project: projectRoot, spec: specPath }, { stateStore });

    const dryRun = await runSwarmRun({ project: projectRoot, dryRun: true }, { stateStore });
    expect((dryRun as any).action).toBe("planned");

    const run = await runSwarmRun({ project: projectRoot }, { stateStore });
    expect((run as any).action).toBe("review_required");
    expect((run as any).localReportPath).toContain(path.join(".openclaw", "swarm", "reports"));
    expect((run as any).obsidianReportPath).toContain(obsidianRoot);

    const midStatus = await runSwarmStatus({ project: projectRoot }, { stateStore });
    expect(midStatus.workflow.reviewQueueSize).toBe(1);

    const review = await runSwarmReview(
      { project: projectRoot, task: "build-task-1", approve: true },
      { stateStore },
    );
    expect((review as any).status).toBe("done");

    const finalStatus = await runSwarmStatus({ project: projectRoot }, { stateStore });
    expect(finalStatus.workflow.reviewQueueSize).toBe(0);

    const localReport = await fs.readFile((run as any).localReportPath, "utf8");
    const obsidianReport = await fs.readFile((run as any).obsidianReportPath, "utf8");
    expect(localReport).toContain("# Swarm Report");
    expect(obsidianReport).toContain("# Swarm Report");
  });
});
