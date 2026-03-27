import { ACP_BRIDGE_FREE_VERSION_FLOOR, compareOpenClawVersions, normalizeOpenClawVersion } from "./openclaw-version.js";

export type AcpBridgeExitSmokeCheck = {
  id: string;
  label: string;
  command: string;
  purpose: string;
  expectedArtifacts?: string[];
};

export type AcpBridgeExitDependency = {
  id: string;
  module: string;
  reason: string;
  blocksAcpBridgeRemoval: boolean;
};

export type AcpBridgeExitGate = {
  minimumVersion: string;
  currentVersion: string | null;
  versionSatisfied: boolean | null;
  publicControlPlaneExportReady: boolean | null;
  readyForBridgeRemoval: boolean;
  evidenceMode: "doctor" | "runtime-version-only";
  liveSmokeMatrix: AcpBridgeExitSmokeCheck[];
  remainingBridgeDependencies: AcpBridgeExitDependency[];
};

export const ACP_BRIDGE_EXIT_LIVE_SMOKE_MATRIX: AcpBridgeExitSmokeCheck[] = [
  {
    id: "acp-backend-direct",
    label: "ACP backend direct route",
    command: "~/.openclaw/scripts/openclaw-acp-post-upgrade-smoke.sh",
    purpose: "Validate the ACP backend, default agent wiring, and configured direct route before plugin-level ACP checks.",
  },
  {
    id: "swarm-doctor",
    label: "Swarm doctor",
    command: "openclaw swarm doctor --json",
    purpose: "Confirm default-runner resolution, public ACP export readiness, and ACP bridge-exit gate status.",
  },
  {
    id: "swarm-init-plan-status",
    label: "Swarm init / plan / status",
    command: "openclaw swarm init --project <path> && openclaw swarm plan --project <path> --spec <spec> && openclaw swarm status --project <path>",
    purpose: "Validate project bootstrap and operator visibility on the target install.",
    expectedArtifacts: [
      "<project>/.openclaw/swarm/workflow-state.json",
      "<project>/.openclaw/swarm/reports/specs/<specId>.md",
      "<obsidianRoot>/<project>-swarm-report.md",
      "<obsidianRoot>/<project>/specs/<specId>.md",
    ],
  },
  {
    id: "swarm-dry-run",
    label: "Swarm dry-run",
    command: "openclaw swarm run --project <path> --dry-run --json",
    purpose: "Confirm the resolved default runner selects ACP without needing bridge fallback.",
  },
  {
    id: "swarm-live-run",
    label: "Swarm live ACP run",
    command: "openclaw swarm run --project <path> --json",
    purpose: "Exercise the public ACP control-plane through a real task dispatch.",
    expectedArtifacts: [
      "<project>/.openclaw/swarm/reports/run-log.md",
      "<obsidianRoot>/<project>/run-log.md",
    ],
  },
  {
    id: "swarm-session-lifecycle",
    label: "Swarm session lifecycle",
    command: "openclaw swarm session status --project <path> --run <runId> --json && openclaw swarm session cancel --project <path> --run <runId> --json && openclaw swarm session close --project <path> --run <runId> --json",
    purpose: "Validate ACP session status, cancel, and close on the public path before bridge removal.",
  },
  {
    id: "swarm-review-report-journal",
    label: "Swarm review / report / journal sync",
    command: "openclaw swarm review --project <path> --task <taskId> --approve --json && openclaw swarm report --project <path> --json",
    purpose: "Validate report generation and the complete Obsidian mirror structure for smoke runs with journaling enabled.",
    expectedArtifacts: [
      "<obsidianRoot>/<project>-swarm-report.md",
      "<obsidianRoot>/<project>/run-log.md",
      "<obsidianRoot>/<project>/review-log.md",
      "<obsidianRoot>/<project>/completion-summary.md",
      "<obsidianRoot>/<project>/specs/<specId>.md",
    ],
  },
];

export const ACP_BRIDGE_REMOVAL_DEPENDENCIES: AcpBridgeExitDependency[] = [];

export function buildAcpBridgeExitGate(
  runtimeVersion?: string | null,
  options: {
    publicControlPlaneExportReady?: boolean | null;
    evidenceMode?: "doctor" | "runtime-version-only";
  } = {},
): AcpBridgeExitGate {
  const normalizedVersion = normalizeOpenClawVersion(runtimeVersion) ?? runtimeVersion?.trim() ?? null;
  const compared = normalizedVersion ? compareOpenClawVersions(normalizedVersion, ACP_BRIDGE_FREE_VERSION_FLOOR) : null;
  const versionSatisfied = compared === null ? null : compared >= 0;
  const publicControlPlaneExportReady =
    options.publicControlPlaneExportReady === undefined ? null : options.publicControlPlaneExportReady;
  const evidenceMode = options.evidenceMode ?? "runtime-version-only";

  return {
    minimumVersion: ACP_BRIDGE_FREE_VERSION_FLOOR,
    currentVersion: normalizedVersion,
    versionSatisfied,
    publicControlPlaneExportReady,
    readyForBridgeRemoval: versionSatisfied === true && publicControlPlaneExportReady === true,
    evidenceMode,
    liveSmokeMatrix: ACP_BRIDGE_EXIT_LIVE_SMOKE_MATRIX,
    remainingBridgeDependencies: ACP_BRIDGE_REMOVAL_DEPENDENCIES,
  };
}

export function formatAcpBridgeExitGateNotes(gate: AcpBridgeExitGate): string[] {
  const currentVersion = gate.currentVersion ?? "(unknown)";
  const readinessNote =
    gate.versionSatisfied === null
      ? `ACP bridge exit gate: runtime version is unknown; confirm OpenClaw >=${gate.minimumVersion} before removing ACP bridge.`
      : gate.versionSatisfied === false
        ? `ACP bridge exit gate: current install ${currentVersion} is below the bridge-free support floor >=${gate.minimumVersion}.`
        : gate.publicControlPlaneExportReady === true
          ? "ACP bridge exit gate: version floor satisfied and public ACP export is ready on this install."
          : gate.publicControlPlaneExportReady === false
            ? "ACP bridge exit gate: version floor satisfied, but the public ACP export is not ready on this install."
            : "ACP bridge exit gate: version floor satisfied; verify public ACP export readiness with swarm doctor before removing ACP bridge.";

  return [
    `Bridge-free ACP floor: >=${gate.minimumVersion}.`,
    `OpenClaw runtime version: ${currentVersion}.`,
    readinessNote,
    `ACP bridge removal blockers tracked: ${gate.remainingBridgeDependencies.length}.`,
  ];
}
