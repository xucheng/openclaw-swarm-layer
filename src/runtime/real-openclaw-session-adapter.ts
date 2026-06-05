import { randomUUID } from "node:crypto";
import fs, { type FileHandle } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { SwarmPluginConfig } from "../config.js";
import type { PluginRuntime } from "openclaw/plugin-sdk/core";
import type { OpenClawSessionAdapter, AcpAcceptedSession, AcpSessionStatus } from "./openclaw-session-adapter.js";
import type { AcpSpawnParams } from "./acp-mapping.js";
import { supportsPublicAcpRuntime } from "./openclaw-version.js";
import {
  ensureAcpxBackendRegistered,
  resolveAcpRuntimeRegistryModulePath,
  resolveOpenClawRoot,
  resolveOpenClawStateDir,
} from "./openclaw-exec-bridge.js";

type AcpManager = {
  initializeSession(input: {
    cfg: unknown;
    sessionKey: string;
    agent: string;
    mode: "persistent" | "oneshot";
    cwd?: string;
    backendId?: string;
  }): Promise<{
    handle: {
      sessionKey: string;
      backend: string;
      backendSessionId?: string;
      agentSessionId?: string;
    };
  }>;
  runTurn(input: {
    cfg: unknown;
    sessionKey: string;
    text: string;
    mode: "prompt" | "steer";
    requestId: string;
  }): Promise<void>;
  setSessionRuntimeMode?(input: { cfg: unknown; sessionKey: string; runtimeMode: string }): Promise<void>;
  getSessionStatus(input: { cfg: unknown; sessionKey: string }): Promise<{
    sessionKey: string;
    backend: string;
    state: "idle" | "running" | "error";
    identity?: { acpxSessionId?: string; agentSessionId?: string };
    runtimeStatus?: { backendSessionId?: string; agentSessionId?: string; summary?: string };
    lastError?: string;
  }>;
  cancelSession(input: { cfg: unknown; sessionKey: string; reason?: string }): Promise<void>;
  closeSession(input: { cfg: unknown; sessionKey: string; reason: string }): Promise<{ runtimeClosed: boolean; runtimeNotice?: string }>;
};

type SdkLike = {
  getAcpSessionManager?: () => AcpManager;
};

type SdkImporter = (specifier: string) => Promise<SdkLike>;
type CompatibleAcpSdkLoadOptions = {
  importModule?: SdkImporter;
  resolveOpenClawRoot?: () => string;
};
type RuntimeConfigSnapshotReader = Pick<PluginRuntime, "config">["config"] & {
  current?: () => unknown;
  loadConfig?: () => unknown;
};

const PUBLIC_ACP_RUNTIME_UNAVAILABLE_PATTERNS = [
  "getAcpSessionManager at runtime",
  "Unable to load a compatible OpenClaw ACP SDK entry",
  "Cannot find package 'openclaw'",
];
const MAX_ACP_DIAGNOSTIC_BYTES = 16_384;
const MAX_ACP_DIAGNOSTIC_CHARS = 300;
const ACP_DIAGNOSTIC_LOG_MTIME_WINDOW_MS = 60_000;
const GENERIC_ACP_ERROR_PATTERNS = [
  /\bInternal error\b/i,
  /ACP turn failed before completion/i,
  /Could not initialize ACP session runtime/i,
];

function defaultImportModule(specifier: string): Promise<SdkLike> {
  return import(specifier) as Promise<SdkLike>;
}

function readRuntimeConfigSnapshot(runtime: Pick<PluginRuntime, "config">): unknown {
  const config = runtime.config as RuntimeConfigSnapshotReader;
  if (typeof config.current === "function") {
    return config.current();
  }
  if (typeof config.loadConfig === "function") {
    return config.loadConfig();
  }
  throw new Error("OpenClaw runtime config snapshot is unavailable for ACP control-plane execution");
}

function buildHostSdkImportSpecifiers(runtimeVersion?: string | null, rootResolver: () => string = resolveOpenClawRoot): string[] {
  const openclawRoot = rootResolver();
  const fallbackPaths = supportsPublicAcpRuntime(runtimeVersion)
    ? [
        resolveAcpRuntimeRegistryModulePath(openclawRoot),
        path.join(openclawRoot, "dist", "plugin-sdk", "index.js"),
      ]
    : [path.join(openclawRoot, "dist", "plugin-sdk", "index.js")];
  return fallbackPaths.map((entry) => pathToFileURL(entry).href);
}

