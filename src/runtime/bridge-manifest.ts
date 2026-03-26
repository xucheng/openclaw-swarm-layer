import { compareOpenClawVersions, normalizeOpenClawVersion } from "./openclaw-version.js";

type InternalModuleExport = {
  relativeModulePath: string;
  exportAlias: string;
};

type InternalSubagentPatchSpec = {
  relativeModulePath: string;
  patchedModulePath: string;
  patchedSubagentExports: {
    spawn: string;
    findLatestRun: string;
    killByChildSession: string;
    isRunActive: string;
  };
};

export type InternalModuleSpec = {
  exports: {
    loadConfig: InternalModuleExport;
    getAcpSessionManager: InternalModuleExport;
  };
  subagentPatch: InternalSubagentPatchSpec;
};

export type BridgeCompatibility = {
  version: string;
  strategy: "internal-bundle";
  testedAt: string;
  supportedRunners: Array<"acp" | "subagent">;
  notes: string[];
  replacementCandidates: {
    acpControlPlaneExport: string;
    subagentSpawnExport: string;
  };
};

export const INTERNAL_MODULES_BY_VERSION: Record<string, InternalModuleSpec> = {
  "2026.2.26": {
    exports: {
      loadConfig: {
        relativeModulePath: "dist/plugin-sdk/thread-bindings-SYAnWHuW.js",
        exportAlias: "i",
      },
      getAcpSessionManager: {
        relativeModulePath: "dist/plugin-sdk/thread-bindings-SYAnWHuW.js",
        exportAlias: "Vr",
      },
    },
    subagentPatch: {
      relativeModulePath: "dist/plugin-sdk/thread-bindings-SYAnWHuW.js",
      patchedModulePath: "dist/plugin-sdk/thread-bindings-SYAnWHuW.swarm-bridge.mjs",
      patchedSubagentExports: {
        spawn: "__bridgeSpawnSubagentDirect",
        findLatestRun: "__bridgeFindLatestSubagentRunByChildSession",
        killByChildSession: "__bridgeKillSubagentRunByChildSession",
        isRunActive: "__bridgeIsSubagentSessionRunActive",
      },
    },
  },
  "2026.3.13": {
    exports: {
      loadConfig: {
        relativeModulePath: "dist/plugin-sdk/thread-bindings-SYAnWHuW.js",
        exportAlias: "i",
      },
      getAcpSessionManager: {
        relativeModulePath: "dist/plugin-sdk/thread-bindings-SYAnWHuW.js",
        exportAlias: "Vr",
      },
    },
    subagentPatch: {
      relativeModulePath: "dist/plugin-sdk/thread-bindings-SYAnWHuW.js",
      patchedModulePath: "dist/plugin-sdk/thread-bindings-SYAnWHuW.swarm-bridge.mjs",
      patchedSubagentExports: {
        spawn: "__bridgeSpawnSubagentDirect",
        findLatestRun: "__bridgeFindLatestSubagentRunByChildSession",
        killByChildSession: "__bridgeKillSubagentRunByChildSession",
        isRunActive: "__bridgeIsSubagentSessionRunActive",
      },
    },
  },
  "2026.3.22": {
    exports: {
      loadConfig: {
        relativeModulePath: "dist/io-cPs4dU7X.js",
        exportAlias: "s",
      },
      getAcpSessionManager: {
        relativeModulePath: "dist/manager-CTkU8M9E.js",
        exportAlias: "t",
      },
    },
    subagentPatch: {
      relativeModulePath: "dist/pi-embedded-CzQCqSlH.js",
      patchedModulePath: "dist/pi-embedded-CzQCqSlH.swarm-bridge.mjs",
      patchedSubagentExports: {
        spawn: "__bridgeSpawnSubagentDirect",
        findLatestRun: "__bridgeFindLatestSubagentRunByChildSession",
        killByChildSession: "__bridgeKillSubagentRunByChildSession",
        isRunActive: "__bridgeIsSubagentSessionRunActive",
      },
    },
  },
  "2026.3.23": {
    exports: {
      loadConfig: {
        relativeModulePath: "dist/io-CZZeeo8R.js",
        exportAlias: "s",
      },
      getAcpSessionManager: {
        relativeModulePath: "dist/manager-BgeTqIfW.js",
        exportAlias: "t",
      },
    },
    subagentPatch: {
      relativeModulePath: "dist/pi-embedded-CwMQzdKD.js",
      patchedModulePath: "dist/pi-embedded-CwMQzdKD.swarm-bridge.mjs",
      patchedSubagentExports: {
        spawn: "__bridgeSpawnSubagentDirect",
        findLatestRun: "__bridgeFindLatestSubagentRunByChildSession",
        killByChildSession: "__bridgeKillSubagentRunByChildSession",
        isRunActive: "__bridgeIsSubagentSessionRunActive",
      },
    },
  },
  "2026.3.23-1": {
    exports: {
      loadConfig: {
        relativeModulePath: "dist/io-CZZeeo8R.js",
        exportAlias: "s",
      },
      getAcpSessionManager: {
        relativeModulePath: "dist/manager-BgeTqIfW.js",
        exportAlias: "t",
      },
    },
    subagentPatch: {
      relativeModulePath: "dist/pi-embedded-CwMQzdKD.js",
      patchedModulePath: "dist/pi-embedded-CwMQzdKD.swarm-bridge.mjs",
      patchedSubagentExports: {
        spawn: "__bridgeSpawnSubagentDirect",
        findLatestRun: "__bridgeFindLatestSubagentRunByChildSession",
        killByChildSession: "__bridgeKillSubagentRunByChildSession",
        isRunActive: "__bridgeIsSubagentSessionRunActive",
      },
    },
  },
  "2026.3.24": {
    exports: {
      loadConfig: {
        relativeModulePath: "dist/io-Ddcnnsbo.js",
        exportAlias: "loadConfig",
      },
      getAcpSessionManager: {
        relativeModulePath: "dist/manager-BFi-xqLj.js",
        exportAlias: "t",
      },
    },
    subagentPatch: {
      relativeModulePath: "dist/pi-embedded-BaSvmUpW.js",
      patchedModulePath: "dist/pi-embedded-BaSvmUpW.swarm-bridge.mjs",
      patchedSubagentExports: {
        spawn: "__bridgeSpawnSubagentDirect",
        findLatestRun: "__bridgeFindLatestSubagentRunByChildSession",
        killByChildSession: "__bridgeKillSubagentRunByChildSession",
        isRunActive: "__bridgeIsSubagentSessionRunActive",
      },
    },
  },
};

