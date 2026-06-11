import fs from "node:fs/promises";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

const addFormats = addFormatsModule as unknown as (ajv: Ajv2020) => void;
import type { RunRecord, TaskNode } from "../../../src/types.js";

const schemasDir = path.resolve(__dirname, "../../../src/schemas");

async function compileSchema(name: string) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const schema = JSON.parse(await fs.readFile(path.join(schemasDir, name), "utf8"));
  return ajv.compile(schema);
}

describe("state JSON schemas stay in sync with types.ts", () => {
  it("accepts a failed ACP run record with failure metadata", async () => {
    const validate = await compileSchema("run.schema.json");
    const run: RunRecord = {
      runId: "task-1-run-1",
      taskId: "task-1",
      attempt: 1,
      status: "failed",
      runner: { type: "acp" },
      workspacePath: "/tmp/project",
      startedAt: "2026-06-11T00:00:00.000Z",
      endedAt: "2026-06-11T00:05:00.000Z",
      resultSummary: "Failed: This operation was aborted",
      artifacts: [],
      sessionRef: {
        runtime: "acp",
        sessionKey: "agent:deepseek:acp:abc",
        backend: "acpx",
        backendSessionId: "backend-1",
        threadId: "thread-1",
      },
      failure: {
        source: "openclaw-embedded",
        message: "This operation was aborted",
        upstreamState: "idle",
        sessionKey: "agent:deepseek:acp:abc",
        backendSessionId: "backend-1",
      },
      events: [
        { at: "2026-06-11T00:05:00.000Z", type: "error", detail: { message: "aborted" } },
      ],
      retryHistory: [{ attempt: 1, runId: "task-1-run-1", status: "failed", at: "2026-06-11T00:05:00.000Z" }],
      budgetUsage: { exceeded: false },
      lastSignal: "sync",
    };

    expect(validate(run)).toBe(true);
    expect(validate.errors).toBeNull();
  });

  it("accepts a timed_out run status", async () => {
    const validate = await compileSchema("run.schema.json");
    const run = {
      runId: "task-1-run-2",
      taskId: "task-1",
      attempt: 1,
      status: "timed_out",
      runner: { type: "acp" },
      workspacePath: "/tmp/project",
      startedAt: "2026-06-11T00:00:00.000Z",
      artifacts: [],
    };

    expect(validate(run)).toBe(true);
  });

  it("accepts a task node with expectedArtifacts and modern status values", async () => {
    const validate = await compileSchema("task.schema.json");
    const task: TaskNode = {
      taskId: "task-1",
      specId: "spec-1",
      phaseId: "phase-1",
      title: "Write the note",
      description: "Write the note to /tmp/out/note.md",
      kind: "coding",
      deps: [],
      status: "queued",
      workspace: { mode: "shared" },
      runner: {
        type: "acp",
        agentId: "deepseek",
        retryPolicy: { maxAttempts: 2, backoffSeconds: 5, retryOn: ["failed", "timed_out"] },
        budget: { maxDurationSeconds: 600 },
      },
      review: { required: true, status: "pending" },
      session: { policy: "reuse_if_available", bindingKey: "daily-papers" },
      expectedArtifacts: ["/tmp/out/**/note-*.md"],
      retryCount: 1,
      lastRejectReason: "missing artifacts",
    };

    expect(validate(task)).toBe(true);
    expect(validate.errors).toBeNull();
  });

  it("rejects unknown task status values", async () => {
    const validate = await compileSchema("task.schema.json");
    const task = {
      taskId: "task-1",
      specId: "spec-1",
      title: "Write the note",
      description: "Write the note",
      kind: "coding",
      deps: [],
      status: "definitely_not_a_status",
      workspace: { mode: "shared" },
      runner: { type: "acp" },
      review: { required: false },
    };

    expect(validate(task)).toBe(false);
  });
});
