import path from "node:path";
import { createRequire } from "node:module";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
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

async function withIsolatedOpenClawState<T>(run: () => Promise<T>): Promise<T> {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "swarm-doctor-live-"));
  const configPath = path.join(stateDir, "openclaw.json");
  const previousStateDir = process.env.OPENCLAW_STATE_DIR;
  const previousConfigPath = process.env.OPENCLAW_CONFIG_PATH;
  const previousTestFast = process.env.OPENCLAW_TEST_FAST;

  await writeFile(
    configPath,
    JSON.stringify(
      {
        acp: {
          enabled: true,
          backend: "acpx",
        },
        plugins: {
          allow: ["acpx"],
          entries: {
            acpx: {
              enabled: true,
              config: {
                permissionMode: "approve-all",
                expectedVersion: "any",
                cwd: process.cwd(),
              },
            },
          },
        },
      },
      null,
      2,
    ),
  );

  process.env.OPENCLAW_STATE_DIR = stateDir;
  process.env.OPENCLAW_CONFIG_PATH = configPath;
  process.env.OPENCLAW_TEST_FAST = "1";

  try {
    return await run();
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = previousStateDir;
    }
    if (previousConfigPath === undefined) {
      delete process.env.OPENCLAW_CONFIG_PATH;
    } else {
      process.env.OPENCLAW_CONFIG_PATH = previousConfigPath;
    }
    if (previousTestFast === undefined) {
      delete process.env.OPENCLAW_TEST_FAST;
    } else {
      process.env.OPENCLAW_TEST_FAST = previousTestFast;
    }
    await rm(stateDir, { recursive: true, force: true });
  }
}

skipInCI("e2e: live bridge doctor diagnostics", () => {
  it("returns warning severity when bridge config is usable but unpinned", async () => {
    const result = await withIsolatedOpenClawState(() =>
      runSwarmDoctor(
        {},
        {
          config: {
            bridge: {
              openclawRoot: resolveOpenClawRoot(),
              versionAllow: [],
            },
          } as any,
        },
      ),
    );

    expect(result.ok).toBe(true);
    expect(result.severity).toBe("warning");
    expect(result.publicApi.acpControlPlaneExport).toBe(true);
    expect(result.replacementPlan[0]?.runner).toBe("acp");
  });
});
