import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { OpenClawPluginConfigSchema } from "openclaw/plugin-sdk";
import { supportsPublicAcpRuntime } from "./runtime/openclaw-version.js";

export type WorkspaceMode = "shared" | "isolated";
export type RunnerType = "manual" | "acp" | "subagent";
export type ConfiguredRunnerType = RunnerType | "auto";
export type BridgeRunnerType = Exclude<RunnerType, "manual">;

export type SwarmBridgeConfig = {
  enabled: boolean;
  acpFallbackEnabled: boolean;
  subagentEnabled: boolean;
  nodePath?: string;
  openclawRoot?: string;
  versionAllow: string[];
};

export type SwarmAcpConfig = {
  enabled: boolean;
  backendId?: string;
  defaultAgentId?: string;
  allowedAgents: string[];
  defaultMode: "run" | "session";
  allowThreadBinding: boolean;
  defaultTimeoutSeconds?: number;
  experimentalControlPlaneAdapter: boolean;
  maxConcurrent?: number;
  queuePolicy?: "fifo";
  retryOnSignal?: string[];
};

export type SwarmSubagentConfig = {
  enabled: boolean;
};

export type JournalConfig = {
  enableRunLog: boolean;
  enableReviewLog: boolean;
  enableSpecArchive: boolean;
  enableCompletionSummary: boolean;
};

/** @deprecated Use JournalConfig */
export type ObsidianJournalConfig = JournalConfig;

export type SwarmEvaluatorConfig = {
  enabled: boolean;
  autoInjectAfter: string[];
};

export type SwarmReviewConfig = {
  rejectPolicy: "blocked" | "ready_retry";
  maxRejectRetries: number;
};

export type SwarmBootstrapConfig = {
  enabled: boolean;
};

export type SwarmAutopilotReviewPolicy = {
  mode: "manual_only" | "auto_safe" | "auto_allowlist";
  allowlistTags: string[];
  denyTags: string[];
};

export type SwarmAutopilotRecoveryPolicy = {
  stuckRunMinutes: number;
  idleSessionMinutes: number;
  maxRecoveriesPerTask: number;
  cancelBeforeRetry: boolean;
  degradedFailureRate: number;
  degradedMinTerminalRuns: number;
  degradedTerminalWindow: number;
};

export type SwarmAutopilotConfig = {
  enabled: boolean;
  mode: "supervised";
  tickSeconds: number;
  leaseSeconds: number;
  maxDispatchPerTick: number;
  reviewPolicy: SwarmAutopilotReviewPolicy;
  recoveryPolicy: SwarmAutopilotRecoveryPolicy;
};

export type AcpAutomationResolutionHints = {
  runtimeVersion?: string | null;
};

export type SwarmPluginConfig = {
  stateRoot?: string;
  defaultProjectRoot?: string;
  obsidianRoot?: string;
  journal: JournalConfig;
  enableCli: boolean;
  enableTools: boolean;
  enableService: boolean;
  enableChatCommand: boolean;
  defaultWorkspaceMode: WorkspaceMode;
  defaultRunner: ConfiguredRunnerType;
  maxParallelTasks: number;
  reviewRequiredByDefault: boolean;
  enforceTaskImmutability: boolean;
  evaluator: SwarmEvaluatorConfig;
  review: SwarmReviewConfig;
  acp: SwarmAcpConfig;
  subagent: SwarmSubagentConfig;
  bridge: SwarmBridgeConfig;
  bootstrap: SwarmBootstrapConfig;
  autopilot: SwarmAutopilotConfig;
};

export const defaultSwarmPluginConfig: SwarmPluginConfig = {
  enableCli: true,
  enableTools: true,
  enableService: true,
  enableChatCommand: false,
  defaultWorkspaceMode: "shared",
  defaultRunner: "auto",
  maxParallelTasks: 1,
  reviewRequiredByDefault: true,
  enforceTaskImmutability: false,
  evaluator: {
    enabled: false,
    autoInjectAfter: ["coding"],
  },
  journal: {
    enableRunLog: true,
    enableReviewLog: true,
    enableSpecArchive: true,
    enableCompletionSummary: true,
  },
  review: {
    rejectPolicy: "ready_retry",
    maxRejectRetries: 3,
  },
  acp: {
    enabled: false,
    backendId: undefined,
    defaultAgentId: undefined,
    allowedAgents: [],
    defaultMode: "run",
    allowThreadBinding: false,
    experimentalControlPlaneAdapter: false,
    maxConcurrent: 6,
    queuePolicy: "fifo",
    retryOnSignal: ["SIGTERM"],
  },
  subagent: {
    enabled: false,
  },
  bridge: {
    enabled: false,
    acpFallbackEnabled: false,
    subagentEnabled: false,
    nodePath: undefined,
    openclawRoot: undefined,
    versionAllow: [],
  },
  bootstrap: {
    enabled: false,
  },
  autopilot: {
    enabled: false,
    mode: "supervised",
    tickSeconds: 15,
    leaseSeconds: 45,
    maxDispatchPerTick: 2,
    reviewPolicy: {
      mode: "manual_only",
      allowlistTags: [],
      denyTags: ["high-risk", "security", "prod"],
    },
    recoveryPolicy: {
      stuckRunMinutes: 20,
      idleSessionMinutes: 60,
      maxRecoveriesPerTask: 1,
      cancelBeforeRetry: true,
      degradedFailureRate: 0.5,
      degradedMinTerminalRuns: 3,
      degradedTerminalWindow: 6,
    },
  },
};

