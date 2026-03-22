import path from "node:path";
import { createRequire } from "node:module";
import { runSwarmDoctor } from "../../src/cli/swarm-doctor.js";

function resolveOpenClawRoot(): string {
  const require = createRequire(import.meta.url);
  const sdkEntryPath = require.resolve("openclaw/plugin-sdk");
  let cursor = path.dirname(sdkEntryPath);
  while (true) {
    const packageJsonPath = path.join(cursor, "package.json");
    if (require("node:fs").existsSync(packageJsonPath)) {
      return cursor;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) {
      throw new Error("Unable to resolve openclaw package root from plugin-sdk entry");
    }
    cursor = parent;
  }
}

const skipInCI = process.env.CI ? describe.skip : describe;

skipInCI("e2e: live bridge doctor diagnostics", () => {
  it("returns warning severity when bridge config is usable but unpinned", async () => {
    const result = await runSwarmDoctor(
      {},
      {
        config: {
          bridge: {
            enabled: true,
            versionAllow: [],
          },
        } as any,
      },
    );

    expect(result.ok).toBe(true);
    expect(result.severity).toBe("warning");
    expect(result.remediation.some((item) => item.includes("versionAllow"))).toBe(true);
    expect(result.publicApi.acpControlPlaneExport).toBe(false);
    expect(result.replacementPlan[0]?.runner).toBe("acp");
  });

  it("returns blocked severity for live version drift", async () => {
    const result = await runSwarmDoctor(
      {},
      {
        config: {
          bridge: {
            enabled: true,
            openclawRoot: resolveOpenClawRoot(),
            versionAllow: ["0.0.0-test"],
          },
        } as any,
      },
    );

    expect(result.ok).toBe(false);
    expect(result.severity).toBe("blocked");
    expect(result.remediation.some((item) => item.includes("versionAllow"))).toBe(true);
    expect(result.nextAction).toContain("versionAllow");
    expect(result.compatibility.supportedRunners.length).toBeGreaterThanOrEqual(0);
  });
});
