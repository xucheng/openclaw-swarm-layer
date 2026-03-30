import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { compareOpenClawVersions, normalizeOpenClawVersion } from "./openclaw-version.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  strategy: "internal-bundle" | "dynamic-discovery";
  testedAt: string;
  supportedRunners: Array<"acp" | "subagent">;
  notes: string[];
  replacementCandidates: {
    acpControlPlaneExport: string;
    subagentSpawnExport: string;
  };
};

// ---------------------------------------------------------------------------
// Version-range resolution strategies
// ---------------------------------------------------------------------------

/**
 * Defines how to resolve internal modules for a range of OpenClaw versions.
 *
 * Ranges are evaluated in declaration order — first match wins.
 * Use `maxVersion: null` for an open-ended (forward-compatible) range.
 */
type VersionRangeStrategy = {
  /** Inclusive lower bound */
  minVersion: string;
  /** Inclusive upper bound; `null` = unbounded (all future versions) */
  maxVersion: string | null;
  /** How to locate `loadConfig` */
  loadConfig:
    | { mode: "exact"; relativeModulePath: string; exportAlias: string }
    | { mode: "dynamic"; fileGlob: string; exportName: string };
  /** How to locate `getAcpSessionManager` */
  acpSessionManager:
    | { mode: "exact"; relativeModulePath: string; exportAlias: string }
    | { mode: "stable-path"; relativeModulePath: string; exportName: string };
  /** Subagent bridge spec, or `null` if not supported in this range */
  subagentPatch: InternalSubagentPatchSpec | null;
  compatibility: BridgeCompatibility;
};

// Ordered most-specific-first.  Open-ended range comes last.
const VERSION_RANGE_STRATEGIES: VersionRangeStrategy[] = [
  // ---- legacy exact-hash ranges (kept for pinned installs) ----
  {
    minVersion: "2026.2.26",
    maxVersion: "2026.2.26",
    loadConfig: { mode: "exact", relativeModulePath: "dist/plugin-sdk/thread-bindings-SYAnWHuW.js", exportAlias: "i" },
    acpSessionManager: { mode: "exact", relativeModulePath: "dist/plugin-sdk/thread-bindings-SYAnWHuW.js", exportAlias: "Vr" },
    subagentPatch: {
      relativeModulePath: "dist/plugin-sdk/thread-bindings-SYAnWHuW.js",
      patchedModulePath: "dist/plugin-sdk/thread-bindings-SYAnWHuW.swarm-bridge.mjs",
      patchedSubagentExports: { spawn: "__bridgeSpawnSubagentDirect", findLatestRun: "__bridgeFindLatestSubagentRunByChildSession", killByChildSession: "__bridgeKillSubagentRunByChildSession", isRunActive: "__bridgeIsSubagentSessionRunActive" },
    },
    compatibility: {
      version: "2026.2.26",
      strategy: "internal-bundle",
      testedAt: "2026-03-21",
      supportedRunners: ["acp", "subagent"],
      notes: ["Uses hashed thread-bindings bundle aliases for ACP control-plane access.", "Requires patched subagent helper exports for status and kill support."],
      replacementCandidates: { acpControlPlaneExport: "getAcpSessionManager", subagentSpawnExport: "spawnSubagentDirect" },
    },
  },
  {
    minVersion: "2026.3.13",
    maxVersion: "2026.3.13",
    loadConfig: { mode: "exact", relativeModulePath: "dist/plugin-sdk/thread-bindings-SYAnWHuW.js", exportAlias: "i" },
    acpSessionManager: { mode: "exact", relativeModulePath: "dist/plugin-sdk/thread-bindings-SYAnWHuW.js", exportAlias: "Vr" },
    subagentPatch: {
      relativeModulePath: "dist/plugin-sdk/thread-bindings-SYAnWHuW.js",
      patchedModulePath: "dist/plugin-sdk/thread-bindings-SYAnWHuW.swarm-bridge.mjs",
      patchedSubagentExports: { spawn: "__bridgeSpawnSubagentDirect", findLatestRun: "__bridgeFindLatestSubagentRunByChildSession", killByChildSession: "__bridgeKillSubagentRunByChildSession", isRunActive: "__bridgeIsSubagentSessionRunActive" },
    },
    compatibility: {
      version: "2026.3.13",
      strategy: "internal-bundle",
      testedAt: "2026-03-21",
      supportedRunners: ["acp", "subagent"],
      notes: ["Uses hashed thread-bindings bundle aliases for ACP control-plane access.", "Requires patched subagent helper exports for status and kill support."],
      replacementCandidates: { acpControlPlaneExport: "getAcpSessionManager", subagentSpawnExport: "spawnSubagentDirect" },
    },
  },
  {
    minVersion: "2026.3.22",
    maxVersion: "2026.3.24",
    loadConfig: { mode: "dynamic", fileGlob: "io-*.js", exportName: "loadConfig" },
    acpSessionManager: { mode: "stable-path", relativeModulePath: "dist/plugin-sdk/acp-runtime.js", exportName: "getAcpSessionManager" },
    subagentPatch: null, // pi-embedded may or may not exist; not guaranteed in this range
    compatibility: {
      version: ">=2026.3.22 <=2026.3.24",
      strategy: "dynamic-discovery",
      testedAt: "2026-03-26",
      supportedRunners: ["acp"],
      notes: [
        "loadConfig resolved dynamically from dist/io-*.js.",
        "getAcpSessionManager available via stable plugin-sdk/acp-runtime export.",
        "Subagent bridge not guaranteed (pi-embedded bundle may be absent).",
      ],
      replacementCandidates: { acpControlPlaneExport: "getAcpSessionManager", subagentSpawnExport: "spawnSubagentDirect" },
    },
  },

  // ---- open-ended forward-compatible range ----
  {
    minVersion: "2026.3.22",
    maxVersion: null,
    loadConfig: { mode: "dynamic", fileGlob: "io-*.js", exportName: "loadConfig" },
    acpSessionManager: { mode: "stable-path", relativeModulePath: "dist/plugin-sdk/acp-runtime.js", exportName: "getAcpSessionManager" },
    subagentPatch: null,
    compatibility: {
      version: ">=2026.3.22",
      strategy: "dynamic-discovery",
      testedAt: "2026-03-29",
      supportedRunners: ["acp"],
      notes: [
        "Forward-compatible range: loadConfig discovered dynamically from dist/io-*.js.",
        "getAcpSessionManager resolved via stable plugin-sdk/acp-runtime.js path.",
        "Subagent bridge is not available; awaiting public spawnSubagentDirect export.",
      ],
      replacementCandidates: { acpControlPlaneExport: "getAcpSessionManager", subagentSpawnExport: "spawnSubagentDirect" },
    },
  },
];