const allowedConfigKeys = new Set([
  "stateRoot",
  "defaultProjectRoot",
  "obsidianRoot",
  "enableCli",
  "enableTools",
  "enableService",
  "enableChatCommand",
  "defaultWorkspaceMode",
  "defaultRunner",
  "maxParallelTasks",
  "reviewRequiredByDefault",
  "journal",
  "enforceTaskImmutability",
  "evaluator",
  "review",
  "acp",
  "subagent",
  "bridge",
  "bootstrap",
  "autopilot",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function resolveConfiguredDefaultRunner(input: unknown): ConfiguredRunnerType {
  return input === "manual" || input === "acp" || input === "subagent" || input === "auto"
    ? input
    : defaultSwarmPluginConfig.defaultRunner;
}

function resolveBridgeConfig(input: Record<string, unknown>): SwarmBridgeConfig {
  const bridgeInput = isObject(input.bridge) ? input.bridge : undefined;
  const legacyBridgeEnabled = typeof bridgeInput?.enabled === "boolean" ? bridgeInput.enabled : false;
  const acpFallbackEnabled =
    typeof bridgeInput?.acpFallbackEnabled === "boolean" ? bridgeInput.acpFallbackEnabled : defaultSwarmPluginConfig.bridge.acpFallbackEnabled;
  const subagentEnabled =
    typeof bridgeInput?.subagentEnabled === "boolean" ? bridgeInput.subagentEnabled : legacyBridgeEnabled;

  return {
    enabled: legacyBridgeEnabled || acpFallbackEnabled || subagentEnabled,
    acpFallbackEnabled,
    subagentEnabled,
    nodePath: typeof bridgeInput?.nodePath === "string" ? bridgeInput.nodePath : defaultSwarmPluginConfig.bridge.nodePath,
    openclawRoot:
      typeof bridgeInput?.openclawRoot === "string" ? bridgeInput.openclawRoot : defaultSwarmPluginConfig.bridge.openclawRoot,
    versionAllow: Array.isArray(bridgeInput?.versionAllow)
      ? bridgeInput.versionAllow.filter((value): value is string => typeof value === "string")
      : defaultSwarmPluginConfig.bridge.versionAllow,
  };
}

function resolveSubagentConfig(
  input: Record<string, unknown>,
  defaultRunner: ConfiguredRunnerType,
  bridge: SwarmBridgeConfig,
): SwarmSubagentConfig {
  const subagentInput = isObject(input.subagent) ? input.subagent : undefined;
  if (typeof subagentInput?.enabled === "boolean") {
    return { enabled: subagentInput.enabled };
  }
  if (defaultRunner === "subagent") {
    return { enabled: true };
  }
  void bridge;
  return defaultSwarmPluginConfig.subagent;
}

export function isBridgeEnabledForRunner(
  config: Pick<SwarmPluginConfig, "bridge">,
  runner: BridgeRunnerType,
): boolean {
  return runner === "acp"
    ? false
    : config.bridge.subagentEnabled || config.bridge.enabled;
}

export function isAcpBridgeFallbackEnabled(
  config: Pick<SwarmPluginConfig, "bridge">,
): boolean {
  void config;
  return false;
}

export function hasLegacyAcpBridgeFallbackConfig(
  config: Pick<SwarmPluginConfig, "bridge">,
): boolean {
  return config.bridge.acpFallbackEnabled;
}

export function isAcpPublicPathAvailableForAutomation(
  config: Pick<SwarmPluginConfig, "acp">,
  hints?: AcpAutomationResolutionHints,
): boolean {
  if (!config.acp.enabled) {
    return false;
  }
  return Boolean(config.acp.experimentalControlPlaneAdapter) || supportsPublicAcpRuntime(hints?.runtimeVersion);
}

export function canUseAcpAsDefaultRunner(
  config: Pick<SwarmPluginConfig, "acp" | "bridge">,
  hints?: AcpAutomationResolutionHints,
): boolean {
  if (!config.acp.enabled) {
    return false;
  }
  return isAcpPublicPathAvailableForAutomation(config, hints);
}

export function describeAcpExecutionPosture(
  config: Pick<SwarmPluginConfig, "acp" | "bridge">,
): string {
  if (!config.acp.enabled) {
    return "disabled (manual runner remains the safe fallback)";
  }
  return "public control-plane only";
}

export function resolveWorkflowDefaultRunner(
  config: Pick<SwarmPluginConfig, "defaultRunner" | "acp" | "subagent" | "bridge">,
  hints?: AcpAutomationResolutionHints,
): RunnerType {
  if (config.defaultRunner === "auto") {
    return canUseAcpAsDefaultRunner(config, hints) ? "acp" : "manual";
  }
  if (config.defaultRunner === "subagent") {
    return isSubagentRunnerEnabled(config) ? "subagent" : "manual";
  }
  return config.defaultRunner;
}

export function resolveDefaultAllowedRunners(
  config: Pick<SwarmPluginConfig, "subagent" | "bridge">,
): RunnerType[] {
  return isSubagentRunnerEnabled(config) ? ["manual", "acp", "subagent"] : ["manual", "acp"];
}

export function isSubagentRunnerEnabled(
  config: Pick<SwarmPluginConfig, "subagent" | "bridge">,
): boolean {
  return config.subagent.enabled && isBridgeEnabledForRunner(config, "subagent");
}

export function getSubagentRunnerDisabledMessage(
  config: Pick<SwarmPluginConfig, "subagent" | "bridge">,
): string | undefined {
  if (isSubagentRunnerEnabled(config)) {
    return undefined;
  }
  if (!config.subagent.enabled) {
    return "subagent runner is retained only as a legacy bridge-backed opt-in path; enable subagent.enabled=true and bridge.subagentEnabled=true to use it";
  }
  return "subagent runner is retained only as a legacy bridge-backed opt-in path; enable bridge.subagentEnabled=true to use it";
}

export function describeSubagentPosture(
  config: Pick<SwarmPluginConfig, "subagent" | "bridge">,
): string {
  if (isSubagentRunnerEnabled(config)) {
    return "legacy bridge-backed opt-in (enabled explicitly)";
  }
  if (config.subagent.enabled) {
    return "legacy bridge-backed opt-in (bridge not enabled)";
  }
  return "legacy bridge-backed opt-in (disabled by default)";
}

export type RuntimePolicySnapshot = {
  configuredDefaultRunner: ConfiguredRunnerType;
  resolvedDefaultRunner: RunnerType;
  workflowDefaultRunner?: RunnerType;
  allowedRunners: RunnerType[];
  subagentEnabled: boolean;
};

export function resolveRuntimePolicySnapshot(
  config: Pick<SwarmPluginConfig, "defaultRunner" | "acp" | "subagent" | "bridge">,
  workflowRuntime?: { defaultRunner?: RunnerType; allowedRunners?: RunnerType[] },
  hints?: AcpAutomationResolutionHints,
): RuntimePolicySnapshot {
  return {
    configuredDefaultRunner: config.defaultRunner,
    resolvedDefaultRunner: resolveWorkflowDefaultRunner(config, hints),
    workflowDefaultRunner: workflowRuntime?.defaultRunner,
    allowedRunners:
      workflowRuntime?.allowedRunners && workflowRuntime.allowedRunners.length > 0
        ? [...workflowRuntime.allowedRunners]
        : resolveDefaultAllowedRunners(config),
    subagentEnabled: isSubagentRunnerEnabled(config),
  };
}

export const swarmPluginConfigJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    stateRoot: { type: "string" },
    defaultProjectRoot: { type: "string" },
    obsidianRoot: { type: "string" },
    enableCli: { type: "boolean", default: true },
    enableTools: { type: "boolean", default: true },
    enableService: { type: "boolean", default: true },
    enableChatCommand: { type: "boolean", default: false },
    defaultWorkspaceMode: { type: "string", enum: ["shared", "isolated"], default: "shared" },
    defaultRunner: { type: "string", enum: ["auto", "manual", "acp", "subagent"], default: "auto" },
    maxParallelTasks: { type: "integer", minimum: 1, default: 1 },
    reviewRequiredByDefault: { type: "boolean", default: true },
    enforceTaskImmutability: { type: "boolean", default: false },
    evaluator: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean", default: false },
        autoInjectAfter: { type: "array", items: { type: "string" }, default: ["coding"] },
      },
    },
    review: {
      type: "object",
      additionalProperties: false,
      properties: {
        rejectPolicy: { type: "string", enum: ["blocked", "ready_retry"], default: "ready_retry" },
        maxRejectRetries: { type: "integer", minimum: 1, default: 3 },
      },
    },
    acp: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean", default: false },
        backendId: { type: "string" },
        defaultAgentId: { type: "string" },
        allowedAgents: { type: "array", items: { type: "string" }, default: [] },
        defaultMode: { type: "string", enum: ["run", "session"], default: "run" },
        allowThreadBinding: { type: "boolean", default: false },
        defaultTimeoutSeconds: { type: "integer", minimum: 1 },
        experimentalControlPlaneAdapter: { type: "boolean", default: false },
        maxConcurrent: { type: "integer", minimum: 1, default: 6 },
        queuePolicy: { type: "string", enum: ["fifo"], default: "fifo" },
        retryOnSignal: { type: "array", items: { type: "string" }, default: ["SIGTERM"] },
      },
    },
    subagent: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean", default: false },
      },
    },
    bridge: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean", default: false },
        acpFallbackEnabled: { type: "boolean", default: false },
        subagentEnabled: { type: "boolean", default: false },
        nodePath: { type: "string" },
        openclawRoot: { type: "string" },
        versionAllow: {
          type: "array",
          items: { type: "string" },
          default: [],
          description: 'Accepts exact versions or comparator rules such as ">=2026.3.22".',
        },
      },
    },
    bootstrap: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean", default: false },
      },
    },
    autopilot: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean", default: false },
        mode: { type: "string", enum: ["supervised"], default: "supervised" },
        tickSeconds: { type: "integer", minimum: 1, default: 15 },
        leaseSeconds: { type: "integer", minimum: 1, default: 45 },
        maxDispatchPerTick: { type: "integer", minimum: 1, default: 2 },
        reviewPolicy: {
          type: "object",
          additionalProperties: false,
          properties: {
            mode: { type: "string", enum: ["manual_only", "auto_safe", "auto_allowlist"], default: "manual_only" },
            allowlistTags: { type: "array", items: { type: "string" }, default: [] },
            denyTags: { type: "array", items: { type: "string" }, default: ["high-risk", "security", "prod"] },
          },
        },
        recoveryPolicy: {
          type: "object",
          additionalProperties: false,
          properties: {
            stuckRunMinutes: { type: "integer", minimum: 1, default: 20 },
            idleSessionMinutes: { type: "integer", minimum: 1, default: 60 },
            maxRecoveriesPerTask: { type: "integer", minimum: 1, default: 1 },
            cancelBeforeRetry: { type: "boolean", default: true },
            degradedFailureRate: { type: "number", minimum: 0, maximum: 1, default: 0.5 },
            degradedMinTerminalRuns: { type: "integer", minimum: 1, default: 3 },
            degradedTerminalWindow: { type: "integer", minimum: 1, default: 6 },
          },
        },
      },
    },
  },
} satisfies Record<string, unknown>;

