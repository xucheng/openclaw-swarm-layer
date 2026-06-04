# Release Runbook

This runbook covers the full `openclaw-swarm-layer` publication flow for npm, GitHub releases, the ClawHub code plugin, and the ClawHub skill.

## Release Target

- Package: `openclaw-swarm-layer`
- Runtime ID: `openclaw-swarm-layer`
- Skill slug: `swarm-layer`
- Current release line: `0.5.7`

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

## Release Validation

Run the full local release gate:

```bash
npm run release:check
```

That covers:

- `npm run build`
- `npm test`
- `npm run check:docs-redaction`
- `npm pack --dry-run`
- `npm run prepare:clawhub:package`

The ClawHub package staging output is written to:

```text
.clawhub-package/openclaw-swarm-layer/
```

## npm Publish

From the repository root:

```bash
npm publish --access public
```

Post-publish verification:

```bash
npm view openclaw-swarm-layer version
```

Expected version for this release: `0.5.7`.

## GitHub Release

After the release commit is on the target branch:

```bash
git tag v0.5.7
git push origin v0.5.7
gh release create v0.5.7 --title "v0.5.7" --notes-file docs/release-notes/v0.5.7.md
```

Recommended release notes source:

- use [docs/release-notes/v0.5.7.md](release-notes/v0.5.7.md)
- keep the `0.5.7` section in [CHANGELOG.md](../CHANGELOG.md) aligned
- keep the title aligned with the tag

## ClawHub Code Plugin Publish

Stage the package first:

```bash
npm run prepare:clawhub:package
```

Publish the staged package:

```bash
clawhub package publish .clawhub-package/openclaw-swarm-layer \
  --family code-plugin \
  --name openclaw-swarm-layer \
  --display-name "OpenClaw Swarm Layer" \
  --version 0.5.7 \
  --source-repo xucheng/openclaw-swarm-layer \
  --source-ref v0.5.7 \
  --source-commit <git-sha> \
  --changelog "Improve Daily Papers-style cron reliability with explicit parallel phase barriers, queued-task drain, active-run sync options, downstream ready promotion, and docs-redaction release gates."
```

Optional tags to keep aligned with the current listing:

- `latest`
- `swarm`
- `workflow`
- `orchestration`
- `harness`

## ClawHub Skill Publish

Publish the repository skill directly from `skills/swarm-layer`:

```bash
clawhub publish skills/swarm-layer \
  --slug swarm-layer \
  --name "Swarm Layer" \
  --version 0.5.7 \
  --changelog "Refresh the Swarm Layer skill for Daily Papers-style cron reliability, sync-aware run/status commands, and current release metadata."
```

Optional tags to keep aligned with the current listing:

- `latest`
- `openclaw`
- `swarm`
- `workflow`
- `orchestration`

## Post-Publish Checks

Verify the published artifacts resolve correctly:

```bash
clawhub package inspect openclaw-swarm-layer
clawhub inspect swarm-layer
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
