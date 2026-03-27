import {
  defaultSwarmPluginConfig,
  describeAcpExecutionPosture,
  describeSubagentPosture,
  isBridgeEnabledForRunner,
  resolveSwarmPluginConfig,
  type SwarmPluginConfig,
} from "../config.js";
import {
  buildAcpBridgeExitGate,
  formatAcpBridgeExitGateNotes,
  type AcpBridgeExitGate,
} from "../runtime/acp-bridge-exit-gate.js";
import { resolveBridgeScriptPath, resolveTsxLoaderPath, runBridgeCommandDirect } from "../runtime/bridge-openclaw-session-adapter.js";
import {
  buildMigrationChecklist,
  buildReplacementPlan,
  detectPublicApiAvailability,
  type PublicApiAvailability,
} from "../runtime/public-api-seams.js";
import { type SwarmCliContext } from "./context.js";

type BridgeDoctorResult = {
  ok: boolean;
  severity: "healthy" | "warning" | "blocked";
  openclawRoot: string;
  version?: string;
  compatibility: {
    strategy?: "internal-bundle";
    testedAt?: string;
    supportedRunners: string[];
    replacementCandidates: string[];
    notes: string[];
  };
  publicApi: {
    acpControlPlaneExport: boolean;
    subagentSpawnExport: boolean;
    readyReplacementPoints: string[];
  };
  acpBridgeExitGate: AcpBridgeExitGate;
  replacementPlan: Array<{
    runner: "acp" | "subagent";
    publicExport: string;
    available: boolean;
    status: "ready" | "blocked";
    currentImplementation: string;
    targetImplementation: string;
    affectedModules: string[];
    nextStep: string;
  }>;
  migrationChecklist: string[];
  checks: Record<string, boolean>;
  blockers: string[];
  warnings: string[];
  risks: string[];
  remediation: string[];
  nextAction: string;
};

export type BridgeCommandRunner = typeof runBridgeCommandDirect;
type PublicApiDetector = typeof detectPublicApiAvailability;

function resolveEffectiveConfig(context?: SwarmCliContext): SwarmPluginConfig {
  if (context?.stateStore?.config) {
    return context.stateStore.config;
  }
  return resolveSwarmPluginConfig(context?.config ?? defaultSwarmPluginConfig);
}

function resolveContextRuntimeVersion(context?: SwarmCliContext): string | null | undefined {
  return context?.runtime?.version ?? context?.stateStore?.runtimeVersion ?? null;
}

function pushUnique(items: string[], value: string): string[] {
  return items.includes(value) ? items : [...items, value];
}

function resolveDoctorDefaultRunner(
  config: Pick<SwarmPluginConfig, "defaultRunner" | "acp" | "subagent" | "bridge">,
  result: Pick<BridgeDoctorResult, "publicApi">,
): "manual" | "acp" | "subagent" {
  if (config.defaultRunner === "auto") {
    return config.acp.enabled && (result.publicApi.acpControlPlaneExport || isBridgeEnabledForRunner(config, "acp"))
      ? "acp"
      : "manual";
  }
  if (config.defaultRunner === "subagent") {
    return config.subagent.enabled ? "subagent" : "manual";
  }
  return config.defaultRunner;
}

function annotateDefaultRunnerGuidance(
  result: BridgeDoctorResult,
  config: SwarmPluginConfig,
): BridgeDoctorResult {
  const resolvedDefaultRunner = resolveDoctorDefaultRunner(config, result);
  const resolutionNote = `Default runner resolution: ${config.defaultRunner} -> ${resolvedDefaultRunner} on this install.`;
  const fallbackNote = "Manual runner remains the safe explicit fallback.";

  return {
    ...result,
    compatibility: {
      ...result.compatibility,
      notes: [resolutionNote, fallbackNote].reduce(pushUnique, result.compatibility.notes),
    },
    warnings: [resolutionNote, fallbackNote].reduce(pushUnique, result.warnings),
  };
}

