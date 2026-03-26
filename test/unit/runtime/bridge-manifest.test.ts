import { INTERNAL_MODULES_BY_VERSION, resolveBridgeCompatibility, resolveInternalModuleSpec } from "../../../src/runtime/bridge-manifest.js";

describe("bridge manifest", () => {
  it("resolves module specs for tested versions", () => {
    expect(resolveInternalModuleSpec("2026.3.13")).toEqual(INTERNAL_MODULES_BY_VERSION["2026.3.13"]);
    expect(resolveInternalModuleSpec("2026.3.22")).toEqual(INTERNAL_MODULES_BY_VERSION["2026.3.22"]);
    expect(resolveInternalModuleSpec("2026.3.23-1")).toEqual(INTERNAL_MODULES_BY_VERSION["2026.3.23-1"]);
    expect(resolveInternalModuleSpec("2026.3.23-hotfix")).toEqual(INTERNAL_MODULES_BY_VERSION["2026.3.23"]);
    expect(resolveInternalModuleSpec("2026.3.24")).toEqual(INTERNAL_MODULES_BY_VERSION["2026.3.24"]);
  });

  it("exposes compatibility metadata for tested versions", () => {
    const compatibility = resolveBridgeCompatibility("2026.3.22");

    expect(compatibility?.strategy).toBe("internal-bundle");
    expect(compatibility?.supportedRunners).toEqual(["acp", "subagent"]);
    expect(compatibility?.replacementCandidates.acpControlPlaneExport).toBe("getAcpSessionManager");
  });

  it("normalizes OpenClaw build suffixes when resolving compatibility", () => {
    const compatibility = resolveBridgeCompatibility("2026.3.23-1");

    expect(compatibility?.strategy).toBe("internal-bundle");
    expect(compatibility?.supportedRunners).toEqual(["acp", "subagent"]);
  });

  it("reuses the post-2026.3.22 bridge family for later patch releases", () => {
    const compatibility = resolveBridgeCompatibility("2026.3.24");

    expect(compatibility?.strategy).toBe("internal-bundle");
    expect(compatibility?.supportedRunners).toEqual(["acp", "subagent"]);
  });
});
