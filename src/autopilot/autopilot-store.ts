import fs from "node:fs/promises";
import { resolveSwarmPluginConfig, type SwarmPluginConfig } from "../config.js";
import { ensureDir, pathExists, readJsonFile, writeJsonFileAtomic } from "../lib/json-file.js";
import { resolveSwarmPaths } from "../lib/paths.js";
import { createDefaultAutopilotState, type AutopilotDecision, type AutopilotState } from "./types.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export class AutopilotStore {
  readonly config: SwarmPluginConfig;

  constructor(config?: Partial<SwarmPluginConfig>) {
    this.config = resolveSwarmPluginConfig(config);
  }

  resolvePaths(projectRoot: string) {
    return resolveSwarmPaths(projectRoot, this.config);
  }

  getDefaultState(projectRoot: string): AutopilotState {
    const paths = this.resolvePaths(projectRoot);
    return createDefaultAutopilotState(paths.projectRoot, this.config);
  }

  async loadState(projectRoot: string): Promise<AutopilotState | null> {
    const paths = this.resolvePaths(projectRoot);
    const state = await readJsonFile<AutopilotState>(paths.autopilotStatePath);
    if (!state) {
      return null;
    }
    const normalized: AutopilotState = {
      ...this.getDefaultState(projectRoot),
      ...state,
      metrics: {
        ...this.getDefaultState(projectRoot).metrics,
        ...(state.metrics ?? {}),
      },
    };
    this.assertValidState(normalized);
    return normalized;
  }

  async getState(projectRoot: string): Promise<AutopilotState> {
    return (await this.loadState(projectRoot)) ?? this.getDefaultState(projectRoot);
  }

  async initState(projectRoot: string): Promise<AutopilotState> {
    const existing = await this.loadState(projectRoot);
    if (existing) {
      return existing;
    }
    const initial = this.getDefaultState(projectRoot);
    await this.saveState(projectRoot, initial);
    return initial;
  }

  async saveState(projectRoot: string, state: AutopilotState): Promise<void> {
    this.assertValidState(state);
    const paths = this.resolvePaths(projectRoot);
    await ensureDir(paths.swarmRoot);
    await writeJsonFileAtomic(paths.autopilotStatePath, state);
  }

  async appendDecision(projectRoot: string, decision: AutopilotDecision & { tickId: string }): Promise<void> {
    const paths = this.resolvePaths(projectRoot);
    await ensureDir(paths.logsDir);
    await fs.appendFile(paths.autopilotDecisionLogPath, `${JSON.stringify(decision)}\n`, "utf8");
  }

  async hasDecisionLog(projectRoot: string): Promise<boolean> {
    return pathExists(this.resolvePaths(projectRoot).autopilotDecisionLogPath);
  }

  private assertValidState(state: unknown): asserts state is AutopilotState {
    assert(isObject(state), "autopilot state must be an object");
    assert(typeof state.version === "number" && state.version >= 1, "autopilot state version is invalid");
    assert(typeof state.projectRoot === "string" && state.projectRoot.length > 0, "autopilot state projectRoot is required");
    assert(
      state.desiredState === "running" || state.desiredState === "paused" || state.desiredState === "stopped",
      "autopilot desiredState is invalid",
    );
    assert(state.runtimeState === "idle" || state.runtimeState === "ticking", "autopilot runtimeState is invalid");
    assert(state.mode === "supervised", 'autopilot mode must be "supervised"');
    assert(isObject(state.metrics), "autopilot metrics are required");
    for (const key of [
      "tickCount",
      "dryRunCount",
      "observationCount",
      "dispatchCount",
      "autoApproveCount",
      "retryCount",
      "escalationCount",
      "cancelCount",
      "closeCount",
      "degradedTickCount",
    ]) {
      assert(typeof state.metrics[key] === "number" && state.metrics[key] >= 0, `autopilot metrics.${key} is invalid`);
    }
    if (state.lastDecision !== undefined) {
      assert(isObject(state.lastDecision), "autopilot lastDecision must be an object");
      assert(typeof state.lastDecision.at === "string", "autopilot lastDecision.at is required");
      assert(
        state.lastDecision.action === "dry_run" ||
          state.lastDecision.action === "observe" ||
          state.lastDecision.action === "dispatch" ||
          state.lastDecision.action === "noop",
        "autopilot lastDecision.action is invalid",
      );
      assert(typeof state.lastDecision.summary === "string", "autopilot lastDecision.summary is required");
    }
  }
}
