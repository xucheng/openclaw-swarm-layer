import plugin from "../../src/index.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function createApi(overrides?: Partial<Record<string, unknown>>) {
  return {
    pluginConfig: {},
    registerCli: vi.fn(),
    registerTool: vi.fn(),
    registerService: vi.fn(),
    ...overrides,
  } as any;
}

describe("plugin registration", () => {
  it("registers cli, tools, and service by default", () => {
    const api = createApi();

    plugin.register?.(api);

    expect(api.registerCli).toHaveBeenCalledTimes(1);
    expect(api.registerCli.mock.calls[0][1]).toEqual({
      commands: ["swarm"],
      descriptors: [{ name: "swarm", description: "Swarm workflow commands", hasSubcommands: true }],
    });
    expect(api.registerTool).toHaveBeenCalledTimes(8);
    expect(api.registerService).toHaveBeenCalledTimes(1);
  });

  it("respects disabled config flags", () => {
    const api = createApi({
      pluginConfig: {
        enableCli: false,
        enableTools: false,
        enableService: false,
      },
    });

    plugin.register?.(api);

    expect(api.registerCli).not.toHaveBeenCalled();
    expect(api.registerService).not.toHaveBeenCalled();
  });
});

describe("plugin manifest", () => {
  it("declares the startup tool contracts required by OpenClaw", () => {
    const manifest = JSON.parse(readFileSync(resolve("openclaw.plugin.json"), "utf8"));
    const expectedTools = [
      "swarm_status",
      "swarm_autopilot_status",
      "swarm_task_plan",
      "swarm_run",
      "swarm_review_gate",
      "swarm_session_status",
      "swarm_session_cancel",
      "swarm_session_close",
    ];

    expect(manifest.activation).toEqual({ onStartup: true });
    expect(manifest.contracts?.tools).toEqual(expectedTools);
    expect(Object.keys(manifest.toolMetadata ?? {})).toEqual(expectedTools);
    for (const tool of expectedTools) {
      expect(manifest.toolMetadata[tool]).toEqual({ optional: true });
    }
  });

  it("declares autopilot watcher config in the manifest schema", () => {
    const manifest = JSON.parse(readFileSync(resolve("openclaw.plugin.json"), "utf8"));
    const autopilotProperties = manifest.configSchema.properties.autopilot.properties;

    expect(autopilotProperties.watcherMode).toEqual({
      type: "string",
      enum: ["polling", "watch", "hybrid"],
      default: "polling",
    });
    expect(autopilotProperties.watcher.properties.library).toEqual({
      type: "string",
      enum: ["auto", "parcel", "node"],
      default: "auto",
    });
    expect(autopilotProperties.watcher.properties.safetyTickMs).toEqual({
      type: "integer",
      minimum: 1000,
      default: 300000,
    });
  });
});
