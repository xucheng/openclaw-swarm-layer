import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { resolvePluginConfigFromApi, swarmPluginConfigSchema } from "./config.js";
import { registerSwarmCli } from "./cli/register-swarm-cli.js";
import { registerSwarmService } from "./services/orchestrator.js";
import { registerSwarmTools } from "./tools/index.js";

const plugin = {
  id: "openclaw-swarm-layer",
  name: "OpenClaw Swarm Layer",
  description: "Spec-driven workflow orchestrator for OpenClaw.",
  version: "0.3.1",
  configSchema: swarmPluginConfigSchema,
  register(api: OpenClawPluginApi) {
    const config = resolvePluginConfigFromApi(api);
    if (config.enableCli) {
      registerSwarmCli(api);
    }
    if (config.enableTools) {
      registerSwarmTools(api);
    }
    if (config.enableService) {
      registerSwarmService(api);
    }
  },
} satisfies {
  id: string;
  name: string;
  description: string;
  version: string;
  configSchema: typeof swarmPluginConfigSchema;
  register(api: OpenClawPluginApi): void;
};

export default plugin;