export async function loadCompatibleAcpSdk(
  runtimeVersion?: string | null,
  options: CompatibleAcpSdkLoadOptions = {},
): Promise<SdkLike> {
  const importModule = options.importModule ?? defaultImportModule;
  const rootResolver = options.resolveOpenClawRoot ?? resolveOpenClawRoot;
  const packageSpecifiers = supportsPublicAcpRuntime(runtimeVersion)
    ? ["openclaw/plugin-sdk/acp-runtime", "openclaw/plugin-sdk"]
    : ["openclaw/plugin-sdk"];
  let lastError: unknown;
  let hostSpecifiers: string[] = [];

  try {
    // Prefer the host OpenClaw install so local devDependencies do not shadow the live ACP registry.
    hostSpecifiers = buildHostSdkImportSpecifiers(runtimeVersion, rootResolver);
  } catch (error) {
    lastError = error;
  }

  for (const specifier of hostSpecifiers) {
    try {
      return await importModule(specifier);
    } catch (error) {
      lastError = error;
    }
  }

  for (const specifier of packageSpecifiers) {
    try {
      return await importModule(specifier);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Unable to load a compatible OpenClaw ACP SDK entry");
}

export function isPublicAcpRuntimeUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return PUBLIC_ACP_RUNTIME_UNAVAILABLE_PATTERNS.some((pattern) => error.message.includes(pattern));
}

function shouldUsePublicSessionAdapter(
  runtime: Pick<PluginRuntime, "version"> | undefined,
  config: Pick<SwarmPluginConfig, "acp">,
): boolean {
  if (!runtime || !config.acp.enabled) {
    return false;
  }
  if (supportsPublicAcpRuntime(runtime.version)) {
    return true;
  }
  return Boolean(config.acp.experimentalControlPlaneAdapter);
}

function mapManagerState(status: Awaited<ReturnType<AcpManager["getSessionStatus"]>>): AcpSessionStatus["state"] {
  if (status.state === "running") {
    return "running";
  }
  if (status.state === "error") {
    return "failed";
  }
  return "completed";
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }
  return String(error).trim();
}

function resolveDefaultRuntimeMode(configuredRuntimeMode: string | undefined, agentId: string): string | undefined {
  if (configuredRuntimeMode) {
    return configuredRuntimeMode;
  }
  return agentId === "codex" ? "auto" : undefined;
}

function isGenericAcpMessage(message: string | undefined): boolean {
  return Boolean(message && GENERIC_ACP_ERROR_PATTERNS.some((pattern) => pattern.test(message)));
}

function isUnsupportedRuntimeModeControlError(error: unknown): boolean {
  const message = normalizeErrorMessage(error);
  return /session\/set_mode|unsupported|does not support|not supported/i.test(message);
}

function truncateDiagnostic(value: string): string {
  return value.length > MAX_ACP_DIAGNOSTIC_CHARS ? `${value.slice(0, MAX_ACP_DIAGNOSTIC_CHARS - 3)}...` : value;
}

function redactDiagnostic(value: string): string {
  return truncateDiagnostic(
    value
      .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "<redacted-token>")
      .replace(/\b(api[_-]?key|token|secret|password)=\S+/gi, "$1=<redacted>")
      .trim(),
  );
}

function appendDiagnostic(message: string | undefined, diagnostic: string | undefined): string | undefined {
  if (!diagnostic) {
    return message;
  }
  if (!message) {
    return diagnostic;
  }
  if (message.includes(diagnostic)) {
    return message;
  }
  return `${message} (diagnostic: ${diagnostic})`;
}

function extractWrapperPathFromCommand(command: string | undefined): string | undefined {
  if (!command) {
    return undefined;
  }
  const quoted = command.match(/"([^"]*codex-acp-wrapper\.mjs)"/);
  if (quoted?.[1]) {
    return quoted[1];
  }
  const token = command.split(/\s+/).find((entry) => entry.includes("codex-acp-wrapper.mjs"));
  return token?.replace(/^"|"$/g, "");
}

