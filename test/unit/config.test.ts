import { resolveSwarmPluginConfig, swarmPluginConfigSchema } from "../../src/config.js";

describe("swarm plugin config", () => {
  it("resolves defaults and accepts obsidianRoot", () => {
    const resolved = resolveSwarmPluginConfig({ obsidianRoot: "/tmp/obsidian" });
    expect(resolved.obsidianRoot).toBe("/tmp/obsidian");
    expect(resolved.enableCli).toBe(true);
    expect(resolved.acp.enabled).toBe(false);
  });

  it("accepts nested acp config", () => {
    const resolved = resolveSwarmPluginConfig({
      acp: {
        enabled: true,
        backendId: "acpx",
        defaultAgentId: "codex",
        allowedAgents: ["codex", "claude"],
        defaultMode: "run",
        allowThreadBinding: false,
        defaultTimeoutSeconds: 900,
        experimentalControlPlaneAdapter: true,
      },
    });

    expect(resolved.acp).toEqual({
      enabled: true,
      backendId: "acpx",
      defaultAgentId: "codex",
      allowedAgents: ["codex", "claude"],
      defaultMode: "run",
      allowThreadBinding: false,
      defaultTimeoutSeconds: 900,
      experimentalControlPlaneAdapter: true,
    });
  });

  it("accepts subagent as default runner", () => {
    const resolved = resolveSwarmPluginConfig({ defaultRunner: "subagent" });
    expect(resolved.defaultRunner).toBe("subagent");
  });

  it("accepts bridge config", () => {
    const resolved = resolveSwarmPluginConfig({
      bridge: {
        enabled: true,
        openclawRoot: "/opt/openclaw",
        versionAllow: ["2026.2.26"],
      },
    });

    expect(resolved.bridge).toEqual({
      enabled: true,
      nodePath: undefined,
      openclawRoot: "/opt/openclaw",
      versionAllow: ["2026.2.26"],
    });
  });

  it("accepts bridge comparator rules in versionAllow", () => {
    const resolved = resolveSwarmPluginConfig({
      bridge: {
        enabled: true,
        openclawRoot: "/opt/openclaw",
        versionAllow: [">=2026.3.22"],
      },
    });

    expect(resolved.bridge.versionAllow).toEqual([">=2026.3.22"]);
  });

  it("accepts bridge nodePath", () => {
    const resolved = resolveSwarmPluginConfig({
      bridge: {
        enabled: true,
        nodePath: "/usr/bin/node",
      },
    });

    expect(resolved.bridge.nodePath).toBe("/usr/bin/node");
  });

  it("rejects unknown keys in plugin schema validation", () => {
    const result = swarmPluginConfigSchema.validate?.({ nope: true });
    expect(result).toEqual({ ok: false, errors: ['Unrecognized key: "nope"'] });
  });

  it("rejects invalid nested acp config", () => {
    const result = swarmPluginConfigSchema.validate?.({
      acp: {
        enabled: true,
        allowedAgents: ["codex", 1],
      },
    });
    expect(result).toEqual({ ok: false, errors: ["acp.allowedAgents must be an array of strings"] });
  });
});
