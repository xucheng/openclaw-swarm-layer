import { runSwarmDoctor } from "../../src/cli/swarm-doctor.js";

describe("e2e: bridge doctor", () => {
  it("returns a structured doctor result via bridge runner", async () => {
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
      (async () => ({
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
                targetImplementation: "real-openclaw-session-adapter via public acp-runtime export",
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
                targetImplementation: "public subagent spawn helper from plugin-sdk export",
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
            risks: ["bridge mode depends on internal aliases"],
            remediation: [],
            nextAction: "Bridge checks passed.",
            severity: "healthy",
          },
        }),
        stderr: "",
      })) as any,
    );

    expect(result.ok).toBe(true);
    expect(result.checks.acpBackendHealthy).toBe(true);
    expect(result.severity).toBe("healthy");
    expect(result.migrationChecklist[1]).toContain("[acp] Keep");
  });

  it("returns remediation for a simulated version drift case", async () => {
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
      (async () => ({
        code: 0,
        stdout: JSON.stringify({
          result: {
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
            risks: ["bridge mode depends on internal aliases"],
            remediation: ["Update bridge.versionAllow to include the current OpenClaw version or a compatible range such as >=2026.3.22."],
            nextAction: "Update bridge.versionAllow to include the current OpenClaw version or a compatible range such as >=2026.3.22.",
            severity: "blocked",
          },
        }),
        stderr: "",
      })) as any,
    );

    expect(result.ok).toBe(false);
    expect(result.remediation[0]).toContain("Update bridge.versionAllow");
    expect(result.severity).toBe("blocked");
    expect(result.migrationChecklist).toEqual([]);
  });
});
