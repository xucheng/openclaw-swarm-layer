export type PublicApiAvailability = {
  acpControlPlaneExport: boolean;
  readyReplacementPoints: string[];
  notes: string[];
};

export const ACP_PUBLIC_REPLACEMENT_EXPORT = "getAcpSessionManager";

export type ReplacementPlanItem = {
  runner: "acp";
  publicExport: string;
  available: boolean;
  status: "complete" | "ready" | "blocked";
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
    if (item.status === "complete") {
      steps.push(
        `[${item.runner}] Keep ${item.currentImplementation}. Review modules: ${item.affectedModules.join(", ")}.`,
      );
    } else if (item.available) {
      steps.push(
        `[${item.runner}] Replace ${item.currentImplementation} with ${item.targetImplementation}. Update modules: ${item.affectedModules.join(", ")}.`,
      );
    } else {
      steps.push(`[${item.runner}] ${item.nextStep}`);
    }
  }

  steps.push(
    "After ACP runtime changes, rerun unit tests, e2e regressions, and at least one live smoke before relaxing bridge guards.",
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
  const readyReplacementPoints: string[] = [];
  const notes: string[] = [];

  if (!acpControlPlaneExport) {
    notes.push(`Public ACP runtime SDK does not expose ${ACP_PUBLIC_REPLACEMENT_EXPORT}().`);
  } else {
    readyReplacementPoints.push(`acp:${ACP_PUBLIC_REPLACEMENT_EXPORT}`);
    notes.push(`Public ACP runtime SDK exposes ${ACP_PUBLIC_REPLACEMENT_EXPORT}(); ACP public control-plane execution is available.`);
  }

  return {
    acpControlPlaneExport,
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
      status: availability.acpControlPlaneExport ? "complete" : "blocked",
      currentImplementation: "real-openclaw-session-adapter via public acp-runtime export",
      targetImplementation: "public ACP control-plane as the supported execution path",
      affectedModules: [
        "src/cli/context.ts",
        "src/runtime/real-openclaw-session-adapter.ts",
      ],
      nextStep: availability.acpControlPlaneExport
        ? "Keep ACP on the public control-plane path and avoid reintroducing bridge fallbacks."
        : "Keep using manual runner until a public control-plane export is available.",
    },
  ];
}
