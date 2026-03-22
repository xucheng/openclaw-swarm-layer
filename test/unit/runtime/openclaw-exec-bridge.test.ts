import {
  dedupeStrings,
  deriveDoctorNextAction,
  deriveDoctorRemediation,
  deriveDoctorSeverity,
  waitForAcpBackendHealthy,
} from "../../../src/runtime/openclaw-exec-bridge.js";
import { INTERNAL_MODULES_BY_VERSION, buildPatchedBridgeModuleSource } from "../../../src/runtime/bridge-manifest.js";

describe("openclaw exec bridge", () => {
  it("includes mappings for tested OpenClaw versions", () => {
    expect(INTERNAL_MODULES_BY_VERSION["2026.2.26"]).toBeDefined();
    expect(INTERNAL_MODULES_BY_VERSION["2026.3.13"]).toBeDefined();
  });

  it("waits until an ACP backend reports healthy", async () => {
    let calls = 0;
    await expect(
      waitForAcpBackendHealthy(() => {
        calls += 1;
        if (calls < 2) {
          return { healthy: () => false };
        }
        return { healthy: () => true };
      }, "acpx", 1000, 1),
    ).resolves.toBeUndefined();
  });

  it("fails clearly when an ACP backend never becomes healthy", async () => {
    await expect(
      waitForAcpBackendHealthy(() => ({ healthy: () => false }), "acpx", 5, 1),
    ).rejects.toThrow("ACP runtime backend is currently unavailable");
  });

  it("appends a subagent bridge export when patching internal modules", () => {
    const source = "function spawnSubagentDirect(){}";
    const patched = buildPatchedBridgeModuleSource(source);

    expect(patched).toContain("__bridgeSpawnSubagentDirect");
  });

  it("derives remediation for version drift and backend failures", () => {
    const remediation = deriveDoctorRemediation({
      ok: false,
      openclawRoot: "/opt/openclaw",
      version: "2026.4.0",
      compatibility: {
        supportedRunners: [],
        replacementCandidates: [],
        notes: [],
      },
      publicApi: {
        acpControlPlaneExport: false,
        subagentSpawnExport: false,
        readyReplacementPoints: [],
      },
      replacementPlan: [],
      migrationChecklist: [],
      checks: {
        versionMapped: false,
        versionAllowed: false,
        internalModuleResolved: false,
        acpBackendHealthy: false,
        subagentPatchable: false,
      },
      blockers: [
        "OpenClaw version 2026.4.0 is not in bridge allowlist (2026.3.13)",
        "ACP runtime backend is currently unavailable. Try again in a moment. (backend: acpx)",
      ],
      warnings: [],
      risks: [],
    });

    expect(remediation.some((item) => item.includes("versionAllow"))).toBe(true);
    expect(remediation.some((item) => item.includes("acpx plugin"))).toBe(true);
  });

  it("derives severity and next action for doctor output", () => {
    const report = {
      ok: false,
      openclawRoot: "/opt/openclaw",
      version: "2026.4.0",
      compatibility: {
        supportedRunners: [],
        replacementCandidates: [],
        notes: [],
      },
      publicApi: {
        acpControlPlaneExport: false,
        subagentSpawnExport: false,
        readyReplacementPoints: [],
      },
      replacementPlan: [],
      migrationChecklist: [],
      checks: {
        versionMapped: false,
        versionAllowed: false,
        internalModuleResolved: false,
        acpBackendHealthy: false,
        subagentPatchable: false,
      },
      blockers: ["OpenClaw version 2026.4.0 is not in bridge allowlist (2026.3.13)"],
      warnings: [],
      risks: [],
      remediation: ["Update bridge.versionAllow to include the current OpenClaw version, or switch back to a tested version."],
    };

    expect(deriveDoctorSeverity(report as any)).toBe("blocked");
    expect(deriveDoctorNextAction(report as any)).toContain("Update bridge.versionAllow");
  });

  it("deduplicates repeated diagnostic strings", () => {
    expect(dedupeStrings(["a", "b", "a"])).toEqual(["a", "b"]);
  });
});
