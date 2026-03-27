import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import {
  buildPatchedBridgeModuleSource,
  resolveBridgeCompatibility,
  resolveInternalModuleSpecCandidates,
  resolveInternalModuleSpec,
  type InternalModuleSpec,
} from "./bridge-manifest.js";
import { matchesOpenClawVersionAllowlist } from "./openclaw-version.js";
import { buildMigrationChecklist, buildReplacementPlan, detectPublicApiAvailability } from "./public-api-seams.js";

type BridgeCommand =
  | "doctor"
  | "subagent-spawn"
  | "subagent-status"
  | "subagent-kill";

type BridgeInput = {
  bridge?: {
    nodePath?: string;
    openclawRoot?: string;
    versionAllow?: string[];
  };
  params?: Record<string, unknown>;
};

const BRIDGE_INPUT_ENV_VAR = "OPENCLAW_SWARM_BRIDGE_INPUT_B64";

export type BridgeDoctorResult = {
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
    status: "complete" | "ready" | "blocked";
    currentImplementation: string;
    targetImplementation: string;
    affectedModules: string[];
    nextStep: string;
  }>;
  migrationChecklist: string[];
  checks: {
    versionMapped: boolean;
    versionAllowed: boolean;
    internalModuleResolved: boolean;
    acpBackendHealthy: boolean;
    subagentPatchable: boolean;
  };
  blockers: string[];
  warnings: string[];
  risks: string[];
  remediation: string[];
  nextAction: string;
};

export function deriveDoctorRemediation(report: Omit<BridgeDoctorResult, "remediation" | "nextAction" | "severity">): string[] {
  const steps: string[] = [];
  const text = report.blockers.join("\n");
  const warningText = report.warnings.join("\n");

  if (/not in bridge allowlist/i.test(text)) {
    steps.push("Update bridge.versionAllow to include the current OpenClaw version or a compatible range such as >=2026.3.22.");
  }
  if (/No internal bridge mapping is registered|mapping is stale/i.test(text)) {
    steps.push("Refresh INTERNAL_MODULES_BY_VERSION for the installed OpenClaw build and re-run swarm doctor.");
  }
  if (/ACP runtime backend is currently unavailable|ACP runtime backend is not configured/i.test(text)) {
    steps.push("Ensure the acpx plugin is enabled, ACP global config is enabled, and rerun `openclaw swarm doctor --json`.");
  }
  if (/subagent helpers|subagent patch/i.test(text)) {
    steps.push("Refresh the bridge patch export list for subagent helpers before using the subagent bridge path.");
  }
  if (/versionAllow is empty/i.test(warningText)) {
    steps.push("Pin bridge.versionAllow to the validated OpenClaw versions or a minimum compatible range.");
  }
  if (/openclawRoot is not pinned/i.test(warningText)) {
    steps.push("Set bridge.openclawRoot explicitly so bridge execution does not rely on install auto-detection.");
  }
  if (steps.length === 0 && !report.ok) {
    steps.push("Inspect bridge.blockers and bridge.risks, then re-run doctor after correcting configuration or version drift.");
  }
  if (steps.length === 0 && report.ok && report.warnings.length > 0) {
    steps.push("Address bridge warnings to reduce upgrade and compatibility risk before relying on bridge mode broadly.");
  }
  return steps;
}

export function deriveDoctorSeverity(report: Omit<BridgeDoctorResult, "severity" | "nextAction">): BridgeDoctorResult["severity"] {
  if (report.blockers.length > 0) {
    return "blocked";
  }
  if (report.warnings.length > 0 || report.risks.length > 0) {
    return "warning";
  }
  return "healthy";
}

export function deriveDoctorNextAction(report: Omit<BridgeDoctorResult, "nextAction">): string {
  if (report.remediation.length > 0) {
    return report.remediation[0];
  }
  if (!report.ok && report.blockers.length > 0) {
    return "Resolve bridge blockers before retrying execution.";
  }
  if (report.ok) {
    return "Bridge checks passed. You can proceed with bridge-backed execution smoke or normal runs.";
  }
  return "Inspect doctor output and resolve blockers before retrying.";
}

export function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)];
}

