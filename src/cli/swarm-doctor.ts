import { defaultSwarmPluginConfig, type SwarmPluginConfig } from "../config.js";
import { resolveBridgeScriptPath, resolveTsxLoaderPath, runBridgeCommandDirect } from "../runtime/bridge-openclaw-session-adapter.js";
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

function resolveEffectiveConfig(context?: SwarmCliContext): SwarmPluginConfig {
  if (context?.stateStore?.config) {
    return context.stateStore.config;
  }
  if (context?.config) {
    return {
      ...defaultSwarmPluginConfig,
      ...context.config,
      acp: {
        ...defaultSwarmPluginConfig.acp,
        ...context.config.acp,
      },
      bridge: {
        ...defaultSwarmPluginConfig.bridge,
        ...context.config.bridge,
      },
    };
  }
  return defaultSwarmPluginConfig;
}

export async function runSwarmDoctor(
  _options: Record<string, never>,
  context?: SwarmCliContext,
  commandRunner: BridgeCommandRunner = runBridgeCommandDirect,
): Promise<BridgeDoctorResult> {
  const config = resolveEffectiveConfig(context);
  if (!config.bridge.enabled) {
    return {
      ok: false,
      severity: "blocked",
      openclawRoot: config.bridge.openclawRoot ?? "(unset)",
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
      migrationChecklist: [
        "Enable bridge mode first, then rerun `openclaw swarm doctor --json` to generate a migration checklist.",
      ],
      checks: {
        bridgeEnabled: false,
      },
      blockers: ["bridge.enabled=false"],
      warnings: [],
      risks: ["bridge mode is disabled"],
      remediation: ["Enable plugins.entries.openclaw-swarm-layer.config.bridge.enabled before using bridge-backed execution."],
      nextAction: "Enable bridge mode before running bridge-backed ACP or subagent execution.",
    };
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
  return parsed.result;
}
