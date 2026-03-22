import { classifyBridgeFailure, formatBridgeFailure } from "../../../src/runtime/bridge-errors.js";

describe("bridge errors", () => {
  it("classifies version drift failures", () => {
    const classified = classifyBridgeFailure("OpenClaw version 2026.4.0 is not in bridge allowlist");

    expect(classified.kind).toBe("version-drift");
    expect(classified.remediation[0]).toContain("versionAllow");
  });

  it("classifies backend unavailable and timeout failures", () => {
    expect(classifyBridgeFailure("ACP runtime backend is currently unavailable").kind).toBe("backend-unavailable");
    expect(classifyBridgeFailure("bridge timed out after 120000ms").kind).toBe("timeout");
  });

  it("formats a failure with remediation guidance", () => {
    const formatted = formatBridgeFailure("acp-status", "ACP runtime backend is currently unavailable");

    expect(formatted).toContain("[backend-unavailable]");
    expect(formatted).toContain("Remediation:");
  });
});
