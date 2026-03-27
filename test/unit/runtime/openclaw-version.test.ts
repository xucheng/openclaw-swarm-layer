import {
  ACP_BRIDGE_FREE_VERSION_FLOOR,
  compareOpenClawVersions,
  matchesOpenClawVersionAllowlist,
  matchesOpenClawVersionRule,
  normalizeOpenClawVersion,
  supportsPublicAcpRuntime,
} from "../../../src/runtime/openclaw-version.js";

describe("openclaw version helpers", () => {
  it("exports the ACP bridge-free version floor", () => {
    expect(ACP_BRIDGE_FREE_VERSION_FLOOR).toBe("2026.3.22");
  });

  it("normalizes build suffixes to the release version", () => {
    expect(normalizeOpenClawVersion("2026.3.23-1")).toBe("2026.3.23");
    expect(normalizeOpenClawVersion("2026.3.23-hotfix")).toBe("2026.3.23");
  });

  it("compares suffixed versions against baseline releases", () => {
    expect(compareOpenClawVersions("2026.3.23-1", "2026.3.22")).toBeGreaterThan(0);
    expect(compareOpenClawVersions("2026.3.23-1", "2026.3.23")).toBe(0);
  });

  it("treats suffixed 2026.3.22+ builds as supporting the public ACP runtime", () => {
    expect(supportsPublicAcpRuntime("2026.3.23-1")).toBe(true);
    expect(supportsPublicAcpRuntime(ACP_BRIDGE_FREE_VERSION_FLOOR)).toBe(true);
    expect(supportsPublicAcpRuntime("2026.3.21")).toBe(false);
  });

  it("matches exact and comparator version rules", () => {
    expect(matchesOpenClawVersionRule("2026.3.23-1", "2026.3.23")).toBe(true);
    expect(matchesOpenClawVersionRule("2026.3.23-1", ">=2026.3.22")).toBe(true);
    expect(matchesOpenClawVersionRule("2026.3.23-1", ">2026.3.23")).toBe(false);
  });

  it("matches allowlists that contain comparator rules", () => {
    expect(matchesOpenClawVersionAllowlist("2026.3.23-1", [">=2026.3.22"])).toBe(true);
    expect(matchesOpenClawVersionAllowlist("2026.3.21", [">=2026.3.22"])).toBe(false);
  });
});