export const BRIDGE_COMPATIBILITY_BY_VERSION: Record<string, BridgeCompatibility> = {
  "2026.2.26": {
    version: "2026.2.26",
    strategy: "internal-bundle",
    testedAt: "2026-03-21",
    supportedRunners: ["acp", "subagent"],
    notes: [
      "Uses hashed thread-bindings bundle aliases for ACP control-plane access.",
      "Requires patched subagent helper exports for status and kill support.",
    ],
    replacementCandidates: {
      acpControlPlaneExport: "getAcpSessionManager",
      subagentSpawnExport: "spawnSubagentDirect",
    },
  },
  "2026.3.13": {
    version: "2026.3.13",
    strategy: "internal-bundle",
    testedAt: "2026-03-21",
    supportedRunners: ["acp", "subagent"],
    notes: [
      "Uses hashed thread-bindings bundle aliases for ACP control-plane access.",
      "Requires patched subagent helper exports for status and kill support.",
    ],
    replacementCandidates: {
      acpControlPlaneExport: "getAcpSessionManager",
      subagentSpawnExport: "spawnSubagentDirect",
    },
  },
  "2026.3.22": {
    version: "2026.3.22",
    strategy: "internal-bundle",
    testedAt: "2026-03-23",
    supportedRunners: ["acp", "subagent"],
    notes: [
      "ACP bridge bindings split across io + manager bundles; bridge resolution must load both.",
      "Subagent bridge patching now targets the pi-embedded bundle instead of the older thread-bindings bundle.",
    ],
    replacementCandidates: {
      acpControlPlaneExport: "getAcpSessionManager",
      subagentSpawnExport: "spawnSubagentDirect",
    },
  },
  "2026.3.23": {
    version: "2026.3.23",
    strategy: "internal-bundle",
    testedAt: "2026-03-24",
    supportedRunners: ["acp", "subagent"],
    notes: [
      "ACP bridge bindings remain split across io + manager bundles in the 2026.3.23 line.",
      "Subagent bridge patching still targets the pi-embedded bundle in the 2026.3.23 line.",
    ],
    replacementCandidates: {
      acpControlPlaneExport: "getAcpSessionManager",
      subagentSpawnExport: "spawnSubagentDirect",
    },
  },
  "2026.3.23-1": {
    version: "2026.3.23-1",
    strategy: "internal-bundle",
    testedAt: "2026-03-24",
    supportedRunners: ["acp", "subagent"],
    notes: [
      "ACP bridge bindings remain split across io + manager bundles in the 2026.3.23 line.",
      "Subagent bridge patching still targets the pi-embedded bundle in the 2026.3.23 line.",
    ],
    replacementCandidates: {
      acpControlPlaneExport: "getAcpSessionManager",
      subagentSpawnExport: "spawnSubagentDirect",
    },
  },
  "2026.3.24": {
    version: "2026.3.24",
    strategy: "internal-bundle",
    testedAt: "2026-03-26",
    supportedRunners: ["acp", "subagent"],
    notes: [
      "ACP bridge bindings still span the io + manager bundles in the 2026.3.24 line, but loadConfig is now a named io export.",
      "Subagent bridge patching still targets the pi-embedded bundle in the 2026.3.24 line.",
    ],
    replacementCandidates: {
      acpControlPlaneExport: "getAcpSessionManager",
      subagentSpawnExport: "spawnSubagentDirect",
    },
  },
};