type PersistedAcpSessionRecord = {
  pid?: number | string;
  agent_command?: string;
  mtimeMs?: number;
};

function normalizePid(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return String(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return value;
  }
  return undefined;
}

function resolveWrapperLogDir(records: PersistedAcpSessionRecord[]): string {
  for (const record of records) {
    const wrapperPath = extractWrapperPathFromCommand(record.agent_command);
    if (wrapperPath) {
      return path.dirname(wrapperPath);
    }
  }
  return path.join(resolveOpenClawStateDir(), "workspace", ".openclaw-bridge-state", "acpx");
}

async function readPersistedSessionRecords(sessionKey: string): Promise<PersistedAcpSessionRecord[]> {
  const sessionsDir = path.join(resolveOpenClawStateDir(), "workspace", "state", "sessions");
  const encodedSessionKey = encodeURIComponent(sessionKey);
  let entries: string[];
  try {
    entries = await fs.readdir(sessionsDir);
  } catch {
    return [];
  }

  const candidates = (
    await Promise.all(
      entries
        .filter((entry) => entry.startsWith(encodedSessionKey) && entry.endsWith(".json"))
        .map(async (entry) => {
          const filePath = path.join(sessionsDir, entry);
          try {
            const stat = await fs.stat(filePath);
            return { filePath, mtimeMs: stat.mtimeMs };
          } catch {
            return null;
          }
        }),
    )
  )
    .filter((entry): entry is { filePath: string; mtimeMs: number } => Boolean(entry))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  const records: PersistedAcpSessionRecord[] = [];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(await fs.readFile(candidate.filePath, "utf8")) as PersistedAcpSessionRecord;
      records.push({ ...parsed, mtimeMs: candidate.mtimeMs });
    } catch {
      // Keep scanning in case the newest record is mid-write.
    }
  }
  return records;
}

function isNearSessionRecordMtime(logMtimeMs: number, records: PersistedAcpSessionRecord[]): boolean {
  const recordMtimes = records.map((record) => record.mtimeMs).filter((value): value is number => typeof value === "number");
  if (recordMtimes.length === 0) {
    return true;
  }
  const minMtime = Math.min(...recordMtimes) - ACP_DIAGNOSTIC_LOG_MTIME_WINDOW_MS;
  const maxMtime = Math.max(...recordMtimes) + ACP_DIAGNOSTIC_LOG_MTIME_WINDOW_MS;
  return logMtimeMs >= minMtime && logMtimeMs <= maxMtime;
}

async function resolveWrapperStderrPaths(records: PersistedAcpSessionRecord[]): Promise<string[]> {
  const logDir = resolveWrapperLogDir(records);
  const stderrPaths: string[] = [];
  for (const record of records) {
    const pid = normalizePid(record.pid);
    if (!pid) {
      continue;
    }
    const expectedPath = path.join(logDir, `codex-acp-wrapper.stderr.pid-${pid}.log`);
    try {
      await fs.access(expectedPath);
      if (!stderrPaths.includes(expectedPath)) {
        stderrPaths.push(expectedPath);
      }
    } catch {
      // Fall back to the newest wrapper stderr in case persisted pid metadata is stale.
    }
  }
  try {
    const entries = await fs.readdir(logDir);
    const candidates = (
      await Promise.all(
        entries
          .filter((entry) => entry.startsWith("codex-acp-wrapper.stderr.pid-") && entry.endsWith(".log"))
          .map(async (entry) => {
            const filePath = path.join(logDir, entry);
            try {
              const stat = await fs.stat(filePath);
              return { filePath, mtimeMs: stat.mtimeMs };
            } catch {
              return null;
            }
          }),
      )
    )
      .filter((entry): entry is { filePath: string; mtimeMs: number } => Boolean(entry))
      .filter((entry) => isNearSessionRecordMtime(entry.mtimeMs, records))
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    for (const candidate of candidates) {
      if (!stderrPaths.includes(candidate.filePath)) {
        stderrPaths.push(candidate.filePath);
      }
    }
    return stderrPaths;
  } catch {
    return stderrPaths;
  }
}