export function encodeBridgeInputForEnv(input: BridgeInput): string {
  return Buffer.from(JSON.stringify(input), "utf8").toString("base64url");
}

export function decodeBridgeInputFromEnv(encoded: string): BridgeInput {
  const raw = Buffer.from(encoded, "base64url").toString("utf8");
  return JSON.parse(raw) as BridgeInput;
}

export async function readBridgeInput(
  env: NodeJS.ProcessEnv = process.env,
  stdinReader: () => Promise<string> = readStdin,
): Promise<BridgeInput> {
  const encoded = env[BRIDGE_INPUT_ENV_VAR]?.trim();
  if (encoded) {
    return decodeBridgeInputFromEnv(encoded);
  }
  const rawInput = await stdinReader();
  return rawInput.trim().length > 0 ? (JSON.parse(rawInput) as BridgeInput) : {};
}

function getRequire() {
  return createRequire(import.meta.url);
}

function isOpenClawPackageRoot(candidate: string): boolean {
  return existsSync(path.join(candidate, "package.json")) && existsSync(path.join(candidate, "dist", "plugin-sdk"));
}

function findEnclosingOpenClawPackageRoot(candidatePath: string): string | null {
  let cursor = path.dirname(path.resolve(candidatePath));
  while (true) {
    if (isOpenClawPackageRoot(cursor)) {
      return cursor;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) {
      return null;
    }
    cursor = parent;
  }
}