// ---------------------------------------------------------------------------
// Resolution helpers
// ---------------------------------------------------------------------------

function versionInRange(version: string, min: string, max: string | null): boolean {
  const cmpMin = compareOpenClawVersions(version, min);
  if (cmpMin === null || cmpMin < 0) return false;
  if (max === null) return true;
  const cmpMax = compareOpenClawVersions(version, max);
  return cmpMax !== null && cmpMax <= 0;
}

export function resolveVersionRangeStrategy(version: string): VersionRangeStrategy | null {
  const normalized = normalizeOpenClawVersion(version) ?? version;
  for (const strategy of VERSION_RANGE_STRATEGIES) {
    if (versionInRange(normalized, strategy.minVersion, strategy.maxVersion)) {
      return strategy;
    }
  }
  return null;
}

/**
 * Scan a directory for files matching a simple `prefix*suffix` glob,
 * import each, and return the first module that has the expected named export.
 */
async function dynamicDiscoverExport(
  baseDir: string,
  fileGlob: string,
  exportName: string,
): Promise<{ modulePath: string; fn: Function } | null> {
  const starIdx = fileGlob.indexOf("*");
  const prefix = starIdx >= 0 ? fileGlob.slice(0, starIdx) : fileGlob;
  const suffix = starIdx >= 0 ? fileGlob.slice(starIdx + 1) : "";

  let entries: string[];
  try {
    entries = await readdir(baseDir);
  } catch {
    return null;
  }
  const candidates = entries.filter((f) => f.startsWith(prefix) && f.endsWith(suffix));
  for (const filename of candidates) {
    try {
      const fullPath = path.join(baseDir, filename);
      const mod = await import(pathToFileURL(fullPath).href);
      if (typeof mod[exportName] === "function") {
        return { modulePath: fullPath, fn: mod[exportName] };
      }
    } catch {
      // skip
    }
  }
  return null;
}

export type ResolvedBridgeModules = {
  version: string;
  loadConfig: () => unknown;
  getAcpSessionManager: Function | null;
  subagentPatch: InternalSubagentPatchSpec | null;
  /** The full spec (for callers that still need it) */
  spec: InternalModuleSpec;
  compatibility: BridgeCompatibility;
};