export const swarmPluginConfigSchema: OpenClawPluginConfigSchema = {
  jsonSchema: swarmPluginConfigJsonSchema,
  validate(value: unknown) {
    if (value === undefined || value === null) {
      return { ok: true, value: defaultSwarmPluginConfig };
    }
    if (!isObject(value)) {
      return { ok: false, errors: ["config must be an object"] };
    }

    const input = value as Record<string, unknown>;
    const errors: string[] = [];

    for (const key of Object.keys(input)) {
      if (!allowedConfigKeys.has(key)) {
        errors.push(`Unrecognized key: \"${key}\"`);
      }
    }
    if (input.stateRoot !== undefined && typeof input.stateRoot !== "string") {
      errors.push("stateRoot must be a string");
    }
    if (input.defaultProjectRoot !== undefined && typeof input.defaultProjectRoot !== "string") {
      errors.push("defaultProjectRoot must be a string");
    }
    if (input.obsidianRoot !== undefined && typeof input.obsidianRoot !== "string") {
      errors.push("obsidianRoot must be a string");
    }
    for (const key of ["enableCli", "enableTools", "enableService", "enableChatCommand", "reviewRequiredByDefault", "enforceTaskImmutability"]) {
      if (input[key] !== undefined && typeof input[key] !== "boolean") {
        errors.push(`${key} must be a boolean`);
      }
    }
    if (input.defaultWorkspaceMode !== undefined && input.defaultWorkspaceMode !== "shared" && input.defaultWorkspaceMode !== "isolated") {
      errors.push('defaultWorkspaceMode must be one of: "shared", "isolated"');
    }
    if (
      input.defaultRunner !== undefined &&
      input.defaultRunner !== "auto" &&
      input.defaultRunner !== "manual" &&
      input.defaultRunner !== "acp" &&
      input.defaultRunner !== "subagent"
    ) {
      errors.push('defaultRunner must be one of: "auto", "manual", "acp", "subagent"');
    }
    if (input.maxParallelTasks !== undefined && (!Number.isInteger(input.maxParallelTasks) || Number(input.maxParallelTasks) < 1)) {
      errors.push("maxParallelTasks must be an integer >= 1");
    }
    if (input.evaluator !== undefined) {
      if (!isObject(input.evaluator)) {
        errors.push("evaluator must be an object");
      } else {
        const evaluator = input.evaluator;
        const allowedEvaluatorKeys = new Set(["enabled", "autoInjectAfter"]);
        for (const key of Object.keys(evaluator)) {
          if (!allowedEvaluatorKeys.has(key)) {
            errors.push(`Unrecognized key: "evaluator.${key}"`);
          }
        }
        if (evaluator.enabled !== undefined && typeof evaluator.enabled !== "boolean") {
          errors.push("evaluator.enabled must be a boolean");
        }
        if (
          evaluator.autoInjectAfter !== undefined &&
          (!Array.isArray(evaluator.autoInjectAfter) || evaluator.autoInjectAfter.some((v) => typeof v !== "string"))
        ) {
          errors.push("evaluator.autoInjectAfter must be an array of strings");
        }
      }
    }
    if (input.acp !== undefined) {
      if (!isObject(input.acp)) {
        errors.push("acp must be an object");
      } else {
        const acp = input.acp;
        const allowedAcpKeys = new Set([
          "enabled",
          "backendId",
          "defaultAgentId",
          "allowedAgents",
          "defaultMode",
          "allowThreadBinding",
          "defaultTimeoutSeconds",
          "experimentalControlPlaneAdapter",
          "maxConcurrent",
          "queuePolicy",
          "retryOnSignal",
        ]);
        for (const key of Object.keys(acp)) {
          if (!allowedAcpKeys.has(key)) {
            errors.push(`Unrecognized key: \"acp.${key}\"`);
          }
        }
        if (acp.enabled !== undefined && typeof acp.enabled !== "boolean") {
          errors.push("acp.enabled must be a boolean");
        }
        if (acp.defaultAgentId !== undefined && typeof acp.defaultAgentId !== "string") {
          errors.push("acp.defaultAgentId must be a string");
        }
        if (acp.backendId !== undefined && typeof acp.backendId !== "string") {
          errors.push("acp.backendId must be a string");
        }
        if (
          acp.allowedAgents !== undefined &&
          (!Array.isArray(acp.allowedAgents) || acp.allowedAgents.some((v) => typeof v !== "string"))
        ) {
          errors.push("acp.allowedAgents must be an array of strings");
        }
        if (acp.defaultMode !== undefined && acp.defaultMode !== "run" && acp.defaultMode !== "session") {
          errors.push('acp.defaultMode must be one of: "run", "session"');
        }
        if (acp.allowThreadBinding !== undefined && typeof acp.allowThreadBinding !== "boolean") {
          errors.push("acp.allowThreadBinding must be a boolean");
        }
        if (acp.experimentalControlPlaneAdapter !== undefined && typeof acp.experimentalControlPlaneAdapter !== "boolean") {
          errors.push("acp.experimentalControlPlaneAdapter must be a boolean");
        }
        if (
          acp.defaultTimeoutSeconds !== undefined &&
          (!Number.isInteger(acp.defaultTimeoutSeconds) || Number(acp.defaultTimeoutSeconds) < 1)
        ) {
          errors.push("acp.defaultTimeoutSeconds must be an integer >= 1");
        }
        if (
          acp.maxConcurrent !== undefined &&
          (!Number.isInteger(acp.maxConcurrent) || Number(acp.maxConcurrent) < 1)
        ) {
          errors.push("acp.maxConcurrent must be an integer >= 1");
        }
        if (acp.queuePolicy !== undefined && acp.queuePolicy !== "fifo") {
          errors.push('acp.queuePolicy must be "fifo"');
        }
        if (
          acp.retryOnSignal !== undefined &&
          (!Array.isArray(acp.retryOnSignal) || acp.retryOnSignal.some((v) => typeof v !== "string"))
        ) {
          errors.push("acp.retryOnSignal must be an array of strings");
        }
      }
    }
    if (input.review !== undefined) {
      if (!isObject(input.review)) {
        errors.push("review must be an object");
      } else {
        const review = input.review;
        const allowedReviewKeys = new Set(["rejectPolicy", "maxRejectRetries"]);
        for (const key of Object.keys(review)) {
          if (!allowedReviewKeys.has(key)) {
            errors.push(`Unrecognized key: "review.${key}"`);
          }
        }
        if (review.rejectPolicy !== undefined && review.rejectPolicy !== "blocked" && review.rejectPolicy !== "ready_retry") {
          errors.push('review.rejectPolicy must be one of: "blocked", "ready_retry"');
        }
        if (
          review.maxRejectRetries !== undefined &&
          (!Number.isInteger(review.maxRejectRetries) || Number(review.maxRejectRetries) < 1)
        ) {
          errors.push("review.maxRejectRetries must be an integer >= 1");
        }
      }
    }
    if (input.subagent !== undefined) {
      if (!isObject(input.subagent)) {
        errors.push("subagent must be an object");
      } else {
        const subagent = input.subagent;
        const allowedSubagentKeys = new Set(["enabled"]);
        for (const key of Object.keys(subagent)) {
          if (!allowedSubagentKeys.has(key)) {
            errors.push(`Unrecognized key: \"subagent.${key}\"`);
          }
        }
        if (subagent.enabled !== undefined && typeof subagent.enabled !== "boolean") {
          errors.push("subagent.enabled must be a boolean");
        }
      }
    }
    if (input.bridge !== undefined) {
      if (!isObject(input.bridge)) {
        errors.push("bridge must be an object");
      } else {
        const bridge = input.bridge;
        const allowedBridgeKeys = new Set(["enabled", "acpFallbackEnabled", "subagentEnabled", "nodePath", "openclawRoot", "versionAllow"]);
        for (const key of Object.keys(bridge)) {
          if (!allowedBridgeKeys.has(key)) {
            errors.push(`Unrecognized key: \"bridge.${key}\"`);
          }
        }
        for (const key of ["enabled", "acpFallbackEnabled", "subagentEnabled"]) {
          if (bridge[key] !== undefined && typeof bridge[key] !== "boolean") {
            errors.push(`bridge.${key} must be a boolean`);
          }
        }
        if (bridge.openclawRoot !== undefined && typeof bridge.openclawRoot !== "string") {
          errors.push("bridge.openclawRoot must be a string");
        }
        if (bridge.nodePath !== undefined && typeof bridge.nodePath !== "string") {
          errors.push("bridge.nodePath must be a string");
        }
        if (
          bridge.versionAllow !== undefined &&
          (!Array.isArray(bridge.versionAllow) || bridge.versionAllow.some((v) => typeof v !== "string"))
        ) {
          errors.push("bridge.versionAllow must be an array of strings");
        }
      }
    }
    if (input.bootstrap !== undefined) {
      if (!isObject(input.bootstrap)) {
        errors.push("bootstrap must be an object");
      } else {
        const bootstrap = input.bootstrap;
        const allowedBootstrapKeys = new Set(["enabled"]);
        for (const key of Object.keys(bootstrap)) {
          if (!allowedBootstrapKeys.has(key)) {
            errors.push(`Unrecognized key: "bootstrap.${key}"`);
          }
        }
        if (bootstrap.enabled !== undefined && typeof bootstrap.enabled !== "boolean") {
          errors.push("bootstrap.enabled must be a boolean");
        }
      }
    }
    if (input.autopilot !== undefined) {
      if (!isObject(input.autopilot)) {
        errors.push("autopilot must be an object");
      } else {
        const autopilot = input.autopilot;
        const allowedAutopilotKeys = new Set([
          "enabled",
          "mode",
          "tickSeconds",
          "leaseSeconds",
          "maxDispatchPerTick",
          "reviewPolicy",
          "recoveryPolicy",
        ]);
        for (const key of Object.keys(autopilot)) {
          if (!allowedAutopilotKeys.has(key)) {
            errors.push(`Unrecognized key: "autopilot.${key}"`);
          }
        }
        if (autopilot.enabled !== undefined && typeof autopilot.enabled !== "boolean") {
          errors.push("autopilot.enabled must be a boolean");
        }
        if (autopilot.mode !== undefined && autopilot.mode !== "supervised") {
          errors.push('autopilot.mode must be "supervised"');
        }
        for (const [key, value] of [
          ["tickSeconds", autopilot.tickSeconds],
          ["leaseSeconds", autopilot.leaseSeconds],
          ["maxDispatchPerTick", autopilot.maxDispatchPerTick],
        ] as const) {
          if (value !== undefined && (!Number.isInteger(value) || Number(value) < 1)) {
            errors.push(`autopilot.${key} must be an integer >= 1`);
          }
        }
        if (autopilot.reviewPolicy !== undefined) {
          if (!isObject(autopilot.reviewPolicy)) {
            errors.push("autopilot.reviewPolicy must be an object");
          } else {
            const reviewPolicy = autopilot.reviewPolicy;
            const allowedReviewPolicyKeys = new Set(["mode", "allowlistTags", "denyTags"]);
            for (const key of Object.keys(reviewPolicy)) {
              if (!allowedReviewPolicyKeys.has(key)) {
                errors.push(`Unrecognized key: "autopilot.reviewPolicy.${key}"`);
              }
            }
            if (
              reviewPolicy.mode !== undefined &&
              reviewPolicy.mode !== "manual_only" &&
              reviewPolicy.mode !== "auto_safe" &&
              reviewPolicy.mode !== "auto_allowlist"
            ) {
              errors.push('autopilot.reviewPolicy.mode must be one of: "manual_only", "auto_safe", "auto_allowlist"');
            }
            if (
              reviewPolicy.allowlistTags !== undefined &&
              (!Array.isArray(reviewPolicy.allowlistTags) || reviewPolicy.allowlistTags.some((v) => typeof v !== "string"))
            ) {
              errors.push("autopilot.reviewPolicy.allowlistTags must be an array of strings");
            }
            if (
              reviewPolicy.denyTags !== undefined &&
              (!Array.isArray(reviewPolicy.denyTags) || reviewPolicy.denyTags.some((v) => typeof v !== "string"))
            ) {
              errors.push("autopilot.reviewPolicy.denyTags must be an array of strings");
            }
          }
        }
        if (autopilot.recoveryPolicy !== undefined) {
          if (!isObject(autopilot.recoveryPolicy)) {
            errors.push("autopilot.recoveryPolicy must be an object");
          } else {
            const recoveryPolicy = autopilot.recoveryPolicy;
            const allowedRecoveryPolicyKeys = new Set([
              "stuckRunMinutes",
              "idleSessionMinutes",
              "maxRecoveriesPerTask",
              "cancelBeforeRetry",
              "degradedFailureRate",
              "degradedMinTerminalRuns",
              "degradedTerminalWindow",
            ]);
            for (const key of Object.keys(recoveryPolicy)) {
              if (!allowedRecoveryPolicyKeys.has(key)) {
                errors.push(`Unrecognized key: "autopilot.recoveryPolicy.${key}"`);
              }
            }
            for (const [key, value] of [
              ["stuckRunMinutes", recoveryPolicy.stuckRunMinutes],
              ["idleSessionMinutes", recoveryPolicy.idleSessionMinutes],
              ["maxRecoveriesPerTask", recoveryPolicy.maxRecoveriesPerTask],
              ["degradedMinTerminalRuns", recoveryPolicy.degradedMinTerminalRuns],
              ["degradedTerminalWindow", recoveryPolicy.degradedTerminalWindow],
            ] as const) {
              if (value !== undefined && (!Number.isInteger(value) || Number(value) < 1)) {
                errors.push(`autopilot.recoveryPolicy.${key} must be an integer >= 1`);
              }
            }
            if (recoveryPolicy.cancelBeforeRetry !== undefined && typeof recoveryPolicy.cancelBeforeRetry !== "boolean") {
              errors.push("autopilot.recoveryPolicy.cancelBeforeRetry must be a boolean");
            }
            if (
              recoveryPolicy.degradedFailureRate !== undefined &&
              (typeof recoveryPolicy.degradedFailureRate !== "number" ||
                Number.isNaN(recoveryPolicy.degradedFailureRate) ||
                recoveryPolicy.degradedFailureRate < 0 ||
                recoveryPolicy.degradedFailureRate > 1)
            ) {
              errors.push("autopilot.recoveryPolicy.degradedFailureRate must be a number between 0 and 1");
            }
          }
        }
      }
    }

    if (input.defaultRunner === "subagent") {
      if (isObject(input.subagent) && input.subagent.enabled === false) {
        errors.push('subagent.enabled must be true when defaultRunner="subagent"');
      }
      if (!isObject(input.bridge) || input.bridge.subagentEnabled !== true) {
        errors.push('bridge.subagentEnabled must be true when defaultRunner="subagent"');
      }
    }

    if (errors.length > 0) {
      return { ok: false, errors };
    }

    return { ok: true, value: resolveSwarmPluginConfig(input) };
  },
};