export function resolveOpenClawRootFromExecPath(execPath: string = process.execPath): string | null {
  const enclosedRoot = findEnclosingOpenClawPackageRoot(execPath);
  if (enclosedRoot) {
    return enclosedRoot;
  }
  const execDir = path.dirname(path.resolve(execPath));
  const prefixes = dedupeStrings([
    path.resolve(execDir, ".."),
    path.resolve(execDir, "..", ".."),
    path.resolve(execDir, "..", "..", ".."),
  ]);

  for (const prefix of prefixes) {
    const candidates = [
      path.join(prefix, "lib", "node_modules", "openclaw"),
      path.join(prefix, "node_modules", "openclaw"),
    ];
    for (const candidate of candidates) {
      if (isOpenClawPackageRoot(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

export function resolveOpenClawRoot(override?: string): string {
  if (override) {
    return path.resolve(override);
  }
  const envRoot = process.env.OPENCLAW_ROOT?.trim();
  if (envRoot) {
    return path.resolve(envRoot);
  }
  const stateDirRoot = path.join(resolveOpenClawStateDir(), "lib", "node_modules", "openclaw");
  if (isOpenClawPackageRoot(stateDirRoot)) {
    return stateDirRoot;
  }
  const argvPathRoot = process.argv[1] ? resolveOpenClawRootFromExecPath(process.argv[1]) : null;
  if (argvPathRoot) {
    return argvPathRoot;
  }
  const execPathRoot = resolveOpenClawRootFromExecPath();
  if (execPathRoot) {
    return execPathRoot;
  }
  const require = getRequire();
  let sdkEntryPath: string;
  try {
    sdkEntryPath = require.resolve("openclaw/plugin-sdk");
  } catch {
    throw new Error(
      "Unable to resolve openclaw package root from bridge context. Set bridge.openclawRoot explicitly or export OPENCLAW_ROOT.",
    );
  }
  let cursor = path.dirname(sdkEntryPath);
  while (true) {
    const packageJsonPath = path.join(cursor, "package.json");
    if (existsSync(packageJsonPath)) {
      return cursor;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) {
      throw new Error("Unable to resolve openclaw package root from plugin-sdk entry");
    }
    cursor = parent;
  }
}

export function resolveAcpRuntimeRegistryModulePath(openclawRoot: string): string {
  const publicAcpRuntimePath = path.join(openclawRoot, "dist", "plugin-sdk", "acp-runtime.js");
  if (existsSync(publicAcpRuntimePath)) {
    return publicAcpRuntimePath;
  }
  return path.join(openclawRoot, "dist", "plugin-sdk", "index.js");
}

function resolveOpenClawStateDir(): string {
  const envStateDir = process.env.OPENCLAW_STATE_DIR?.trim();
  if (envStateDir) {
    return path.resolve(envStateDir);
  }
  return path.join(os.homedir(), ".openclaw");
}

export function resolveAcpxServiceModulePath(openclawRoot: string, cfg: any): string | null {
  if (cfg?.plugins?.entries?.acpx?.enabled === false) {
    return null;
  }
  const candidates: string[] = [];
  const serviceRelativeCandidates = [
    path.join("src", "service.ts"),
    path.join("dist", "service.js"),
    "service.js",
    "index.js",
  ];
  const installPath =
    typeof cfg?.plugins?.installs?.acpx?.installPath === "string" ? cfg.plugins.installs.acpx.installPath.trim() : "";
  if (installPath) {
    for (const relativePath of serviceRelativeCandidates) {
      candidates.push(path.join(installPath, relativePath));
    }
  }

  const globalExtensionRoot = path.join(resolveOpenClawStateDir(), "extensions", "acpx");
  for (const relativePath of serviceRelativeCandidates) {
    candidates.push(path.join(globalExtensionRoot, relativePath));
  }

  const bundledExtensionRoots = [
    path.join(openclawRoot, "dist", "extensions", "acpx"),
    path.join(openclawRoot, "extensions", "acpx"),
  ];
  for (const bundledExtensionRoot of bundledExtensionRoots) {
    for (const relativePath of serviceRelativeCandidates) {
      candidates.push(path.join(bundledExtensionRoot, relativePath));
    }
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function resolveInternalModule(openclawRoot: string, versionAllow?: string[]) {
  const packageJson = JSON.parse(await fs.readFile(path.join(openclawRoot, "package.json"), "utf8")) as { version: string };
  const version = packageJson.version as string;
  if (!matchesOpenClawVersionAllowlist(version, versionAllow)) {
    throw new Error(`OpenClaw version ${version} is not in bridge allowlist (${(versionAllow ?? []).join(", ")})`);
  }
  const specs = resolveInternalModuleSpecCandidates(version);
  if (specs.length === 0) {
    throw new Error(`No internal bridge mapping is registered for OpenClaw ${version}`);
  }
  let lastError: unknown;
  for (const spec of specs) {
    try {
      const loadConfigModulePath = path.join(openclawRoot, spec.exports.loadConfig.relativeModulePath);
      const loadConfigModule = await import(pathToFileURL(loadConfigModulePath).href);
      const loadConfig = loadConfigModule[spec.exports.loadConfig.exportAlias] as (() => unknown) | undefined;
      if (!loadConfig) {
        throw new Error(`Internal bridge mapping candidate is stale for OpenClaw ${version}`);
      }
      return {
        version,
        spec,
        loadConfig,
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `Internal bridge mapping for OpenClaw ${version} is stale${
      lastError instanceof Error && lastError.message ? ` (${lastError.message})` : ""
    }`,
  );
}

async function resolvePatchedSubagentSpawner(openclawRoot: string, spec: InternalModuleSpec) {
  const originalModulePath = path.join(openclawRoot, spec.subagentPatch.relativeModulePath);
  const patchedModulePath = path.join(openclawRoot, spec.subagentPatch.patchedModulePath);
  const source = await fs.readFile(originalModulePath, "utf8");
  await fs.writeFile(patchedModulePath, buildPatchedBridgeModuleSource(source), "utf8");
  const mod = await import(pathToFileURL(patchedModulePath).href);
  const spawnSubagentDirect = mod[spec.subagentPatch.patchedSubagentExports.spawn] as
    | ((params: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<Record<string, unknown>>)
    | undefined;
  const findLatestSubagentRunByChildSession = mod[spec.subagentPatch.patchedSubagentExports.findLatestRun] as
    | ((childSessionKey: string) => Record<string, unknown> | null)
    | undefined;
  const killSubagentRunByChildSession = mod[spec.subagentPatch.patchedSubagentExports.killByChildSession] as
    | ((cfg: unknown, childSessionKey: string) => Promise<Record<string, unknown>>)
    | undefined;
  const isSubagentSessionRunActive = mod[spec.subagentPatch.patchedSubagentExports.isRunActive] as
    | ((childSessionKey: string) => boolean)
    | undefined;
  if (!spawnSubagentDirect || !findLatestSubagentRunByChildSession || !killSubagentRunByChildSession || !isSubagentSessionRunActive) {
    throw new Error("Patched bridge module did not expose subagent helpers");
  }
  return {
    spawnSubagentDirect,
    findLatestSubagentRunByChildSession,
    killSubagentRunByChildSession,
    isSubagentSessionRunActive,
  };
}

function mapSubagentRunState(entry: Record<string, unknown>, active: boolean) {
  if (active) {
    return "running" as const;
  }
  const endedReason = typeof entry.endedReason === "string" ? entry.endedReason : "";
  const outcome = entry.outcome as { status?: string; error?: string } | undefined;
  if (endedReason === "killed" || outcome?.error === "killed") {
    return "cancelled" as const;
  }
  if (outcome?.status === "error") {
    return "failed" as const;
  }
  return "completed" as const;
}

async function runBridgeDoctor(input: BridgeInput): Promise<BridgeDoctorResult> {
  const openclawRoot = resolveOpenClawRoot(input.bridge?.openclawRoot);
  const report: BridgeDoctorResult = {
    ok: false,
    severity: "blocked",
    openclawRoot,
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
    migrationChecklist: [],
    checks: {
      versionMapped: false,
      versionAllowed: false,
      internalModuleResolved: false,
      acpBackendHealthy: false,
      subagentPatchable: false,
    },
    blockers: [],
    warnings: [],
    risks: [
      "subagent bridge mode depends on internal OpenClaw bundle aliases and version pinning",
      "subagent bridge mode is a legacy opt-in path and may break on upstream packaging changes",
    ],
    remediation: [],
    nextAction: "Resolve bridge blockers before using bridge-backed execution.",
  };

  if (!input.bridge?.versionAllow || input.bridge.versionAllow.length === 0) {
    report.warnings.push("bridge.versionAllow is empty; version drift risk is high");
  }
  if (!input.bridge?.openclawRoot) {
    report.warnings.push("bridge.openclawRoot is not pinned; bridge will rely on install auto-detection");
  }

  try {
    const publicApi = await detectPublicApiAvailability({
      rootLoader: async () =>
        (await import(pathToFileURL(path.join(openclawRoot, "dist", "plugin-sdk", "index.js")).href)) as Record<string, unknown>,
      acpRuntimeLoader: async () =>
        (await import(pathToFileURL(resolveAcpRuntimeRegistryModulePath(openclawRoot)).href)) as Record<string, unknown>,
    });
    report.publicApi = {
      acpControlPlaneExport: publicApi.acpControlPlaneExport,
      subagentSpawnExport: publicApi.subagentSpawnExport,
      readyReplacementPoints: publicApi.readyReplacementPoints,
    };
    report.replacementPlan = buildReplacementPlan(publicApi);
    report.migrationChecklist = buildMigrationChecklist(report.replacementPlan);
    report.warnings.push(...publicApi.notes);
  } catch (error) {
    report.warnings.push(`Unable to inspect public plugin SDK exports: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const packageJson = JSON.parse(await fs.readFile(path.join(openclawRoot, "package.json"), "utf8")) as { version: string };
    report.version = packageJson.version;
    const compatibility = resolveBridgeCompatibility(packageJson.version);
    if (compatibility) {
      report.compatibility = {
        strategy: compatibility.strategy,
        testedAt: compatibility.testedAt,
        supportedRunners: compatibility.supportedRunners.filter((runner) => runner === "subagent"),
        replacementCandidates: [compatibility.replacementCandidates.subagentSpawnExport],
        notes: compatibility.notes,
      };
    }
    report.checks.versionAllowed =
      !input.bridge?.versionAllow ||
      input.bridge.versionAllow.length === 0 ||
      matchesOpenClawVersionAllowlist(packageJson.version, input.bridge.versionAllow);
    if (!report.checks.versionAllowed) {
      report.blockers.push(`OpenClaw version ${packageJson.version} is not in bridge allowlist (${(input.bridge?.versionAllow ?? []).join(", ")})`);
    }
    report.checks.versionMapped = Boolean(resolveInternalModuleSpec(packageJson.version));
    if (!report.checks.versionMapped) {
      report.blockers.push(`No internal bridge mapping is registered for OpenClaw ${packageJson.version}`);
      return report;
    }

    const { loadConfig, spec } = await resolveInternalModule(openclawRoot, input.bridge?.versionAllow);
    report.checks.internalModuleResolved = true;
    const cfg = loadConfig();
    void cfg;
    report.checks.acpBackendHealthy = true;

    try {
      await resolvePatchedSubagentSpawner(openclawRoot, spec);
      report.checks.subagentPatchable = true;
    } catch (error) {
      report.blockers.push(error instanceof Error ? error.message : String(error));
    }
  } catch (error) {
    report.blockers.push(error instanceof Error ? error.message : String(error));
  }

  report.ok = report.blockers.length === 0;
  report.blockers = dedupeStrings(report.blockers);
  report.warnings = dedupeStrings(report.warnings);
  report.remediation = deriveDoctorRemediation(report);
  report.remediation = dedupeStrings(report.remediation);
  report.severity = deriveDoctorSeverity(report);
  report.nextAction = deriveDoctorNextAction(report);
  return report;
}

type AcpxRuntimeService = {
  start(ctx: { config: unknown; workspaceDir?: string; stateDir: string; logger: any }): Promise<void> | void;
};

export function resolveAcpxRuntimeServiceFactory(
  mod: Record<string, unknown>,
): ((params?: { pluginConfig?: unknown }) => AcpxRuntimeService) | null {
  const exportedFactory = mod.createAcpxRuntimeService;
  if (typeof exportedFactory === "function") {
    return exportedFactory as (params?: { pluginConfig?: unknown }) => AcpxRuntimeService;
  }

  const plugin = mod.default as { register?: (api: { pluginConfig?: unknown; registerService: (service: AcpxRuntimeService) => void }) => void } | undefined;
  const register = plugin?.register;
  if (typeof register !== "function") {
    return null;
  }

  return (params?: { pluginConfig?: unknown }) => {
    let registeredService: AcpxRuntimeService | null = null;
    register({
      pluginConfig: params?.pluginConfig,
      registerService(service) {
        registeredService = service;
      },
    });
    if (!registeredService) {
      throw new Error("ACPX plugin did not register a runtime service");
    }
    return registeredService;
  };
}

export async function ensureAcpxBackendRegistered(openclawRoot: string, cfg: any): Promise<void> {
  const backendId = cfg?.acp?.backend ?? "acpx";
  const registryModulePath = pathToFileURL(resolveAcpRuntimeRegistryModulePath(openclawRoot)).href;
  const registryModule = await import(registryModulePath);
  const getBackend = () => registryModule.getAcpRuntimeBackend?.(backendId) ?? null;
  if (getBackend()) {
    await waitForAcpBackendHealthy(getBackend, backendId);
    return;
  }

  const serviceModulePath = resolveAcpxServiceModulePath(openclawRoot, cfg);
  if (!serviceModulePath) {
    throw new Error("ACP runtime backend is not configured. Install and enable the acpx plugin.");
  }

  const mod = await import(pathToFileURL(serviceModulePath).href);
  const createAcpxRuntimeService = resolveAcpxRuntimeServiceFactory(mod as Record<string, unknown>);
  if (!createAcpxRuntimeService) {
    throw new Error("Unable to load acpx runtime service for bridge bootstrap");
  }

  const workspaceDir = cfg?.agents?.defaults?.workspace ?? cfg?.workspace ?? path.join(openclawRoot, ".bridge-workspace");
  const service = createAcpxRuntimeService({ pluginConfig: cfg?.plugins?.entries?.acpx?.config });
  await service.start({
    config: cfg,
    workspaceDir,
    stateDir: path.join(workspaceDir, ".openclaw-bridge-state"),
    logger: {
      debug() {
        return;
      },
      info() {
        return;
      },
      warn() {
        return;
      },
      error() {
        return;
      },
    },
  });
  await waitForAcpBackendHealthy(getBackend, backendId);
}

export async function waitForAcpBackendHealthy(
  getBackend: () => { healthy?: () => boolean } | null,
  backendId: string,
  timeoutMs = 15_000,
  intervalMs = 250,
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const backend = getBackend();
    if (backend && (!backend.healthy || backend.healthy())) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`ACP runtime backend is currently unavailable. Try again in a moment. (backend: ${backendId})`);
}

async function handleAcp(command: BridgeCommand, input: BridgeInput) {
  const openclawRoot = resolveOpenClawRoot(input.bridge?.openclawRoot);
  if (command === "doctor") {
    const report = await runBridgeDoctor(input);
    return {
      ok: true,
      version: report.version ?? "unknown",
      result: report,
    };
  }
  const { loadConfig, version, spec } = await resolveInternalModule(
    openclawRoot,
    input.bridge?.versionAllow,
  );
  const cfg = loadConfig();
  const params = input.params ?? {};

  if (command === "subagent-spawn") {
    const subagentHelpers = await resolvePatchedSubagentSpawner(openclawRoot, spec);
    const subagentParams = params as {
      task: string;
      label?: string;
      agentId?: string;
      mode?: "run" | "session";
      thread?: boolean;
      runTimeoutSeconds?: number;
    };
    const result = await subagentHelpers.spawnSubagentDirect(
      {
        task: subagentParams.task,
        label: subagentParams.label,
        agentId: subagentParams.agentId,
        mode: subagentParams.mode,
        thread: subagentParams.thread,
        runTimeoutSeconds: subagentParams.runTimeoutSeconds,
        expectsCompletionMessage: false,
      },
      {
        requesterAgentIdOverride: "main",
      },
    );
    if (result.status !== "accepted") {
      throw new Error(result.error ? String(result.error) : `Subagent spawn failed with status ${String(result.status)}`);
    }
    return {
      ok: true,
      version,
      result: {
        childSessionKey: result.childSessionKey,
        runId: result.runId,
        mode: result.mode ?? subagentParams.mode ?? "run",
        acceptedAt: new Date().toISOString(),
        note: result.note,
      },
    };
  }

  if (command === "subagent-status") {
    const subagentHelpers = await resolvePatchedSubagentSpawner(openclawRoot, spec);
    const statusParams = params as { childSessionKey: string };
    const entry = subagentHelpers.findLatestSubagentRunByChildSession(statusParams.childSessionKey);
    if (!entry) {
      throw new Error(`Subagent run not found for ${statusParams.childSessionKey}`);
    }
    const active = subagentHelpers.isSubagentSessionRunActive(statusParams.childSessionKey);
    return {
      ok: true,
      version,
      result: {
        childSessionKey: statusParams.childSessionKey,
        runId: typeof entry.runId === "string" ? entry.runId : undefined,
        state: mapSubagentRunState(entry, active),
        checkedAt: new Date().toISOString(),
        message:
          typeof (entry.outcome as { error?: string } | undefined)?.error === "string"
            ? (entry.outcome as { error?: string }).error
            : typeof entry.frozenResultText === "string"
              ? entry.frozenResultText
              : undefined,
        outputText: typeof entry.frozenResultText === "string" ? entry.frozenResultText : undefined,
      },
    };
  }

  if (command === "subagent-kill") {
    const subagentHelpers = await resolvePatchedSubagentSpawner(openclawRoot, spec);
    const killParams = params as { childSessionKey: string; reason?: string };
    const entry = subagentHelpers.findLatestSubagentRunByChildSession(killParams.childSessionKey);
    if (!entry) {
      throw new Error(`Subagent run not found for ${killParams.childSessionKey}`);
    }
    await subagentHelpers.killSubagentRunByChildSession(cfg, killParams.childSessionKey);
    return {
      ok: true,
      version,
      result: {
        childSessionKey: killParams.childSessionKey,
        killedAt: new Date().toISOString(),
        message: killParams.reason ?? "killed",
      },
    };
  }

  throw new Error(`Unsupported bridge command: ${command}`);
}

export async function runBridgeCommand(command: BridgeCommand, input: BridgeInput) {
  return handleAcp(command, input);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function main(argv: string[]): Promise<number> {
  const command = argv[2] as BridgeCommand | undefined;
  if (!command) {
    process.stderr.write("Missing bridge command\n");
    return 1;
  }

  try {
    const parsed = await readBridgeInput();
    const result = await runBridgeCommand(command, parsed);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  void main(process.argv).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    },
  );
}
