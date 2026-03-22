import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { OpenClawPluginConfigSchema } from "openclaw/plugin-sdk";

export type WorkspaceMode = "shared" | "isolated";
export type RunnerType = "manual" | "acp" | "subagent";

export type SwarmBridgeConfig = {
  enabled: boolean;
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
};

export type ObsidianJournalConfig = {
  enableRunLog: boolean;
  enableReviewLog: boolean;
  enableSpecArchive: boolean;
  enableCompletionSummary: boolean;
};

export type SwarmPluginConfig = {
  stateRoot?: string;
  defaultProjectRoot?: string;
  obsidianRoot?: string;
  obsidianJournal: ObsidianJournalConfig;
  enableCli: boolean;
  enableTools: boolean;
  enableService: boolean;
  enableChatCommand: boolean;
  defaultWorkspaceMode: WorkspaceMode;
  defaultRunner: RunnerType;
  maxParallelTasks: number;
  reviewRequiredByDefault: boolean;
  acp: SwarmAcpConfig;
  bridge: SwarmBridgeConfig;
};

export const defaultSwarmPluginConfig: SwarmPluginConfig = {
  enableCli: true,
  enableTools: true,
  enableService: true,
  enableChatCommand: false,
  defaultWorkspaceMode: "shared",
  defaultRunner: "manual",
  maxParallelTasks: 1,
  reviewRequiredByDefault: true,
  obsidianJournal: {
    enableRunLog: false,
    enableReviewLog: false,
    enableSpecArchive: false,
    enableCompletionSummary: false,
  },
  acp: {
    enabled: false,
    backendId: undefined,
    allowedAgents: [],
    defaultMode: "run",
    allowThreadBinding: false,
    experimentalControlPlaneAdapter: false,
  },
  bridge: {
    enabled: false,
    nodePath: undefined,
    openclawRoot: undefined,
    versionAllow: [],
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
  "obsidianJournal",
  "acp",
  "bridge",
]);

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
    defaultRunner: { type: "string", enum: ["manual", "acp", "subagent"], default: "manual" },
    maxParallelTasks: { type: "integer", minimum: 1, default: 1 },
    reviewRequiredByDefault: { type: "boolean", default: true },
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
      },
    },
    bridge: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean", default: false },
        nodePath: { type: "string" },
        openclawRoot: { type: "string" },
        versionAllow: { type: "array", items: { type: "string" }, default: [] },
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
    if (!value || typeof value !== "object" || Array.isArray(value)) {
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
    for (const key of ["enableCli", "enableTools", "enableService", "enableChatCommand", "reviewRequiredByDefault"]) {
      if (input[key] !== undefined && typeof input[key] !== "boolean") {
        errors.push(`${key} must be a boolean`);
      }
    }
    if (input.defaultWorkspaceMode !== undefined && input.defaultWorkspaceMode !== "shared" && input.defaultWorkspaceMode !== "isolated") {
      errors.push('defaultWorkspaceMode must be one of: "shared", "isolated"');
    }
    if (
      input.defaultRunner !== undefined &&
      input.defaultRunner !== "manual" &&
      input.defaultRunner !== "acp" &&
      input.defaultRunner !== "subagent"
    ) {
      errors.push('defaultRunner must be one of: "manual", "acp", "subagent"');
    }
    if (input.maxParallelTasks !== undefined && (!Number.isInteger(input.maxParallelTasks) || Number(input.maxParallelTasks) < 1)) {
      errors.push("maxParallelTasks must be an integer >= 1");
    }
    if (input.acp !== undefined) {
      if (!input.acp || typeof input.acp !== "object" || Array.isArray(input.acp)) {
        errors.push("acp must be an object");
      } else {
        const acp = input.acp as Record<string, unknown>;
        const allowedAcpKeys = new Set([
          "enabled",
          "backendId",
          "defaultAgentId",
          "allowedAgents",
          "defaultMode",
          "allowThreadBinding",
          "defaultTimeoutSeconds",
          "experimentalControlPlaneAdapter",
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
          (!Array.isArray(acp.allowedAgents) || acp.allowedAgents.some((value) => typeof value !== "string"))
        ) {
          errors.push("acp.allowedAgents must be an array of strings");
        }
        if (acp.defaultMode !== undefined && acp.defaultMode !== "run" && acp.defaultMode !== "session") {
          errors.push('acp.defaultMode must be one of: "run", "session"');
        }
        if (acp.allowThreadBinding !== undefined && typeof acp.allowThreadBinding !== "boolean") {
          errors.push("acp.allowThreadBinding must be a boolean");
        }
        if (
          acp.experimentalControlPlaneAdapter !== undefined &&
          typeof acp.experimentalControlPlaneAdapter !== "boolean"
        ) {
          errors.push("acp.experimentalControlPlaneAdapter must be a boolean");
        }
        if (
          acp.defaultTimeoutSeconds !== undefined &&
          (!Number.isInteger(acp.defaultTimeoutSeconds) || Number(acp.defaultTimeoutSeconds) < 1)
        ) {
          errors.push("acp.defaultTimeoutSeconds must be an integer >= 1");
        }
      }
    }
    if (input.bridge !== undefined) {
      if (!input.bridge || typeof input.bridge !== "object" || Array.isArray(input.bridge)) {
        errors.push("bridge must be an object");
      } else {
        const bridge = input.bridge as Record<string, unknown>;
        const allowedBridgeKeys = new Set(["enabled", "nodePath", "openclawRoot", "versionAllow"]);
        for (const key of Object.keys(bridge)) {
          if (!allowedBridgeKeys.has(key)) {
            errors.push(`Unrecognized key: \"bridge.${key}\"`);
          }
        }
        if (bridge.enabled !== undefined && typeof bridge.enabled !== "boolean") {
          errors.push("bridge.enabled must be a boolean");
        }
        if (bridge.openclawRoot !== undefined && typeof bridge.openclawRoot !== "string") {
          errors.push("bridge.openclawRoot must be a string");
        }
        if (bridge.nodePath !== undefined && typeof bridge.nodePath !== "string") {
          errors.push("bridge.nodePath must be a string");
        }
        if (
          bridge.versionAllow !== undefined &&
          (!Array.isArray(bridge.versionAllow) || bridge.versionAllow.some((value) => typeof value !== "string"))
        ) {
          errors.push("bridge.versionAllow must be an array of strings");
        }
      }
    }

    if (errors.length > 0) {
      return { ok: false, errors };
    }

    return { ok: true, value: resolveSwarmPluginConfig(input) };
  },
};