const POST_2026_3_22_FAMILY_VERSIONS = ["2026.3.24", "2026.3.23", "2026.3.22"] as const;

function dedupeSpecs(specs: InternalModuleSpec[]): InternalModuleSpec[] {
  const seen = new Set<string>();
  return specs.filter((spec) => {
    const key = JSON.stringify(spec);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function resolveInternalModuleSpecCandidates(version: string): InternalModuleSpec[] {
  const normalizedVersion = normalizeOpenClawVersion(version) ?? version;
  const exactSpecs = [INTERNAL_MODULES_BY_VERSION[version], INTERNAL_MODULES_BY_VERSION[normalizedVersion]].filter(
    (spec): spec is InternalModuleSpec => Boolean(spec),
  );
  if (exactSpecs.length > 0) {
    return dedupeSpecs(exactSpecs);
  }

  const compared = compareOpenClawVersions(normalizedVersion, "2026.3.22");
  if (compared !== null && compared >= 0) {
    return POST_2026_3_22_FAMILY_VERSIONS.map((candidateVersion) => INTERNAL_MODULES_BY_VERSION[candidateVersion]).filter(
      (spec): spec is InternalModuleSpec => Boolean(spec),
    );
  }

  return [];
}

export function resolveInternalModuleSpec(version: string): InternalModuleSpec | null {
  return resolveInternalModuleSpecCandidates(version)[0] ?? null;
}

export function resolveBridgeCompatibility(version: string): BridgeCompatibility | null {
  const normalizedVersion = normalizeOpenClawVersion(version) ?? version;
  const exactCompatibility = BRIDGE_COMPATIBILITY_BY_VERSION[version] ?? BRIDGE_COMPATIBILITY_BY_VERSION[normalizedVersion];
  if (exactCompatibility) {
    return exactCompatibility;
  }
  const compared = compareOpenClawVersions(normalizedVersion, "2026.3.22");
  if (compared !== null && compared >= 0) {
    return BRIDGE_COMPATIBILITY_BY_VERSION["2026.3.24"];
  }
  return null;
}

export function buildPatchedBridgeModuleSource(source: string): string {
  if (source.includes("__bridgeSpawnSubagentDirect") && source.includes("__bridgeKillSubagentRunByChildSession")) {
    return source;
  }
  return `${source}
function __bridgeFindLatestSubagentRunByChildSession(childSessionKey) {
  return findLatestRunForChildSession(getSubagentRunsSnapshotForRead(subagentRuns), childSessionKey);
}
async function __bridgeKillSubagentRunByChildSession(cfg, childSessionKey) {
  const entry = __bridgeFindLatestSubagentRunByChildSession(childSessionKey);
  if (!entry) return { killed: false };
  return await killSubagentRun({ cfg, entry, cache: new Map() });
}
export {
  spawnSubagentDirect as __bridgeSpawnSubagentDirect,
  __bridgeFindLatestSubagentRunByChildSession,
  __bridgeKillSubagentRunByChildSession,
  isSubagentSessionRunActive as __bridgeIsSubagentSessionRunActive
};
`;
}
