import { ACP_BRIDGE_FREE_VERSION_FLOOR } from "../../../src/runtime/openclaw-version.js";
import { buildAcpBridgeExitGate, formatAcpBridgeExitGateNotes } from "../../../src/runtime/acp-bridge-exit-gate.js";

describe("acp bridge exit gate", () => {
  it("captures the bridge-free floor, live smoke matrix, and remaining blockers", () => {
    const gate = buildAcpBridgeExitGate("2026.3.24", {
      publicControlPlaneExportReady: true,
      evidenceMode: "doctor",
    });

    expect(gate.minimumVersion).toBe(ACP_BRIDGE_FREE_VERSION_FLOOR);
    expect(gate.versionSatisfied).toBe(true);
    expect(gate.readyForBridgeRemoval).toBe(true);
    expect(gate.evidenceMode).toBe("doctor");
    expect(gate.liveSmokeMatrix.map((check) => check.id)).toEqual([
      "acp-backend-direct",
      "swarm-doctor",
      "swarm-init-plan-status",
      "swarm-dry-run",
      "swarm-live-run",
      "swarm-session-lifecycle",
      "swarm-review-report-journal",
    ]);
    expect(gate.liveSmokeMatrix.find((check) => check.id === "swarm-review-report-journal")?.expectedArtifacts).toEqual([
      "<obsidianRoot>/<project>-swarm-report.md",
      "<obsidianRoot>/<project>/run-log.md",
      "<obsidianRoot>/<project>/review-log.md",
      "<obsidianRoot>/<project>/completion-summary.md",
      "<obsidianRoot>/<project>/specs/<specId>.md",
    ]);
    expect(gate.remainingBridgeDependencies).toEqual([]);
  });

  it("formats runtime-version-only guidance when export readiness has not been probed", () => {
    const gate = buildAcpBridgeExitGate("2026.3.24");
    const notes = formatAcpBridgeExitGateNotes(gate);

    expect(notes).toContain("Bridge-free ACP floor: >=2026.3.22.");
    expect(notes).toContain("OpenClaw runtime version: 2026.3.24.");
    expect(notes).toContain(
      "ACP bridge exit gate: version floor satisfied; verify public ACP export readiness with swarm doctor before removing ACP bridge.",
    );
    expect(notes).toContain("ACP bridge removal blockers tracked: 0.");
  });
});