export function resolveSwarmPluginConfig(rawConfig: unknown): SwarmPluginConfig {
  const input = rawConfig && typeof rawConfig === "object" ? (rawConfig as Record<string, unknown>) : {};
  return {
    stateRoot: typeof input.stateRoot === "string" ? input.stateRoot : undefined,
    defaultProjectRoot:
      typeof input.defaultProjectRoot === "string" ? input.defaultProjectRoot : undefined,
    obsidianRoot: typeof input.obsidianRoot === "string" ? input.obsidianRoot : undefined,
    enableCli: typeof input.enableCli === "boolean" ? input.enableCli : true,
    enableTools: typeof input.enableTools === "boolean" ? input.enableTools : true,
    enableService: typeof input.enableService === "boolean" ? input.enableService : true,
    enableChatCommand: typeof input.enableChatCommand === "boolean" ? input.enableChatCommand : false,
    defaultWorkspaceMode:
      input.defaultWorkspaceMode === "isolated" ? "isolated" : defaultSwarmPluginConfig.defaultWorkspaceMode,
    defaultRunner:
      input.defaultRunner === "acp" || input.defaultRunner === "subagent"
        ? input.defaultRunner
        : defaultSwarmPluginConfig.defaultRunner,
    maxParallelTasks:
      typeof input.maxParallelTasks === "number" && input.maxParallelTasks > 0
        ? Math.floor(input.maxParallelTasks)
        : defaultSwarmPluginConfig.maxParallelTasks,
    reviewRequiredByDefault:
      typeof input.reviewRequiredByDefault === "boolean"
        ? input.reviewRequiredByDefault
        : defaultSwarmPluginConfig.reviewRequiredByDefault,
    obsidianJournal: {
      enableRunLog:
        Boolean(input.obsidianJournal) && typeof (input.obsidianJournal as Record<string, unknown>).enableRunLog === "boolean"
          ? ((input.obsidianJournal as Record<string, unknown>).enableRunLog as boolean)
          : defaultSwarmPluginConfig.obsidianJournal.enableRunLog,
      enableReviewLog:
        Boolean(input.obsidianJournal) && typeof (input.obsidianJournal as Record<string, unknown>).enableReviewLog === "boolean"
          ? ((input.obsidianJournal as Record<string, unknown>).enableReviewLog as boolean)
          : defaultSwarmPluginConfig.obsidianJournal.enableReviewLog,
      enableSpecArchive:
        Boolean(input.obsidianJournal) && typeof (input.obsidianJournal as Record<string, unknown>).enableSpecArchive === "boolean"
          ? ((input.obsidianJournal as Record<string, unknown>).enableSpecArchive as boolean)
          : defaultSwarmPluginConfig.obsidianJournal.enableSpecArchive,
      enableCompletionSummary:
        Boolean(input.obsidianJournal) && typeof (input.obsidianJournal as Record<string, unknown>).enableCompletionSummary === "boolean"
          ? ((input.obsidianJournal as Record<string, unknown>).enableCompletionSummary as boolean)
          : defaultSwarmPluginConfig.obsidianJournal.enableCompletionSummary,
    },
    acp: {
      enabled:
        Boolean(input.acp) && typeof (input.acp as Record<string, unknown>).enabled === "boolean"
          ? ((input.acp as Record<string, unknown>).enabled as boolean)
          : defaultSwarmPluginConfig.acp.enabled,
      defaultAgentId:
        Boolean(input.acp) && typeof (input.acp as Record<string, unknown>).defaultAgentId === "string"
          ? ((input.acp as Record<string, unknown>).defaultAgentId as string)
          : defaultSwarmPluginConfig.acp.defaultAgentId,
      backendId:
        Boolean(input.acp) && typeof (input.acp as Record<string, unknown>).backendId === "string"
          ? ((input.acp as Record<string, unknown>).backendId as string)
          : defaultSwarmPluginConfig.acp.backendId,
      allowedAgents:
        Boolean(input.acp) && Array.isArray((input.acp as Record<string, unknown>).allowedAgents)
          ? ((input.acp as Record<string, unknown>).allowedAgents as unknown[]).filter(
              (value): value is string => typeof value === "string",
            )
          : defaultSwarmPluginConfig.acp.allowedAgents,
      defaultMode:
        Boolean(input.acp) && (input.acp as Record<string, unknown>).defaultMode === "session"
          ? "session"
          : defaultSwarmPluginConfig.acp.defaultMode,
      allowThreadBinding:
        Boolean(input.acp) && typeof (input.acp as Record<string, unknown>).allowThreadBinding === "boolean"
          ? ((input.acp as Record<string, unknown>).allowThreadBinding as boolean)
          : defaultSwarmPluginConfig.acp.allowThreadBinding,
      defaultTimeoutSeconds:
        Boolean(input.acp) && typeof (input.acp as Record<string, unknown>).defaultTimeoutSeconds === "number"
          ? Math.floor((input.acp as Record<string, unknown>).defaultTimeoutSeconds as number)
          : defaultSwarmPluginConfig.acp.defaultTimeoutSeconds,
      experimentalControlPlaneAdapter:
        Boolean(input.acp) &&
        typeof (input.acp as Record<string, unknown>).experimentalControlPlaneAdapter === "boolean"
          ? ((input.acp as Record<string, unknown>).experimentalControlPlaneAdapter as boolean)
          : defaultSwarmPluginConfig.acp.experimentalControlPlaneAdapter,
    },
    bridge: {
      enabled:
        Boolean(input.bridge) && typeof (input.bridge as Record<string, unknown>).enabled === "boolean"
          ? ((input.bridge as Record<string, unknown>).enabled as boolean)
          : defaultSwarmPluginConfig.bridge.enabled,
      nodePath:
        Boolean(input.bridge) && typeof (input.bridge as Record<string, unknown>).nodePath === "string"
          ? ((input.bridge as Record<string, unknown>).nodePath as string)
          : defaultSwarmPluginConfig.bridge.nodePath,
      openclawRoot:
        Boolean(input.bridge) && typeof (input.bridge as Record<string, unknown>).openclawRoot === "string"
          ? ((input.bridge as Record<string, unknown>).openclawRoot as string)
          : defaultSwarmPluginConfig.bridge.openclawRoot,
      versionAllow:
        Boolean(input.bridge) && Array.isArray((input.bridge as Record<string, unknown>).versionAllow)
          ? ((input.bridge as Record<string, unknown>).versionAllow as unknown[]).filter(
              (value): value is string => typeof value === "string",
            )
          : defaultSwarmPluginConfig.bridge.versionAllow,
    },
  };
}

export function resolvePluginConfigFromApi(api: Pick<OpenClawPluginApi, "pluginConfig">): SwarmPluginConfig {
  return resolveSwarmPluginConfig(api.pluginConfig);
}
