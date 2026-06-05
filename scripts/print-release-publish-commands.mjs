import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

const repoRoot = git(["rev-parse", "--show-toplevel"]);
const sourceCommit = git(["rev-parse", "HEAD"]);
const status = git(["status", "--porcelain"]);
const packageJson = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));
const version = packageJson.version;

if (status) {
  process.stderr.write("Release command generation requires a clean git worktree so source commit metadata is exact.\n");
  process.stderr.write(status);
  process.stderr.write("\n");
  process.exit(1);
}

const releaseNotes = `docs/release-notes/v${version}.md`;

process.stdout.write(`# Run from any directory. Paths and source commit are resolved from git.\n`);
process.stdout.write(`REPO_ROOT=${shellQuote(repoRoot)}\n`);
process.stdout.write(`RELEASE_VERSION=${shellQuote(version)}\n`);
process.stdout.write(`SOURCE_COMMIT=${shellQuote(sourceCommit)}\n\n`);

process.stdout.write(`npm view openclaw-swarm-layer version\n\n`);

process.stdout.write(`git tag "v$RELEASE_VERSION"\n`);
process.stdout.write(`git push origin "v$RELEASE_VERSION"\n`);
process.stdout.write(
  `gh release create "v$RELEASE_VERSION" --title "v$RELEASE_VERSION" --notes-file "$REPO_ROOT/${releaseNotes}"\n\n`,
);

process.stdout.write(`npm --prefix "$REPO_ROOT" run prepare:clawhub:package\n`);
process.stdout.write(
  [
    `clawhub package publish "$REPO_ROOT/.clawhub-package/openclaw-swarm-layer"`,
    `--family code-plugin`,
    `--name openclaw-swarm-layer`,
    `--display-name "OpenClaw Swarm Layer"`,
    `--version "$RELEASE_VERSION"`,
    `--tags latest,swarm,workflow,orchestration,harness`,
    `--source-repo xucheng/openclaw-swarm-layer`,
    `--source-ref "v$RELEASE_VERSION"`,
    `--source-commit "$SOURCE_COMMIT"`,
    `--changelog "Recover ClawHub skill/package alignment with explicit-workdir publishing and verified source metadata."`,
  ].join(" \\\n  "),
);
process.stdout.write(`\n\n`);
process.stdout.write(
  [
    `clawhub --workdir "$REPO_ROOT" skill publish "$REPO_ROOT/skills/swarm-layer"`,
    `--slug swarm-layer`,
    `--name "Swarm Layer"`,
    `--version "$RELEASE_VERSION"`,
    `--tags latest,openclaw,swarm,workflow,orchestration,harness`,
    `--changelog "Republish the Swarm Layer skill with explicit workdir and current $RELEASE_VERSION SKILL.md content."`,
  ].join(" \\\n  "),
);
process.stdout.write(`\n\n`);
process.stdout.write(
  `clawhub inspect swarm-layer --version "$RELEASE_VERSION" --file SKILL.md | rg "Current release baseline: \`openclaw-swarm-layer@$RELEASE_VERSION\`"\n`,
);
process.stdout.write(
  `clawhub package inspect openclaw-swarm-layer --version "$RELEASE_VERSION" | rg "Source Commit: $SOURCE_COMMIT|Source Ref: v$RELEASE_VERSION|Selected: $RELEASE_VERSION"\n`,
);
process.stdout.write(
  `clawhub package inspect openclaw-swarm-layer --version "$RELEASE_VERSION" --file skills/swarm-layer/SKILL.md | rg "Current release baseline: \`openclaw-swarm-layer@$RELEASE_VERSION\`"\n`,
);
