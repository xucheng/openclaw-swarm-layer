import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runSwarmDoctor } from "../../../src/cli/swarm-doctor.js";

describe("swarm doctor cli", () => {
  it("reports public-api-only status when ACP is enabled but the public export is unavailable", async () => {
    const result = await runSwarmDoctor(
      {},
      { config: { acp: { enabled: true }, bridge: { enabled: false } } as any, runtime: { version: "2026.3.24" } as any },
      vi.fn(async () => ({
        acpControlPlaneExport: false,
        readyReplacementPoints: [],
        notes: ["Public ACP runtime SDK does not expose getAcpSessionManager()."],
      })) as any,
    );

    expect(result.ok).toBe(false);
    expect(result.severity).toBe("blocked");
    expect(result.blockers[0]).toContain("public ACP control-plane export is not available");
    expect(result.warnings[0]).toContain("ACP bridge has been removed");
    expect(result.warnings).toContain("Default runner resolution: auto -> manual on this install.");
    expect(result.warnings).toContain("Manual runner remains the safe explicit fallback.");
    expect(result.warnings).toContain("ACP execution posture: public control-plane only.");
    expect(result.warnings).toContain("ACP automation is unavailable on this install until the public control-plane export is ready.");
    expect(result.warnings).toContain("Bridge-free ACP floor: >=2026.3.22.");
    expect(result.warnings).toContain("OpenClaw runtime version: 2026.3.24.");
    expect(result.warnings).toContain("ACP bridge exit gate: version floor satisfied, but the public ACP export is not ready on this install.");
    expect(result.acpBridgeExitGate.minimumVersion).toBe("2026.3.22");
    expect(result.acpBridgeExitGate.currentVersion).toBe("2026.3.24");
    expect(result.acpBridgeExitGate.versionSatisfied).toBe(true);
    expect(result.acpBridgeExitGate.publicControlPlaneExportReady).toBe(false);
    expect(result.acpBridgeExitGate.readyForBridgeRemoval).toBe(false);
    expect(result.acpBridgeExitGate.evidenceMode).toBe("doctor");
    expect(result.migrationChecklist[0]).toContain("swarm doctor");
  });

  it("returns a warning-only report when ACP is disabled", async () => {
    const result = await runSwarmDoctor(
      {},
      { config: { acp: { enabled: false }, bridge: { enabled: false } } as any },
      vi.fn(async () => ({
        acpControlPlaneExport: false,
        readyReplacementPoints: [],
        notes: [],
      })) as any,
    );

    expect(result.ok).toBe(true);
    expect(result.severity).toBe("warning");
    expect(result.blockers).toEqual([]);
    expect(result.warnings).toContain("Default runner resolution: auto -> manual on this install.");
    expect(result.warnings).toContain("ACP is disabled in plugin config; manual runner remains the safe fallback.");
  });

  it("warns when legacy ACP bridge config is still present", async () => {
    const result = await runSwarmDoctor(
      {},
      {
        config: {
          acp: { enabled: true },
          bridge: { acpFallbackEnabled: true },
        } as any,
      },
      vi.fn(async () => ({
        acpControlPlaneExport: false,
        readyReplacementPoints: [],
        notes: [],
      })) as any,
    );

    expect(result.warnings).toContain(
      "ACP bridge fallback config is legacy and ignored; ACP automation now requires the public control-plane path.",
    );
    expect(result.nextAction).toBe(
      "Keep manual runner as the baseline until the public ACP control-plane export is ready on this install.",
    );
  });

  it("surfaces public api replacement readiness from public-api-only mode", async () => {
    const result = await runSwarmDoctor(
      {},
      { config: { bridge: { enabled: false } } as any, runtime: { version: "2026.3.24" } as any },
      vi.fn(async () => ({
        acpControlPlaneExport: true,
        readyReplacementPoints: ["acp:getAcpSessionManager"],
        notes: ["Public ACP runtime SDK exposes getAcpSessionManager(); ACP public control-plane execution is available."],
      })) as any,
    );

    expect(result.ok).toBe(true);
    expect(result.publicApi.acpControlPlaneExport).toBe(true);
    expect(result.replacementPlan[0]?.status).toBe("complete");
    expect(result.migrationChecklist[1]).toContain("[acp] Keep real-openclaw-session-adapter");
    expect(result.acpBridgeExitGate.readyForBridgeRemoval).toBe(true);
  });

  it("detects the ACP public export from the host OpenClaw sdk when bare package imports are unavailable", async () => {
    const openclawRoot = mkdtempSync(path.join(tmpdir(), "swarm-doctor-openclaw-root-"));
    mkdirSync(path.join(openclawRoot, "dist", "plugin-sdk"), { recursive: true });
    writeFileSync(
      path.join(openclawRoot, "dist", "plugin-sdk", "index.js"),
      "export const registerContextEngine = () => null;\n",
      "utf8",
    );
    writeFileSync(
      path.join(openclawRoot, "dist", "plugin-sdk", "acp-runtime.js"),
      "export function getAcpSessionManager() { return null; }\n",
      "utf8",
    );

    try {
      const result = await runSwarmDoctor(
        {},
        {
          config: {
            acp: { enabled: true },
            bridge: { enabled: false, openclawRoot },
          } as any,
          runtime: { version: "2026.3.24" } as any,
        },
      );

      expect(result.ok).toBe(true);
      expect(result.publicApi.acpControlPlaneExport).toBe(true);
      expect(result.replacementPlan[0]?.status).toBe("complete");
      expect(result.warnings).toContain("Default runner resolution: auto -> acp on this install.");
      expect(result.acpBridgeExitGate.readyForBridgeRemoval).toBe(true);
      expect(result.nextAction).toBe("Use the ACP public control-plane path as the supported execution path.");
    } finally {
      rmSync(openclawRoot, { recursive: true, force: true });
    }
  });
});
