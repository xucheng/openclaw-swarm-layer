import { runSwarmDoctor } from "../../../src/cli/swarm-doctor.js";

describe("swarm doctor cli", () => {
  it("reports public-api-only status when bridge fallback is disabled", async () => {
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
    expect(result.blockers[0]).toContain("ACP is enabled");
    expect(result.warnings[0]).toContain("public API readiness only");
    expect(result.warnings).toContain("Default runner resolution: auto -> manual on this install.");
    expect(result.warnings).toContain("Manual runner remains the safe explicit fallback.");
    expect(result.warnings).toContain("ACP execution posture: public control-plane primary without bridge fallback.");
    expect(result.warnings).toContain("ACP bridge fallback is disabled; automated ACP execution must use the public control-plane path.");
    expect(result.warnings).toContain("Subagent posture: experimental (disabled by default).");
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

  it("returns a warning-only report when ACP is disabled and bridge fallback is off", async () => {
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

  it("runs the bridge doctor command when bridge mode is enabled", async () => {
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
            supportedRunners: ["acp", "subagent"],
            replacementCandidates: ["getAcpSessionManager", "spawnSubagentDirect"],
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
          bridge: {
            acpFallbackEnabled: true,
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
    expect(result.warnings).toContain("ACP execution posture: public control-plane primary with bridge compatibility fallback.");
    expect(result.warnings).toContain("ACP bridge fallback is enabled for compatibility only; keep the public ACP control-plane as the normal execution path.");
    expect(result.warnings).toContain("ACP bridge exit gate: current install 2026.3.13 is below the bridge-free support floor >=2026.3.22.");
    expect(result.acpBridgeExitGate.versionSatisfied).toBe(false);
    expect(result.acpBridgeExitGate.publicControlPlaneExportReady).toBe(true);
    expect(result.acpBridgeExitGate.readyForBridgeRemoval).toBe(false);
    expect(result.nextAction).toBe("Keep ACP public control-plane as the default path; retain bridge only for compatibility fallback.");
  });

  it("surfaces remediation returned by the bridge doctor", async () => {
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
            acpBackendHealthy: false,
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
          bridge: {
            acpFallbackEnabled: true,
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

  it("marks subagent as experimental when it is enabled explicitly", async () => {
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

    expect(result.warnings).toContain("Subagent posture: experimental (enabled explicitly).");
    expect(result.compatibility.notes).toContain("Subagent posture: experimental (enabled explicitly).");
  });

  it("marks ACP bridge as legacy fallback when the public export is still missing", async () => {
    const result = await runSwarmDoctor(
      {},
      {
        config: {
          acp: { enabled: true },
          bridge: { acpFallbackEnabled: true },
        } as any,
      },
      vi.fn(async () => ({
        code: 0,
        stdout: JSON.stringify({
          result: {
            ok: true,
            openclawRoot: "/opt/openclaw",
            compatibility: {
              supportedRunners: ["acp"],
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
            checks: {},
            blockers: [],
            warnings: [],
            risks: [],
            remediation: [],
            nextAction: "Bridge checks passed.",
            severity: "healthy",
          },
        }),
        stderr: "",
      })) as any,
    );

    expect(result.warnings).toContain(
      "ACP bridge fallback is enabled as a legacy compatibility path because the public ACP control-plane export is not ready.",
    );
    expect(result.nextAction).toBe("Use bridge only as a legacy ACP compatibility fallback until the public control-plane export is ready.");
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
        notes: ["Public ACP runtime SDK exposes getAcpSessionManager(); ACP bridge replacement is now technically possible."],
      })) as any,
    );

    expect(result.ok).toBe(true);
    expect(result.publicApi.acpControlPlaneExport).toBe(true);
    expect(result.replacementPlan[0]?.status).toBe("ready");
    expect(result.migrationChecklist[1]).toContain("[acp] Replace");
    expect(result.acpBridgeExitGate.readyForBridgeRemoval).toBe(true);
  });
});
