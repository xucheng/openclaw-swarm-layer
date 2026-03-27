import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  defaultSwarmPluginConfig,
  describeAcpExecutionPosture,
  describeSubagentPosture,
  hasLegacyAcpBridgeFallbackConfig,
  isBridgeEnabledForRunner,
  isSubagentRunnerEnabled,
  resolveSwarmPluginConfig,
  type SwarmPluginConfig,
} from "../config.js";
import {
  buildAcpBridgeExitGate,
  formatAcpBridgeExitGateNotes,
  type AcpBridgeExitGate,
} from "../runtime/acp-bridge-exit-gate.js";
import { resolveBridgeScriptPath, resolveTsxLoaderPath, runBridgeCommandDirect } from "../runtime/bridge-openclaw-subagent-adapter.js";
import { resolveAcpRuntimeRegistryModulePath, resolveOpenClawRoot } from "../runtime/openclaw-exec-bridge.js";
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
    status: "complete" | "ready" | "blocked";
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

function buildDoctorPublicApiDetectorInput(
  config: SwarmPluginConfig,
): Parameters<typeof detectPublicApiAvailability>[0] | undefined {
  try {
    const openclawRoot = resolveOpenClawRoot(config.bridge.openclawRoot);
    return {
      rootLoader: async () =>
        (await import(pathToFileURL(path.join(openclawRoot, "dist", "plugin-sdk", "index.js")).href)) as Record<string, unknown>,
      acpRuntimeLoader: async () =>
        (await import(pathToFileURL(resolveAcpRuntimeRegistryModulePath(openclawRoot)).href)) as Record<string, unknown>,
    };
  } catch {
    return undefined;
  }
}

function pushUnique(items: string[], value: string): string[] {
  return items.includes(value) ? items : [...items, value];
}

function resolveDoctorDefaultRunner(
  config: Pick<SwarmPluginConfig, "defaultRunner" | "acp" | "subagent" | "bridge">,
  result: Pick<BridgeDoctorResult, "publicApi">,
): "manual" | "acp" | "subagent" {
  if (config.defaultRunner === "auto") {
    return config.acp.enabled && result.publicApi.acpControlPlaneExport
      ? "acp"
      : "manual";
  }
  if (config.defaultRunner === "subagent") {
    return isSubagentRunnerEnabled(config) ? "subagent" : "manual";
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
  const legacyAcpBridgeNote = hasLegacyAcpBridgeFallbackConfig(config)
    ? "ACP bridge fallback config is legacy and ignored; ACP automation now requires the public control-plane path."
    : undefined;
  const guidanceNote = !config.acp.enabled
    ? undefined
    : result.publicApi.acpControlPlaneExport
      ? "ACP automation now depends on the public control-plane path only."
      : "ACP automation is unavailable on this install until the public control-plane export is ready.";

  let nextAction = result.nextAction;
  if (config.acp.enabled && result.publicApi.acpControlPlaneExport) {
    nextAction = "Use the ACP public control-plane path as the supported execution path.";
  } else if (config.acp.enabled && !result.publicApi.acpControlPlaneExport) {
    nextAction = "Keep manual runner as the baseline until the public ACP control-plane export is ready on this install.";
  }

  return {
    ...result,
    compatibility: {
      ...result.compatibility,
      notes: [postureNote, legacyAcpBridgeNote, guidanceNote]
        .filter((value): value is string => Boolean(value))
        .reduce(pushUnique, result.compatibility.notes),
    },
    warnings: [postureNote, legacyAcpBridgeNote, guidanceNote]
      .filter((value): value is string => Boolean(value))
      .reduce(pushUnique, result.warnings),
    nextAction,
  };
}

function annotateSubagentLegacyStatus(
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
  const subagentBridgeEnabled = config.subagent.enabled && isBridgeEnabledForRunner(config, "subagent");

  const blockers: string[] = [];
  const warnings: string[] = ["ACP bridge has been removed; doctor is reporting public API readiness for ACP and bridge status only for subagent."];
  const remediation: string[] = [];

  if (config.acp.enabled && !availability.acpControlPlaneExport) {
    blockers.push("ACP is enabled but the public ACP control-plane export is not available on this install.");
    remediation.push("Keep using manual runner until the public ACP control-plane export is available on the target OpenClaw install.");
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
      annotateSubagentLegacyStatus(
        annotateAcpBridgeContainment(
          {
            ok: blockers.length === 0,
            severity: blockers.length > 0 ? "blocked" : "warning",
            openclawRoot: config.bridge.openclawRoot ?? "(unset)",
            compatibility: {
              supportedRunners: [
                ...(config.acp.enabled ? ["acp"] : []),
                ...(subagentBridgeEnabled ? ["subagent"] : []),
              ],
              replacementCandidates: replacementPlan.map((item) => item.publicExport),
              notes: ["ACP bridge has been removed from the supported runtime path.", ...availability.notes],
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
              bridgeEnabled: subagentBridgeEnabled,
              acpBridgeFallbackEnabled: false,
              subagentBridgeFallbackEnabled: subagentBridgeEnabled,
              acpBridgeRemoved: true,
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
                ? "Use the ACP public control-plane path; ACP bridge is no longer part of the supported runtime."
                : "Keep manual runner as baseline, and only enable ACP on installs where the public control-plane export is available."),
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
  const subagentBridgeEnabled = config.subagent.enabled && isBridgeEnabledForRunner(config, "subagent");

  if (!subagentBridgeEnabled) {
    const detectorInput = buildDoctorPublicApiDetectorInput(config);
    const availability = await publicApiDetector(detectorInput ?? {}).catch(() => ({
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
      annotateSubagentLegacyStatus(annotateAcpBridgeContainment(parsed.result, config), config),
      config,
    ),
    parsed.result.version ?? runtimeVersion,
  );
}
