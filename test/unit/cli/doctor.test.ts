import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runSwarmDoctor } from "../../../src/cli/swarm-doctor.js";

describe("swarm doctor cli", () => {
  it("reports public-api-only status when ACP is enabled but the public export is unavailable", async () => {
    const result = await runSwarmDoctor(
      {},
      { config: { acp: { enabled: true }, bridge: { enabled: false } } as any, runtime: { version: "2026.3.24" } as any },
      undefined,
      vi.fn(async () => ({
        acpControlPlaneExport: false,
        subagentSpawnExport: false,
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
    expect(result.warnings).toContain("Subagent posture: legacy bridge-backed opt-in (disabled by default).");
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

  it("returns a warning-only report when ACP is disabled and subagent bridge is off", async () => {
    const result = await runSwarmDoctor(
      {},
      { config: { acp: { enabled: false }, bridge: { enabled: false } } as any },
      undefined,
      vi.fn(async () => ({
        acpControlPlaneExport: false,
        subagentSpawnExport: false,
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

  it("runs the bridge doctor command when subagent bridge mode is enabled", async () => {
    const commandRunner = vi.fn(async () => ({
      code: 0,
      stdout: JSON.stringify({
        result: {
          ok: true,
          openclawRoot: "/opt/openclaw",
          version: "2026.3.13",
          compatibility: {
            strategy: "internal-bundle",
            testedAt: "2026-03-21",
            supportedRunners: ["subagent"],
            replacementCandidates: ["spawnSubagentDirect"],
            notes: ["tested"],
          },
          publicApi: {
            acpControlPlaneExport: true,
            subagentSpawnExport: false,
            readyReplacementPoints: ["acp:getAcpSessionManager"],
          },
          replacementPlan: [],
          migrationChecklist: [],
          checks: {
            versionMapped: true,
            versionAllowed: true,
            internalModuleResolved: true,
            acpBackendHealthy: true,
            subagentPatchable: true,
          },
          blockers: [],
          warnings: [],
          risks: [],
          remediation: [],
          nextAction: "Bridge checks passed.",
          severity: "healthy",
        },
      }),
      stderr: "",
    }));

    const result = await runSwarmDoctor(
      {},
      {
        config: {
          acp: {
            enabled: true,
          },
          subagent: {
            enabled: true,
          },
          bridge: {
            subagentEnabled: true,
            nodePath: "/usr/bin/node",
            openclawRoot: "/opt/openclaw",
            versionAllow: ["2026.3.13"],
          },
        } as any,
      },
      commandRunner as any,
    );

    expect(result.ok).toBe(true);
    expect(commandRunner).toHaveBeenCalledTimes(1);
    expect(result.severity).toBe("healthy");
    expect(result.warnings).toContain("Default runner resolution: auto -> acp on this install.");
    expect(result.warnings).toContain("Manual runner remains the safe explicit fallback.");
    expect(result.warnings).toContain("ACP execution posture: public control-plane only.");
    expect(result.warnings).toContain("ACP automation now depends on the public control-plane path only.");
    expect(result.warnings).toContain("ACP bridge exit gate: current install 2026.3.13 is below the bridge-free support floor >=2026.3.22.");
    expect(result.acpBridgeExitGate.versionSatisfied).toBe(false);
    expect(result.acpBridgeExitGate.publicControlPlaneExportReady).toBe(true);
    expect(result.acpBridgeExitGate.readyForBridgeRemoval).toBe(false);
    expect(result.nextAction).toBe("Use the ACP public control-plane path as the supported execution path.");
  });

  it("surfaces remediation returned by the subagent bridge doctor", async () => {
    const commandRunner = vi.fn(async () => ({
      code: 0,
      stdout: JSON.stringify({
        result: {
          ok: false,
          openclawRoot: "/opt/openclaw",
          version: "2026.3.99",
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
            acpBackendHealthy: true,
            subagentPatchable: false,
          },
          blockers: ["OpenClaw version 2026.3.99 is not in bridge allowlist"],
          warnings: [],
          risks: ["bridge mode depends on internal aliases"],
          remediation: ["Update bridge.versionAllow"],
          nextAction: "Update bridge.versionAllow",
          severity: "blocked",
        },
      }),
      stderr: "",
    }));

    const result = await runSwarmDoctor(
      {},
      {
        config: {
          subagent: { enabled: true },
          bridge: {
            subagentEnabled: true,
            nodePath: "/usr/bin/node",
            openclawRoot: "/opt/openclaw",
            versionAllow: ["2026.3.13"],
          },
        } as any,
      },
      commandRunner as any,
    );

    expect(result.ok).toBe(false);
    expect(result.remediation).toContain("Update bridge.versionAllow");
    expect(result.nextAction).toContain("versionAllow");
  });

  it("marks subagent as legacy bridge-backed when enabled without bridge support", async () => {
    const result = await runSwarmDoctor(
      {},
      { config: { subagent: { enabled: true }, bridge: { enabled: false } } as any },
      undefined,
      vi.fn(async () => ({
        acpControlPlaneExport: false,
        subagentSpawnExport: false,
        readyReplacementPoints: [],
        notes: [],
      })) as any,
    );

    expect(result.warnings).toContain("Subagent posture: legacy bridge-backed opt-in (bridge not enabled).");
    expect(result.compatibility.notes).toContain("Subagent posture: legacy bridge-backed opt-in (bridge not enabled).");
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
      undefined,
      vi.fn(async () => ({
        acpControlPlaneExport: false,
        subagentSpawnExport: false,
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
      undefined,
      vi.fn(async () => ({
        acpControlPlaneExport: true,
        subagentSpawnExport: false,
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
