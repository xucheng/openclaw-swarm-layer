import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const outputRoot = join(repoRoot, ".clawhub-package", "openclaw-swarm-layer");

const basePackage = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));
const manifest = JSON.parse(await readFile(join(repoRoot, "openclaw.plugin.json"), "utf8"));

const releasePackage = {
  name: basePackage.name,
  displayName: basePackage.displayName,
  version: basePackage.version,
  description: basePackage.description,
  license: basePackage.license,
  author: basePackage.author,
  repository: basePackage.repository,
  homepage: basePackage.homepage,
  bugs: basePackage.bugs,
  keywords: basePackage.keywords,
  type: basePackage.type,
  main: basePackage.main,
  types: basePackage.types,
  files: basePackage.files,
  openclaw: basePackage.openclaw,
  dependencies: basePackage.dependencies,
  peerDependencies: basePackage.peerDependencies,
};

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await mkdir(join(outputRoot, "dist"), { recursive: true });
await mkdir(join(outputRoot, "scripts"), { recursive: true });

await cp(join(repoRoot, "dist", "src"), join(outputRoot, "dist", "src"), { recursive: true });
await cp(
  join(repoRoot, "scripts", "openclaw-exec-bridge.mjs"),
  join(outputRoot, "scripts", "openclaw-exec-bridge.mjs"),
);
await cp(join(repoRoot, "skills"), join(outputRoot, "skills"), { recursive: true });
await cp(join(repoRoot, "LICENSE"), join(outputRoot, "LICENSE"));
await cp(join(repoRoot, "README.md"), join(outputRoot, "README.md"));
await cp(join(repoRoot, "openclaw.plugin.json"), join(outputRoot, "openclaw.plugin.json"));

try {
  await cp(join(repoRoot, "package-lock.json"), join(outputRoot, "package-lock.json"));
} catch {
  // ClawHub package publication can proceed without a lockfile.
}

await writeFile(join(outputRoot, "package.json"), `${JSON.stringify(releasePackage, null, 2)}\n`);

const summary = {
  output: outputRoot,
  packageName: releasePackage.name,
  displayName: releasePackage.displayName,
  runtimeId: manifest.id,
  version: releasePackage.version,
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
