import { describeAcpExecutionPosture, resolveSwarmPluginConfig, resolveWorkflowDefaultRunner, swarmPluginConfigSchema } from "../../src/config.js";

describe("swarm plugin config", () => {
  it("resolves defaults and accepts obsidianRoot", () => {
    const resolved = resolveSwarmPluginConfig({ obsidianRoot: "/tmp/obsidian" });
    expect(resolved.obsidianRoot).toBe("/tmp/obsidian");
    expect(resolved.enableCli).toBe(true);
    expect(resolved.defaultRunner).toBe("auto");
    expect(resolved.acp.enabled).toBe(false);
    expect(resolved.subagent.enabled).toBe(false);
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

  it("accepts auto as default runner", () => {
    const resolved = resolveSwarmPluginConfig({ defaultRunner: "auto" });
    expect(resolved.defaultRunner).toBe("auto");
  });

  it("keeps subagent default configs opt-in", () => {
    const resolved = resolveSwarmPluginConfig({
      defaultRunner: "subagent",
      bridge: { subagentEnabled: true },
    });
    expect(resolved.defaultRunner).toBe("subagent");
    expect(resolved.subagent.enabled).toBe(true);
  });

  it("accepts bridge config and expands legacy enabled alias into subagent fallback only", () => {
    const resolved = resolveSwarmPluginConfig({
      bridge: {
        enabled: true,
        openclawRoot: "/opt/openclaw",
        versionAllow: ["2026.2.26"],
      },
    });

    expect(resolved.bridge).toEqual({
      enabled: true,
      acpFallbackEnabled: false,
      subagentEnabled: true,
      nodePath: undefined,
      openclawRoot: "/opt/openclaw",
      versionAllow: ["2026.2.26"],
    });
  });

  it("accepts runner-scoped bridge fallback flags", () => {
    const resolved = resolveSwarmPluginConfig({
      bridge: {
        acpFallbackEnabled: true,
        subagentEnabled: false,
      },
    });

    expect(resolved.bridge.enabled).toBe(true);
    expect(resolved.bridge.acpFallbackEnabled).toBe(true);
    expect(resolved.bridge.subagentEnabled).toBe(false);
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


  it("describes ACP as public-first without bridge fallback by default", () => {
    const resolved = resolveSwarmPluginConfig({
      acp: {
        enabled: true,
      },
    });

    expect(describeAcpExecutionPosture(resolved)).toBe("public control-plane only");
  });

  it("keeps ACP posture public-only even when legacy ACP bridge config is present", () => {
    const resolved = resolveSwarmPluginConfig({
      acp: {
        enabled: true,
      },
      bridge: {
        acpFallbackEnabled: true,
      },
    });

    expect(describeAcpExecutionPosture(resolved)).toBe("public control-plane only");
  });

  it("resolves auto to manual when ACP is enabled but no public capability is available", () => {
    const resolved = resolveSwarmPluginConfig({
      acp: {
        enabled: true,
      },
    });

    expect(resolveWorkflowDefaultRunner(resolved)).toBe("manual");
  });

  it("resolves auto to ACP when the runtime version supports the public ACP path", () => {
    const resolved = resolveSwarmPluginConfig({
      acp: {
        enabled: true,
      },
    });

    expect(resolveWorkflowDefaultRunner(resolved, { runtimeVersion: "2026.3.24" })).toBe("acp");
  });

  it("keeps auto on manual when only legacy ACP bridge config is present", () => {
    const resolved = resolveSwarmPluginConfig({
      acp: {
        enabled: true,
      },
      bridge: {
        acpFallbackEnabled: true,
      },
    });

    expect(resolveWorkflowDefaultRunner(resolved)).toBe("manual");
  });

  it("keeps subagent out of allowed runners when bridge support is not enabled", () => {
    const resolved = resolveSwarmPluginConfig({
      subagent: {
        enabled: true,
      },
    });

    expect(resolveWorkflowDefaultRunner(resolved)).toBe("manual");
  });

  it("includes subagent only when both subagent and bridge opt-in are enabled", () => {
    const resolved = resolveSwarmPluginConfig({
      defaultRunner: "subagent",
      subagent: {
        enabled: true,
      },
      bridge: {
        subagentEnabled: true,
      },
    });

    expect(resolveWorkflowDefaultRunner(resolved)).toBe("subagent");
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

  it("rejects contradictory subagent config when subagent is the default runner", () => {
    const result = swarmPluginConfigSchema.validate?.({
      defaultRunner: "subagent",
      subagent: { enabled: false },
    });

    expect(result).toEqual({
      ok: false,
      errors: [
        'subagent.enabled must be true when defaultRunner="subagent"',
        'bridge.subagentEnabled must be true when defaultRunner="subagent"',
      ],
    });
  });

  it("rejects subagent default runner when subagent bridge is not enabled", () => {
    const result = swarmPluginConfigSchema.validate?.({
      defaultRunner: "subagent",
      subagent: { enabled: true },
      bridge: { subagentEnabled: false },
    });

    expect(result).toEqual({ ok: false, errors: ['bridge.subagentEnabled must be true when defaultRunner="subagent"'] });
  });
});
