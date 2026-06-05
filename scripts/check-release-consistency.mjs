import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

async function readText(relativePath) {
  return await readFile(join(repoRoot, relativePath), "utf8");
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

function failIfMissing(errors, file, expected, label) {
  if (!file.contents.includes(expected)) {
    errors.push(`${file.path} missing ${label}: ${expected}`);
  }
}

function failIfPresent(errors, file, forbidden, label) {
  if (file.contents.includes(forbidden)) {
    errors.push(`${file.path} contains stale ${label}: ${forbidden}`);
  }
}

const errors = [];
const packageJson = await readJson("package.json");
const packageLock = await readJson("package-lock.json");
const manifest = await readJson("openclaw.plugin.json");
const version = packageJson.version;

if (packageLock.version !== version) {
  errors.push(`package-lock.json top-level version ${packageLock.version} does not match package.json ${version}`);
}
if (packageLock.packages?.[""]?.version !== version) {
  errors.push(`package-lock.json root package version ${packageLock.packages?.[""]?.version} does not match package.json ${version}`);
}
if (manifest.version !== version) {
  errors.push(`openclaw.plugin.json version ${manifest.version} does not match package.json ${version}`);
}

const files = {
  readme: { path: "README.md", contents: await readText("README.md") },
  changelog: { path: "CHANGELOG.md", contents: await readText("CHANGELOG.md") },
  runbook: { path: "docs/release-runbook.md", contents: await readText("docs/release-runbook.md") },
  skill: { path: "skills/swarm-layer/SKILL.md", contents: await readText("skills/swarm-layer/SKILL.md") },
  releaseNotes: {
    path: `docs/release-notes/v${version}.md`,
    contents: await readText(`docs/release-notes/v${version}.md`).catch(() => ""),
  },
};

failIfMissing(errors, files.readme, `version-${version}-blue.svg`, "README version badge");
failIfMissing(errors, files.changelog, `## ${version} (`, "CHANGELOG release section");
failIfMissing(errors, files.releaseNotes, `# v${version}`, "release notes title");

failIfMissing(errors, files.runbook, `Current release line: \`${version}\``, "runbook current release line");
failIfMissing(errors, files.runbook, `Expected version for this release: \`${version}\``, "runbook npm expected version");
failIfMissing(errors, files.runbook, `git tag v${version}`, "runbook git tag command");
failIfMissing(errors, files.runbook, `gh release create v${version}`, "runbook GitHub release command");
failIfMissing(errors, files.runbook, `--version ${version}`, "runbook ClawHub version flag");
failIfMissing(errors, files.runbook, `--source-ref v${version}`, "runbook ClawHub source ref");
failIfMissing(errors, files.runbook, `docs/release-notes/v${version}.md`, "runbook release notes path");

failIfMissing(
  errors,
  files.skill,
  `Current release baseline: \`openclaw-swarm-layer@${version}\``,
  "skill release baseline",
);
failIfMissing(errors, files.skill, `The \`${version}\` release was smoke-tested`, "skill smoke-test version");
failIfPresent(
  errors,
  files.skill,
  "Unified skill for spec-driven workflow orchestration. Routes to appropriate module",
  "legacy ClawHub skill body",
);

if (errors.length > 0) {
  process.stderr.write(`Release consistency check failed:\n${errors.map((error) => `- ${error}`).join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Release consistency check passed for openclaw-swarm-layer@${version}\n`);
}