export function resolveSwarmPluginConfig(rawConfig: unknown): SwarmPluginConfig {
  const input = isObject(rawConfig) ? rawConfig : {};
  const defaultRunner = resolveConfiguredDefaultRunner(input.defaultRunner);
  const bridge = resolveBridgeConfig(input);
  const subagent = resolveSubagentConfig(input, defaultRunner, bridge);

  return {
    stateRoot: typeof input.stateRoot === "string" ? input.stateRoot : undefined,
    defaultProjectRoot: typeof input.defaultProjectRoot === "string" ? input.defaultProjectRoot : undefined,
    obsidianRoot: typeof input.obsidianRoot === "string" ? input.obsidianRoot : undefined,
    enableCli: typeof input.enableCli === "boolean" ? input.enableCli : true,
    enableTools: typeof input.enableTools === "boolean" ? input.enableTools : true,
    enableService: typeof input.enableService === "boolean" ? input.enableService : true,
    enableChatCommand: typeof input.enableChatCommand === "boolean" ? input.enableChatCommand : false,
    defaultWorkspaceMode:
      input.defaultWorkspaceMode === "isolated" ? "isolated" : defaultSwarmPluginConfig.defaultWorkspaceMode,
    defaultRunner,
    maxParallelTasks:
      typeof input.maxParallelTasks === "number" && input.maxParallelTasks > 0
        ? Math.floor(input.maxParallelTasks)
        : defaultSwarmPluginConfig.maxParallelTasks,
    reviewRequiredByDefault:
      typeof input.reviewRequiredByDefault === "boolean"
        ? input.reviewRequiredByDefault
        : defaultSwarmPluginConfig.reviewRequiredByDefault,
    enforceTaskImmutability:
      typeof input.enforceTaskImmutability === "boolean"
        ? input.enforceTaskImmutability
        : defaultSwarmPluginConfig.enforceTaskImmutability,
    evaluator: {
      enabled:
        isObject(input.evaluator) && typeof input.evaluator.enabled === "boolean"
          ? input.evaluator.enabled
          : defaultSwarmPluginConfig.evaluator.enabled,
      autoInjectAfter:
        isObject(input.evaluator) && Array.isArray(input.evaluator.autoInjectAfter)
          ? input.evaluator.autoInjectAfter.filter((value): value is string => typeof value === "string")
          : defaultSwarmPluginConfig.evaluator.autoInjectAfter,
    },
    journal: {
      enableRunLog:
        isObject(input.journal) && typeof input.journal.enableRunLog === "boolean"
          ? input.journal.enableRunLog
          : defaultSwarmPluginConfig.journal.enableRunLog,
      enableReviewLog:
        isObject(input.journal) && typeof input.journal.enableReviewLog === "boolean"
          ? input.journal.enableReviewLog
          : defaultSwarmPluginConfig.journal.enableReviewLog,
      enableSpecArchive:
        isObject(input.journal) && typeof input.journal.enableSpecArchive === "boolean"
          ? input.journal.enableSpecArchive
          : defaultSwarmPluginConfig.journal.enableSpecArchive,
      enableCompletionSummary:
        isObject(input.journal) && typeof input.journal.enableCompletionSummary === "boolean"
          ? input.journal.enableCompletionSummary
          : defaultSwarmPluginConfig.journal.enableCompletionSummary,
    },
    review: {
      rejectPolicy:
        isObject(input.review) && (input.review.rejectPolicy === "blocked" || input.review.rejectPolicy === "ready_retry")
          ? input.review.rejectPolicy
          : defaultSwarmPluginConfig.review.rejectPolicy,
      maxRejectRetries:
        isObject(input.review) && typeof input.review.maxRejectRetries === "number" && input.review.maxRejectRetries > 0
          ? Math.floor(input.review.maxRejectRetries)
          : defaultSwarmPluginConfig.review.maxRejectRetries,
    },
    acp: {
      enabled:
        isObject(input.acp) && typeof input.acp.enabled === "boolean"
          ? input.acp.enabled
          : defaultSwarmPluginConfig.acp.enabled,
      defaultAgentId:
        isObject(input.acp) && typeof input.acp.defaultAgentId === "string"
          ? input.acp.defaultAgentId
          : defaultSwarmPluginConfig.acp.defaultAgentId,
      backendId:
        isObject(input.acp) && typeof input.acp.backendId === "string"
          ? input.acp.backendId
          : defaultSwarmPluginConfig.acp.backendId,
      allowedAgents:
        isObject(input.acp) && Array.isArray(input.acp.allowedAgents)
          ? input.acp.allowedAgents.filter((value): value is string => typeof value === "string")
          : defaultSwarmPluginConfig.acp.allowedAgents,
      defaultMode:
        isObject(input.acp) && input.acp.defaultMode === "session"
          ? "session"
          : defaultSwarmPluginConfig.acp.defaultMode,
      allowThreadBinding:
        isObject(input.acp) && typeof input.acp.allowThreadBinding === "boolean"
          ? input.acp.allowThreadBinding
          : defaultSwarmPluginConfig.acp.allowThreadBinding,
      defaultTimeoutSeconds:
        isObject(input.acp) && typeof input.acp.defaultTimeoutSeconds === "number"
          ? Math.floor(input.acp.defaultTimeoutSeconds)
          : defaultSwarmPluginConfig.acp.defaultTimeoutSeconds,
      experimentalControlPlaneAdapter:
        isObject(input.acp) && typeof input.acp.experimentalControlPlaneAdapter === "boolean"
          ? input.acp.experimentalControlPlaneAdapter
          : defaultSwarmPluginConfig.acp.experimentalControlPlaneAdapter,
      maxConcurrent:
        isObject(input.acp) && typeof input.acp.maxConcurrent === "number" && input.acp.maxConcurrent > 0
          ? Math.floor(input.acp.maxConcurrent)
          : defaultSwarmPluginConfig.acp.maxConcurrent,
      queuePolicy: "fifo" as const,
      retryOnSignal:
        isObject(input.acp) && Array.isArray(input.acp.retryOnSignal)
          ? input.acp.retryOnSignal.filter((value): value is string => typeof value === "string")
          : defaultSwarmPluginConfig.acp.retryOnSignal,
    },
    subagent,
    bridge,
    bootstrap: {
      enabled:
        isObject(input.bootstrap) && typeof input.bootstrap.enabled === "boolean"
          ? input.bootstrap.enabled
          : defaultSwarmPluginConfig.bootstrap.enabled,
    },
    autopilot: {
      enabled:
        isObject(input.autopilot) && typeof input.autopilot.enabled === "boolean"
          ? input.autopilot.enabled
          : defaultSwarmPluginConfig.autopilot.enabled,
      mode: "supervised",
      tickSeconds:
        isObject(input.autopilot) && typeof input.autopilot.tickSeconds === "number" && input.autopilot.tickSeconds > 0
          ? Math.floor(input.autopilot.tickSeconds)
          : defaultSwarmPluginConfig.autopilot.tickSeconds,
      leaseSeconds:
        isObject(input.autopilot) && typeof input.autopilot.leaseSeconds === "number" && input.autopilot.leaseSeconds > 0
          ? Math.floor(input.autopilot.leaseSeconds)
          : defaultSwarmPluginConfig.autopilot.leaseSeconds,
      maxDispatchPerTick:
        isObject(input.autopilot) &&
        typeof input.autopilot.maxDispatchPerTick === "number" &&
        input.autopilot.maxDispatchPerTick > 0
          ? Math.floor(input.autopilot.maxDispatchPerTick)
          : defaultSwarmPluginConfig.autopilot.maxDispatchPerTick,
      reviewPolicy: {
        mode:
          isObject(input.autopilot) &&
          isObject(input.autopilot.reviewPolicy) &&
          (input.autopilot.reviewPolicy.mode === "manual_only" ||
            input.autopilot.reviewPolicy.mode === "auto_safe" ||
            input.autopilot.reviewPolicy.mode === "auto_allowlist")
            ? input.autopilot.reviewPolicy.mode
            : defaultSwarmPluginConfig.autopilot.reviewPolicy.mode,
        allowlistTags:
          isObject(input.autopilot) && isObject(input.autopilot.reviewPolicy) && Array.isArray(input.autopilot.reviewPolicy.allowlistTags)
            ? input.autopilot.reviewPolicy.allowlistTags.filter((value): value is string => typeof value === "string")
            : defaultSwarmPluginConfig.autopilot.reviewPolicy.allowlistTags,
        denyTags:
          isObject(input.autopilot) && isObject(input.autopilot.reviewPolicy) && Array.isArray(input.autopilot.reviewPolicy.denyTags)
            ? input.autopilot.reviewPolicy.denyTags.filter((value): value is string => typeof value === "string")
            : defaultSwarmPluginConfig.autopilot.reviewPolicy.denyTags,
      },
      recoveryPolicy: {
        stuckRunMinutes:
          isObject(input.autopilot) &&
          isObject(input.autopilot.recoveryPolicy) &&
          typeof input.autopilot.recoveryPolicy.stuckRunMinutes === "number" &&
          input.autopilot.recoveryPolicy.stuckRunMinutes > 0
            ? Math.floor(input.autopilot.recoveryPolicy.stuckRunMinutes)
            : defaultSwarmPluginConfig.autopilot.recoveryPolicy.stuckRunMinutes,
        idleSessionMinutes:
          isObject(input.autopilot) &&
          isObject(input.autopilot.recoveryPolicy) &&
          typeof input.autopilot.recoveryPolicy.idleSessionMinutes === "number" &&
          input.autopilot.recoveryPolicy.idleSessionMinutes > 0
            ? Math.floor(input.autopilot.recoveryPolicy.idleSessionMinutes)
            : defaultSwarmPluginConfig.autopilot.recoveryPolicy.idleSessionMinutes,
        maxRecoveriesPerTask:
          isObject(input.autopilot) &&
          isObject(input.autopilot.recoveryPolicy) &&
          typeof input.autopilot.recoveryPolicy.maxRecoveriesPerTask === "number" &&
          input.autopilot.recoveryPolicy.maxRecoveriesPerTask > 0
            ? Math.floor(input.autopilot.recoveryPolicy.maxRecoveriesPerTask)
            : defaultSwarmPluginConfig.autopilot.recoveryPolicy.maxRecoveriesPerTask,
        cancelBeforeRetry:
          isObject(input.autopilot) &&
          isObject(input.autopilot.recoveryPolicy) &&
          typeof input.autopilot.recoveryPolicy.cancelBeforeRetry === "boolean"
            ? input.autopilot.recoveryPolicy.cancelBeforeRetry
            : defaultSwarmPluginConfig.autopilot.recoveryPolicy.cancelBeforeRetry,
        degradedFailureRate:
          isObject(input.autopilot) &&
          isObject(input.autopilot.recoveryPolicy) &&
          typeof input.autopilot.recoveryPolicy.degradedFailureRate === "number" &&
          input.autopilot.recoveryPolicy.degradedFailureRate >= 0 &&
          input.autopilot.recoveryPolicy.degradedFailureRate <= 1
            ? input.autopilot.recoveryPolicy.degradedFailureRate
            : defaultSwarmPluginConfig.autopilot.recoveryPolicy.degradedFailureRate,
        degradedMinTerminalRuns:
          isObject(input.autopilot) &&
          isObject(input.autopilot.recoveryPolicy) &&
          typeof input.autopilot.recoveryPolicy.degradedMinTerminalRuns === "number" &&
          input.autopilot.recoveryPolicy.degradedMinTerminalRuns > 0
            ? Math.floor(input.autopilot.recoveryPolicy.degradedMinTerminalRuns)
            : defaultSwarmPluginConfig.autopilot.recoveryPolicy.degradedMinTerminalRuns,
        degradedTerminalWindow:
          isObject(input.autopilot) &&
          isObject(input.autopilot.recoveryPolicy) &&
          typeof input.autopilot.recoveryPolicy.degradedTerminalWindow === "number" &&
          input.autopilot.recoveryPolicy.degradedTerminalWindow > 0
            ? Math.floor(input.autopilot.recoveryPolicy.degradedTerminalWindow)
            : defaultSwarmPluginConfig.autopilot.recoveryPolicy.degradedTerminalWindow,
      },
    },
  };
}

export function resolvePluginConfigFromApi(api: Pick<OpenClawPluginApi, "pluginConfig">): SwarmPluginConfig {
  return resolveSwarmPluginConfig(api.pluginConfig);
}