function annotateAcpBridgeExitGate(
  result: BridgeDoctorResult,
  runtimeVersion?: string | null,
): BridgeDoctorResult {
  const gate = buildAcpBridgeExitGate(result.version ?? runtimeVersion, {
    publicControlPlaneExportReady: result.publicApi.acpControlPlaneExport,
    evidenceMode: "doctor",
  });
  const gateNotes = formatAcpBridgeExitGateNotes(gate);

  return {
    ...result,
    acpBridgeExitGate: gate,
    compatibility: {
      ...result.compatibility,
      notes: gateNotes.reduce(pushUnique, result.compatibility.notes),
    },
    warnings: gateNotes.reduce(pushUnique, result.warnings),
  };
}

function annotateAcpBridgeContainment(
  result: BridgeDoctorResult,
  config: SwarmPluginConfig,
): BridgeDoctorResult {
  const postureNote = `ACP execution posture: ${describeAcpExecutionPosture(config)}.`;
  const acpBridgeEnabled = isBridgeEnabledForRunner(config, "acp");
  const guidanceNote = !config.acp.enabled
    ? undefined
    : acpBridgeEnabled
      ? result.publicApi.acpControlPlaneExport
        ? "ACP bridge fallback is enabled for compatibility only; keep the public ACP control-plane as the normal execution path."
        : "ACP bridge fallback is enabled as a legacy compatibility path because the public ACP control-plane export is not ready."
      : "ACP bridge fallback is disabled; automated ACP execution must use the public control-plane path.";

  let nextAction = result.nextAction;
  if (config.acp.enabled && result.publicApi.acpControlPlaneExport) {
    nextAction = acpBridgeEnabled
      ? "Keep ACP public control-plane as the default path; retain bridge only for compatibility fallback."
      : "Use the ACP public control-plane path as the default execution path.";
  } else if (config.acp.enabled && acpBridgeEnabled && !result.publicApi.acpControlPlaneExport) {
    nextAction = "Use bridge only as a legacy ACP compatibility fallback until the public control-plane export is ready.";
  }

  return {
    ...result,
    compatibility: {
      ...result.compatibility,
      notes: [postureNote, guidanceNote]
        .filter((value): value is string => Boolean(value))
        .reduce(pushUnique, result.compatibility.notes),
    },
    warnings: [postureNote, guidanceNote]
      .filter((value): value is string => Boolean(value))
      .reduce(pushUnique, result.warnings),
    nextAction,
  };
}

function annotateSubagentExperimentalStatus(
  result: BridgeDoctorResult,
  config: SwarmPluginConfig,
): BridgeDoctorResult {
  const note = `Subagent posture: ${describeSubagentPosture(config)}.`;
  return {
    ...result,
    compatibility: {
      ...result.compatibility,
      notes: result.compatibility.notes.includes(note) ? result.compatibility.notes : [...result.compatibility.notes, note],
    },
    warnings: result.warnings.includes(note) ? result.warnings : [...result.warnings, note],
  };
}

