import type { OpenClawPluginApi, OpenClawPluginDefinition } from "openclaw/plugin-sdk/plugin-entry";
import { resolvePluginConfigFromApi, swarmPluginConfigSchema } from "./config.js";
import { registerSwarmCli } from "./cli/register-swarm-cli.js";
import { registerSwarmService } from "./services/orchestrator.js";
import { registerSwarmTools } from "./tools/index.js";

const plugin = {
  id: "openclaw-swarm-layer",
  name: "OpenClaw Swarm Layer",
  description: "Spec-driven workflow orchestrator for OpenClaw.",
  version: "0.5.6",
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
} satisfies OpenClawPluginDefinition;

export default plugin;
