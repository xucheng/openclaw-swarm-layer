import { ACP_BRIDGE_REPLACEMENT_BOUNDARY } from "../../../src/runtime/bridge-openclaw-session-adapter.js";
import { SUBAGENT_BRIDGE_REPLACEMENT_BOUNDARY } from "../../../src/runtime/bridge-openclaw-subagent-adapter.js";

describe("bridge replacement boundaries", () => {
  it("describes the ACP bridge replacement boundary", () => {
    expect(ACP_BRIDGE_REPLACEMENT_BOUNDARY.publicExport).toBe("getAcpSessionManager");
    expect(ACP_BRIDGE_REPLACEMENT_BOUNDARY.currentImplementation).toContain("bridge-openclaw-session-adapter");
  });

  it("describes the subagent bridge replacement boundary", () => {
    expect(SUBAGENT_BRIDGE_REPLACEMENT_BOUNDARY.publicExport).toBe("spawnSubagentDirect");
    expect(SUBAGENT_BRIDGE_REPLACEMENT_BOUNDARY.currentImplementation).toContain("bridge-openclaw-subagent-adapter");
  });
});
