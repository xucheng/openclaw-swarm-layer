# Release Runbook

This runbook covers the full `openclaw-swarm-layer` publication flow for npm, GitHub releases, the ClawHub code plugin, and the ClawHub skill.

## Release Target

- Package: `openclaw-swarm-layer`
- Runtime ID: `openclaw-swarm-layer`
- Skill slug: `swarm-layer`
- Current release line: `0.5.12`

## Safety Guardrails

ClawHub package and skill versions are immutable after publish. A bad source commit or stale skill body cannot be corrected by re-publishing the same version, so this release line uses generated publish commands instead of hand-typed source metadata.

Required guardrails:

- generate publish commands from a clean release commit with `npm run release:commands`
- use `SOURCE_COMMIT="$(git rev-parse HEAD)"`; never type a commit hash by hand
- publish the ClawHub package from `"$REPO_ROOT/.clawhub-package/openclaw-swarm-layer"`
- publish the ClawHub skill with `clawhub --workdir "$REPO_ROOT" skill publish "$REPO_ROOT/skills/swarm-layer"`
- do not publish the skill from a relative `skills/swarm-layer` path without an explicit `--workdir`
- inspect both the standalone skill body and the package-embedded `skills/swarm-layer/SKILL.md` after publish

The explicit workdir is required because the ClawHub CLI can fall back to its default workspace when the current directory is not recognized as the intended package workspace.

## Preflight

Verify credentials before cutting a release:

```bash
gh auth status
clawhub whoami
npm whoami
```

Expected posture for a publish-capable environment:

- GitHub authenticated with `repo` scope
- ClawHub authenticated as the package and skill owner
- npm authenticated to the target publisher account

Set release variables from the repository root:

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
RELEASE_VERSION="0.5.12"
SOURCE_COMMIT="$(git rev-parse HEAD)"
git -C "$REPO_ROOT" status --short
```

The status output must be empty before the final publish command set is generated.

## Release Validation

Run the full local release gate:

```bash
npm run release:check
```

That covers:

- `npm run build`
- `npm test`
- `npm run check:docs-redaction`
- `npm run check:release-consistency`
- `npm pack --dry-run`
- `npm run prepare:clawhub:package`

The ClawHub package staging output is written to:

```text
.clawhub-package/openclaw-swarm-layer/
```

After committing the release prep, generate the exact publish commands:

```bash
npm run release:commands
```

The command generator refuses to run if the worktree is dirty.

## npm Publish

From the repository root, after the release gate is green and the release prep commit is clean:

```bash
npm publish --access public
```

Post-publish verification:

```bash
npm view openclaw-swarm-layer version
```

Expected version for this release: `0.5.12`.

## GitHub Release

After npm is published and the release commit is on the target branch:

```bash
git tag "v$RELEASE_VERSION"
git push origin "v$RELEASE_VERSION"
gh release create "v$RELEASE_VERSION" --title "v$RELEASE_VERSION" --notes-file "$REPO_ROOT/docs/release-notes/v0.5.12.md"
```

Recommended release notes source:

- use [docs/release-notes/v0.5.12.md](release-notes/v0.5.12.md)
- keep the `0.5.12` section in [CHANGELOG.md](../CHANGELOG.md) aligned
- keep the title aligned with the tag

## ClawHub Code Plugin Publish

Stage the package first:

```bash
npm --prefix "$REPO_ROOT" run prepare:clawhub:package
```

Publish the staged package:

```bash
clawhub package publish "$REPO_ROOT/.clawhub-package/openclaw-swarm-layer" \
  --family code-plugin \
  --name openclaw-swarm-layer \
  --display-name "OpenClaw Swarm Layer" \
  --version "$RELEASE_VERSION" \
  --tags latest,swarm,workflow,orchestration,harness \
  --source-repo xucheng/openclaw-swarm-layer \
  --source-ref "v$RELEASE_VERSION" \
  --source-commit "$SOURCE_COMMIT" \
  --changelog "Recover ClawHub skill/package alignment with explicit-workdir publishing and verified source metadata."
```

## ClawHub Skill Publish

Publish the repository skill with an explicit workdir and an absolute skill path:

```bash
clawhub --workdir "$REPO_ROOT" skill publish "$REPO_ROOT/skills/swarm-layer" \
  --slug swarm-layer \
  --name "Swarm Layer" \
  --version "$RELEASE_VERSION" \
  --tags latest,openclaw,swarm,workflow,orchestration,harness \
  --changelog "Republish the Swarm Layer skill with explicit workdir and current $RELEASE_VERSION SKILL.md content."
```

## Post-Publish Checks

Verify the published artifacts resolve correctly:

```bash
clawhub inspect swarm-layer --version "$RELEASE_VERSION" --file SKILL.md | rg "Current release baseline: `openclaw-swarm-layer@$RELEASE_VERSION`"
clawhub package inspect openclaw-swarm-layer --version "$RELEASE_VERSION" | rg "Source Commit: $SOURCE_COMMIT|Source Ref: v$RELEASE_VERSION|Selected: $RELEASE_VERSION"
clawhub package inspect openclaw-swarm-layer --version "$RELEASE_VERSION" --file skills/swarm-layer/SKILL.md | rg "Current release baseline: `openclaw-swarm-layer@$RELEASE_VERSION`"
openclaw --profile release-smoke plugins install clawhub:openclaw-swarm-layer
openclaw --profile release-smoke skills install swarm-layer
```

If npm was published, also verify:

```bash
npm view openclaw-swarm-layer version
```

## Release Notes Checklist

- package version updated in `package.json`, `package-lock.json`, and `openclaw.plugin.json`
- README install commands reflect current ClawHub and OpenClaw CLI syntax
- changelog entry summarizes milestone scope and verification
- skill description matches the published runtime surface (`manual + acp`, optional autopilot)
- tested-against OpenClaw version is current
- generated publish commands use `SOURCE_COMMIT`, absolute ClawHub package path, explicit skill `--workdir`, and post-publish skill body checks
