export type PublicApiAvailability = {
  acpControlPlaneExport: boolean;
  subagentSpawnExport: boolean;
  readyReplacementPoints: string[];
  notes: string[];
};

export const ACP_PUBLIC_REPLACEMENT_EXPORT = "getAcpSessionManager";
export const SUBAGENT_PUBLIC_REPLACEMENT_EXPORT = "spawnSubagentDirect";

export type ReplacementPlanItem = {
  runner: "acp" | "subagent";
  publicExport: string;
  available: boolean;
  status: "ready" | "blocked";
  currentImplementation: string;
  targetImplementation: string;
  affectedModules: string[];
  nextStep: string;
};

export function buildMigrationChecklist(plan: ReplacementPlanItem[]): string[] {
  const steps = [
    "Run `openclaw swarm doctor --json` before changing bridge or public API integration code.",
  ];

  for (const item of plan) {
    if (item.available) {
      steps.push(
        `[${item.runner}] Replace ${item.currentImplementation} with ${item.targetImplementation}. Update modules: ${item.affectedModules.join(", ")}.`,
      );
    } else {
      steps.push(
        `[${item.runner}] Keep the current bridge path until the public export ${item.publicExport} is available.`,
      );
    }
  }

  steps.push(
    "After any replacement, rerun unit tests, e2e regressions, and at least one live smoke before relaxing bridge guards.",
  );

  return steps;
}

type SdkExports = Record<string, unknown>;
type PublicApiLoader = () => Promise<SdkExports>;
type PublicApiLoaderOptions = {
  rootLoader?: PublicApiLoader;
  acpRuntimeLoader?: PublicApiLoader;
};

export async function detectPublicApiAvailability(
  loaders: PublicApiLoader | PublicApiLoaderOptions = {},
): Promise<PublicApiAvailability> {
  const options =
    typeof loaders === "function"
      ? { rootLoader: loaders }
      : loaders;

  const rootLoader =
    options.rootLoader ??
    (async () => {
      const sdkEntry = "openclaw/plugin-sdk";
      return (await import(sdkEntry)) as SdkExports;
    });
  const acpRuntimeLoader =
    options.acpRuntimeLoader ??
    (async () => {
      const acpRuntimeEntry = "openclaw/plugin-sdk/acp-runtime";
      return (await import(acpRuntimeEntry)) as SdkExports;
    });

  const [rootSdk, acpRuntimeSdk] = await Promise.all([
    rootLoader().catch(() => ({} as SdkExports)),
    acpRuntimeLoader().catch(() => ({} as SdkExports)),
  ]);

  const acpControlPlaneExport =
    typeof acpRuntimeSdk[ACP_PUBLIC_REPLACEMENT_EXPORT] === "function" ||
    typeof rootSdk[ACP_PUBLIC_REPLACEMENT_EXPORT] === "function";
  const subagentSpawnExport = typeof rootSdk[SUBAGENT_PUBLIC_REPLACEMENT_EXPORT] === "function";
  const readyReplacementPoints: string[] = [];
  const notes: string[] = [];

  if (!acpControlPlaneExport) {
    notes.push(`Public ACP runtime SDK does not expose ${ACP_PUBLIC_REPLACEMENT_EXPORT}().`);
  } else {
    readyReplacementPoints.push(`acp:${ACP_PUBLIC_REPLACEMENT_EXPORT}`);
    notes.push(`Public ACP runtime SDK exposes ${ACP_PUBLIC_REPLACEMENT_EXPORT}(); ACP bridge replacement is now technically possible.`);
  }
  if (!subagentSpawnExport) {
    notes.push(`Public plugin SDK does not expose ${SUBAGENT_PUBLIC_REPLACEMENT_EXPORT}().`);
  } else {
    readyReplacementPoints.push(`subagent:${SUBAGENT_PUBLIC_REPLACEMENT_EXPORT}`);
    notes.push(`Public plugin SDK exposes ${SUBAGENT_PUBLIC_REPLACEMENT_EXPORT}(); subagent bridge replacement is now technically possible.`);
  }

  return {
    acpControlPlaneExport,
    subagentSpawnExport,
    readyReplacementPoints,
    notes,
  };
}

export function buildReplacementPlan(availability: PublicApiAvailability): ReplacementPlanItem[] {
  return [
    {
      runner: "acp",
      publicExport: ACP_PUBLIC_REPLACEMENT_EXPORT,
      available: availability.acpControlPlaneExport,
      status: availability.acpControlPlaneExport ? "ready" : "blocked",
      currentImplementation: "bridge-openclaw-session-adapter -> openclaw-exec-bridge",
      targetImplementation: "real-openclaw-session-adapter via public acp-runtime export",
      affectedModules: [
        "src/runtime/bridge-openclaw-session-adapter.ts",
        "src/runtime/openclaw-exec-bridge.ts",
        "src/runtime/real-openclaw-session-adapter.ts",
      ],
      nextStep: availability.acpControlPlaneExport
        ? "Prototype replacing the ACP bridge control-plane path with the public export."
        : "Keep using the bridge-backed ACP adapter until a public control-plane export is available.",
    },
    {
      runner: "subagent",
      publicExport: SUBAGENT_PUBLIC_REPLACEMENT_EXPORT,
      available: availability.subagentSpawnExport,
      status: availability.subagentSpawnExport ? "ready" : "blocked",
      currentImplementation: "bridge-openclaw-subagent-adapter -> openclaw-exec-bridge patched helpers",
      targetImplementation: "public subagent spawn helper from plugin-sdk export",
      affectedModules: [
        "src/runtime/bridge-openclaw-subagent-adapter.ts",
        "src/runtime/openclaw-exec-bridge.ts",
      ],
      nextStep: availability.subagentSpawnExport
        ? "Prototype replacing the subagent bridge spawn path with the public export."
        : "Keep using the bridge-backed subagent adapter until a public spawn export is available.",
    },
  ];
}
