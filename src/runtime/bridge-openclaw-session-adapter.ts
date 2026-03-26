import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { PluginRuntime } from "openclaw/plugin-sdk";
import type { SwarmPluginConfig } from "../config.js";
import type { AcpSpawnParams } from "./acp-mapping.js";
import { formatBridgeFailure } from "./bridge-errors.js";
import type { AcpAcceptedSession, AcpSessionStatus, OpenClawSessionAdapter } from "./openclaw-session-adapter.js";

export const ACP_BRIDGE_REPLACEMENT_BOUNDARY = {
  currentImplementation: "bridge-openclaw-session-adapter -> openclaw-exec-bridge",
  targetImplementation: "real-openclaw-session-adapter via top-level public plugin-sdk export",
  publicExport: "getAcpSessionManager",
};

type BridgeResponse<T> = {
  ok: boolean;
  version: string;
  result: T;
};

export type BridgeSpawnResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export type BridgeCommandRunner = (
  argv: string[],
  options: { cwd: string; input: string; timeoutMs: number },
) => Promise<BridgeSpawnResult>;

export function resolveBridgeScriptPath() {
  const currentFile = fileURLToPath(import.meta.url);
  let cursor = path.dirname(currentFile);
  while (true) {
    if (existsSync(path.join(cursor, "openclaw.plugin.json")) || existsSync(path.join(cursor, "package.json"))) {
      break;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) {
      throw new Error("Unable to resolve swarm-layer project root for bridge script");
    }
    cursor = parent;
  }
  const projectRoot = cursor;
  return path.join(projectRoot, "scripts", "openclaw-exec-bridge.mjs");
}

export function resolveTsxLoaderPath() {
  const require = createRequire(import.meta.url);
  try {
    const resolved = require.resolve("tsx");
    if (existsSync(resolved)) {
      return resolved;
    }
  } catch {
    // Fall back to direct node_modules probing for path-linked plugin installs.
  }

  const currentFile = fileURLToPath(import.meta.url);
  let cursor = path.dirname(currentFile);
  while (true) {
    const candidate = path.join(cursor, "node_modules", "tsx", "dist", "loader.mjs");
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) {
      throw new Error("Unable to resolve tsx loader for bridge execution");
    }
    cursor = parent;
  }
}

export async function runBridgeCommandDirect(
  argv: string[],
  options: { cwd: string; input: string; timeoutMs: number },
): Promise<BridgeSpawnResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(argv[0]!, argv.slice(1), {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, options.timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        code: signal ? 1 : code ?? 1,
        stdout,
        stderr: timedOut && stderr.trim().length === 0 ? `bridge timed out after ${options.timeoutMs}ms` : stderr,
      });
    });

    child.stdin.write(options.input);
    child.stdin.end();
  });
}

export class BridgeOpenClawSessionAdapter implements OpenClawSessionAdapter {
  constructor(
    _runtime: Pick<PluginRuntime, "system"> | undefined,
    private readonly config: Pick<SwarmPluginConfig, "acp" | "bridge">,
    private readonly nodePath: string = config.bridge.nodePath ?? process.execPath,
    private readonly bridgeScriptPath: string = resolveBridgeScriptPath(),
    private readonly tsxLoaderPath: string = resolveTsxLoaderPath(),
    private readonly commandRunner: BridgeCommandRunner = runBridgeCommandDirect,
  ) {}

  private async runBridge<T>(command: "acp-spawn" | "acp-status" | "acp-cancel" | "acp-close", params: Record<string, unknown>): Promise<T> {
    const spawnResult = await this.commandRunner([this.nodePath, "--import", this.tsxLoaderPath, this.bridgeScriptPath, command], {
      timeoutMs: 120_000,
      cwd: path.dirname(this.bridgeScriptPath),
      input: JSON.stringify({
        bridge: {
          openclawRoot: this.config.bridge.openclawRoot,
          versionAllow: this.config.bridge.versionAllow,
        },
        params,
      }),
    });

    if (spawnResult.code !== 0) {
      throw new Error(formatBridgeFailure(command, spawnResult.stderr.trim() || spawnResult.stdout.trim() || "unknown error"));
    }

    const parsed = JSON.parse(spawnResult.stdout) as BridgeResponse<T>;
    return parsed.result;
  }

  async spawnAcpSession(params: AcpSpawnParams): Promise<AcpAcceptedSession> {
    return this.runBridge<AcpAcceptedSession>("acp-spawn", {
      ...params,
      backendId: this.config.acp.backendId,
      sessionKey: `agent:${params.agentId}:acp:${randomUUID()}`,
      requestId: randomUUID(),
    });
  }

  async getAcpSessionStatus(sessionKey: string): Promise<AcpSessionStatus> {
    return this.runBridge<AcpSessionStatus>("acp-status", { sessionKey });
  }

  async cancelAcpSession(sessionKey: string, reason?: string): Promise<{ sessionKey: string; cancelledAt?: string; message?: string }> {
    return this.runBridge("acp-cancel", { sessionKey, reason });
  }

  async closeAcpSession(sessionKey: string, reason?: string): Promise<{ sessionKey: string; closedAt?: string; message?: string }> {
    return this.runBridge("acp-close", { sessionKey, reason });
  }
}

export function createBridgeSessionAdapter(
  _runtime: Pick<PluginRuntime, "system"> | undefined,
  config: Pick<SwarmPluginConfig, "acp" | "bridge">,
): OpenClawSessionAdapter | null {
  if (!config.bridge.enabled) {
    return null;
  }
  return new BridgeOpenClawSessionAdapter(_runtime, config);
}
