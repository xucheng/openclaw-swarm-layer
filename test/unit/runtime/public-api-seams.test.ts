import {
  ACP_PUBLIC_REPLACEMENT_EXPORT,
  SUBAGENT_PUBLIC_REPLACEMENT_EXPORT,
  buildMigrationChecklist,
  buildReplacementPlan,
  detectPublicApiAvailability,
} from "../../../src/runtime/public-api-seams.js";

describe("public API seams", () => {
  it("reports missing top-level spawn/control helpers when sdk lacks them", async () => {
    const availability = await detectPublicApiAvailability({
      rootLoader: async () => ({}),
      acpRuntimeLoader: async () => ({}),
    });

    expect(availability.acpControlPlaneExport).toBe(false);
    expect(availability.subagentSpawnExport).toBe(false);
    expect(availability.readyReplacementPoints).toEqual([]);
    expect(availability.notes.length).toBeGreaterThan(0);
  });

  it("reports available helpers when sdk exposes them", async () => {
    const availability = await detectPublicApiAvailability({
      rootLoader: async () => ({
        spawnSubagentDirect() {
          return null;
        },
      }),
      acpRuntimeLoader: async () => ({
        getAcpSessionManager() {
          return null;
        },
      }),
    });

    expect(availability.acpControlPlaneExport).toBe(true);
    expect(availability.subagentSpawnExport).toBe(true);
    expect(availability.readyReplacementPoints).toEqual([
      `acp:${ACP_PUBLIC_REPLACEMENT_EXPORT}`,
      `subagent:${SUBAGENT_PUBLIC_REPLACEMENT_EXPORT}`,
    ]);
    expect(availability.notes.some((note) => note.includes("public control-plane execution is available"))).toBe(true);
  });

  it("builds a replacement plan from detected public availability", async () => {
    const availability = await detectPublicApiAvailability({
      rootLoader: async () => ({}),
      acpRuntimeLoader: async () => ({
        getAcpSessionManager() {
          return null;
        },
      }),
    });

    const plan = buildReplacementPlan(availability);

    expect(plan).toEqual([
      {
        runner: "acp",
        publicExport: ACP_PUBLIC_REPLACEMENT_EXPORT,
        available: true,
        status: "complete",
        currentImplementation: "real-openclaw-session-adapter via public acp-runtime export",
        targetImplementation: "public ACP control-plane as the supported execution path",
        affectedModules: [
          "src/cli/context.ts",
          "src/runtime/real-openclaw-session-adapter.ts",
        ],
        nextStep: "Keep ACP on the public control-plane path and avoid reintroducing bridge fallbacks.",
      },
      {
        runner: "subagent",
        publicExport: SUBAGENT_PUBLIC_REPLACEMENT_EXPORT,
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
    ]);
  });

  it("builds a staged migration checklist from the replacement plan", async () => {
    const availability = await detectPublicApiAvailability({
      rootLoader: async () => ({}),
      acpRuntimeLoader: async () => ({
        getAcpSessionManager() {
          return null;
        },
      }),
    });

    const checklist = buildMigrationChecklist(buildReplacementPlan(availability));

    expect(checklist[0]).toContain("swarm doctor");
    expect(checklist.some((item) => item.includes("[acp] Keep real-openclaw-session-adapter"))).toBe(true);
    expect(checklist.some((item) => item.includes("[subagent] Keep the current bridge path"))).toBe(true);
  });
});