async function readFileTail(filePath: string): Promise<string | undefined> {
  let handle: FileHandle | undefined;
  try {
    handle = await fs.open(filePath, "r");
    const stat = await handle.stat();
    if (stat.size <= 0) {
      return undefined;
    }
    const length = Math.min(stat.size, MAX_ACP_DIAGNOSTIC_BYTES);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, stat.size - length);
    return buffer.toString("utf8");
  } catch {
    return undefined;
  } finally {
    await handle?.close();
  }
}

function looksLikeUsefulAcpDiagnostic(value: string): boolean {
  return /quota|usage|limit|permission|denied|sandbox|approval|timeout|failed|error|exception|abort/i.test(value);
}

function extractDiagnosticFromWrapperLine(line: string): string | undefined {
  const trimmed = line.trim();
  if (!trimmed) {
    return undefined;
  }
  const unhandled = trimmed.match(/Unhandled error during turn:\s*(.+)$/i);
  if (unhandled?.[1]) {
    return redactDiagnostic(unhandled[1]);
  }
  const errorLine = trimmed.match(/\bERROR\b\s+[^:]+:\s*(.+)$/i);
  if (errorLine?.[1] && looksLikeUsefulAcpDiagnostic(errorLine[1])) {
    return redactDiagnostic(errorLine[1]);
  }
  if (looksLikeUsefulAcpDiagnostic(trimmed)) {
    return redactDiagnostic(trimmed);
  }
  return undefined;
}

async function readAcpWrapperDiagnostic(sessionKey: string): Promise<string | undefined> {
  const records = await readPersistedSessionRecords(sessionKey);
  const stderrPaths = await resolveWrapperStderrPaths(records);
  for (const stderrPath of stderrPaths) {
    const tail = await readFileTail(stderrPath);
    if (!tail) {
      continue;
    }
    const lines = tail.split(/\r?\n/).reverse();
    for (const line of lines) {
      const diagnostic = extractDiagnosticFromWrapperLine(line);
      if (diagnostic) {
        return diagnostic;
      }
    }
  }
  return undefined;
}

async function resolveAcpStatusMessage(params: {
  sessionKey: string;
  state: AcpSessionStatus["state"];
  upstreamMessage?: string;
  caughtTurnError?: string;
}): Promise<string | undefined> {
  const primary = params.upstreamMessage ?? params.caughtTurnError;
  if (params.state !== "failed") {
    return primary;
  }

  if (primary && !isGenericAcpMessage(primary)) {
    return primary;
  }

  const directDiagnostic =
    params.caughtTurnError && !isGenericAcpMessage(params.caughtTurnError) ? params.caughtTurnError : undefined;
  const persistedDiagnostic = directDiagnostic ?? (await readAcpWrapperDiagnostic(params.sessionKey));
  return appendDiagnostic(primary, persistedDiagnostic);
}

async function applyDefaultRuntimeMode(params: {
  manager: AcpManager;
  cfg: unknown;
  sessionKey: string;
  runtimeMode: string | undefined;
  explicit: boolean;
}): Promise<void> {
  if (!params.runtimeMode) {
    return;
  }
  if (!params.manager.setSessionRuntimeMode) {
    if (params.explicit) {
      throw new Error("OpenClaw ACP manager does not support acp.defaultRuntimeMode; upgrade OpenClaw or remove this setting.");
    }
    return;
  }
  try {
    await params.manager.setSessionRuntimeMode({
      cfg: params.cfg,
      sessionKey: params.sessionKey,
      runtimeMode: params.runtimeMode,
    });
  } catch (error) {
    if (!params.explicit && isUnsupportedRuntimeModeControlError(error)) {
      return;
    }
    throw new Error(`Could not apply ACP runtime mode "${params.runtimeMode}": ${normalizeErrorMessage(error)}`);
  }
}

export class ExperimentalRealOpenClawSessionAdapter implements OpenClawSessionAdapter {
  private readonly turnErrorsBySession = new Map<string, string>();

  constructor(
    private readonly runtime: Pick<PluginRuntime, "config" | "version">,
    private readonly config: Pick<SwarmPluginConfig, "acp">,
    private readonly sdkLoader: () => Promise<SdkLike> = () => loadCompatibleAcpSdk(runtime.version),
    private readonly ensureBackendRegistered: (openclawRoot: string, cfg: unknown) => Promise<void> = ensureAcpxBackendRegistered,
  ) {}