function buildBridgeOptionalDoctorResult(
  config: SwarmPluginConfig,
  availability: PublicApiAvailability,
  runtimeVersion?: string | null,
): BridgeDoctorResult {
  const replacementPlan = buildReplacementPlan(availability);
  const migrationChecklist = buildMigrationChecklist(replacementPlan);
  const acpBridgeEnabled = isBridgeEnabledForRunner(config, "acp");
  const subagentBridgeEnabled = isBridgeEnabledForRunner(config, "subagent");

  const blockers: string[] = [];
  const warnings: string[] = ["Bridge fallback is disabled; doctor is reporting public API readiness only."];
  const remediation: string[] = [];

  if (config.acp.enabled && !availability.acpControlPlaneExport && !acpBridgeEnabled) {
    blockers.push("ACP is enabled but neither a public ACP control-plane export nor ACP bridge fallback is available.");
    remediation.push("Enable bridge.acpFallbackEnabled for legacy ACP compatibility, or keep using manual runner until the public ACP control-plane export is available.");
  }
  if (config.subagent.enabled && !availability.subagentSpawnExport && !subagentBridgeEnabled) {
    blockers.push("subagent is enabled but neither a public subagent export nor subagent bridge fallback is available.");
    remediation.push("Disable subagent or enable bridge.subagentEnabled until the public subagent export is available.");
  }
  if (!config.acp.enabled) {
    warnings.push("ACP is disabled in plugin config; manual runner remains the safe fallback.");
  }
  warnings.push(...availability.notes);

  return annotateAcpBridgeExitGate(
    annotateDefaultRunnerGuidance(
      annotateSubagentExperimentalStatus(
        annotateAcpBridgeContainment(
          {
            ok: blockers.length === 0,
            severity: blockers.length > 0 ? "blocked" : "warning",
            openclawRoot: config.bridge.openclawRoot ?? "(unset)",
            compatibility: {
              supportedRunners: [
                ...(config.acp.enabled ? ["acp"] : []),
                ...(config.subagent.enabled ? ["subagent"] : []),
              ],
              replacementCandidates: replacementPlan.map((item) => item.publicExport),
              notes: ["Bridge fallback is not enabled for any runner.", ...availability.notes],
            },
            publicApi: {
              acpControlPlaneExport: availability.acpControlPlaneExport,
              subagentSpawnExport: availability.subagentSpawnExport,
              readyReplacementPoints: availability.readyReplacementPoints,
            },
            acpBridgeExitGate: buildAcpBridgeExitGate(runtimeVersion, {
              publicControlPlaneExportReady: availability.acpControlPlaneExport,
              evidenceMode: "doctor",
            }),
            replacementPlan,
            migrationChecklist,
            checks: {
              bridgeEnabled: false,
              acpBridgeFallbackEnabled: acpBridgeEnabled,
              subagentBridgeFallbackEnabled: subagentBridgeEnabled,
              acpPublicControlPlaneReady: availability.acpControlPlaneExport,
              subagentPublicSpawnReady: availability.subagentSpawnExport,
              acpConfigured: config.acp.enabled,
              subagentConfigured: config.subagent.enabled,
            },
            blockers,
            warnings,
            risks: blockers.length > 0 ? ["Automated execution availability depends on missing public exports or disabled fallbacks."] : [],
            remediation,
            nextAction:
              blockers[0] ??
              (availability.acpControlPlaneExport
                ? "Use the ACP public control-plane path; bridge fallback is optional for compatibility only."
                : "Keep manual runner as baseline, and enable ACP or bridge fallback only when needed."),
          },
          config,
        ),
        config,
      ),
      config,
    ),
    runtimeVersion,
  );
}

export async function runSwarmDoctor(
  _options: Record<string, never>,
  context?: SwarmCliContext,
  commandRunner: BridgeCommandRunner = runBridgeCommandDirect,
  publicApiDetector: PublicApiDetector = detectPublicApiAvailability,
): Promise<BridgeDoctorResult> {
  const config = resolveEffectiveConfig(context);
  const runtimeVersion = resolveContextRuntimeVersion(context);
  const bridgeEnabled = isBridgeEnabledForRunner(config, "acp") || isBridgeEnabledForRunner(config, "subagent");

  if (!bridgeEnabled) {
    const availability = await publicApiDetector().catch(() => ({
      acpControlPlaneExport: false,
      subagentSpawnExport: false,
      readyReplacementPoints: [],
      notes: ["Unable to detect public API availability from the current OpenClaw install."],
    }));
    return buildBridgeOptionalDoctorResult(config, availability, runtimeVersion);
  }

  const result = await commandRunner(
    [config.bridge.nodePath ?? process.execPath, "--import", resolveTsxLoaderPath(), resolveBridgeScriptPath(), "doctor"],
    {
      timeoutMs: 120_000,
      cwd: process.cwd(),
      input: JSON.stringify({
        bridge: {
          openclawRoot: config.bridge.openclawRoot,
          versionAllow: config.bridge.versionAllow,
        },
      }),
    },
  );

  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || "bridge doctor failed");
  }

  const parsed = JSON.parse(result.stdout) as { result: BridgeDoctorResult };
  return annotateAcpBridgeExitGate(
    annotateDefaultRunnerGuidance(
      annotateSubagentExperimentalStatus(annotateAcpBridgeContainment(parsed.result, config), config),
      config,
    ),
    parsed.result.version ?? runtimeVersion,
  );
}
