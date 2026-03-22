import { INTERNAL_MODULES_BY_VERSION, resolveBridgeCompatibility, resolveInternalModuleSpec } from "../../../src/runtime/bridge-manifest.js";

describe("bridge manifest", () => {
  it("resolves module specs for tested versions", () => {
    expect(resolveInternalModuleSpec("2026.3.13")).toEqual(INTERNAL_MODULES_BY_VERSION["2026.3.13"]);
  });

  it("exposes compatibility metadata for tested versions", () => {
    const compatibility = resolveBridgeCompatibility("2026.3.13");

    expect(compatibility?.strategy).toBe("internal-bundle");
    expect(compatibility?.supportedRunners).toEqual(["acp", "subagent"]);
    expect(compatibility?.replacementCandidates.acpControlPlaneExport).toBe("getAcpSessionManager");
  });
});