/**
 * Master resolution entry-point.
 *
 * 1. Match version to a range strategy.
 * 2. Resolve each export according to the strategy (exact / dynamic / stable-path).
 * 3. Return a unified result.
 */
export async function resolveBridgeModules(openclawRoot: string, version: string): Promise<ResolvedBridgeModules> {
  const strategy = resolveVersionRangeStrategy(version);
  if (!strategy) {
    throw new Error(`OpenClaw ${version} is below the minimum supported version (2026.2.26)`);
  }

  const distDir = path.join(openclawRoot, "dist");

  // --- loadConfig ---
  let loadConfigPath: string;
  let loadConfigAlias: string;
  let loadConfigFn: (() => unknown) | undefined;

  if (strategy.loadConfig.mode === "exact") {
    loadConfigPath = strategy.loadConfig.relativeModulePath;
    loadConfigAlias = strategy.loadConfig.exportAlias;
    const fullPath = path.join(openclawRoot, loadConfigPath);
    const mod = await import(pathToFileURL(fullPath).href);
    loadConfigFn = mod[loadConfigAlias] as (() => unknown) | undefined;
  } else {
    const result = await dynamicDiscoverExport(distDir, strategy.loadConfig.fileGlob, strategy.loadConfig.exportName);
    if (!result) {
      throw new Error(`Dynamic discovery failed: no dist file matching ${strategy.loadConfig.fileGlob} exports ${strategy.loadConfig.exportName}`);
    }
    loadConfigPath = path.relative(openclawRoot, result.modulePath);
    loadConfigAlias = strategy.loadConfig.exportName;
    loadConfigFn = result.fn as () => unknown;
  }

  if (!loadConfigFn) {
    throw new Error(`loadConfig export not found at ${loadConfigPath}[${loadConfigAlias}]`);
  }

  // --- getAcpSessionManager ---
  let acpPath: string;
  let acpAlias: string;
  let acpFn: Function | null = null;

  if (strategy.acpSessionManager.mode === "exact") {
    acpPath = strategy.acpSessionManager.relativeModulePath;
    acpAlias = strategy.acpSessionManager.exportAlias;
    try {
      const mod = await import(pathToFileURL(path.join(openclawRoot, acpPath)).href);
      acpFn = mod[acpAlias] as Function ?? null;
    } catch { /* optional */ }
  } else {
    acpPath = strategy.acpSessionManager.relativeModulePath;
    acpAlias = strategy.acpSessionManager.exportName;
    try {
      const mod = await import(pathToFileURL(path.join(openclawRoot, acpPath)).href);
      acpFn = mod[acpAlias] as Function ?? null;
    } catch { /* optional */ }
  }

  // --- Construct legacy-compatible InternalModuleSpec ---
  const emptySubagentPatch: InternalSubagentPatchSpec = {
    relativeModulePath: "",
    patchedModulePath: "",
    patchedSubagentExports: { spawn: "", findLatestRun: "", killByChildSession: "", isRunActive: "" },
  };

  const spec: InternalModuleSpec = {
    exports: {
      loadConfig: { relativeModulePath: loadConfigPath, exportAlias: loadConfigAlias },
      getAcpSessionManager: { relativeModulePath: acpPath, exportAlias: acpAlias },
    },
    subagentPatch: strategy.subagentPatch ?? emptySubagentPatch,
  };

  return {
    version,
    loadConfig: loadConfigFn,
    getAcpSessionManager: acpFn,
    subagentPatch: strategy.subagentPatch,
    spec,
    compatibility: strategy.compatibility,
  };
}

// ---------------------------------------------------------------------------
// Compat shims — keep existing call sites working
// ---------------------------------------------------------------------------

/** @deprecated — prefer `resolveVersionRangeStrategy` */
export function resolveInternalModuleSpec(version: string): InternalModuleSpec | null {
  return resolveVersionRangeStrategy(version) ? ({} as InternalModuleSpec) : null;
}

/** @deprecated — prefer `resolveVersionRangeStrategy` */
export function resolveInternalModuleSpecCandidates(version: string): InternalModuleSpec[] {
  return resolveVersionRangeStrategy(version) ? [{}  as InternalModuleSpec] : [];
}

/** @deprecated — prefer `resolveVersionRangeStrategy().compatibility` */
export function resolveBridgeCompatibility(version: string): BridgeCompatibility | null {
  return resolveVersionRangeStrategy(version)?.compatibility ?? null;
}

// ---------------------------------------------------------------------------
// Subagent patch helper (unchanged)
// ---------------------------------------------------------------------------

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
