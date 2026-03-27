import { fileURLToPath } from "node:url";
import path from "node:path";
import type { PluginRuntime } from "openclaw/plugin-sdk";
import { isBridgeEnabledForRunner, type SwarmPluginConfig } from "../config.js";
import { formatBridgeFailure } from "./bridge-errors.js";
import type { OpenClawSubagentAdapter, SubagentAcceptedRun, SubagentRunStatus, SubagentSpawnParams } from "./openclaw-subagent-adapter.js";

export const SUBAGENT_BRIDGE_REPLACEMENT_BOUNDARY = {
  currentImplementation: "bridge-openclaw-subagent-adapter -> openclaw-exec-bridge patched helpers",
  targetImplementation: "public subagent spawn helper from top-level plugin-sdk export",
  publicExport: "spawnSubagentDirect",
};

type BridgeCommandRunner = (
  argv: string[],
  options: { cwd: string; input: string; timeoutMs: number },
) => Promise<{ code: number; stdout: string; stderr: string }>;

type BridgeResponse<T> = {
  ok: boolean;
  version: string;
  result: T;
};

export function resolveBridgeScriptPath() {
  const currentFile = fileURLToPath(import.meta.url);
  let cursor = path.dirname(currentFile);
  while (true) {
    const packageJson = path.join(cursor, "package.json");
    if (path.basename(cursor) === "openclaw-swarm-layer") {
      break;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) {
      throw new Error("Unable to resolve swarm-layer project root for subagent bridge script");
    }
    cursor = parent;
  }
  return path.join(cursor, "scripts", "openclaw-exec-bridge.mjs");
}

export function resolveTsxLoaderPath() {
  const currentFile = fileURLToPath(import.meta.url);
  let cursor = path.dirname(currentFile);
  while (true) {
    const candidate = path.join(cursor, "node_modules", "tsx", "dist", "loader.mjs");
    if (path.basename(cursor) === "openclaw-swarm-layer") {
      return candidate;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) {
      throw new Error("Unable to resolve tsx loader for subagent bridge");
    }
    cursor = parent;
  }
}

export async function runBridgeCommandDirect(
  argv: string[],
  options: { cwd: string; input: string; timeoutMs: number },
): Promise<{ code: number; stdout: string; stderr: string }> {
  const { spawn } = await import("node:child_process");
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
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
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

export class BridgeOpenClawSubagentAdapter implements OpenClawSubagentAdapter {
  constructor(
    private readonly config: Pick<SwarmPluginConfig, "bridge">,
    private readonly nodePath: string = config.bridge.nodePath ?? process.execPath,
    private readonly bridgeScriptPath: string = resolveBridgeScriptPath(),
    private readonly tsxLoaderPath: string = resolveTsxLoaderPath(),
    private readonly commandRunner: BridgeCommandRunner = runBridgeCommandDirect,
  ) {}

  async spawnSubagent(params: SubagentSpawnParams): Promise<SubagentAcceptedRun> {
    const result = await this.commandRunner(
      [this.nodePath, "--import", this.tsxLoaderPath, this.bridgeScriptPath, "subagent-spawn"],
      {
        timeoutMs: 120_000,
        cwd: path.dirname(this.bridgeScriptPath),
        input: JSON.stringify({
          bridge: {
            openclawRoot: this.config.bridge.openclawRoot,
            versionAllow: this.config.bridge.versionAllow,
          },
          params,
        }),
      },
    );
    if (result.code !== 0) {
      throw new Error(formatBridgeFailure("subagent-spawn", result.stderr.trim() || result.stdout.trim() || "unknown error"));
    }
    const parsed = JSON.parse(result.stdout) as BridgeResponse<SubagentAcceptedRun>;
    return parsed.result;
  }

  async getSubagentRunStatus(childSessionKey: string): Promise<SubagentRunStatus> {
    const result = await this.commandRunner(
      [this.nodePath, "--import", this.tsxLoaderPath, this.bridgeScriptPath, "subagent-status"],
      {
        timeoutMs: 120_000,
        cwd: path.dirname(this.bridgeScriptPath),
        input: JSON.stringify({
          bridge: {
            openclawRoot: this.config.bridge.openclawRoot,
            versionAllow: this.config.bridge.versionAllow,
          },
          params: { childSessionKey },
        }),
      },
    );
    if (result.code !== 0) {
      throw new Error(formatBridgeFailure("subagent-status", result.stderr.trim() || result.stdout.trim() || "unknown error"));
    }
    const parsed = JSON.parse(result.stdout) as BridgeResponse<SubagentRunStatus>;
    return parsed.result;
  }

  async killSubagentRun(childSessionKey: string, reason?: string): Promise<{ childSessionKey: string; killedAt?: string; message?: string }> {
    const result = await this.commandRunner(
      [this.nodePath, "--import", this.tsxLoaderPath, this.bridgeScriptPath, "subagent-kill"],
      {
        timeoutMs: 120_000,
        cwd: path.dirname(this.bridgeScriptPath),
        input: JSON.stringify({
          bridge: {
            openclawRoot: this.config.bridge.openclawRoot,
            versionAllow: this.config.bridge.versionAllow,
          },
          params: { childSessionKey, reason },
        }),
      },
    );
    if (result.code !== 0) {
      throw new Error(formatBridgeFailure("subagent-kill", result.stderr.trim() || result.stdout.trim() || "unknown error"));
    }
    const parsed = JSON.parse(result.stdout) as BridgeResponse<{ childSessionKey: string; killedAt?: string; message?: string }>;
    return parsed.result;
  }
}

export function createBridgeSubagentAdapter(
  config: Pick<SwarmPluginConfig, "bridge">,
): OpenClawSubagentAdapter | null {
  if (!isBridgeEnabledForRunner(config, "subagent")) {
    return null;
  }
  return new BridgeOpenClawSubagentAdapter(config);
}