  private async getManager(): Promise<{ manager: AcpManager; cfg: unknown }> {
    if (!shouldUsePublicSessionAdapter(this.runtime, this.config)) {
      throw new Error("OpenClaw public ACP session adapter is disabled for this runtime/config combination");
    }
    const cfg = readRuntimeConfigSnapshot(this.runtime);
    await this.ensureBackendRegistered(resolveOpenClawRoot(), cfg);
    const sdk = await this.sdkLoader();
    const manager = sdk.getAcpSessionManager?.();
    if (!manager) {
      throw new Error(
        "OpenClaw public ACP runtime does not expose getAcpSessionManager at runtime; real ACP adapter remains blocked on an upstream public control-plane export",
      );
    }
    return { manager, cfg };
  }

  async spawnAcpSession(params: AcpSpawnParams): Promise<AcpAcceptedSession> {
    const { manager, cfg } = await this.getManager();
    const sessionKey = `agent:${params.agentId}:acp:${randomUUID()}`;
    const initialized = await manager.initializeSession({
      cfg,
      sessionKey,
      agent: params.agentId,
      mode: params.mode === "session" ? "persistent" : "oneshot",
      cwd: params.cwd,
      backendId: this.config.acp.backendId,
    });
    await applyDefaultRuntimeMode({
      manager,
      cfg,
      sessionKey,
      runtimeMode: resolveDefaultRuntimeMode(this.config.acp.defaultRuntimeMode, params.agentId),
      explicit: Boolean(this.config.acp.defaultRuntimeMode),
    });
    void manager
      .runTurn({
        cfg,
        sessionKey,
        text: params.task,
        mode: "prompt",
        requestId: randomUUID(),
      })
      .then(
        () => this.turnErrorsBySession.delete(sessionKey),
        (error) => this.turnErrorsBySession.set(sessionKey, normalizeErrorMessage(error)),
      );
    return {
      sessionKey,
      backend: initialized.handle.backend,
      backendSessionId: initialized.handle.backendSessionId,
      agentSessionId: initialized.handle.agentSessionId,
      acceptedAt: new Date().toISOString(),
    };
  }

  async getAcpSessionStatus(sessionKey: string): Promise<AcpSessionStatus> {
    const { manager, cfg } = await this.getManager();
    const status = await manager.getSessionStatus({ cfg, sessionKey });
    const state = mapManagerState(status);
    const message = await resolveAcpStatusMessage({
      sessionKey,
      state,
      upstreamMessage: status.lastError ?? status.runtimeStatus?.summary,
      caughtTurnError: this.turnErrorsBySession.get(sessionKey),
    });
    return {
      sessionKey,
      state,
      backend: status.backend,
      backendSessionId: status.runtimeStatus?.backendSessionId ?? status.identity?.acpxSessionId,
      agentSessionId: status.runtimeStatus?.agentSessionId ?? status.identity?.agentSessionId,
      checkedAt: new Date().toISOString(),
      message,
    };
  }

  async cancelAcpSession(sessionKey: string, reason?: string): Promise<{ sessionKey: string; cancelledAt?: string; message?: string }> {
    const { manager, cfg } = await this.getManager();
    await manager.cancelSession({ cfg, sessionKey, reason });
    return { sessionKey, cancelledAt: new Date().toISOString(), message: reason };
  }

  async closeAcpSession(sessionKey: string, reason?: string): Promise<{ sessionKey: string; closedAt?: string; message?: string }> {
    const { manager, cfg } = await this.getManager();
    const closed = await manager.closeSession({ cfg, sessionKey, reason: reason ?? "closed by swarm layer" });
    return {
      sessionKey,
      closedAt: new Date().toISOString(),
      message: closed.runtimeNotice ?? reason,
    };
  }
}

export function createSessionAdapter(
  runtime: Pick<PluginRuntime, "config" | "version"> | undefined,
  config: Pick<SwarmPluginConfig, "acp">,
): OpenClawSessionAdapter | null {
  if (!runtime || !shouldUsePublicSessionAdapter(runtime, config)) {
    return null;
  }
  return new ExperimentalRealOpenClawSessionAdapter(runtime, config);
}
