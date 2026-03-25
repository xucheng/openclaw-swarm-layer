import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(scriptDir, "..", "dist", "src", "runtime", "openclaw-exec-bridge.js");
const srcPath = path.join(scriptDir, "..", "src", "runtime", "openclaw-exec-bridge.ts");

// Prefer dist build; fall back to source (works when tsx loader is active)
const modulePath = existsSync(distPath) ? distPath : srcPath;
const { main } = await import(modulePath);

const code = await main(process.argv);
process.exit(code);
