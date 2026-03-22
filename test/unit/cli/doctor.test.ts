import { runSwarmDoctor } from "../../../src/cli/swarm-doctor.js";

describe("swarm doctor cli", () => {
  it("returns a disabled report when bridge mode is off", async () => {
    const result = await runSwarmDoctor({}, { config: { bridge: { enabled: false } } as any });

    expect(result.ok).toBe(false);
    expect(result.blockers).toContain("bridge.enabled=false");
    expect(result.remediation[0]).toContain("Enable");
    expect(result.severity).toBe("blocked");
    expect(result.migrationChecklist[0]).toContain("Enable bridge mode first");
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
            acpControlPlaneExport: false,
            subagentSpawnExport: false,
            readyReplacementPoints: [],
          },
          replacementPlan: [
            {
              runner: "acp",
              publicExport: "getAcpSessionManager",
              available: false,
              status: "blocked",
              currentImplementation: "bridge-openclaw-session-adapter -> openclaw-exec-bridge",
              targetImplementation: "real-openclaw-session-adapter via top-level public plugin-sdk export",
              affectedModules: [
                "src/runtime/bridge-openclaw-session-adapter.ts",
                "src/runtime/openclaw-exec-bridge.ts",
                "src/runtime/real-openclaw-session-adapter.ts",
              ],
              nextStep: "Keep using the bridge-backed ACP adapter until a public control-plane export is available.",
            },
            {
              runner: "subagent",
              publicExport: "spawnSubagentDirect",
              available: false,
              status: "blocked",
              currentImplementation: "bridge-openclaw-subagent-adapter -> openclaw-exec-bridge patched helpers",
              targetImplementation: "public subagent spawn helper from top-level plugin-sdk export",
              affectedModules: [
                "src/runtime/bridge-openclaw-subagent-adapter.ts",
                "src/runtime/openclaw-exec-bridge.ts",
              ],
              nextStep: "Keep using the bridge-backed subagent adapter until a public spawn export is available.",
            },
          ],
          migrationChecklist: [
            "Run `openclaw swarm doctor --json` before changing bridge or public API integration code.",
            "[acp] Keep the current bridge path until the public export getAcpSessionManager is available.",
            "[subagent] Keep the current bridge path until the public export spawnSubagentDirect is available.",
            "After any replacement, rerun unit tests, e2e regressions, and at least one live smoke before relaxing bridge guards.",
          ],
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
          bridge: {
            enabled: true,
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
    expect(result.migrationChecklist[1]).toContain("[acp] Keep");
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
            enabled: true,
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

  it("returns warning guidance when bridge config is unpinned but still usable", async () => {
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
            acpControlPlaneExport: false,
            subagentSpawnExport: false,
            readyReplacementPoints: [],
          },
          replacementPlan: [
            {
              runner: "acp",
              publicExport: "getAcpSessionManager",
              available: false,
              status: "blocked",
              currentImplementation: "bridge-openclaw-session-adapter -> openclaw-exec-bridge",
              targetImplementation: "real-openclaw-session-adapter via top-level public plugin-sdk export",
              affectedModules: [
                "src/runtime/bridge-openclaw-session-adapter.ts",
                "src/runtime/openclaw-exec-bridge.ts",
                "src/runtime/real-openclaw-session-adapter.ts",
              ],
              nextStep: "Keep using the bridge-backed ACP adapter until a public control-plane export is available.",
            },
            {
              runner: "subagent",
              publicExport: "spawnSubagentDirect",
              available: false,
              status: "blocked",
              currentImplementation: "bridge-openclaw-subagent-adapter -> openclaw-exec-bridge patched helpers",
              targetImplementation: "public subagent spawn helper from top-level plugin-sdk export",
              affectedModules: [
                "src/runtime/bridge-openclaw-subagent-adapter.ts",
                "src/runtime/openclaw-exec-bridge.ts",
              ],
              nextStep: "Keep using the bridge-backed subagent adapter until a public spawn export is available.",
            },
          ],
          migrationChecklist: [
            "Run `openclaw swarm doctor --json` before changing bridge or public API integration code.",
            "[acp] Keep the current bridge path until the public export getAcpSessionManager is available.",
            "[subagent] Keep the current bridge path until the public export spawnSubagentDirect is available.",
            "After any replacement, rerun unit tests, e2e regressions, and at least one live smoke before relaxing bridge guards.",
          ],
          checks: {
            versionMapped: true,
            versionAllowed: true,
            internalModuleResolved: true,
            acpBackendHealthy: true,
            subagentPatchable: true,
          },
          blockers: [],
          warnings: ["bridge.versionAllow is empty; version drift risk is high"],
          risks: ["bridge mode depends on internal aliases"],
          remediation: ["Pin bridge.versionAllow to the exact OpenClaw versions you have validated."],
          nextAction: "Pin bridge.versionAllow to the exact OpenClaw versions you have validated.",
          severity: "warning",
        },
      }),
      stderr: "",
    }));

    const result = await runSwarmDoctor(
      {},
      {
        config: {
          bridge: {
            enabled: true,
            nodePath: "/usr/bin/node",
            openclawRoot: "/opt/openclaw",
            versionAllow: [],
          },
        } as any,
      },
      commandRunner as any,
    );

    expect(result.severity).toBe("warning");
    expect(result.remediation[0]).toContain("Pin bridge.versionAllow");
  });

  it("surfaces public api replacement readiness from doctor output", async () => {
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
          replacementPlan: [
            {
              runner: "acp",
              publicExport: "getAcpSessionManager",
              available: true,
              status: "ready",
              currentImplementation: "bridge-openclaw-session-adapter -> openclaw-exec-bridge",
              targetImplementation: "real-openclaw-session-adapter via top-level public plugin-sdk export",
              affectedModules: [
                "src/runtime/bridge-openclaw-session-adapter.ts",
                "src/runtime/openclaw-exec-bridge.ts",
                "src/runtime/real-openclaw-session-adapter.ts",
              ],
              nextStep: "Prototype replacing the ACP bridge control-plane path with the public export.",
            },
            {
              runner: "subagent",
              publicExport: "spawnSubagentDirect",
              available: false,
              status: "blocked",
              currentImplementation: "bridge-openclaw-subagent-adapter -> openclaw-exec-bridge patched helpers",
              targetImplementation: "public subagent spawn helper from top-level plugin-sdk export",
              affectedModules: [
                "src/runtime/bridge-openclaw-subagent-adapter.ts",
                "src/runtime/openclaw-exec-bridge.ts",
              ],
              nextStep: "Keep using the bridge-backed subagent adapter until a public spawn export is available.",
            },
          ],
          migrationChecklist: [
            "Run `openclaw swarm doctor --json` before changing bridge or public API integration code.",
            "[acp] Replace bridge-openclaw-session-adapter -> openclaw-exec-bridge with real-openclaw-session-adapter via top-level public plugin-sdk export. Update modules: src/runtime/bridge-openclaw-session-adapter.ts, src/runtime/openclaw-exec-bridge.ts, src/runtime/real-openclaw-session-adapter.ts.",
            "[subagent] Keep the current bridge path until the public export spawnSubagentDirect is available.",
            "After any replacement, rerun unit tests, e2e regressions, and at least one live smoke before relaxing bridge guards.",
          ],
          checks: {
            versionMapped: true,
            versionAllowed: true,
            internalModuleResolved: true,
            acpBackendHealthy: true,
            subagentPatchable: true,
          },
          blockers: [],
          warnings: ["Top-level public plugin SDK exposes getAcpSessionManager(); ACP bridge replacement is now technically possible."],
          risks: ["bridge mode depends on internal aliases"],
          remediation: ["Address bridge warnings to reduce upgrade and compatibility risk before relying on bridge mode broadly."],
          nextAction: "Address bridge warnings to reduce upgrade and compatibility risk before relying on bridge mode broadly.",
          severity: "warning",
        },
      }),
      stderr: "",
    }));

    const result = await runSwarmDoctor(
      {},
      {
        config: {
          bridge: {
            enabled: true,
            nodePath: "/usr/bin/node",
            openclawRoot: "/opt/openclaw",
            versionAllow: ["2026.3.13"],
          },
        } as any,
      },
      commandRunner as any,
    );

    expect(result.publicApi.acpControlPlaneExport).toBe(true);
    expect(result.publicApi.readyReplacementPoints).toContain("acp:getAcpSessionManager");
    expect(result.compatibility.replacementCandidates).toContain("getAcpSessionManager");
    expect(result.replacementPlan[0]?.status).toBe("ready");
    expect(result.migrationChecklist[1]).toContain("[acp] Replace");
  });
});
