import { UnsupportedOpenClawSessionAdapter } from "../../../src/runtime/openclaw-session-adapter.js";

describe("UnsupportedOpenClawSessionAdapter", () => {
  it("throws a clear error until a real ACP session adapter is wired", async () => {
    const adapter = new UnsupportedOpenClawSessionAdapter();

    await expect(
      adapter.spawnAcpSession({
        task: "Run tests",
        runtime: "acp",
        agentId: "codex",
        mode: "run",
        thread: false,
      }),
    ).rejects.toThrow("ACP execution is not wired");
  });

  it("throws for status lookups before a real adapter is wired", async () => {
    const adapter = new UnsupportedOpenClawSessionAdapter();

    await expect(adapter.getAcpSessionStatus("agent:codex:acp:1")).rejects.toThrow(
      "ACP session status is not wired",
    );
  });

  it("throws for cancel and close before a real adapter is wired", async () => {
    const adapter = new UnsupportedOpenClawSessionAdapter();

    await expect(adapter.cancelAcpSession("agent:codex:acp:1")).rejects.toThrow("ACP session cancel is not wired");
    await expect(adapter.closeAcpSession("agent:codex:acp:1")).rejects.toThrow("ACP session close is not wired");
  });
});
