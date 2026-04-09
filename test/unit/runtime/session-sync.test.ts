import { syncAcpRunRecord } from "../../../src/runtime/session-sync.js";
import type { RunRecord } from "../../../src/types.js";

const baseRun: RunRecord = {
  runId: "run-1",
  taskId: "task-1",
  attempt: 1,
  status: "accepted",
  runner: { type: "acp" },
  workspacePath: "/tmp/project",
  startedAt: "2026-03-20T00:00:00.000Z",
  artifacts: [],
  sessionRef: {
    runtime: "acp",
    sessionKey: "agent:codex:acp:1",
    backend: "acpx",
  },
  events: [{ at: "2026-03-20T00:00:00.000Z", type: "spawn_accepted" }],
};

describe("session sync", () => {
  it("maps running status and appends a status event", () => {
    const result = syncAcpRunRecord(baseRun, {
      sessionKey: "agent:codex:acp:1",
      state: "running",
      checkedAt: "2026-03-20T00:01:00.000Z",
      message: "still running",
    });

    expect(result.runRecord.status).toBe("running");
    expect(result.runRecord.events?.at(-1)?.type).toBe("status_polled");
  });

  it("maps completed status and writes endedAt", () => {
    const result = syncAcpRunRecord(baseRun, {
      sessionKey: "agent:codex:acp:1",
      state: "completed",
      checkedAt: "2026-03-20T00:02:00.000Z",
      message: "done",
    });

    expect(result.runRecord.status).toBe("completed");
    expect(result.runRecord.endedAt).toBe("2026-03-20T00:02:00.000Z");
    expect(result.runRecord.events?.map((event) => event.type)).toContain("done");
    expect(result.runRecord.resultSummary).toBe("Completed: ACP session finished");
  });

  it("maps timed out status and appends timeout event", () => {
    const result = syncAcpRunRecord(baseRun, {
      sessionKey: "agent:codex:acp:1",
      state: "timed_out",
      checkedAt: "2026-03-20T00:03:00.000Z",
      message: "timeout",
    });

    expect(result.runRecord.status).toBe("timed_out");
    expect(result.runRecord.events?.map((event) => event.type)).toContain("timeout");
    expect(result.runRecord.resultSummary).toBe("Timed out: ACP session exceeded allowed time");
  });
});
