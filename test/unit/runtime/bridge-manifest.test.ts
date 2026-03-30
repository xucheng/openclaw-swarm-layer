import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  resolveVersionRangeStrategy,
  resolveBridgeCompatibility,
  resolveBridgeModules,
} from "../../../src/runtime/bridge-manifest.js";

describe("bridge manifest", () => {
  // ---- resolveVersionRangeStrategy ----

  it("resolves exact strategies for legacy versions", () => {
    const s = resolveVersionRangeStrategy("2026.2.26");
    expect(s).not.toBeNull();
    expect(s!.loadConfig.mode).toBe("exact");

    const s2 = resolveVersionRangeStrategy("2026.3.13");
    expect(s2).not.toBeNull();
    expect(s2!.loadConfig.mode).toBe("exact");
  });

  it("resolves dynamic strategies for modern versions", () => {
    const s = resolveVersionRangeStrategy("2026.3.22");
    expect(s).not.toBeNull();
    expect(s!.loadConfig.mode).toBe("dynamic");
    expect(s!.acpSessionManager.mode).toBe("stable-path");
  });

  it("prefers the bounded range over the open-ended range", () => {
    // 2026.3.24 matches both [2026.3.22, 2026.3.24] and [2026.3.22, null]
    // The bounded one should win because it's declared first.
    const s = resolveVersionRangeStrategy("2026.3.24");
    expect(s).not.toBeNull();
    expect(s!.compatibility.version).toBe(">=2026.3.22 <=2026.3.24");
  });

  it("falls through to the open-ended range for future versions", () => {
    const s = resolveVersionRangeStrategy("2026.3.28");
    expect(s).not.toBeNull();
    expect(s!.compatibility.version).toBe(">=2026.3.22");

    const s2 = resolveVersionRangeStrategy("2027.1.1");
    expect(s2).not.toBeNull();
    expect(s2!.compatibility.version).toBe(">=2026.3.22");
  });

  it("returns null for versions below minimum", () => {
    expect(resolveVersionRangeStrategy("2026.1.1")).toBeNull();
    expect(resolveVersionRangeStrategy("2025.12.31")).toBeNull();
  });

  // ---- resolveBridgeCompatibility ----

  it("exposes compatibility metadata for tested versions", () => {
    const c = resolveBridgeCompatibility("2026.3.22");
    expect(c?.supportedRunners).toContain("acp");
    expect(c?.replacementCandidates.acpControlPlaneExport).toBe("getAcpSessionManager");
  });

  it("normalizes build suffixes when resolving compatibility", () => {
    const c = resolveBridgeCompatibility("2026.3.23-1");
    expect(c).not.toBeNull();
    expect(c?.replacementCandidates.acpControlPlaneExport).toBe("getAcpSessionManager");
  });

  it("provides forward-compatible compatibility for future versions", () => {
    const c = resolveBridgeCompatibility("2026.3.28");
    expect(c).not.toBeNull();
    expect(c?.strategy).toBe("dynamic-discovery");
    expect(c?.supportedRunners).toContain("acp");
  });

  // ---- resolveBridgeModules + dynamicDiscoverExport ----

  describe("resolveBridgeModules with dynamic discovery", () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await mkdtemp(path.join(os.tmpdir(), "bridge-test-"));
      const distDir = path.join(tmpDir, "dist");
      const sdkDir = path.join(distDir, "plugin-sdk");
      await mkdir(sdkDir, { recursive: true });
      await writeFile(path.join(tmpDir, "package.json"), JSON.stringify({ name: "openclaw", version: "2026.4.1" }));
      // io-FAKEHASH.js exports loadConfig
      await writeFile(path.join(distDir, "io-FAKEHASH123.js"), "export function loadConfig() { return { fake: true }; }\n");
      // stable acp-runtime.js
      await writeFile(path.join(sdkDir, "acp-runtime.js"), "export function getAcpSessionManager() { return {}; }\n");
    });

    afterEach(async () => {
      await rm(tmpDir, { recursive: true, force: true });
    });

    it("discovers loadConfig dynamically from dist/io-*.js", async () => {
      const result = await resolveBridgeModules(tmpDir, "2026.4.1");
      expect(result.loadConfig).toBeTypeOf("function");
      expect(result.spec.exports.loadConfig.exportAlias).toBe("loadConfig");
      expect(result.spec.exports.loadConfig.relativeModulePath).toMatch(/^dist\/io-FAKEHASH123\.js$/);
    });

    it("resolves getAcpSessionManager from stable path", async () => {
      const result = await resolveBridgeModules(tmpDir, "2026.4.1");
      expect(result.getAcpSessionManager).toBeTypeOf("function");
      expect(result.spec.exports.getAcpSessionManager.relativeModulePath).toBe("dist/plugin-sdk/acp-runtime.js");
    });

    it("sets subagentPatch to null for dynamic strategy", async () => {
      const result = await resolveBridgeModules(tmpDir, "2026.4.1");
      expect(result.subagentPatch).toBeNull();
    });

    it("throws when no io-*.js file exports loadConfig", async () => {
      // overwrite with a module that does not export loadConfig
      await writeFile(path.join(tmpDir, "dist", "io-FAKEHASH123.js"), "export function somethingElse() {}\n");
      await expect(resolveBridgeModules(tmpDir, "2026.4.1")).rejects.toThrow(/Dynamic discovery failed/);
    });

    it("throws for versions below minimum", async () => {
      await writeFile(path.join(tmpDir, "package.json"), JSON.stringify({ name: "openclaw", version: "2026.1.1" }));
      await expect(resolveBridgeModules(tmpDir, "2026.1.1")).rejects.toThrow(/below the minimum/);
    });
  });
});
