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
  waitForAcpBackendHealthy,
} from "../../../src/runtime/openclaw-exec-bridge.js";
import { resolveVersionRangeStrategy } from "../../../src/runtime/bridge-manifest.js";

describe("openclaw exec bridge", () => {
  it("resolves strategies for tested OpenClaw versions", () => {
    expect(resolveVersionRangeStrategy("2026.2.26")).not.toBeNull();
    expect(resolveVersionRangeStrategy("2026.3.13")).not.toBeNull();
    expect(resolveVersionRangeStrategy("2026.3.22")).not.toBeNull();
    expect(resolveVersionRangeStrategy("2026.3.23-1")).not.toBeNull();
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

  it("falls back to the npm-project acpx package when OpenClaw records no installPath", () => {
    const tmpStateDir = fs.mkdtempSync(path.join(os.tmpdir(), "swarm-acpx-npm-project-"));
    const npmAcpxPath = path.join(
      tmpStateDir,
      "npm",
      "projects",
      "openclaw-acpx-abc123",
      "node_modules",
      "@openclaw",
      "acpx",
    );
    fs.mkdirSync(path.join(npmAcpxPath, "dist"), { recursive: true });
    fs.writeFileSync(path.join(npmAcpxPath, "dist", "index.js"), "export {};\n");

    const previousStateDir = process.env.OPENCLAW_STATE_DIR;
    process.env.OPENCLAW_STATE_DIR = tmpStateDir;
    try {
      expect(resolveAcpxServiceModulePath("/opt/openclaw", { plugins: { entries: { acpx: { enabled: true } } } })).toBe(
        path.join(npmAcpxPath, "dist", "index.js"),
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
        register(api: {
          registerService: (service: { start: typeof start }) => void;
          on: (event: string, handler: unknown) => void;
        }) {
          api.on("reply_dispatch", () => undefined);
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

    expect(resolveOpenClawRootFromExecPath(path.join(distDir, "entry.js"))).toBe(fs.realpathSync(openclawRoot));
  });

  it("follows a symlinked launcher to the active OpenClaw package root", () => {
    const tmpPrefix = fs.mkdtempSync(path.join(os.tmpdir(), "swarm-openclaw-symlink-"));
    const binDir = path.join(tmpPrefix, "state", "bin");
    const openclawRoot = path.join(tmpPrefix, "active", "lib", "node_modules", "openclaw");
    const launcher = path.join(openclawRoot, "openclaw.mjs");
    fs.mkdirSync(binDir, { recursive: true });
    fs.mkdirSync(path.join(openclawRoot, "dist", "plugin-sdk"), { recursive: true });
    fs.writeFileSync(path.join(openclawRoot, "package.json"), JSON.stringify({ name: "openclaw", version: "2026.4.26" }));
    fs.writeFileSync(launcher, "#!/usr/bin/env node\n");
    fs.symlinkSync(launcher, path.join(binDir, "openclaw"));

    expect(resolveOpenClawRootFromExecPath(path.join(binDir, "openclaw"))).toBe(fs.realpathSync(openclawRoot));
  });

  it("falls back to the OpenClaw package root under the configured state dir", () => {
    const tmpStateDir = fs.mkdtempSync(path.join(os.tmpdir(), "swarm-openclaw-state-root-"));
    const openclawRoot = path.join(tmpStateDir, "lib", "node_modules", "openclaw");
    const previousStateDir = process.env.OPENCLAW_STATE_DIR;
    const previousArgv1 = process.argv[1];
    fs.mkdirSync(path.join(openclawRoot, "dist", "plugin-sdk"), { recursive: true });
    fs.writeFileSync(path.join(openclawRoot, "package.json"), JSON.stringify({ name: "openclaw", version: "2026.3.24" }));

    process.env.OPENCLAW_STATE_DIR = tmpStateDir;
    process.argv[1] = path.join(tmpStateDir, "bin", "not-openclaw");
    try {
      expect(resolveOpenClawRoot()).toBe(openclawRoot);
    } finally {
      process.argv[1] = previousArgv1;
      if (previousStateDir === undefined) {
        delete process.env.OPENCLAW_STATE_DIR;
      } else {
        process.env.OPENCLAW_STATE_DIR = previousStateDir;
      }
    }
  });

  it("keeps the state-dir runtime root when the active launcher package lacks bundled acpx", () => {
    const tmpPrefix = fs.mkdtempSync(path.join(os.tmpdir(), "swarm-openclaw-acpx-root-"));
    const activeRoot = path.join(tmpPrefix, "active", "lib", "node_modules", "openclaw");
    const stateDir = path.join(tmpPrefix, "state");
    const stateRoot = path.join(stateDir, "lib", "node_modules", "openclaw");
    const launcher = path.join(activeRoot, "openclaw.mjs");
    const previousStateDir = process.env.OPENCLAW_STATE_DIR;
    const previousArgv1 = process.argv[1];

    fs.mkdirSync(path.join(activeRoot, "dist", "plugin-sdk"), { recursive: true });
    fs.writeFileSync(path.join(activeRoot, "package.json"), JSON.stringify({ name: "openclaw", version: "2026.4.26" }));
    fs.writeFileSync(launcher, "#!/usr/bin/env node\n");
    fs.mkdirSync(path.join(stateRoot, "dist", "plugin-sdk"), { recursive: true });
    fs.mkdirSync(path.join(stateRoot, "node_modules", "acpx"), { recursive: true });
    fs.writeFileSync(path.join(stateRoot, "package.json"), JSON.stringify({ name: "openclaw", version: "2026.4.15" }));
    fs.writeFileSync(path.join(stateRoot, "node_modules", "acpx", "package.json"), JSON.stringify({ name: "acpx" }));

    process.env.OPENCLAW_STATE_DIR = stateDir;
    process.argv[1] = launcher;
    try {
      expect(resolveOpenClawRoot()).toBe(stateRoot);
    } finally {
      process.argv[1] = previousArgv1;
      if (previousStateDir === undefined) {
        delete process.env.OPENCLAW_STATE_DIR;
      } else {
        process.env.OPENCLAW_STATE_DIR = previousStateDir;
      }
    }
  });

  it("derives remediation for version drift", () => {
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
        readyReplacementPoints: [],
      },
      replacementPlan: [],
      migrationChecklist: [],
      checks: {
        versionMapped: false,
        versionAllowed: false,
        internalModuleResolved: false,
        acpBackendHealthy: true,
      },
      blockers: ["OpenClaw version 2026.4.0 is not in bridge allowlist (2026.3.13)"],
      warnings: [],
      risks: [],
    });

    expect(remediation.some((item) => item.includes("versionAllow"))).toBe(true);
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
        readyReplacementPoints: [],
      },
      replacementPlan: [],
      migrationChecklist: [],
      checks: {
        versionMapped: false,
        versionAllowed: false,
        internalModuleResolved: false,
        acpBackendHealthy: true,
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
});
