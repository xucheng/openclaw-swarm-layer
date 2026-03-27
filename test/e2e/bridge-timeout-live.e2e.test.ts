import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runBridgeCommandDirect } from "../../src/runtime/bridge-openclaw-subagent-adapter.js";

describe("e2e: live bridge timeout classification", () => {
  it("classifies a real hanging command as timeout", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "swarm-layer-bridge-timeout-"));
    const hangScript = path.join(tempDir, "hang.mjs");
    await fs.writeFile(hangScript, 'setInterval(() => {}, 1_000);\n', "utf8");

    const result = await runBridgeCommandDirect([process.execPath, hangScript], {
      cwd: tempDir,
      input: "",
      timeoutMs: 10,
    });

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("bridge timed out after 10ms");
  });
});
