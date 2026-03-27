import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  decodeBridgeInputFromEnv,
  dedupeStrings,
  deriveDoctorNextAction,
  deriveDoctorRemediation,
  deriveDoctorSeverity,
  encodeBridgeInputForEnv,
  readBridgeInput,
  resolveAcpxServiceModulePath,
  resolveAcpxRuntimeServiceFactory,
  resolveAcpRuntimeRegistryModulePath,
  resolveOpenClawRoot,
  resolveOpenClawRootFromExecPath,
  spawnDetachedBridgeWorker,
  waitForAcpBackendHealthy,
} from "../../../src/runtime/openclaw-exec-bridge.js";
import { INTERNAL_MODULES_BY_VERSION, buildPatchedBridgeModuleSource } from "../../../src/runtime/bridge-manifest.js";

describe("openclaw exec bridge", () => {
  it("includes mappings for tested OpenClaw versions", () => {
    expect(INTERNAL_MODULES_BY_VERSION["2026.2.26"]).toBeDefined();
    expect(INTERNAL_MODULES_BY_VERSION["2026.3.13"]).toBeDefined();
    expect(INTERNAL_MODULES_BY_VERSION["2026.3.22"]).toBeDefined();
    expect(INTERNAL_MODULES_BY_VERSION["2026.3.23-1"]).toBeDefined();
  });

  it("waits until an ACP backend reports healthy", async () => {
    let calls = 0;
    await expect(
      waitForAcpBackendHealthy(() => {
        calls += 1;
        if (calls < 2) {
          return { healthy: () => false };
        }
        return { healthy: () => true };
      }, "acpx", 1000, 1),
    ).resolves.toBeUndefined();
  });

  it("fails clearly when an ACP backend never becomes healthy", async () => {
    await expect(
      waitForAcpBackendHealthy(() => ({ healthy: () => false }), "acpx", 5, 1),
    ).rejects.toThrow("ACP runtime backend is currently unavailable");
  });

  it("appends a subagent bridge export when patching internal modules", () => {
    const source = "function spawnSubagentDirect(){}";
    const patched = buildPatchedBridgeModuleSource(source);

    expect(patched).toContain("__bridgeSpawnSubagentDirect");
  });

  it("prefers the installed acpx service path when present", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "swarm-acpx-"));
    const installPath = path.join(tmpRoot, "extensions", "acpx");
    fs.mkdirSync(path.join(installPath, "src"), { recursive: true });
    fs.writeFileSync(path.join(installPath, "src", "service.ts"), "export {};\n");
    const cfg = {
      plugins: {
        installs: {
          acpx: {
            installPath,
          },
        },
      },
    };

    expect(resolveAcpxServiceModulePath("/opt/openclaw", cfg)).toBe(path.join(installPath, "src", "service.ts"));
  });

  it("falls back to the global acpx extension directory when no install record exists", () => {
    const tmpStateDir = fs.mkdtempSync(path.join(os.tmpdir(), "swarm-acpx-global-"));
    const globalExtensionPath = path.join(tmpStateDir, "extensions", "acpx");
    fs.mkdirSync(path.join(globalExtensionPath, "src"), { recursive: true });
    fs.writeFileSync(path.join(globalExtensionPath, "src", "service.ts"), "export {};\n");

    const previousStateDir = process.env.OPENCLAW_STATE_DIR;
    process.env.OPENCLAW_STATE_DIR = tmpStateDir;
    try {
      expect(resolveAcpxServiceModulePath("/opt/openclaw", { plugins: { entries: { acpx: { enabled: true } } } })).toBe(
        path.join(globalExtensionPath, "src", "service.ts"),
      );
    } finally {
      if (previousStateDir === undefined) {
        delete process.env.OPENCLAW_STATE_DIR;
      } else {
        process.env.OPENCLAW_STATE_DIR = previousStateDir;
      }
    }
  });

  it("falls back to the bundled dist/extensions acpx directory when no global install exists", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "swarm-acpx-bundled-"));
    const bundledExtensionPath = path.join(tmpRoot, "dist", "extensions", "acpx");
    fs.mkdirSync(bundledExtensionPath, { recursive: true });
    fs.writeFileSync(path.join(bundledExtensionPath, "index.js"), "export default {};\n");
    const previousStateDir = process.env.OPENCLAW_STATE_DIR;
    process.env.OPENCLAW_STATE_DIR = path.join(tmpRoot, ".openclaw-state");
    try {
      expect(resolveAcpxServiceModulePath(tmpRoot, { plugins: { entries: { acpx: { enabled: true } } } })).toBe(
        path.join(bundledExtensionPath, "index.js"),
      );
    } finally {
      if (previousStateDir === undefined) {
        delete process.env.OPENCLAW_STATE_DIR;
      } else {
        process.env.OPENCLAW_STATE_DIR = previousStateDir;
      }
    }
  });

  it("skips the acpx service path when the plugin is explicitly disabled", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "swarm-acpx-disabled-"));
    const installPath = path.join(tmpRoot, "extensions", "acpx");
    fs.mkdirSync(path.join(installPath, "src"), { recursive: true });
    fs.writeFileSync(path.join(installPath, "src", "service.ts"), "export {};\n");

    const cfg = {
      plugins: {
        entries: {
          acpx: {
            enabled: false,
          },
        },
        installs: {
          acpx: {
            installPath,
          },
        },
      },
    };

    expect(resolveAcpxServiceModulePath("/opt/openclaw", cfg)).toBeNull();
  });

  it("resolves the public acp-runtime registry path when available", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "swarm-openclaw-"));
    const publicRuntimePath = path.join(tmpRoot, "dist", "plugin-sdk");
    fs.mkdirSync(publicRuntimePath, { recursive: true });
    fs.writeFileSync(path.join(publicRuntimePath, "acp-runtime.js"), "export {};\n");

    expect(resolveAcpRuntimeRegistryModulePath(tmpRoot)).toBe(path.join(publicRuntimePath, "acp-runtime.js"));
  });

  it("uses an exported createAcpxRuntimeService factory when available", () => {
    const start = vi.fn();
    const factory = resolveAcpxRuntimeServiceFactory({
      createAcpxRuntimeService: () => ({ start }),
    });

    expect(factory).toBeTypeOf("function");
    expect(factory?.({ pluginConfig: { permissionMode: "approve-all" } })).toEqual({ start });
  });

  it("falls back to the default plugin register hook when bootstrapping bundled acpx", () => {
    const start = vi.fn();
    const factory = resolveAcpxRuntimeServiceFactory({
      default: {
        register(api: { registerService: (service: { start: typeof start }) => void }) {
          api.registerService({ start });
        },
      },
    });

    expect(factory).toBeTypeOf("function");
    expect(factory?.({ pluginConfig: { permissionMode: "approve-all" } })).toEqual({ start });
  });

  it("detects the host openclaw install root from the node executable prefix", () => {
    const tmpPrefix = fs.mkdtempSync(path.join(os.tmpdir(), "swarm-openclaw-prefix-"));
    const nodeBinDir = path.join(tmpPrefix, "bin");
    const openclawRoot = path.join(tmpPrefix, "lib", "node_modules", "openclaw");
    fs.mkdirSync(nodeBinDir, { recursive: true });
    fs.mkdirSync(path.join(openclawRoot, "dist", "plugin-sdk"), { recursive: true });
    fs.writeFileSync(path.join(openclawRoot, "package.json"), JSON.stringify({ name: "openclaw", version: "2026.3.22" }));

    expect(resolveOpenClawRootFromExecPath(path.join(nodeBinDir, "node"))).toBe(openclawRoot);
  });

  it("detects the host openclaw install root for self-contained installer layouts", () => {
    const tmpPrefix = fs.mkdtempSync(path.join(os.tmpdir(), "swarm-openclaw-self-contained-"));
    const nodeBinDir = path.join(tmpPrefix, "tools", "node", "bin");
    const openclawRoot = path.join(tmpPrefix, "lib", "node_modules", "openclaw");
    fs.mkdirSync(nodeBinDir, { recursive: true });
    fs.mkdirSync(path.join(openclawRoot, "dist", "plugin-sdk"), { recursive: true });
    fs.writeFileSync(path.join(openclawRoot, "package.json"), JSON.stringify({ name: "openclaw", version: "2026.3.22" }));

    expect(resolveOpenClawRootFromExecPath(path.join(nodeBinDir, "node"))).toBe(openclawRoot);
  });

  it("detects the host openclaw install root from a launcher entry inside the package", () => {
    const tmpPrefix = fs.mkdtempSync(path.join(os.tmpdir(), "swarm-openclaw-entry-"));
    const openclawRoot = path.join(tmpPrefix, "lib", "node_modules", "openclaw");
    const distDir = path.join(openclawRoot, "dist");
    fs.mkdirSync(path.join(openclawRoot, "dist", "plugin-sdk"), { recursive: true });
    fs.writeFileSync(path.join(openclawRoot, "package.json"), JSON.stringify({ name: "openclaw", version: "2026.3.24" }));
    fs.writeFileSync(path.join(distDir, "entry.js"), "export {};\n");

    expect(resolveOpenClawRootFromExecPath(path.join(distDir, "entry.js"))).toBe(openclawRoot);
  });

  it("prefers the OpenClaw package root under the configured state dir", () => {
    const tmpStateDir = fs.mkdtempSync(path.join(os.tmpdir(), "swarm-openclaw-state-root-"));
    const openclawRoot = path.join(tmpStateDir, "lib", "node_modules", "openclaw");
    const previousStateDir = process.env.OPENCLAW_STATE_DIR;
    fs.mkdirSync(path.join(openclawRoot, "dist", "plugin-sdk"), { recursive: true });
    fs.writeFileSync(path.join(openclawRoot, "package.json"), JSON.stringify({ name: "openclaw", version: "2026.3.24" }));

    process.env.OPENCLAW_STATE_DIR = tmpStateDir;
    try {
      expect(resolveOpenClawRoot()).toBe(openclawRoot);
    } finally {
      if (previousStateDir === undefined) {
        delete process.env.OPENCLAW_STATE_DIR;
      } else {
        process.env.OPENCLAW_STATE_DIR = previousStateDir;
      }
    }
  });

  it("derives remediation for version drift and backend failures", () => {
    const remediation = deriveDoctorRemediation({
      ok: false,
      openclawRoot: "/opt/openclaw",
      version: "2026.4.0",
      compatibility: {
        supportedRunners: [],
        replacementCandidates: [],
        notes: [],
      },
      publicApi: {
        acpControlPlaneExport: false,
        subagentSpawnExport: false,
        readyReplacementPoints: [],
      },
      replacementPlan: [],
      migrationChecklist: [],
      checks: {
        versionMapped: false,
        versionAllowed: false,
        internalModuleResolved: false,
        acpBackendHealthy: false,
        subagentPatchable: false,
      },
      blockers: [
        "OpenClaw version 2026.4.0 is not in bridge allowlist (2026.3.13)",
        "ACP runtime backend is currently unavailable. Try again in a moment. (backend: acpx)",
      ],
      warnings: [],
      risks: [],
    });

    expect(remediation.some((item) => item.includes("versionAllow"))).toBe(true);
    expect(remediation.some((item) => item.includes("acpx plugin"))).toBe(true);
  });

  it("derives severity and next action for doctor output", () => {
    const report = {
      ok: false,
      openclawRoot: "/opt/openclaw",
      version: "2026.4.0",
      compatibility: {
        supportedRunners: [],
        replacementCandidates: [],
        notes: [],
      },
      publicApi: {
        acpControlPlaneExport: false,
        subagentSpawnExport: false,
        readyReplacementPoints: [],
      },
      replacementPlan: [],
      migrationChecklist: [],
      checks: {
        versionMapped: false,
        versionAllowed: false,
        internalModuleResolved: false,
        acpBackendHealthy: false,
        subagentPatchable: false,
      },
      blockers: ["OpenClaw version 2026.4.0 is not in bridge allowlist (2026.3.13)"],
      warnings: [],
      risks: [],
      remediation: ["Update bridge.versionAllow to include the current OpenClaw version or a compatible range such as >=2026.3.22."],
    };

    expect(deriveDoctorSeverity(report as any)).toBe("blocked");
    expect(deriveDoctorNextAction(report as any)).toContain("Update bridge.versionAllow");
  });

  it("deduplicates repeated diagnostic strings", () => {
    expect(dedupeStrings(["a", "b", "a"])).toEqual(["a", "b"]);
  });

  it("round-trips bridge input through the detached worker env payload", () => {
    const input = {
      bridge: { openclawRoot: "/opt/openclaw", versionAllow: [">=2026.3.22"] },
      params: { sessionKey: "agent:qwen:acp:123", task: "Create a file" },
    };

    expect(decodeBridgeInputFromEnv(encodeBridgeInputForEnv(input))).toEqual(input);
  });

  it("prefers the encoded env payload over stdin when reading bridge input", async () => {
    const encoded = encodeBridgeInputForEnv({
      params: { sessionKey: "agent:qwen:acp:123" },
    });
    const stdinReader = vi.fn(async () => '{"params":{"sessionKey":"stdin"}}');

    const parsed = await readBridgeInput(
      {
        OPENCLAW_SWARM_BRIDGE_INPUT_B64: encoded,
      },
      stdinReader,
    );

    expect(parsed).toEqual({ params: { sessionKey: "agent:qwen:acp:123" } });
    expect(stdinReader).not.toHaveBeenCalled();
  });

  it("spawns a detached acp prompt worker with encoded bridge input", () => {
    const unref = vi.fn();
    const spawnImpl = vi.fn(() => ({ unref }) as any);

    spawnDetachedBridgeWorker(
      "acp-prompt",
      { params: { sessionKey: "agent:qwen:acp:123", task: "Create a file", requestId: "req-1" } },
      {
        spawnImpl,
        execPath: "/opt/node",
        execArgv: ["--import", "/opt/tsx-loader.mjs"],
        argv: ["/opt/node", "/tmp/openclaw-exec-bridge.mjs", "acp-spawn"],
        env: { OPENCLAW_STATE_DIR: "/tmp/state" },
        cwd: "/tmp/swarm-layer",
      },
    );

    expect(spawnImpl).toHaveBeenCalledWith(
      "/opt/node",
      ["--import", "/opt/tsx-loader.mjs", "/tmp/openclaw-exec-bridge.mjs", "acp-prompt"],
      expect.objectContaining({
        cwd: "/tmp/swarm-layer",
        stdio: "ignore",
        detached: true,
        env: expect.objectContaining({
          OPENCLAW_STATE_DIR: "/tmp/state",
          OPENCLAW_SWARM_BRIDGE_INPUT_B64: expect.any(String),
        }),
      }),
    );
    expect(unref).toHaveBeenCalledTimes(1);
  });
});
